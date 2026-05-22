#!/usr/bin/env bash
# Install Docker Engine + Compose plugin on Ubuntu 24.04.
# https://docs.docker.com/engine/install/ubuntu/
set -e
export DEBIAN_FRONTEND=noninteractive

if command -v docker >/dev/null 2>&1; then
    echo "Docker already installed:"
    docker --version
    docker compose version
    exit 0
fi

echo "===== Adding Docker apt repository ====="
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -qq

echo "===== Installing docker-ce ====="
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

echo "===== Versions ====="
docker --version
docker compose version

echo "===== Pull base image (spritsail/fivem-server) ====="
docker pull spritsail/fivem-server:latest || echo "(warn: pull failed, will retry on build)"

echo "✓ Docker ready"
