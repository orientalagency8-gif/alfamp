#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "===== Finalizing hardening (hostname) ====="
hostnamectl set-hostname alfamp-master-01
echo "alfamp-master-01" > /etc/hostname

echo "===== [1/5] Installing Node.js 22 LTS (NodeSource) ====="
if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
fi
echo "node: $(node --version)"
echo "npm:  $(npm --version)"

echo "===== [2/5] Installing PM2 globally ====="
if ! command -v pm2 >/dev/null; then
    npm install -g pm2 --silent
fi
pm2 --version | head -1

echo "===== [3/5] Installing PostgreSQL 16 ====="
if ! command -v psql >/dev/null; then
    apt-get install -y -qq postgresql postgresql-contrib
fi
systemctl enable --now postgresql
echo "postgres: $(sudo -u postgres psql -tAc 'SHOW server_version;' | head -1)"

echo "===== [4/5] Installing Redis 7 ====="
if ! command -v redis-cli >/dev/null; then
    apt-get install -y -qq redis-server
fi
systemctl enable --now redis-server
echo "redis ping: $(redis-cli ping)"

echo "===== [5/5] Installing nginx ====="
if ! command -v nginx >/dev/null; then
    apt-get install -y -qq nginx
fi
systemctl enable --now nginx
nginx -v 2>&1

echo "===== Creating Postgres DB and user 'alfamp' ====="
ALFA_DB_PASS_FILE=/root/.alfamp_db_pass
if [ ! -f "$ALFA_DB_PASS_FILE" ]; then
    openssl rand -base64 24 | tr -d '+/=' | cut -c1-28 > "$ALFA_DB_PASS_FILE"
    chmod 600 "$ALFA_DB_PASS_FILE"
fi
ALFA_DB_PASS=$(cat "$ALFA_DB_PASS_FILE")

sudo -u postgres psql <<SQL
DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'alfamp') THEN
        CREATE USER alfamp WITH ENCRYPTED PASSWORD '$ALFA_DB_PASS';
    ELSE
        ALTER USER alfamp WITH ENCRYPTED PASSWORD '$ALFA_DB_PASS';
    END IF;
END \$\$;
SELECT 'alfamp user ready' AS status;
SQL

# Create DB if missing
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='alfamp'" | grep -q 1 || \
    sudo -u postgres createdb -O alfamp alfamp

sudo -u postgres psql -d alfamp -c "GRANT ALL PRIVILEGES ON DATABASE alfamp TO alfamp;" >/dev/null
sudo -u postgres psql -d alfamp -c "GRANT ALL ON SCHEMA public TO alfamp;" >/dev/null

echo "::ALFAMP_DB_PASS::$ALFA_DB_PASS"

echo ""
echo "===== Stack installation complete ====="
echo "  node     $(node --version)"
echo "  npm      $(npm --version)"
echo "  pm2      $(pm2 --version | head -1)"
echo "  postgres $(sudo -u postgres psql -tAc 'SHOW server_version;' | head -1)"
echo "  redis    $(redis-cli --version)"
echo "  nginx    $(nginx -v 2>&1 | cut -d/ -f2)"
echo ""
echo "Services:"
for svc in postgresql redis-server nginx fail2ban; do
    echo "  $svc: $(systemctl is-active $svc)"
done
