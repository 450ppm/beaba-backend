# Déploiement Beaba

Ce guide couvre une installation neuve sur un Raspberry Pi, plus la mise à jour continue. Pour le frontend, voir le [README du dépôt beaba-frontend](https://github.com/450ppm/beaba-frontend).

---

## 1. Préparer le Raspberry Pi

### OS

1. **Raspberry Pi Imager** → flasher *Raspberry Pi OS Lite (64-bit)* sur la microSD.
2. Activer SSH et configurer le Wi-Fi via le menu avancé (icône engrenage) avant de flasher. Définir un user `beaba` avec mot de passe robuste.
3. Insérer la SD, brancher l'Ethernet (préféré au Wi-Fi pour la stabilité), allumer.
4. Repérer l'IP attribuée par le routeur (souvent dans la page admin de la box, sinon `arp -a`).

### Première connexion

```bash
ssh beaba@<ip-du-pi>
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl mosquitto mosquitto-clients
```

### Node.js 20+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # doit afficher v20+
```

### zigbee2mqtt

Suivre la doc officielle https://www.zigbee2mqtt.io/guide/installation/01_linux.html. Configurer `data/configuration.yaml` :

```yaml
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://localhost:1883
serial:
  port: /dev/ttyUSB0
frontend:
  port: 8080
```

Brancher le Sonoff ZBDongle-E (USB), vérifier `dmesg | tail` pour confirmer `/dev/ttyUSB0`.

```bash
sudo systemctl enable zigbee2mqtt
sudo systemctl start zigbee2mqtt
```

L'interface web de couplage est à `http://<ip-du-pi>:8080`.

---

## 2. Installer Beaba

### Cloner le dépôt

```bash
cd ~
git clone https://github.com/450ppm/beaba-backend.git beaba
cd beaba
cp .env.example .env
nano .env
```

Renseigner au minimum :
- `JWT_SECRET` (générer avec `openssl rand -hex 32`)
- `MQTT_BROKER=mqtt://localhost:1883`
- `KIT_ID`, `KIT_NAME` (identifiant du kit)
- `SHELLY_EM_IP` si tu mets un Shelly EM dans le tableau
- `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET` si tu utilises le stockage cloud
- `RESEND_API_KEY` pour les magic links
- `FRONTEND_URL=https://beaba.450ppm.be`, `COOKIE_DOMAIN=.450ppm.be`, `CORS_ORIGINS=https://beaba.450ppm.be`

### Installer les dépendances et créer la base

```bash
npm install --omit=dev
node src/db/migrate.js
```

### Service systemd

Créer `/etc/systemd/system/beaba.service` :

```ini
[Unit]
Description=Beaba backend
After=network-online.target mosquitto.service zigbee2mqtt.service
Wants=network-online.target

[Service]
Type=simple
User=beaba
WorkingDirectory=/home/beaba/beaba
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable beaba
sudo systemctl start beaba
sudo systemctl status beaba
journalctl -u beaba -f       # suivre les logs
```

---

## 3. Exposer le backend via Cloudflare Tunnel

Pas besoin d'ouvrir de port sur la box internet du ménage.

### Installation cloudflared

```bash
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
cloudflared tunnel login    # ouvre une URL à valider dans un navigateur
```

### Créer le tunnel

```bash
cloudflared tunnel create beaba
# Notez l'UUID retourne
```

Créer `~/.cloudflared/config.yml` :

```yaml
tunnel: <UUID>
credentials-file: /home/beaba/.cloudflared/<UUID>.json

ingress:
  - hostname: api.beaba.450ppm.be
    service: http://localhost:3000
  - service: http_status:404
```

### DNS

Dans le dashboard Cloudflare du domaine 450ppm.be, ajouter un enregistrement CNAME `api.beaba` → `<UUID>.cfargotunnel.com` (proxied).

### Service systemd

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
```

Vérifier : `curl https://api.beaba.450ppm.be/health` doit répondre `{"status":"ok",...}`.

---

## 4. Déployer le frontend (Cloudflare Pages)

1. Connecter le dépôt `beaba-frontend` à Cloudflare Pages depuis le dashboard.
2. Build command : `npm run build`.
3. Build output : `dist`.
4. Variables d'environnement : `VITE_API_URL=https://api.beaba.450ppm.be`.
5. Domaine personnalisé : `beaba.450ppm.be`.

Chaque push sur `master` déclenche un build et un déploiement automatique.

---

## 5. Mises à jour

### Backend

Sur le Pi :

```bash
bash beaba/deploy.sh
```

Le script :
1. `git fetch && git reset --hard origin/master`
2. `npm install --omit=dev`
3. `systemctl restart beaba`
4. `systemctl restart cloudflared` (avec fallback nohup si non installé en service)

Si tu as modifié le schéma SQLite et veux repartir de zéro pour cette campagne : `bash deploy.sh --wipe` (supprime `data/beaba.db` puis relance la migration).

### Frontend

`git push origin master` depuis ta machine de dev. Cloudflare Pages rebuild automatiquement en 1-2 min.

---

## 6. Diagnostic

| Symptôme | Vérification |
|---|---|
| Le frontend affiche "—" partout | Le backend est joignable ? `curl -k https://api.beaba.450ppm.be/health`. Si 502 : `systemctl status beaba`. Si 404 sur un endpoint précis : pousser le backend et redéployer. |
| Une carte/page affiche "Erreur" | Console réseau du navigateur : 404 = endpoint pas déployé, 401 = cookie expiré (relogin), 500 = erreur backend, regarder les logs `journalctl -u beaba`. |
| Asset CSS qui répond 500 sur Cloudflare Pages | Bug "asset poisoned" connu. Faire un changement CSS réel (pas un commentaire — Vite les supprime à la minification), commit + push pour forcer un nouveau content-hash. |
| Capteurs Zigbee absents | `mosquitto_sub -t 'zigbee2mqtt/#' -v` doit montrer le trafic. Si non, vérifier z2m. Si oui mais pas dans Beaba : vérifier que les sondes sont enregistrées dans la table `temp_sensors` / `co2_sensors`. |

---

## 7. Fin de campagne

Quand une campagne se termine :
1. Le ménage clique "Terminer la campagne" → relève finale des compteurs eau/gaz/électricité.
2. Le report PDF/web est généré depuis `/app/report`.
3. Pour démarrer une nouvelle campagne sur le même kit : `bash deploy.sh --wipe` (efface la base ; les données sont restées dans InfluxDB pour analyse longue durée).

---

## Variables d'environnement complètes

Voir [`.env.example`](../.env.example).
