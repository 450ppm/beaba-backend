#!/bin/bash
# Beaba — script d'installation automatique pour Raspberry Pi
# Usage : bash <(curl -sL https://raw.githubusercontent.com/450ppm/beaba-backend/master/install.sh)

set -e

echo "═══════════════════════════════════════════════════"
echo "  Beaba — Installation automatique"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Mise a jour systeme ──────────────────────────
echo "[1/8] Mise a jour du systeme..."
sudo apt update -qq
sudo apt upgrade -y -qq

# ── 2. Dependances de base ──────────────────────────
echo "[2/8] Installation des dependances de base..."
sudo apt install -y -qq git curl mosquitto mosquitto-clients

# ── 3. Node.js 20 ───────────────────────────────────
echo "[3/8] Installation de Node.js 20..."
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | sed 's/v//') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y -qq nodejs
fi
echo "    Node version : $(node -v)"

# ── 4. pnpm (pour zigbee2mqtt) ──────────────────────
echo "[4/8] Installation de pnpm..."
sudo npm install -g pnpm > /dev/null 2>&1

# ── 5. Zigbee2MQTT ──────────────────────────────────
echo "[5/8] Installation de Zigbee2MQTT..."
if [ ! -d /opt/zigbee2mqtt ]; then
  sudo mkdir -p /opt/zigbee2mqtt
  sudo chown $USER: /opt/zigbee2mqtt
  git clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git /opt/zigbee2mqtt
  cd /opt/zigbee2mqtt && npm install --silent

  # Config Z2M par defaut
  mkdir -p /opt/zigbee2mqtt/data
  cat > /opt/zigbee2mqtt/data/configuration.yaml << 'YAML'
homeassistant: false
permit_join: true
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://localhost:1883
serial:
  port: /dev/ttyUSB0
  adapter: ezsp
frontend:
  port: 8080
YAML
fi

# Service systemd Z2M
sudo tee /etc/systemd/system/zigbee2mqtt.service > /dev/null << 'EOF'
[Unit]
Description=Zigbee2MQTT
After=network.target mosquitto.service

[Service]
WorkingDirectory=/opt/zigbee2mqtt
ExecStart=/usr/bin/node index.js
Restart=always
User=USER_PLACEHOLDER

[Install]
WantedBy=multi-user.target
EOF
sudo sed -i "s/USER_PLACEHOLDER/$USER/" /etc/systemd/system/zigbee2mqtt.service

# ── 6. Backend Beaba ────────────────────────────────
echo "[6/8] Clonage du backend Beaba..."
cd ~
if [ ! -d beaba ]; then
  git clone https://github.com/450ppm/beaba-backend.git beaba
fi
cd ~/beaba
npm install --silent

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "    ⚠️  Configure le .env avec : nano ~/beaba/.env"
  echo "    Remplir : JWT_SECRET, RESEND_API_KEY, INFLUX_TOKEN, etc."
fi

node src/db/migrate.js

# Service systemd Beaba
sudo tee /etc/systemd/system/beaba.service > /dev/null << EOF
[Unit]
Description=Beaba backend
After=mosquitto.service zigbee2mqtt.service network.target

[Service]
WorkingDirectory=/home/$USER/beaba
ExecStart=/usr/bin/node src/index.js
Restart=always
User=$USER
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# ── 7. Cloudflare Tunnel ────────────────────────────
echo "[7/8] Installation de Cloudflare Tunnel..."
if ! command -v cloudflared &> /dev/null; then
  ARCH=$(dpkg --print-architecture)
  curl -sL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  sudo dpkg -i /tmp/cloudflared.deb > /dev/null 2>&1
  rm /tmp/cloudflared.deb
fi
echo "    Configure ensuite : cloudflared tunnel login"

# ── 8. Activation des services ──────────────────────
echo "[8/8] Activation des services..."
sudo systemctl daemon-reload
sudo systemctl enable mosquitto > /dev/null 2>&1
sudo systemctl enable zigbee2mqtt > /dev/null 2>&1
sudo systemctl enable beaba > /dev/null 2>&1

# Demarrage immediat
sudo systemctl restart mosquitto
sudo systemctl restart zigbee2mqtt
# Beaba demarre apres config du .env

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Installation terminee !"
echo "═══════════════════════════════════════════════════"
echo ""
echo "Prochaines etapes :"
echo "  1. Configure le .env  : nano ~/beaba/.env"
echo "  2. Lance Beaba        : sudo systemctl start beaba"
echo "  3. Cloudflare tunnel  : cloudflared tunnel login"
echo "  4. Reactive le tunnel : cloudflared tunnel route dns beaba beaba-api.450ppm.be"
echo ""
echo "Acces local :"
echo "  - Zigbee2MQTT : http://$(hostname -I | awk '{print $1}'):8080"
echo "  - Beaba API   : http://$(hostname -I | awk '{print $1}'):3000/health"
echo ""
