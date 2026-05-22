"""
Генерим JWT_SECRET на VPS (если ещё нет) и обновляем /opt/alfamp/deploy.sh
чтобы он передавал JWT_SECRET в PM2.
"""
import io
import sys
import configparser
from pathlib import Path

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)

SECRETS = Path(__file__).parent.parent / "secrets.cfg"


def main():
    cfg = configparser.ConfigParser()
    cfg.read(SECRETS)
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
        def run(cmd, check=True):
            _, out, err = cli.exec_command(cmd, timeout=60)
            o = out.read().decode(); e = err.read().decode()
            rc = out.channel.recv_exit_status()
            if o: print(o, end="")
            if e.strip(): print("[stderr]", e, file=sys.stderr)
            if check and rc != 0: raise RuntimeError(f"rc={rc}: {cmd[:60]}")
            return o

        print("=== Generating JWT_SECRET if missing ===")
        run("""
            if [ ! -f /root/.alfamp_jwt_secret ]; then
                openssl rand -base64 48 | tr -d '+/=' | cut -c1-64 > /root/.alfamp_jwt_secret
                chmod 600 /root/.alfamp_jwt_secret
                echo 'created'
            else
                echo 'already exists'
            fi
        """)
        run("ls -la /root/.alfamp_jwt_secret")

        print()
        print("=== Updating /opt/alfamp/deploy.sh to include JWT_SECRET ===")
        pg_pass = run("cat /root/.alfamp_db_pass", check=False).strip()
        jwt_secret = run("cat /root/.alfamp_jwt_secret").strip()

        deploy_sh = f"""#!/usr/bin/env bash
# Alfa MP — pull-and-deploy для master-server. Вызывается из GitHub Actions
# (via force-command в authorized_keys) или вручную.
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

# Env через --update-env при reload (или при первом start)
ENV_VARS="DEV_API_KEY=alfa_dev_owner_local \\
DEV_SEED=true \\
PORT=8080 \\
NODE_ENV=production \\
PG_HOST=127.0.0.1 PG_PORT=5432 PG_DB=alfamp PG_USER=alfamp PG_PASSWORD='{pg_pass}' \\
JWT_SECRET='{jwt_secret}'"

if pm2 describe $APP >/dev/null 2>&1; then
    echo "[deploy] pm2 reload (zero-downtime)"
    eval "env $ENV_VARS pm2 restart $APP --update-env"
else
    echo "[deploy] pm2 start (first run)"
    eval "env $ENV_VARS pm2 start npm --name $APP --time -- start"
fi

pm2 save >/dev/null

sleep 4
echo "[deploy] health:"
curl -sS -m 5 http://127.0.0.1:8080/health
echo ""
echo "[deploy] ✓ done"
"""
        sftp = cli.open_sftp()
        with sftp.file("/opt/alfamp/deploy.sh", "w") as f:
            f.write(deploy_sh)
        sftp.chmod("/opt/alfamp/deploy.sh", 0o755)
        sftp.close()
        print("  deploy.sh updated with JWT_SECRET injection")

        print()
        print("=== Running deploy.sh ===")
        run("/opt/alfamp/deploy.sh", check=False)

    finally:
        cli.close()


if __name__ == "__main__":
    main()
