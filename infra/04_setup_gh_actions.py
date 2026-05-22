"""
Финальный шаг REPO→VPS pipeline:
1. Генерим ОТДЕЛЬНЫЙ SSH-key для GitHub Actions → VPS
2. Добавляем public key в VPS:/root/.ssh/authorized_keys (с restrictions)
3. Сохраняем private key как GitHub secret VPS_SSH_KEY (+ host, user)
4. Workflow в .github/workflows/deploy.yml уже готов

После этого:
- git push origin main → GitHub Actions runner → ssh root@VPS → /opt/alfamp/deploy.sh
"""
import io
import sys
import json
import base64
import configparser
import subprocess
from pathlib import Path
from urllib import request as urlreq

import paramiko
from nacl import encoding, public  # PyNaCl нужен для шифрования secret'ов

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


def run(cli, cmd, check=True):
    _, out, err = cli.exec_command(cmd, timeout=60)
    o = out.read().decode("utf-8", "replace")
    e = err.read().decode("utf-8", "replace")
    rc = out.channel.recv_exit_status()
    if o.strip(): print(o, flush=True)
    if e.strip(): print(f"  [stderr] {e.strip()}", flush=True)
    if check and rc != 0:
        raise RuntimeError(f"rc={rc}: {cmd[:80]}")
    return rc, o, e


def gh(method, path, body=None):
    c = cfg()
    tok = c.get("github", "token")
    data = json.dumps(body).encode() if body else None
    req = urlreq.Request(f"https://api.github.com{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    with urlreq.urlopen(req, timeout=20) as r:
        body = r.read().decode()
        return json.loads(body) if body else {}


def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    """GitHub-style sealed box encryption for secrets."""
    pk = public.PublicKey(public_key_b64.encode("utf-8"), encoding.Base64Encoder())
    sealed = public.SealedBox(pk).encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(sealed).decode("utf-8")


def main():
    c = cfg()
    repo_full = c.get("github", "repo_full")
    vps_host = c.get("vps", "host")
    cli = ssh()

    try:
        print("=" * 60)
        print("1. Generate SSH key for GH Actions → VPS direction")
        print("=" * 60)
        # Если уже сгенерён — переиспользуем
        rc, _, _ = run(cli, "test -f /root/.ssh/alfamp_gh_actions", check=False)
        if rc != 0:
            run(cli, "ssh-keygen -t ed25519 -C 'gh-actions-to-vps' -f /root/.ssh/alfamp_gh_actions -N ''")
        _, pubkey, _ = run(cli, "cat /root/.ssh/alfamp_gh_actions.pub")
        _, privkey, _ = run(cli, "cat /root/.ssh/alfamp_gh_actions")
        pubkey = pubkey.strip()
        privkey = privkey.strip()
        print(f"  pubkey: {pubkey[:60]}...")

        print()
        print("=" * 60)
        print("2. Authorize this key on VPS (only for /opt/alfamp/deploy.sh)")
        print("=" * 60)
        # Force command + restrictions для минимизации поверхности атаки
        auth_line = f'command="/opt/alfamp/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty {pubkey}'
        # Если уже есть — не дублируем
        run(cli, f"touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys")
        run(cli, f"grep -q 'gh-actions-to-vps' /root/.ssh/authorized_keys || echo '{auth_line}' >> /root/.ssh/authorized_keys")
        run(cli, "cat /root/.ssh/authorized_keys | tail -2")
        # Note: command= forces deploy.sh execution; ssh-action's `script:` will run that script regardless of what it sends. We make it deterministic.
        # ACTUALLY this is problematic — ssh-action sends bash commands. With force-command, those commands are IGNORED and /opt/alfamp/deploy.sh runs.
        # That's actually what we want.

        print()
        print("=" * 60)
        print("3. Fetch GitHub repo's public key for secret encryption")
        print("=" * 60)
        pk_resp = gh("GET", f"/repos/{repo_full}/actions/secrets/public-key")
        repo_pk = pk_resp["key"]
        repo_pk_id = pk_resp["key_id"]
        print(f"  repo public-key id: {repo_pk_id}")

        print()
        print("=" * 60)
        print("4. Upload secrets to GitHub")
        print("=" * 60)
        secrets_to_set = {
            "VPS_HOST": vps_host,
            "VPS_USER": "root",
            "VPS_SSH_KEY": privkey + "\n"
        }
        for name, value in secrets_to_set.items():
            enc = encrypt_secret(repo_pk, value)
            gh("PUT", f"/repos/{repo_full}/actions/secrets/{name}", {
                "encrypted_value": enc,
                "key_id": repo_pk_id
            })
            print(f"  ✓ {name}")

        print()
        print("=" * 60)
        print("✓ GitHub Actions auto-deploy готов")
        print("=" * 60)
        print(f"Workflow: .github/workflows/deploy.yml")
        print(f"Trigger:  git push origin main (paths: master-server/**)")
        print(f"Action:   ssh root@{vps_host} → /opt/alfamp/deploy.sh")
        print()
        print("Чтобы протестировать:")
        print("  1. Сделай локальный коммит в master-server/")
        print("  2. git push origin main")
        print("  3. https://github.com/{}/actions — увидишь workflow run".format(repo_full))
        print("=" * 60)
    finally:
        cli.close()


if __name__ == "__main__":
    main()
