"""
Setup git-based deploy на VPS:
1. Генерим SSH ключ на VPS
2. Добавляем его как deploy key (read-only) к GitHub-репо
3. Клонируем репо в /opt/alfamp/repo
4. Symlink master-server из /opt/alfamp/repo/master-server в /opt/alfamp/master-server
   (PM2 продолжает читать оттуда)
5. Создаём deploy.sh, который делает git pull + npm install + pm2 reload
"""
import io
import sys
import json
import configparser
from pathlib import Path
from urllib import request as urlreq

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", write_through=True)

SECRETS = Path(__file__).parent.parent / "secrets.cfg"


def cfg():
    c = configparser.ConfigParser()
    c.read(SECRETS)
    return c


def ssh():
    c = cfg()
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(
        c.get("vps", "host"),
        port=c.getint("vps", "port", fallback=22),
        username=c.get("vps", "user"),
        password=c.get("vps", "password"),
        timeout=20, look_for_keys=False, allow_agent=False
    )
    return cli


def run(cli, cmd, check=True, timeout=120):
    _, out, err = cli.exec_command(cmd, timeout=timeout)
    o = out.read().decode("utf-8", "replace")
    e = err.read().decode("utf-8", "replace")
    rc = out.channel.recv_exit_status()
    if o.strip():
        print(o, flush=True)
    if e.strip():
        print(f"  [stderr] {e.strip()}", flush=True)
    if check and rc != 0:
        raise RuntimeError(f"rc={rc}: {cmd[:80]}")
    return rc, o, e


def github_api(method, path, body=None):
    c = cfg()
    tok = c.get("github", "token")
    url = f"https://api.github.com{path}"
    data = json.dumps(body).encode() if body else None
    req = urlreq.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    with urlreq.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode() or "{}")


def main():
    c = cfg()
    repo_full = c.get("github", "repo_full")  # orientalagency8-gif/alfamp
    cli = ssh()
    try:
        print("=" * 60)
        print("1. Generate SSH deploy key on VPS")
        print("=" * 60)
        run(cli, "test -f /root/.ssh/alfamp_deploy || ssh-keygen -t ed25519 -C 'alfamp-deploy-vps' -f /root/.ssh/alfamp_deploy -N ''")
        _, pubkey, _ = run(cli, "cat /root/.ssh/alfamp_deploy.pub")
        pubkey = pubkey.strip()
        print(f"  pubkey: {pubkey[:60]}...")

        print()
        print("=" * 60)
        print("2. Register deploy key on GitHub (read-only)")
        print("=" * 60)
        # Сначала проверим, есть ли уже такой
        existing = github_api("GET", f"/repos/{repo_full}/keys")
        for k in existing:
            if k.get("key", "").split()[1] == pubkey.split()[1]:
                print(f"  ✓ key already registered (id={k['id']}, title={k['title']})")
                break
        else:
            new_key = github_api("POST", f"/repos/{repo_full}/keys", {
                "title": "VPS London (alfamp-master-01)",
                "key": pubkey,
                "read_only": True
            })
            print(f"  ✓ key added (id={new_key['id']})")

        print()
        print("=" * 60)
        print("3. Configure SSH known_hosts for github.com")
        print("=" * 60)
        run(cli, "mkdir -p /root/.ssh && chmod 700 /root/.ssh")
        run(cli, "ssh-keyscan -H github.com >> /root/.ssh/known_hosts 2>/dev/null && sort -u /root/.ssh/known_hosts -o /root/.ssh/known_hosts")
        # SSH config to use our specific key for github
        ssh_cfg = """Host github.com
    HostName github.com
    User git
    IdentityFile /root/.ssh/alfamp_deploy
    IdentitiesOnly yes
"""
        sftp = cli.open_sftp()
        with sftp.file("/root/.ssh/config", "w") as f:
            f.write(ssh_cfg)
        sftp.chmod("/root/.ssh/config", 0o600)
        sftp.close()

        print("=" * 60)
        print("4. Clone repo to /opt/alfamp/repo")
        print("=" * 60)
        run(cli, "mkdir -p /opt/alfamp")
        run(cli, f"""
            if [ -d /opt/alfamp/repo/.git ]; then
                cd /opt/alfamp/repo && git fetch && git reset --hard origin/main
            else
                rm -rf /opt/alfamp/repo
                git clone git@github.com:{repo_full}.git /opt/alfamp/repo
            fi
        """, timeout=60)
        run(cli, "ls -la /opt/alfamp/repo/")

        print()
        print("=" * 60)
        print("5. Re-point master-server to repo + install deps")
        print("=" * 60)
        # Удаляем старую SFTP-копию, ставим симлинк
        run(cli, """
            pm2 delete alfa-master 2>/dev/null || true
            rm -rf /opt/alfamp/master-server
            ln -sf /opt/alfamp/repo/master-server /opt/alfamp/master-server
            cd /opt/alfamp/master-server && npm install --omit=dev --no-fund --no-audit 2>&1 | tail -3
        """, timeout=180)

        print()
        print("=" * 60)
        print("6. Write deploy.sh helper")
        print("=" * 60)
        # Достаём PG-пароль из существующего файла
        _, pg_pass, _ = run(cli, "cat /root/.alfamp_db_pass")
        pg_pass = pg_pass.strip()

        deploy_sh = f"""#!/usr/bin/env bash
# Alfa MP — один-командный pull-and-deploy для master-server.
# Использовать: /opt/alfamp/deploy.sh
set -e

REPO=/opt/alfamp/repo
APP=alfa-master

cd $REPO
echo "[deploy] git pull"
git fetch origin
git reset --hard origin/main
git log -1 --oneline

cd $REPO/master-server
echo "[deploy] npm install"
npm install --omit=dev --no-fund --no-audit 2>&1 | tail -3

# Постоянные env-переменные для PM2
PM2_ENV=$(cat <<EOF
{{
  "DEV_API_KEY": "alfa_dev_owner_local",
  "DEV_SEED": "true",
  "PORT": "8080",
  "NODE_ENV": "production",
  "PG_HOST": "127.0.0.1",
  "PG_PORT": "5432",
  "PG_DB": "alfamp",
  "PG_USER": "alfamp",
  "PG_PASSWORD": "{pg_pass}"
}}
EOF
)

if pm2 describe $APP >/dev/null 2>&1; then
    echo "[deploy] pm2 reload (zero-downtime)"
    pm2 reload $APP --update-env
else
    echo "[deploy] pm2 start (first run)"
    DEV_API_KEY=alfa_dev_owner_local DEV_SEED=true PORT=8080 NODE_ENV=production \\
    PG_HOST=127.0.0.1 PG_PORT=5432 PG_DB=alfamp PG_USER=alfamp PG_PASSWORD='{pg_pass}' \\
    pm2 start npm --name $APP --time -- start
fi

pm2 save >/dev/null

# Quick health check
sleep 3
echo "[deploy] health:"
curl -sS -m 5 http://127.0.0.1:8080/health | head -1
echo ""
echo "[deploy] ✓ done"
"""
        sftp = cli.open_sftp()
        with sftp.file("/opt/alfamp/deploy.sh", "w") as f:
            f.write(deploy_sh)
        sftp.chmod("/opt/alfamp/deploy.sh", 0o755)
        sftp.close()
        print("  /opt/alfamp/deploy.sh written (chmod +x)")

        print()
        print("=" * 60)
        print("7. First deploy via deploy.sh")
        print("=" * 60)
        run(cli, "/opt/alfamp/deploy.sh", timeout=180)

        print()
        print("=" * 60)
        print("8. PM2 startup (на случай перезагрузки VPS)")
        print("=" * 60)
        run(cli, "pm2 startup systemd -u root --hp /root | tail -1", check=False)
        run(cli, "pm2 save", check=False)

        print()
        print("=" * 60)
        print("✓ git-deploy pipeline готов")
        print("=" * 60)
        print("Workflow:")
        print("  1. локально: git push origin main")
        print("  2. на VPS:   /opt/alfamp/deploy.sh")
        print("  (or via GitHub Actions later)")
        print("=" * 60)
    finally:
        cli.close()


if __name__ == "__main__":
    main()
