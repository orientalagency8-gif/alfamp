"""
Дофиксировать форк: настроить lfs.allowincompletepush=true,
запустить push в nohup-фоне, дать ему время, потом проверить итог.
"""
import io
import sys
import time
import configparser
from pathlib import Path

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)

SECRETS = Path(__file__).parent.parent / "secrets.cfg"


def main():
    cfg = configparser.ConfigParser(); cfg.read(SECRETS)
    tok = cfg.get("github", "token")
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(
        cfg.get("vps", "host"), port=22,
        username="root", password=cfg.get("vps", "password"),
        timeout=20, look_for_keys=False, allow_agent=False
    )

    def run(cmd, timeout=120):
        _, out, err = cli.exec_command(cmd, timeout=timeout)
        o = out.read().decode("utf-8", "replace"); e = err.read().decode("utf-8", "replace")
        rc = out.channel.recv_exit_status()
        if o: print(o, end="" if o.endswith("\n") else "\n", flush=True)
        if e.strip(): print(f"  [stderr] {e.strip()[:300]}", flush=True)
        return rc, o

    try:
        print("=== Verify clone is still on VPS ===")
        run("test -d /opt/alfamp-clone/fivem/.git && echo OK || echo MISSING")
        run("du -sh /opt/alfamp-clone/fivem/.git")

        print("\n=== Configure lfs.allowincompletepush=true ===")
        run("cd /opt/alfamp-clone/fivem && git config lfs.allowincompletepush true")
        run("cd /opt/alfamp-clone/fivem && git config --get lfs.allowincompletepush")

        print("\n=== Ensure origin URL has PAT for this push ===")
        origin_url = f"https://orientalagency8-gif:{tok}@github.com/orientalagency8-gif/alfamp-client.git"
        run(f"cd /opt/alfamp-clone/fivem && git remote set-url origin '{origin_url}'")

        print("\n=== Launch push as nohup background job ===")
        # Логируем в файл, освобождаем SSH-канал
        run("rm -f /opt/alfamp-clone/push.log /opt/alfamp-clone/push.pid /opt/alfamp-clone/push.done")
        run(
            "cd /opt/alfamp-clone/fivem && "
            "nohup bash -c '"
            "  echo \"[$(date)] starting push master\" >> /opt/alfamp-clone/push.log; "
            "  GIT_LFS_SKIP_PUSH=1 git push -u origin master >> /opt/alfamp-clone/push.log 2>&1; "
            "  EC=$?; echo \"[$(date)] push master finished rc=$EC\" >> /opt/alfamp-clone/push.log; "
            "  echo done > /opt/alfamp-clone/push.done; "
            "' > /dev/null 2>&1 &"
            " echo $! > /opt/alfamp-clone/push.pid"
        )
        run("sleep 2 && cat /opt/alfamp-clone/push.pid")

        print("\n=== Polling for completion (max 15 min) ===")
        for i in range(45):  # 45 × 20s = 15 min
            time.sleep(20)
            _, done = run("test -f /opt/alfamp-clone/push.done && echo done || echo working")
            done = done.strip()
            _, log_tail = run("tail -3 /opt/alfamp-clone/push.log 2>/dev/null", timeout=15)
            print(f"  [{i*20:>4}s] {done}", flush=True)
            if "done" in done:
                break
        else:
            print("  TIMEOUT after 15 min — push job ещё работает")

        print("\n=== Push log (last 40 lines) ===")
        run("tail -40 /opt/alfamp-clone/push.log")

        print("\n=== Removing PAT from remote ===")
        run("cd /opt/alfamp-clone/fivem && git remote set-url origin https://github.com/orientalagency8-gif/alfamp-client.git")
        run("cd /opt/alfamp-clone/fivem && git remote -v")

        print("\n=== Repo size on GitHub (via API) ===")

    finally:
        cli.close()


if __name__ == "__main__":
    main()
