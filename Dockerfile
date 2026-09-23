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
RUN mkdir -p /var/www/certbot

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/snippets/ /etc/nginx/snippets/
COPY deploy/nginx/conf.d/ /etc/nginx/conf.d/
# The image runs on its own with the HTTP config (replacing the stock
# default.conf); docker-compose mounts the chosen one over it.
COPY deploy/nginx/conf.d/http-only.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/jtc-site/browser /usr/share/nginx/html

USER 101:101
EXPOSE 8080 8443

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
