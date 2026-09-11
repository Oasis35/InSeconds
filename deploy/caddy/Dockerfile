FROM caddy:2-builder-alpine AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
RUN apk add --no-cache libcap && \
    addgroup -g 1000 caddy && \
    adduser -D -u 1000 -G caddy caddy

COPY --from=builder /usr/bin/caddy /usr/bin/caddy

RUN setcap cap_net_bind_service=+ep /usr/bin/caddy && \
    mkdir -p /data /config && \
    chown -R caddy:caddy /data /config /usr/bin/caddy

USER caddy
