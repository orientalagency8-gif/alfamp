#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "===== [1/8] apt update + upgrade ====="
apt-get update -qq
apt-get upgrade -y -qq

echo "===== [2/8] Installing base packages ====="
apt-get install -y -qq \
    curl wget git vim htop net-tools build-essential \
    ca-certificates gnupg lsb-release software-properties-common \
    ufw fail2ban unattended-upgrades jq

echo "===== [3/8] Creating non-root sudo user 'alfa' ====="
if ! id -u alfa >/dev/null 2>&1; then
    useradd -m -s /bin/bash alfa
    ALFA_USER_PASS=$(openssl rand -base64 18 | tr -d '+/=' | cut -c1-20)
    echo "alfa:$ALFA_USER_PASS" | chpasswd
    usermod -aG sudo alfa
    # Allow alfa to sudo without password for our automated scripts later
    echo "alfa ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/alfa
    chmod 0440 /etc/sudoers.d/alfa
    echo "::ALFA_USER_PASS::$ALFA_USER_PASS"
else
    echo "user 'alfa' already exists, skipping"
fi

echo "===== [4/8] Configuring UFW firewall ====="
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp    comment 'SSH'       >/dev/null
ufw allow 80/tcp    comment 'HTTP'      >/dev/null
ufw allow 443/tcp   comment 'HTTPS'     >/dev/null
ufw allow 8080/tcp  comment 'Alfa MP Master (dev)' >/dev/null
ufw allow 30120/tcp comment 'FXServer TCP' >/dev/null
ufw allow 30120/udp comment 'FXServer UDP' >/dev/null
ufw --force enable
echo "UFW status:"
ufw status verbose | head -20

echo "===== [5/8] Configuring fail2ban ====="
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ssh
maxretry = 5
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban
fail2ban-client status

echo "===== [6/8] Enabling unattended security upgrades ====="
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

echo "===== [7/8] Hostname + timezone ====="
hostnamectl set-hostname alfamp-master-01
timedatectl set-timezone UTC

echo "===== [8/8] Summary ====="
echo "OS: $(lsb_release -ds)"
echo "Kernel: $(uname -r)"
echo "Hostname: $(hostname)"
echo "Timezone: $(timedatectl show -p Timezone --value)"
echo "Disk free: $(df -h / | tail -1 | awk '{print $4}')"
echo "Memory: $(free -h | awk '/^Mem:/{print $2}')"
echo "UFW: $(ufw status | head -1)"
echo "fail2ban: $(systemctl is-active fail2ban)"
echo ""
echo "✓ Hardening complete"
