"""Deploy master-server to VPS via SFTP + remote install."""
import io
import sys
import time
import configparser
import tarfile
from pathlib import Path

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", write_through=True)

SECRETS = Path(__file__).parent.parent / "secrets.cfg"
LOCAL_MASTER = Path(__file__).parent.parent / "master-server"
REMOTE_BASE = "/opt/alfamp"
REMOTE_MASTER = f"{REMOTE_BASE}/master-server"


def get_client() -> paramiko.SSHClient:
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
    return cli


def run(cli, cmd, *, check=True, timeout=300):
    stdin, stdout, stderr = cli.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    rc = stdout.channel.recv_exit_status()
    if out.strip():
        print(out, flush=True)
    if err.strip():
        print(f"  [stderr] {err.strip()}", flush=True)
    if check and rc != 0:
        raise RuntimeError(f"command failed (rc={rc}): {cmd[:80]}")
    return rc, out, err


def upload_master_server(cli):
    """Tar local master-server (excluding node_modules), upload, extract."""
    print(f"→ Packing {LOCAL_MASTER} (excluding node_modules)...")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for item in LOCAL_MASTER.rglob("*"):
            if "node_modules" in item.parts:
                continue
            if item.name in (".DS_Store", "startup.log", "startup.err"):
                continue
            if item.is_file():
                arc = item.relative_to(LOCAL_MASTER)
                tar.add(item, arcname=str(arc))
    buf.seek(0)
    data = buf.read()
    print(f"  packed {len(data)/1024:.1f} KB")

    print(f"→ Preparing remote dir {REMOTE_MASTER}")
    run(cli, f"mkdir -p {REMOTE_MASTER}")

    print(f"→ Uploading tarball")
    sftp = cli.open_sftp()
    with sftp.file("/tmp/alfamp-master.tar.gz", "wb") as f:
        f.write(data)
    sftp.close()

    print(f"→ Extracting on remote")
    run(cli, f"tar -xzf /tmp/alfamp-master.tar.gz -C {REMOTE_MASTER}")
    run(cli, f"rm /tmp/alfamp-master.tar.gz")
    run(cli, f"ls -la {REMOTE_MASTER}/")


def install_and_start(cli):
    print("→ npm install (это займёт ~30 сек)")
    run(cli, f"cd {REMOTE_MASTER} && npm install --omit=dev --no-fund --no-audit 2>&1 | tail -5", timeout=180)

    print("→ Stopping existing PM2 process (если есть)")
    run(cli, "pm2 delete alfa-master 2>/dev/null || true", check=False)

    print("→ Starting master-server via PM2")
    env = "DEV_API_KEY=alfa_dev_owner_local DEV_SEED=true PORT=8080 NODE_ENV=production"
    run(cli, (
        f"cd {REMOTE_MASTER} && {env} "
        f"pm2 start npm --name alfa-master --time -- start"
    ))

    print("→ Saving PM2 process list + enable on boot")
    run(cli, "pm2 save", check=False)
    rc, out, _ = run(cli, "pm2 startup systemd -u root --hp /root | tail -3", check=False)
    # PM2 prints sudo command to enable boot — we're root, so it works automatically here

    time.sleep(2)
    print("→ PM2 status:")
    run(cli, "pm2 list", check=False)


def configure_nginx(cli):
    print("→ Writing /etc/nginx/sites-available/alfamp")
    nginx_conf = """server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Health endpoint can be cached briefly
    location /health {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    access_log /var/log/nginx/alfamp-access.log;
    error_log  /var/log/nginx/alfamp-error.log warn;
}
"""
    sftp = cli.open_sftp()
    with sftp.file("/etc/nginx/sites-available/alfamp", "w") as f:
        f.write(nginx_conf)
    sftp.close()

    run(cli, "ln -sf /etc/nginx/sites-available/alfamp /etc/nginx/sites-enabled/alfamp")
    run(cli, "rm -f /etc/nginx/sites-enabled/default")
    print("→ nginx -t")
    run(cli, "nginx -t 2>&1")
    print("→ Reload nginx")
    run(cli, "systemctl reload nginx")


def health_check(cli):
    print("→ Health-check изнутри (127.0.0.1:8080)")
    run(cli, "sleep 2 && curl -sS http://127.0.0.1:8080/ | head -20", check=False)
    print("→ Health-check через nginx (127.0.0.1:80)")
    run(cli, "curl -sS http://127.0.0.1/ | head -20", check=False)
    print("→ Server list через nginx")
    run(cli, "curl -sS http://127.0.0.1/v1/servers | head -40", check=False)


def main() -> int:
    print("=" * 50)
    print("Alfa MP — Deploy master-server to VPS")
    print("=" * 50)
    cli = get_client()
    try:
        upload_master_server(cli)
        install_and_start(cli)
        configure_nginx(cli)
        health_check(cli)
        print()
        print("=" * 50)
        print("✓ DEPLOY DONE")
        print("=" * 50)
        cfg = configparser.ConfigParser()
        cfg.read(SECRETS)
        host = cfg.get("vps", "host")
        print(f"  http://{host}/        ← via nginx (80)")
        print(f"  http://{host}:8080/   ← прямой Node.js")
        print(f"  http://{host}/v1/servers")
        print(f"  http://{host}/v1/docs")
        print("=" * 50)
        return 0
    finally:
        cli.close()


if __name__ == "__main__":
    sys.exit(main())
