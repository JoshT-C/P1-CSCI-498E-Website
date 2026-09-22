# ---- Build stage: Angular 22 static build ----
FROM node:24-alpine AS build
WORKDIR /app

# Committed lockfile → reproducible installs.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# outputMode: "static" prerenders the page, so the browser/ output is
# a complete, servable static site.
RUN npx ng build

# ---- Serve stage: hardened, non-root nginx ----
FROM nginx:1.29-alpine

# Non-root by design: the container listens on 8080/8443 and the host maps
# 80→8080 / 443→8443, so a non-root process never has to bind a privileged
# port while the public interface stays the conventional one.
RUN addgroup -S -g 101 site && adduser -S -u 101 -G site site \
    && mkdir -p /var/cache/nginx /var/run /var/www/certbot \
    && chown -R site:site /var/cache/nginx /var/run /var/www/certbot \
    && touch /var/run/nginx.pid && chown site:site /var/run/nginx.pid

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/conf.d/ /etc/nginx/conf.d/
COPY --from=build /app/dist/jtc-site/browser /usr/share/nginx/html

USER 101:101
EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
