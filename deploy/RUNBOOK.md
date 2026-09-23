# Deploy runbook — jtc.lopyhupis.com

Two ways to run the site; both serve the same prerendered Angular build
through the same nginx rules (`deploy/nginx/snippets/`):

- **Proxmox LXC behind a reverse proxy** (section P): one command on the
  Proxmox host; TLS lives on the proxy (NGINX Proxy Manager, Caddy, a
  tunnel).
- **Docker on a server that faces the internet** (sections A–C): a
  non-root, read-only nginx container, with Let's Encrypt issued by a
  certbot sidecar over the webroot (zero downtime — nginx never stops
  serving).

Docker state model: everything lives in `/opt/site` (a clone of this repo)
and two named Docker volumes (`letsencrypt`, `certbot-webroot`). The only
secret is `.env` (gitignored, server-only). Rollback is `git checkout
<commit>` + rebuild — the container is stateless.

---

## 0. Pre-deploy audit (dev machine, before first boot and before every deploy)

The site runs on personal hardware, so "it works on my machine" is not the
bar — the shipped bundle is scanned, and the rendered page is audited in a
real browser. Run from the repo root:

```bash
npm run lint && npm run typecheck && npm test -- --watch=false && npm run build
npm run audit:dist    # scans dist/ for secrets, http:// origins, sourcemaps
npm run e2e           # Playwright: with and without WebGL, desktop and phone
```

CI (`.github/workflows/ci.yml`) runs all of that on every push, the
Playwright suite in Chromium, Firefox and WebKit on Linux, macOS and Windows,
and the suite again against the Docker image and a simulated Proxmox install
with the nginx header checks on (`E2E_NGINX=1`).

After deploy, point the suite at the live site (headers included):

```bash
E2E_NGINX=1 E2E_BASE_URL=https://jtc.lopyhupis.com npx playwright test --project desktop-firefox
```

**Stop if** `audit:dist` reports any finding or any test fails. A 3D test
skipped for "no WebGL in this browser" is the environment, not the site.

---

## P. Proxmox LXC (behind a reverse proxy)

On the Proxmox host, as root:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/JoshT-C/P1-CSCI-498E-Website/main/deploy/proxmox/jtc-site.sh)"
```

It asks for defaults or advanced settings (ID, cores, memory, disk,
bridge, DHCP or a static address, VLAN), downloads the Debian 13 template
if needed, creates an **unprivileged** container whose Proxmox firewall
allows inbound HTTP and ping only (effective once the datacenter firewall
is on), and runs `deploy/proxmox/install.sh` in it: nginx, Node.js from
NodeSource's signed repository, a build as the unprivileged `jtc-build`
user, an atomic deploy to `/var/www/jtc-site`, and unattended security
upgrades. Unattended: `JTC_DEFAULTS=1` plus any `var_*` variable (see the
top of the script).

Then point the proxy host for `jtc.lopyhupis.com` at `http://<container
IP>:80` with TLS on. nginx takes the visitor's address from
`X-Forwarded-For` only when the request comes from a private network, so
the per-address limits apply per visitor, not to the proxy.

Updates: `pct enter <id>`, then `update` (rebuilds only when the branch has
a new commit). CI runs the whole flow on every push against stand-ins for
the Proxmox commands (`deploy/proxmox/test/simulate.sh`).

## A. Preflight (one-time, ~10 min)

```bash
# 1. What IP is the world actually using to reach you?
curl -s ifconfig.me

# 2. Point the domain at it. In your DNS manager: A record
#    jtc.lopyhupis.com → <that IP>
#    (If the domain sits behind a CDN/proxy, set DNS-only/grey-cloud first —
#     fewest moving parts on a first run.)
#    Then poll until it resolves:
dig +short jtc.lopyhupis.com

# 3. Docker + compose present:
docker --version && docker compose version

# 4. Ports 80 and 443 open (server firewall AND any datacenter panel):
sudo ufw status
#    allow 80/tcp and 443/tcp if not already (e.g. sudo ufw allow 80,443/tcp)

# 5. Clone:
sudo mkdir -p /opt/site && sudo chown $USER /opt/site
git clone https://github.com/JoshT-C/P1-CSCI-498E-Website /opt/site
cd /opt/site

# 6. Create the server-only env file:
cp .env.example .env
#    edit .env: set CERT_EMAIL to a real address (LE expiry notices)
chmod 600 .env
```

**Stop if** `dig` doesn't return the IP from step 1, or 80/443 aren't
reachable from outside (`curl -sI http://jtc.lopyhupis.com/` from *another*
machine should not be `Connection refused` after step B.7).

## B. First boot + certificate (~15 min)

```bash
# 7. Build and start (NGINX_CONF=http-only from .env). The node:24 build
#    stage takes ~3–5 min the first time.
docker compose up -d --build web

# 8. Site must be live over plain HTTP:
curl -sI http://jtc.lopyhupis.com/
#    → HTTP/1.1 200 OK, text/html
#    If not: DNS (dig), firewall (port 80), or `docker logs jtc-site`. Stop.

# 9. ACME probe — proves Let's Encrypt's machines can reach the webroot
#    *before* you ask them to. This single check catches every classic
#    first-run failure (DNS not propagated, firewall, proxy eating the path).
docker compose run --rm certbot sh -c 'echo probe > /var/www/certbot/probe'
curl -s http://jtc.lopyhupis.com/.well-known/acme-challenge/probe
#    → probe
docker compose run --rm certbot sh -c 'rm /var/www/certbot/probe'
#    If you don't get "probe": the domain is reachable by *you* but not by
#    the outside world — fix DNS/firewall and re-test. Do not continue.

# 10. Issue the certificate (webroot: nginx keeps serving the whole time):
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  --domains jtc.lopyhupis.com \
  --email "$CERT_EMAIL" --agree-tos --no-eff-email

# 11. Confirm the files landed in the shared volume:
docker compose run --rm certbot ls /etc/letsencrypt/live/jtc.lopyhupis.com/
#    → fullchain.pem  privkey.pem  ...

# 12. Flip to the TLS config and restart:
sed -i 's/^NGINX_CONF=.*/NGINX_CONF=full/' .env
docker compose up -d web

# 13. Verify all four things:
curl -sI https://jtc.lopyhupis.com/
#    → 200 + strict-transport-security + content-security-policy + x-frame-options
curl -sI http://jtc.lopyhupis.com/
#    → 301, location: https://jtc.lopyhupis.com/
curl -s https://jtc.lopyhupis.com/any/deep/route | head -3
#    → the app HTML (SPA fallback working)
echo | openssl s_client -connect jtc.lopyhupis.com:443 -servername jtc.lopyhupis.com 2>/dev/null \
  | openssl x509 -noout -issuer -dates
#    → issuer: Let's Encrypt (E5 or similar), notExpiring for ~90 days

# 14. Renewal, wired up in the same session so it's never "remember later":
cat > /opt/site/renew.sh <<'EOF'
#!/bin/sh
set -eu
cd /opt/site
docker compose run --rm certbot renew --webroot -w /var/www/certbot --quiet \
  --deploy-hook "docker compose exec -T web nginx -s reload"
EOF
chmod +x /opt/site/renew.sh
#    Daily at 03:00; certbot itself no-ops when <30 days from expiry:
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/site/renew.sh >> /var/log/le-renew.log 2>&1") | crontab -
```

## C. Subsequent deploys

```bash
git -C /opt/site pull
docker compose -f /opt/site/docker-compose.yml up -d --build web
# then re-run the step-13 checks in a browser
```

## Rollback

```bash
git -C /opt/site checkout <previous-commit>
docker compose -f /opt/site/docker-compose.yml up -d --build web
```

No data lives in the container or its volumes (except certs, which are
independent of the site build), so a rebuild is the entire rollback.

---

## Troubleshooting table

| Symptom | First thing to check |
|---|---|
| `dig` ≠ server IP | DNS not propagated; wait or fix the A record. Nothing else matters until this is true. |
| Step 8 `Connection refused` | Port 80 firewall (ufw **and** datacenter panel); `docker ps` shows the container running? |
| Step 8 works, step 9 doesn't | Something between the internet and nginx is rewriting paths (proxy). Remove/adjust it. |
| Step 10 rate-limit error | Wait 15 min (LE limits: 50 certs/week/domain, 5 duplicates/week). |
| Step 12 site dies after flip | `docker logs jtc-site` — almost always a cert path typo or the `letsencrypt` volume not named identically in both services. |
| Headers missing on some pages | Some `location` block gained its own `add_header`, which drops every inherited header in nginx. Keep all headers in `jtc-site.conf` at server level. |
| Pages cut off mid-load (connection reset) | The per-address limit (100 r/s, burst 400, 100 connections) closed the connection (444). Behind a proxy, check that it sends `X-Forwarded-For` from a private address. |
| Page loads unstyled | A `/media/…` asset 404'd — check `docker logs jtc-site` and that the build stage ran (rebuild after any `package.json` change). |
