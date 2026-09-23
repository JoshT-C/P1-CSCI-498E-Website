#!/usr/bin/env bash
# jtc-site — Proxmox VE helper: creates a Debian 13 LXC that builds and serves
# the site. Run it on the Proxmox host, as root:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/JoshT-C/P1-CSCI-498E-Website/main/deploy/proxmox/jtc-site.sh)"
#
# Asks for default or advanced settings (whiptail), then: downloads the
# Debian 13 template if needed, creates an unprivileged container with its
# Proxmox firewall open to HTTP only, and runs deploy/proxmox/install.sh in
# it. Inside the container, `update` rebuilds from the newest commit.
#
# Unattended: any var_* below can be set in the environment, and
# JTC_DEFAULTS=1 skips the questions, e.g.
#   JTC_DEFAULTS=1 var_ctid=210 var_net=192.168.1.40/24 var_gateway=192.168.1.1 bash -c "$(curl ...)"
set -Eeuo pipefail

APP="jtc-site"
JTC_REPO="${JTC_REPO:-https://github.com/JoshT-C/P1-CSCI-498E-Website.git}"
JTC_REF="${JTC_REF:-main}"
JTC_RAW="${JTC_RAW:-https://raw.githubusercontent.com/JoshT-C/P1-CSCI-498E-Website/${JTC_REF}}"

# Defaults: the build needs ~1.5 GB of memory; serving needs almost none.
var_ctid="${var_ctid:-}"
var_hostname="${var_hostname:-jtc-site}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-2048}"
var_swap="${var_swap:-512}"
var_disk="${var_disk:-8}"
var_bridge="${var_bridge:-vmbr0}"
var_net="${var_net:-dhcp}"          # dhcp, or an address in CIDR form
var_gateway="${var_gateway:-}"      # required with a static address
var_vlan="${var_vlan:-}"
var_storage="${var_storage:-}"      # container storage (asked if several)
var_tmpl_storage="${var_tmpl_storage:-}"
var_firewall="${var_firewall:-1}"   # Proxmox firewall: inbound HTTP only

YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; BL=$'\033[36m'; DGN=$'\033[32m'; CL=$'\033[m'
BOLD=$'\033[1m'
TAB="  "

header_info() {
  clear 2>/dev/null || true
  cat <<'EOF'
       _ _                   _ _
      (_) |_ ___       ___  (_) |_ ___
      | | __/ __|_____/ __| | | __/ _ \
      | | || (_|_____\__ \ | | ||  __/
     _/ |\__\___|     |___/ |_|\__\___|
    |__/        Proxmox VE helper
EOF
  echo
}

msg_info()  { printf '%s%s…%s %s\n' "$TAB" "$YW" "$CL" "$1"; }
msg_ok()    { printf '%s%s✓%s %s\n' "$TAB" "$GN" "$CL" "$1"; }
msg_error() { printf '%s%s✗%s %s\n' "$TAB" "$RD" "$CL" "$1" >&2; }
setting()   { printf '%s%s%-18s%s %s%s%s\n' "$TAB" "$BOLD" "$1" "$CL" "$DGN" "$2" "$CL"; }

CTID_CREATED=""
on_error() {
  local code=$? line=$1
  msg_error "failed (exit $code) at line $line: $BASH_COMMAND"
  if [[ -n "$CTID_CREATED" ]]; then
    msg_error "container $CTID_CREATED was created and is left for inspection;"
    msg_error "remove it with: pct stop $CTID_CREATED; pct destroy $CTID_CREATED"
  fi
  exit "$code"
}
trap 'on_error $LINENO' ERR
trap 'echo; msg_error "interrupted"; exit 130' INT

# ---- checks -------------------------------------------------------------
checks() {
  [[ $EUID -eq 0 ]] || { msg_error "run as root on the Proxmox host"; exit 1; }
  command -v pveversion >/dev/null || { msg_error "pveversion not found: this is not a Proxmox VE host"; exit 1; }
  local pve
  pve="$(pveversion | grep -oE 'pve-manager/[0-9]+' | cut -d/ -f2)"
  if [[ "${pve:-0}" -lt 8 ]]; then
    msg_error "Proxmox VE 8 or 9 required (found ${pve:-unknown})"
    exit 1
  fi
  [[ "$(dpkg --print-architecture)" == "amd64" ]] || { msg_error "amd64 hosts only"; exit 1; }
  if [[ -n "$var_ctid" ]] && pct status "$var_ctid" >/dev/null 2>&1; then
    msg_error "container ID $var_ctid is already in use"
    exit 1
  fi
}

interactive() { [[ -t 0 && -t 1 && "${JTC_DEFAULTS:-0}" != "1" ]] && command -v whiptail >/dev/null; }

ask() { # ask TITLE PROMPT DEFAULT -> prints the answer
  whiptail --backtitle "Proxmox VE helper: $APP" --title "$1" --inputbox "$2" 10 64 "$3" 3>&1 1>&2 2>&3
}

# ---- settings -------------------------------------------------------------
settings() {
  [[ -n "$var_ctid" ]] || var_ctid="$(pvesh get /cluster/nextid)"
  if interactive; then
    if ! whiptail --backtitle "Proxmox VE helper: $APP" --title "$APP" --yesno \
      "Create a Debian 13 container that builds and serves the site?\n\nDefaults: ID $var_ctid, ${var_cpu} cores, ${var_ram} MiB RAM, ${var_disk} GB disk, DHCP on $var_bridge." \
      12 64 --yes-button "Defaults" --no-button "Advanced"; then
      var_ctid="$(ask "Container ID" "Container ID" "$var_ctid")"
      var_hostname="$(ask "Hostname" "Hostname" "$var_hostname")"
      var_cpu="$(ask "CPU" "CPU cores" "$var_cpu")"
      var_ram="$(ask "Memory" "Memory in MiB (the build needs about 1500)" "$var_ram")"
      var_disk="$(ask "Disk" "Disk size in GB" "$var_disk")"
      var_bridge="$(ask "Network" "Bridge" "$var_bridge")"
      var_net="$(ask "Network" "IPv4: dhcp, or an address in CIDR form (192.168.1.40/24)" "$var_net")"
      if [[ "$var_net" != "dhcp" ]]; then
        var_gateway="$(ask "Network" "Gateway" "$var_gateway")"
      fi
      var_vlan="$(ask "Network" "VLAN tag (blank for none)" "$var_vlan")"
      if whiptail --title "Firewall" --yesno "Enable the container's Proxmox firewall, allowing inbound HTTP (80/tcp) and ping only?\n\n(It takes effect when the datacenter firewall is on.)" 11 64; then
        var_firewall=1
      else
        var_firewall=0
      fi
    fi
  fi
  validate
}

validate() {
  [[ "$var_ctid" =~ ^[0-9]+$ && "$var_ctid" -ge 100 ]] || { msg_error "container ID must be a number from 100"; exit 1; }
  [[ "$var_hostname" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]] || { msg_error "invalid hostname: $var_hostname"; exit 1; }
  for n in var_cpu var_ram var_swap var_disk; do
    [[ "${!n}" =~ ^[0-9]+$ ]] || { msg_error "$n must be a whole number"; exit 1; }
  done
  [[ "$var_ram" -ge 1536 ]] || msg_info "under 1536 MiB of memory the build may fail"
  if [[ "$var_net" != "dhcp" ]]; then
    [[ "$var_net" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || { msg_error "address must be CIDR, e.g. 192.168.1.40/24"; exit 1; }
    [[ "$var_gateway" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { msg_error "a static address needs a gateway"; exit 1; }
  fi
  [[ -z "$var_vlan" || "$var_vlan" =~ ^[0-9]+$ ]] || { msg_error "VLAN tag must be a number"; exit 1; }
}

pick_storage() { # pick_storage CONTENT CURRENT -> prints a storage id
  local content=$1 current=$2
  if [[ -n "$current" ]]; then echo "$current"; return; fi
  mapfile -t found < <(pvesm status -content "$content" 2>/dev/null | awk 'NR>1 && $3=="active" {print $1}')
  if [[ ${#found[@]} -eq 0 ]]; then
    msg_error "no active storage holds '$content'"
    exit 1
  elif [[ ${#found[@]} -eq 1 ]] || ! interactive; then
    echo "${found[0]}"
  else
    local menu=()
    for s in "${found[@]}"; do menu+=("$s" ""); done
    whiptail --title "Storage" --menu "Storage for $content:" 16 60 8 "${menu[@]}" 3>&1 1>&2 2>&3
  fi
}

# ---- build ------------------------------------------------------------------
template() {
  msg_info "Finding the Debian 13 template"
  pveam update >/dev/null 2>&1 || true
  TEMPLATE="$(pveam available -section system | awk '{print $2}' | grep -E '^debian-13-standard_.*_amd64\.tar\.(zst|gz|xz)$' | sort -V | tail -1)"
  [[ -n "$TEMPLATE" ]] || { msg_error "no Debian 13 template offered by pveam"; exit 1; }
  if ! pveam list "$var_tmpl_storage" | grep -q "$TEMPLATE"; then
    msg_info "Downloading $TEMPLATE"
    pveam download "$var_tmpl_storage" "$TEMPLATE" >/dev/null
  fi
  msg_ok "Template $TEMPLATE"
}

create() {
  local ip="ip=$var_net"
  [[ "$var_net" != "dhcp" ]] && ip+=",gw=$var_gateway"
  local net="name=eth0,bridge=$var_bridge,$ip,ip6=auto,firewall=$var_firewall"
  [[ -n "$var_vlan" ]] && net+=",tag=$var_vlan"
  msg_info "Creating container $var_ctid"
  pct create "$var_ctid" "$var_tmpl_storage:vztmpl/$TEMPLATE" \
    --arch amd64 --ostype debian \
    --hostname "$var_hostname" \
    --cores "$var_cpu" --memory "$var_ram" --swap "$var_swap" \
    --rootfs "$var_storage:$var_disk" \
    --net0 "$net" \
    --unprivileged 1 --features nesting=1 \
    --onboot 1 --tags "web;jtc-site" \
    --description "jtc-site: the portfolio, built from $JTC_REPO. Update with \`update\` in the console." \
    >/dev/null
  CTID_CREATED=$var_ctid
  msg_ok "Created container $var_ctid (unprivileged)"

  if [[ "$var_firewall" == "1" ]]; then
    # Inbound: HTTP and ping only; the site's TLS lives on the proxy.
    cat >"/etc/pve/firewall/$var_ctid.fw" <<'EOF'
[OPTIONS]
enable: 1
policy_in: DROP
policy_out: ACCEPT

[RULES]
IN ACCEPT -p tcp -dport 80 -log nolog # jtc-site: HTTP from the reverse proxy
IN Ping(ACCEPT) -log nolog
EOF
    msg_ok "Firewall: inbound HTTP and ping only"
  fi
}

start_and_wait() {
  msg_info "Starting the container"
  pct start "$var_ctid"
  for _ in $(seq 1 60); do
    if pct exec "$var_ctid" -- getent hosts deb.debian.org >/dev/null 2>&1; then
      msg_ok "Network is up"
      return
    fi
    sleep 2
  done
  msg_error "the container has no network after 2 minutes (check the bridge, DHCP or gateway)"
  exit 1
}

install_site() {
  local tmp
  tmp="$(mktemp)"
  msg_info "Fetching the installer"
  curl -fsSL "$JTC_RAW/deploy/proxmox/install.sh" -o "$tmp"
  pct push "$var_ctid" "$tmp" /root/jtc-site-install.sh --perms 0755
  rm -f "$tmp"
  msg_ok "Installer in place"
  pct exec "$var_ctid" -- env JTC_REPO="$JTC_REPO" JTC_REF="$JTC_REF" bash /root/jtc-site-install.sh
  pct exec "$var_ctid" -- rm -f /root/jtc-site-install.sh
}

summary() {
  local ip
  ip="$(pct exec "$var_ctid" -- hostname -I 2>/dev/null | awk '{print $1}')"
  echo
  msg_ok "${GN}$APP is running${CL}"
  echo
  setting "Address" "http://${ip:-<container address>}/"
  setting "Container" "$var_ctid ($var_hostname)"
  setting "Update" "pct enter $var_ctid, then: update"
  echo
  printf '%sPoint your reverse proxy (TLS) at %shttp://%s:80%s.\n' "$TAB" "$BL" "${ip:-<address>}" "$CL"
  printf '%sThe site trusts X-Forwarded-For only from private networks.\n' "$TAB"
  echo
}

main() {
  header_info
  checks
  settings
  var_storage="$(pick_storage rootdir "$var_storage")"
  var_tmpl_storage="$(pick_storage vztmpl "$var_tmpl_storage")"
  echo
  setting "Container ID" "$var_ctid"
  setting "Hostname" "$var_hostname"
  setting "CPU / memory" "$var_cpu cores, $var_ram MiB (+$var_swap swap)"
  setting "Disk" "$var_disk GB on $var_storage"
  setting "Network" "$var_net on $var_bridge${var_vlan:+ (VLAN $var_vlan)}"
  setting "Firewall" "$([[ "$var_firewall" == 1 ]] && echo 'inbound HTTP only' || echo off)"
  setting "Source" "$JTC_REPO ($JTC_REF)"
  echo
  template
  create
  start_and_wait
  install_site
  summary
}

main "$@"
