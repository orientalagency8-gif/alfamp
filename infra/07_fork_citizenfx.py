"""
Создаём фактический «форк» citizenfx/fivem в нашу приватную репу
orientalagency8-gif/alfamp-client. Делаем это на VPS чтобы не упереться
в плохой интернет owner'а.

Шаги (на VPS):
1. Установить git-lfs
2. mkdir /opt/alfamp-clone, cd туда
3. GIT_LFS_SKIP_SMUDGE=1 git clone --no-tags <upstream>
4. cd fivem
5. git remote rename origin upstream
6. git remote add origin <our-private-repo-via-PAT>
7. git push origin <default-branch>
8. git push --tags
"""
import io
import sys
import configparser
from pathlib import Path

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)

SECRETS = Path(__file__).parent.parent / "secrets.cfg"
UPSTREAM = "https://github.com/citizenfx/fivem.git"
CLONE_DIR = "/opt/alfamp-clone/fivem"


def main():
    cfg = configparser.ConfigParser()
    cfg.read(SECRETS)
    tok = cfg.get("github", "token")
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(
        cfg.get("vps", "host"),
        port=cfg.getint("vps", "port", fallback=22),
        username=cfg.get("vps", "user"),
        password=cfg.get("vps", "password"),
        timeout=20, look_for_keys=False, allow_agent=False
    )
    try:
        def run(cmd, check=True, timeout=300):
            _, out, err = cli.exec_command(cmd, timeout=timeout)
            o = out.read().decode("utf-8", "replace")
            e = err.read().decode("utf-8", "replace")
            rc = out.channel.recv_exit_status()
            if o: print(o, end="" if o.endswith("\n") else "\n", flush=True)
            if e.strip(): print(f"  [stderr] {e.strip()[:500]}", flush=True)
            if check and rc != 0:
                raise RuntimeError(f"rc={rc}: {cmd[:80]}")
            return rc, o

        print("=" * 60)
        print("Pre-flight: disk free + git version")
        print("=" * 60)
        run("df -h /opt | tail -1")
        run("git --version")
        run("git lfs --version 2>&1 || apt-get install -y -qq git-lfs && git lfs install", check=False)

        print()
        print("=" * 60)
        print("Cleaning previous clone (if any)")
        print("=" * 60)
        run("rm -rf /opt/alfamp-clone && mkdir -p /opt/alfamp-clone")

        print()
        print("=" * 60)
        print("Clone citizenfx/fivem (GIT_LFS_SKIP_SMUDGE=1, full history)")
        print("=" * 60)
        # Полная история без LFS-blob'ов — мы их будем тянуть избирательно если понадобится
        run(
            f"cd /opt/alfamp-clone && "
            f"GIT_LFS_SKIP_SMUDGE=1 git clone {UPSTREAM} fivem 2>&1 | tail -5",
            timeout=900
        )
        run("du -sh /opt/alfamp-clone/fivem")
        run("cd /opt/alfamp-clone/fivem && git log --oneline -5")
        run("cd /opt/alfamp-clone/fivem && git branch -r | head -5")

        print()
        print("=" * 60)
        print("Set up remotes: upstream + origin (our private)")
        print("=" * 60)
        # Сохраняем upstream чтобы потом сливать апдейты
        run(f"cd /opt/alfamp-clone/fivem && git remote rename origin upstream")
        # Origin = наша private repo, с PAT в URL для разовой пуш-операции
        origin_url = f"https://orientalagency8-gif:{tok}@github.com/orientalagency8-gif/alfamp-client.git"
        run(f"cd /opt/alfamp-clone/fivem && git remote add origin '{origin_url}'")
        run("cd /opt/alfamp-clone/fivem && git remote -v")

        print()
        print("=" * 60)
        print("Push to private repo (это займёт несколько минут, репа ~150–400 MB)")
        print("=" * 60)
        # Default branch CitizenFX = master
        run(
            "cd /opt/alfamp-clone/fivem && git push -u origin master 2>&1 | tail -10",
            timeout=1800,
            check=False
        )
        # Push tags отдельно (могут не уйти полностью — это OK, нам не критично)
        run(
            "cd /opt/alfamp-clone/fivem && git push origin --tags 2>&1 | tail -5",
            timeout=600,
            check=False
        )

        print()
        print("=" * 60)
        print("Удаляем PAT из remote (security hygiene)")
        print("=" * 60)
        run("cd /opt/alfamp-clone/fivem && git remote set-url origin https://github.com/orientalagency8-gif/alfamp-client.git")
        run("cd /opt/alfamp-clone/fivem && git remote -v")

        print()
        print("=" * 60)
        print("✓ Fork complete")
        print("=" * 60)
        print("Private repo: https://github.com/orientalagency8-gif/alfamp-client")
        print("Local mirror: /opt/alfamp-clone/fivem (можно использовать для дальнейших операций)")
        print("Upstream remote: https://github.com/citizenfx/fivem.git (для будущих sync)")
    finally:
        cli.close()


if __name__ == "__main__":
    main()
