"""SSH-хелпер для управления VPS.

Читает учётные данные из q:\\AlfaMP\\secrets.cfg, подключается через paramiko.

Использование:
    python ssh_helper.py "uname -a; df -h; free -m"
    python ssh_helper.py --script <path_to_script.sh>
"""
import io
import sys
import argparse
import configparser
from pathlib import Path

import paramiko

# Force UTF-8 stdout/stderr regardless of Windows console codepage
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", write_through=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", write_through=True)


SECRETS = Path(__file__).parent.parent / "secrets.cfg"


def get_client() -> paramiko.SSHClient:
    cfg = configparser.ConfigParser()
    cfg.read(SECRETS)
    host = cfg.get("vps", "host")
    port = cfg.getint("vps", "port", fallback=22)
    user = cfg.get("vps", "user")
    pwd  = cfg.get("vps", "password")

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(
        host, port=port, username=user, password=pwd,
        timeout=15, banner_timeout=15, auth_timeout=15,
        look_for_keys=False, allow_agent=False
    )
    return cli


def run(cmd: str, *, timeout: int = 60) -> int:
    cli = get_client()
    try:
        stdin, stdout, stderr = cli.exec_command(cmd, timeout=timeout, get_pty=False)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        rc  = stdout.channel.recv_exit_status()
        if out:
            print(out, end="" if out.endswith("\n") else "\n")
        if err.strip():
            print("--- STDERR ---", file=sys.stderr)
            print(err, file=sys.stderr)
        return rc
    finally:
        cli.close()


def run_script(local_path: str, *, timeout: int = 600) -> int:
    text = Path(local_path).read_text(encoding="utf-8")
    return run(text, timeout=timeout)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", nargs="?", help="shell command to run")
    ap.add_argument("--script", help="path to local .sh to execute remotely")
    ap.add_argument("--timeout", type=int, default=120)
    args = ap.parse_args()

    if args.script:
        return run_script(args.script, timeout=args.timeout)
    if args.cmd:
        return run(args.cmd, timeout=args.timeout)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
