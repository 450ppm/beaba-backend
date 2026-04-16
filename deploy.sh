#!/bin/bash
# Script de deploiement Beaba — a lancer sur le RPi
# Usage: bash deploy.sh

set -e
cd /home/beaba/beaba

echo "=== Mise a jour du code ==="
git fetch origin
git reset --hard origin/master

echo "=== Installation des dependances ==="
npm install --omit=dev

echo "=== Migration base de donnees ==="
# Ne pas supprimer la base sauf si --wipe est passe
if [ "$1" = "--wipe" ]; then
  echo "!!! WIPE: suppression de la base de donnees !!!"
  rm -f data/beaba.db
  node src/db/migrate.js
fi

echo "=== Redemarrage du service ==="
sudo systemctl restart beaba

echo "=== Redemarrage du tunnel Cloudflare ==="
sudo systemctl restart cloudflared 2>/dev/null || (
  # Fallback: tunnel en arriere-plan
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  sleep 1
  nohup cloudflared tunnel run beaba > /tmp/cloudflared.log 2>&1 &
  sleep 3
  echo "Tunnel demarre"
)

echo ""
echo "=== Deploiement termine ==="
echo "Local:  http://$(hostname -I | awk '{print $1}'):3000"
echo "Public: https://beaba.450ppm.be"
echo ""
sudo systemctl status beaba --no-pager | head -5
