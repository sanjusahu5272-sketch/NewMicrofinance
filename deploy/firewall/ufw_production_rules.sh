#!/usr/bin/env bash
# =============================================================================
# ufw_production_rules.sh — Host Firewall for Laravel Docker Stack
# Exposes only: SSH (22), HTTP (80), HTTPS (443)
# Blocks: PostgreSQL (5432), Redis (6379), PHP-FPM (9000), Docker internal
# =============================================================================
set -euo pipefail

ADMIN_SSH_CIDR="${ADMIN_SSH_CIDR:-0.0.0.0/0}"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# SSH — restrict to admin IP in production
ufw limit from "${ADMIN_SSH_CIDR}" to any port 22 proto tcp comment "Restricted Admin SSH"

# HTTP (ACME challenge + HTTPS redirect)
ufw allow 80/tcp comment "HTTP ACME & HTTPS Redirect"

# HTTPS
ufw allow 443/tcp comment "Production HTTPS TLS 1.2/1.3"

# Explicitly block internal services
ufw deny 5432/tcp comment "Block PostgreSQL"
ufw deny 6379/tcp comment "Block Redis"
ufw deny 9000/tcp comment "Block PHP-FPM"

ufw --force enable
ufw status verbose
