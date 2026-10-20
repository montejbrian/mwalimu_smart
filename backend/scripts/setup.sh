#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# MwalimuSmart Institutional OS — Fedora Server Setup Script
# Run as root or with sudo: bash scripts/setup.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"

step() { echo -e "\n${BOLD}${GREEN}▶ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠  $1${RESET}"; }
die()  { echo -e "${RED}✗ $1${RESET}"; exit 1; }

INSTALL_DIR="/opt/mwalimusmart"
SERVICE_USER="mwalimusmart"

step "Checking prerequisites"
[[ -f "$INSTALL_DIR/.env" ]] || die ".env not found at $INSTALL_DIR/.env — copy .env.example and fill in values first"
source "$INSTALL_DIR/.env"
[[ -n "${OPENAI_API_KEY:-}" ]]    || die "OPENAI_API_KEY not set in .env"
[[ -n "${ANTHROPIC_API_KEY:-}" ]] || die "ANTHROPIC_API_KEY not set in .env"
[[ -n "${GEMINI_API_KEY:-}" ]]    || die "GEMINI_API_KEY not set in .env"
[[ -n "${AUTH_SECRET:-}" ]]       || die "AUTH_SECRET not set in .env"
[[ "${AUTH_SECRET}" != "change-me-in-production" ]] || die "AUTH_SECRET is still the default — generate a real secret"

step "Installing system packages"
dnf install -y \
  python3.12 python3.12-pip python3.12-devel \
  nodejs npm \
  postgresql16 postgresql16-server postgresql16-contrib \
  cairo pango ffmpeg gcc gcc-c++ \
  nginx git curl 2>/dev/null || warn "Some packages may already be installed"

step "Installing pgvector"
# Build from source if package not available
if ! rpm -q pgvector_16 &>/dev/null; then
  warn "pgvector package not found — building from source"
  cd /tmp
  git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git
  cd pgvector
  PG_CONFIG=$(which pg_config) make
  make install
  cd "$INSTALL_DIR"
fi

step "Setting up PostgreSQL"
postgresql-setup --initdb 2>/dev/null || true
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='mwalimu'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER mwalimu WITH PASSWORD '${POSTGRES_DSN##*:}'"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='mwalimusmart'" | grep -q 1 || \
  sudo -u postgres createdb mwalimusmart -O mwalimu
# Allow local connections
PG_HBA=$(sudo -u postgres psql -t -c "SHOW hba_file" | xargs)
grep -q "mwalimusmart" "$PG_HBA" || \
  echo "host mwalimusmart mwalimu 127.0.0.1/32 md5" >> "$PG_HBA"
systemctl reload postgresql

step "Setting up MongoDB"
systemctl enable --now mongod 2>/dev/null || warn "mongod not found — install MongoDB 7 manually if needed"

step "Creating service user"
id "$SERVICE_USER" &>/dev/null || useradd -r -s /sbin/nologin "$SERVICE_USER"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
mkdir -p /var/mwalimusmart/renders /var/mwalimusmart/kicd_pdfs /var/mwalimusmart/kicd_docs
chown -R "$SERVICE_USER:$SERVICE_USER" /var/mwalimusmart

step "Setting up Python virtual environment"
cd "$INSTALL_DIR"
python3.12 -m venv venv
venv/bin/pip install --upgrade pip wheel
venv/bin/pip install -r requirements.txt

step "Initialising database schema + seed data"
sudo -u "$SERVICE_USER" venv/bin/python -m scripts.init_db --seed

step "Installing Node.js dependencies"
npm ci --prefix "$INSTALL_DIR"

step "Building frontend"
npm ci --prefix "$INSTALL_DIR/../mwalimusmart-frontend" 2>/dev/null || \
  warn "Frontend directory not found at ../mwalimusmart-frontend — build manually"
npm run build --prefix "$INSTALL_DIR/../mwalimusmart-frontend" 2>/dev/null || true
mkdir -p "$INSTALL_DIR/frontend"
cp -r "$INSTALL_DIR/../mwalimusmart-frontend/dist" "$INSTALL_DIR/frontend/" 2>/dev/null || \
  warn "Frontend dist not found — run: cd mwalimusmart-frontend && npm run build"

step "Installing systemd services"
cp deploy/mwalimusmart-api.service   /etc/systemd/system/
cp deploy/mwalimusmart-manim.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mwalimusmart-api mwalimusmart-manim

step "Configuring nginx"
cp deploy/nginx.conf /etc/nginx/conf.d/mwalimusmart.conf
systemctl enable --now nginx
nginx -t && systemctl reload nginx

step "Setting up firewall"
firewall-cmd --permanent --add-service=http 2>/dev/null || true
firewall-cmd --reload 2>/dev/null || true

echo -e "\n${BOLD}${GREEN}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  MwalimuSmart setup complete!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  API:       ${BOLD}http://$(hostname -I | awk '{print $1}'):4000${RESET}"
echo -e "  Frontend:  ${BOLD}http://$(hostname -I | awk '{print $1}')${RESET}  (via nginx)"
echo -e "  Demo login:${BOLD} wanjiku@westlands.sc.ke / MwalimuDemo2025${RESET}"
echo ""
echo -e "  Service status:"
echo -e "    systemctl status mwalimusmart-api"
echo -e "    systemctl status mwalimusmart-manim"
echo -e "    journalctl -fu mwalimusmart-api"
echo ""
echo -e "  Next: copy KICD PDFs to /var/mwalimusmart/kicd_pdfs/ and run:"
echo -e "    sudo -u mwalimusmart venv/bin/python -m rag.pdf_converter \\"
echo -e "      --input_dir /var/mwalimusmart/kicd_pdfs \\"
echo -e "      --output_dir /var/mwalimusmart/kicd_docs"
echo -e "    sudo -u mwalimusmart venv/bin/python -m rag.ingest \\"
echo -e "      --source_dir /var/mwalimusmart/kicd_docs"
echo ""
