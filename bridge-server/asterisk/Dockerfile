FROM andrius/asterisk:latest

USER root
RUN if command -v apt-get >/dev/null; then \
      apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null; then \
      apk add --no-cache python3; \
    fi

COPY http.conf rtp.conf modules.conf extensions.conf /etc/asterisk/
COPY pjsip.conf.template ari.conf.template /templates/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
