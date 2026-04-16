# Beaba — Backend

Node.js backend du kit de monitoring. Tourne sur le Raspberry Pi (ou VPS).

## Stack

- **zigbee2mqtt** → Mosquitto → subscriber MQTT interne
- **Shelly EM** → polling HTTP local
- **SQLite** (better-sqlite3) → buffer offline sur RPi
- **InfluxDB cloud** → stockage long terme, sync par batch
- **Express** → API REST consommée par le frontend React

## Démarrage rapide

```bash
cp .env.example .env
# Éditer .env : KIT_ID, MQTT_BROKER, SHELLY_EM_IP, INFLUX_TOKEN...

npm install
node src/db/migrate.js   # créer la base SQLite
npm start                # ou npm run dev (nodemon)
```

## Structure

```
src/
├── index.js            # point d'entrée
├── db/
│   ├── index.js        # connexion SQLite singleton
│   └── migrate.js      # création du schéma + seed kit
├── mqtt/
│   ├── subscriber.js   # écoute zigbee2mqtt (SNZB-02P, Innr, Heiman HS3AQ)
│   └── shelly.js       # polling Shelly EM (chauffe-eau)
├── sync/
│   └── influx.js       # sync SQLite → InfluxDB par batch
└── api/
    └── routes.js       # REST : /api/rooms, /api/plugs, /api/readings/*, /api/map
```

## Endpoints clés

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Santé du service |
| GET | `/api/kit` | Infos du kit courant |
| GET | `/api/rooms` | Pièces + prises associées |
| PUT | `/api/plugs/:id` | Affecter/renommer une prise |
| GET | `/api/readings/power` | Puissance instantanée par prise |
| GET | `/api/readings/power/history` | Historique (plug_id, from, to) |
| GET | `/api/map` | Vue consolidée pour le treemap |

## Capteurs supportés

| Capteur | Protocole | Topic/source |
|---------|-----------|--------------|
| Sonoff SNZB-02P ×6 | Zigbee → MQTT | `zigbee2mqtt/<name>` |
| Innr prises ×10 | Zigbee → MQTT | `zigbee2mqtt/<name>` |
| Heiman HS3AQ ×1 | Zigbee → MQTT | `zigbee2mqtt/<name>` |
| Shelly EM | WiFi HTTP | poll `/status` |

## Migration cloud

Pour migrer du RPi vers un VPS : copier `beaba.db`, ajuster `.env`
(MQTT_BROKER pointe vers le RPi via tunnel ou VPN). Le frontend ne change pas.
