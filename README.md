# Beaba — Backend

> Kit de monitoring habitat : conso électrique par prise, capteurs ambiance (T°, humidité, CO₂), météo extérieure, analyse confort et cycles de chauffe.
>
> **[beaba.450ppm.be](https://beaba.450ppm.be)** — projet citoyen porté par [450ppm](https://450ppm.be), Bonnevie, Bruxelles Environnement et Molenbeek.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20+-339933.svg)](#prérequis)
[![Frontend](https://img.shields.io/badge/frontend-beaba--frontend-orange.svg)](https://github.com/450ppm/beaba-frontend)

Ce dépôt contient **le backend Node.js/Express** qui tourne sur le Raspberry Pi installé chez chaque ménage. Le frontend React vit dans le dépôt jumeau **[beaba-frontend](https://github.com/450ppm/beaba-frontend)** (déployé sur Cloudflare Pages).

---

## Que fait Beaba

Pendant une campagne de quelques semaines, un kit installé chez un ménage mesure :

- **Conso électrique** par appareil (prises Innr Zigbee + Shelly EM/Plus)
- **Température et humidité** par pièce (sondes Sonoff SNZB-02P)
- **CO₂** ambiant (sondes Heiman HS3AQ)
- **Cycles de chauffe** d'une chaudière ou d'un chauffe-eau (DS18B20 via Shelly Plus Add-On)
- **Météo extérieure** locale (Open-Meteo, sans clé)
- **CO₂ atmosphérique global** (NOAA Mauna Loa)

À partir de là, on calcule :

- la **consommation cumulée** par jour / semaine / mois, par pièce et par appareil
- des **plages de confort** basées sur la condensation de paroi (modèle physique mur brique 30 cm) plutôt que sur des bandes arbitraires
- la **détection de cycles** de chauffe avec score de sous-dimensionnement, surchauffe, pertes au repos pour l'ECS
- un **diagramme psychrométrique** où chaque pièce est positionnée par rapport au risque de condensation

L'objectif final : rendre lisible la consommation et le confort d'un logement pour permettre des changements concrets.

---

## Architecture

```
                     ┌─────────────────────┐
                     │  Cloudflare Pages   │
                     │   beaba-frontend    │  ← React + Vite
                     │  beaba.450ppm.be    │
                     └──────────┬──────────┘
                                │ HTTPS + Cookie auth
                                │
                     ┌──────────▼──────────┐
                     │ Cloudflare Tunnel   │
                     │ api.beaba.450ppm.be │
                     └──────────┬──────────┘
                                │
       ┌────────────────────────▼────────────────────────┐
       │           Raspberry Pi @ ménage                 │
       │  ┌──────────────────────────────────────────┐   │
       │  │ Node.js (ce dépôt)                       │   │
       │  │  ├─ Express API                          │   │
       │  │  ├─ SQLite (better-sqlite3)              │   │
       │  │  ├─ MQTT subscriber (zigbee2mqtt)        │   │
       │  │  ├─ Shelly EM/Plus HTTP poller           │   │
       │  │  └─ InfluxDB sync (cron)                 │   │
       │  └──────────────────────────────────────────┘   │
       │       ▲                ▲              ▲         │
       │    Zigbee           HTTP LAN      Internet      │
       │       │                │              │         │
       │  zigbee2mqtt    Shelly EM/Plus    InfluxDB,     │
       │   + dongle      + Add-On DS18B20  Open-Meteo,   │
       │                                   NOAA, Resend  │
       └─────────────────────────────────────────────────┘
```

Plus de détails dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Démarrage rapide

### Prérequis

- Node.js 20+
- Mosquitto MQTT broker (`apt install mosquitto`)
- zigbee2mqtt (https://www.zigbee2mqtt.io) avec un dongle Conbee/Sonoff ZBDongle
- (optionnel) un compte InfluxDB cloud pour le stockage long terme
- (optionnel) un compte Resend pour les magic links

### Installation locale (dev)

```bash
git clone https://github.com/450ppm/beaba-backend.git
cd beaba-backend
cp .env.example .env
# Editer .env (au minimum : JWT_SECRET, MQTT_BROKER)
npm install
node src/db/migrate.js   # cree data/beaba.db
npm run dev              # API sur :3000
```

L'API expose `http://localhost:3000/health` pour vérifier que ça tourne.

### Déploiement Raspberry Pi

Voir [`docs/DEPLOY.md`](docs/DEPLOY.md) pour la procédure complète (install.sh idempotent + systemd service + Cloudflare Tunnel).

Une fois le service installé :

```bash
ssh beaba@<ip-du-pi>
bash beaba/deploy.sh    # git reset --hard origin/master + npm install + restart
```

---

## Matériel

Liste détaillée des composants Zigbee, Shelly, DS18B20 et leurs prix dans **[`docs/HARDWARE.md`](docs/HARDWARE.md)**.

Kit type (un ménage) ≈ **300-450 €** selon nombre de prises et de pièces.

---

## API

Le backend expose une API REST authentifiée par cookie JWT. Référence des endpoints dans **[`docs/API.md`](docs/API.md)**.

Points clés :

- `POST /api/auth/login` — envoie un magic link
- `GET  /api/auth/verify?token=` — pose le cookie + redirige vers le frontend
- `GET  /api/campaign` — campagne active du kit
- `GET  /api/map` — vue consolidée (pièces + prises + dernières mesures)
- `GET  /api/readings/power/daily` — agrégat kWh journalier par prise
- `GET  /api/comfort/current` — évaluation confort par pièce avec météo
- `GET  /api/weather/current|history|co2_atmospheric`
- `GET  /api/pipe/analysis/:id` — cycles chaudière + heuristiques

---

## Structure du code

```
src/
├── index.js              # point d'entree (Express + cron + pollers)
├── db/
│   ├── index.js          # singleton SQLite + getActiveCampaign
│   └── migrate.js        # schema (tables + index + migrations)
├── api/
│   ├── routes.js         # router principal
│   ├── auth.js           # /auth (magic link via Resend)
│   ├── campaign.js       # /campaign — cycle de vie campagne
│   ├── rooms.js, plugs.js, sensors.js, meters.js
│   ├── readings.js       # /readings/{power,temp,co2}/[history|daily|realtime]
│   ├── comfort.js        # /comfort — modele physique
│   ├── weather.js        # /weather — Open-Meteo + NOAA CO2
│   └── pipe.js           # /pipe — sondes tuyaux + analyse cycles
├── analysis/
│   ├── profile.js        # heuristique categorisation appareil par signature
│   └── cycles.js         # detection cycles + analyse chauffage/ECS
├── lib/
│   ├── comfort.js        # constantes + Magnus + wall surface temp
│   ├── weather.js        # client Open-Meteo + cache + CO2 atmospherique
│   └── email.js          # template magic link (Resend)
├── mqtt/
│   ├── subscriber.js     # ecoute zigbee2mqtt
│   ├── poller.js         # poll actif des sondes au demarrage
│   ├── shelly.js         # poll Shelly EM (Gen1)
│   └── shellyPlus.js     # poll Shelly Plus + Add-On (Gen2 RPC, DS18B20)
├── sync/
│   └── influx.js         # sync SQLite -> InfluxDB par batch
└── report/
    └── ...               # generation de rapports de fin de campagne
```

---

## Variables d'environnement

Toutes documentées dans [`.env.example`](.env.example). Les plus importantes :

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | Signe les cookies de session — **à changer impérativement en prod** |
| `MQTT_BROKER` | URL du broker MQTT local |
| `SHELLY_EM_IP` | IP locale du Shelly EM (mesure de puissance) |
| `SHELLY_PIPE_POLL_S` | Cadence de polling des sondes DS18B20 (20s par défaut) |
| `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET` | InfluxDB cloud pour le stockage long terme |
| `RESEND_API_KEY` | Envoi des magic links (si non défini, lien loggé en console) |
| `FRONTEND_URL`, `COOKIE_DOMAIN`, `CORS_ORIGINS` | Configuration cross-domain frontend/backend |

---

## Contribuer

Issues et PRs bienvenues. Lire **[`CONTRIBUTING.md`](CONTRIBUTING.md)** pour le style de commit, la procédure de PR et le code de conduite.

---

## Licence

[AGPL-3.0](LICENSE). Si tu héberges une version modifiée accessible via réseau, tu dois publier tes modifications. C'est cohérent avec le caractère citoyen du projet : tout monitoring de logement reste auditable.

---

## Crédits

Projet développé par [450ppm](https://450ppm.be) avec [Bonnevie](https://www.bonnevie40.be/), [Bruxelles Environnement](https://environnement.brussels) et la [Commune de Molenbeek](https://www.molenbeek.be).
