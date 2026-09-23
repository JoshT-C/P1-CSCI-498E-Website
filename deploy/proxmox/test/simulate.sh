#!/usr/bin/env bash
# Runs jtc-site.sh end to end without Proxmox, inside a throwaway Debian 13
# container (CI's installer job; locally, e.g.):
#
#   docker run -d --name pve-sim -p 8081:80 -v "$PWD:/src:ro" debian:trixie sleep infinity
#   docker exec pve-sim bash /src/deploy/proxmox/test/simulate.sh
#
# The Proxmox commands are stand-ins (test/bin) that log their calls to
# /tmp/pve.log; `pct exec` runs its command right here, so the container
# plays the LXC and the real install.sh runs in it, from this checkout.
# Afterwards it checks the calls, the firewall file and the served page.
set -Eeuo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="$(cd "$here/../../.." && pwd)"

apt-get update -qq
apt-get install -y -qq --no-install-recommends curl ca-certificates git >/dev/null
mkdir -p /etc/pve/firewall
rm -f /tmp/pve.log

PATH="$here/bin:$PATH" JTC_DEFAULTS=1 JTC_REPO="$src" JTC_REF="${JTC_REF:-HEAD}" JTC_RAW="file://$src" \
  bash "$src/deploy/proxmox/jtc-site.sh"

fail() { echo "simulate: $*" >&2; exit 1; }
grep -q '^pct create 123 local:vztmpl/debian-13-standard_13.1-1_amd64.tar.zst' /tmp/pve.log || fail "no pct create on the newest Debian 13 template"
grep -q -- '--unprivileged 1' /tmp/pve.log || fail "container not unprivileged"
grep -q 'firewall=1' /tmp/pve.log || fail "firewall not enabled on the NIC"
grep -q 'policy_in: DROP' /etc/pve/firewall/123.fw || fail "firewall does not drop by default"
grep -q 'dport 80' /etc/pve/firewall/123.fw || fail "firewall does not allow HTTP"
curl -fsS -o /dev/null http://127.0.0.1/ || fail "the site is not served"
curl -fsSI http://127.0.0.1/ | grep -qi '^content-security-policy:' || fail "no CSP header"
update | grep -q 'Already up to date' || fail "update did not recognise the current commit"
echo "simulate: ok"
