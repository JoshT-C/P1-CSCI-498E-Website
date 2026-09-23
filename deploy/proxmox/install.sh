#!/usr/bin/env bash
# jtc-site — installs the site in a Debian 13 container (run by jtc-site.sh
# on the Proxmox host, or by hand on any Debian 13 system):
#
#   nginx serving the prerendered Angular build on :80, built from source by
#   an unprivileged user, with the repo's hardened nginx config. TLS belongs
#   to the reverse proxy in front (NGINX Proxy Manager, Caddy, a tunnel).
#
# Usage:
#   install.sh             install, or re-deploy the same commit
#   install.sh --update    fetch the newest commit; rebuild only if it changed
#   update                 the same as --update (installed for the console)
#
# Environment:
#   JTC_REPO   git URL or path to build from   (default: the GitHub repo)
#   JTC_REF    branch or tag                   (default: the repo's default)
#   NODE_MAJOR Node.js major version           (default: 24)
set -Eeuo pipefail

JTC_REPO="${JTC_REPO:-https://github.com/JoshT-C/P1-CSCI-498E-Website.git}"
JTC_REF="${JTC_REF:-}"
NODE_MAJOR="${NODE_MAJOR:-24}"
APP_DIR=/opt/jtc-site
SRC_DIR="$APP_DIR/src"
WEB_ROOT=/var/www/jtc-site
BUILD_USER=jtc-build
SELF=/usr/local/sbin/jtc-site

YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; CL=$'\033[m'
msg_info()  { printf ' %s…%s %s\n' "$YW" "$CL" "$1"; }
msg_ok()    { printf ' %s✓%s %s\n' "$GN" "$CL" "$1"; }
msg_error() { printf ' %s✗%s %s\n' "$RD" "$CL" "$1" >&2; }
trap 'msg_error "failed at line $LINENO: $BASH_COMMAND"' ERR

UPDATE=0
case "${1:-}" in
  --update) UPDATE=1 ;;
  "") ;;
  *) msg_error "unknown option: $1"; exit 2 ;;
esac
[[ "$(basename "$0")" == "update" ]] && UPDATE=1

[[ $EUID -eq 0 ]] || { msg_error "run as root"; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
if [[ "${ID:-}" != "debian" ]]; then
  msg_error "Debian only (found ${ID:-unknown})"
  exit 1
fi
[[ "${VERSION_ID:-}" == "13" ]] || msg_info "tested on Debian 13; this is Debian ${VERSION_ID:-?}"

export DEBIAN_FRONTEND=noninteractive

has_systemd() { [[ -d /run/systemd/system ]]; }

install_packages() {
  msg_info "Installing packages"
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    ca-certificates curl git gnupg nginx rsync unattended-upgrades >/dev/null
  msg_ok "Installed nginx, git and friends"

  # Security updates install themselves.
  cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
  msg_ok "Enabled unattended security upgrades"
}

install_node() {
  if command -v node >/dev/null && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]]; then
    msg_ok "Node.js $(node -v) already present"
    return
  fi
  msg_info "Installing Node.js $NODE_MAJOR (NodeSource, signed repository)"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    >/etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
  msg_ok "Installed Node.js $(node -v)"
}

ensure_user() {
  if ! id "$BUILD_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$BUILD_USER"
  fi
  install -d -o "$BUILD_USER" -g "$BUILD_USER" -m 0750 "$APP_DIR"
}

as_builder() { runuser -u "$BUILD_USER" -- env HOME="$APP_DIR" npm_config_cache="$APP_DIR/.npm" "$@"; }

# Prints "changed" or "same".
fetch_source() {
  local before=""
  if [[ -d "$SRC_DIR/.git" ]]; then
    before="$(as_builder git -C "$SRC_DIR" rev-parse HEAD)"
    as_builder git -C "$SRC_DIR" fetch -q --depth 1 origin "${JTC_REF:-HEAD}"
    as_builder git -C "$SRC_DIR" reset --hard -q FETCH_HEAD
  else
    local branch=() repo="$JTC_REPO"
    [[ -n "$JTC_REF" ]] && branch=(--branch "$JTC_REF")
    if [[ -d "$repo" ]]; then
      # A local checkout (CI tests the installer this way) belongs to
      # another user: trust it for this build user only, and clone it as a
      # URL so --depth applies.
      as_builder git config --global --add safe.directory "$(realpath "$repo")"
      as_builder git config --global --add safe.directory "$(realpath "$repo")/.git"
      repo="file://$(realpath "$repo")"
    fi
    as_builder git clone -q --depth 1 "${branch[@]}" "$repo" "$SRC_DIR"
  fi
  local after
  after="$(as_builder git -C "$SRC_DIR" rev-parse HEAD)"
  [[ "$before" == "$after" ]] && echo same || echo changed
}

build_site() {
  msg_info "Building the site (a few minutes)"
  (cd "$SRC_DIR" && as_builder npm ci --no-audit --no-fund --loglevel=error >/dev/null)
  (cd "$SRC_DIR" && as_builder npm run build --silent >/dev/null)
  msg_ok "Built $(as_builder git -C "$SRC_DIR" log -1 --format='%h %s')"
}

deploy_site() {
  msg_info "Deploying"
  local next="$WEB_ROOT.next"
  rm -rf "$next"
  rsync -a --delete "$SRC_DIR/dist/jtc-site/browser/" "$next/"
  chown -R root:root "$next"
  chmod -R u=rwX,go=rX "$next"
  # swap in one step, so no request sees half a deploy
  if [[ -d "$WEB_ROOT" ]]; then
    mv "$WEB_ROOT" "$WEB_ROOT.prev"
  fi
  mv "$next" "$WEB_ROOT"
  rm -rf "$WEB_ROOT.prev"
  # the dependencies are rebuilt by npm ci on every update anyway
  rm -rf "$SRC_DIR/node_modules"
  msg_ok "Deployed to $WEB_ROOT"
}

configure_nginx() {
  msg_info "Configuring nginx"
  install -m 0644 "$SRC_DIR/deploy/nginx/snippets/jtc-http.conf" /etc/nginx/conf.d/jtc-http.conf
  install -d /etc/nginx/snippets
  install -m 0644 "$SRC_DIR/deploy/nginx/snippets/jtc-site.conf" /etc/nginx/snippets/jtc-site.conf
  install -m 0644 "$SRC_DIR/deploy/nginx/lxc/jtc-site.conf" /etc/nginx/sites-available/jtc-site
  ln -sf /etc/nginx/sites-available/jtc-site /etc/nginx/sites-enabled/jtc-site
  rm -f /etc/nginx/sites-enabled/default
  nginx -t -q
  if has_systemd; then
    systemctl enable -q nginx
    systemctl reload-or-restart nginx
  elif [[ -f /run/nginx.pid ]] && kill -0 "$(cat /run/nginx.pid)" 2>/dev/null; then
    nginx -s reload
  else
    nginx # no systemd (a plain container, as in CI)
  fi
  msg_ok "nginx serving on :80"
}

install_update_command() {
  install -m 0755 "$0" "$SELF" 2>/dev/null || true
  cat >/usr/bin/update <<EOF
#!/usr/bin/env bash
# Rebuild jtc-site from the newest commit (a no-op when nothing changed).
exec env JTC_REPO="$JTC_REPO" JTC_REF="$JTC_REF" NODE_MAJOR="$NODE_MAJOR" "$SELF" --update "\$@"
EOF
  chmod 0755 /usr/bin/update
}

main() {
  if [[ $UPDATE -eq 1 ]]; then
    [[ -d "$SRC_DIR/.git" ]] || { msg_error "not installed yet: run install.sh first"; exit 1; }
    install_node
    msg_info "Checking for a newer commit"
    if [[ "$(fetch_source)" == "same" && -d "$WEB_ROOT" ]]; then
      msg_ok "Already up to date ($(as_builder git -C "$SRC_DIR" log -1 --format=%h))"
      exit 0
    fi
    build_site
    deploy_site
    configure_nginx
    msg_ok "Updated"
    exit 0
  fi

  install_packages
  install_node
  ensure_user
  msg_info "Fetching the source from $JTC_REPO"
  fetch_source >/dev/null
  msg_ok "Fetched $(as_builder git -C "$SRC_DIR" log -1 --format=%h)"
  build_site
  deploy_site
  configure_nginx
  install_update_command
  apt-get autoremove -y -qq >/dev/null
  apt-get clean
  msg_ok "Installed. Update later with: ${BL}update${CL}"
}

main
