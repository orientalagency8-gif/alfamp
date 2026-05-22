# Alfa MP — Game Server (upstream FXServer + наш heartbeat)
#
# Базируется на официальном образе spritsail/fivem-server, который содержит
# свежий FXServer Linux build. Поверх ставим curl/jq для heartbeat и наш скрипт.
#
# После нашего собственного форка citizenfx/fivem заменим базовый образ
# на свой alfamp/server-base:latest.

FROM spritsail/fivem-server:latest

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl jq ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Наш heartbeat-сайдкар
COPY heartbeat.sh /usr/local/bin/heartbeat.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/heartbeat.sh /usr/local/bin/entrypoint.sh

# Health-check: жив ли процесс FXServer
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD pgrep -f FXServer >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
