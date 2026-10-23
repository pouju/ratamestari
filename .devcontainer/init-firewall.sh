#!/bin/bash
# Default-deny outbound firewall for the dev container.
# Allows only: DNS, SSH, localhost, the Docker host network, GitHub,
# and the domains listed in ALLOWED_DOMAINS below.
set -euo pipefail
IFS=$'\n\t'

# ---- Edit this list to allow more sites, then rebuild the container ----
ALLOWED_DOMAINS=(
  # npm
  registry.npmjs.org
  # Claude Code
  api.anthropic.com
  claude.ai
  console.anthropic.com
  platform.claude.com
  statsig.anthropic.com
  statsig.com
  sentry.io
  # GitHub content hosts not covered by api.github.com/meta
  codeload.github.com
  objects.githubusercontent.com
  raw.githubusercontent.com
  # VS Code extensions
  marketplace.visualstudio.com
  vscode.blob.core.windows.net
  update.code.visualstudio.com
)

# Keep Docker's internal DNS rules before flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

iptables -F; iptables -X
iptables -t nat -F; iptables -t nat -X
iptables -t mangle -F; iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

if [ -n "$DOCKER_DNS_RULES" ]; then
  iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
  iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
  echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
fi

# DNS, SSH and loopback
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT  -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT  -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

ipset create allowed-domains hash:net

# GitHub IPv4 ranges (fetched before the firewall closes)
echo "Fetching GitHub IP ranges..."
gh_meta=$(curl -fsS --connect-timeout 10 https://api.github.com/meta)
echo "$gh_meta" | jq -r '(.web + .api + .git)[]' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$' \
  | aggregate -q \
  | while read -r cidr; do ipset add -exist allowed-domains "$cidr"; done

# Resolve allowed domains to IPv4 addresses
for domain in "${ALLOWED_DOMAINS[@]}"; do
  ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
  if [ -z "$ips" ]; then
    echo "WARNING: could not resolve $domain, skipping"
    continue
  fi
  while read -r ip; do ipset add -exist allowed-domains "$ip"; done <<< "$ips"
done

# Docker host network (needed for VS Code and port forwarding)
HOST_IP=$(ip route | awk '/default/ {print $3; exit}')
if [ -n "$HOST_IP" ]; then
  HOST_NETWORK=$(echo "$HOST_IP" | sed 's/\.[0-9]*$/.0\/24/')
  iptables -A INPUT  -s "$HOST_NETWORK" -j ACCEPT
  iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT
fi

# Default deny, then allow established traffic and the allowlist
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP
iptables -A INPUT  -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# Block IPv6 entirely (except loopback) so it can't bypass the allowlist
if ip6tables -L >/dev/null 2>&1; then
  ip6tables -F
  ip6tables -A INPUT  -i lo -j ACCEPT
  ip6tables -A OUTPUT -o lo -j ACCEPT
  ip6tables -P INPUT DROP
  ip6tables -P FORWARD DROP
  ip6tables -P OUTPUT DROP
fi

# Verify: a random site must fail, GitHub must work
if curl -s --connect-timeout 5 https://example.com >/dev/null 2>&1; then
  echo "ERROR: firewall check failed, example.com is reachable"
  exit 1
fi
if ! curl -s --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
  echo "ERROR: firewall check failed, api.github.com is not reachable"
  exit 1
fi
echo "Firewall active."
