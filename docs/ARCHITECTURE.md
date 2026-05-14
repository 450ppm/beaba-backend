# Architecture Beaba

## Vue d'ensemble

Beaba est constitué de **deux dépôts** qui se parlent via une API REST sur HTTPS :

```
[ beaba-frontend ]               [ beaba-backend ]
React + Vite                     Node.js + Express
deploye sur Cloudflare Pages     tourne sur Raspberry Pi
beaba.450ppm.be                  api.beaba.450ppm.be (via CF Tunnel)
```

Cette séparation permet :
- Frontend statique cachable mondialement (CDN) — pas de surcoût quel que soit le nombre de visites.
- Backend privé chez le ménage, qui contrôle les données sensibles et les capteurs locaux.
- Mise à jour du frontend indépendante du backend (un build CF Pages prend ~1 min ; le backend nécessite un `bash deploy.sh` sur le Pi).

## Flux de données

```
                                       ┌────────────────┐
  Capteurs Zigbee ──► Sonoff ZBDongle ─►│   mosquitto    │
  (SNZB-02P, Innr,    /dev/ttyUSB0     │  (MQTT broker) │
   Heiman)                              └────────┬───────┘
                                                 │
                                                 ▼
  Shelly EM / Plus ──► HTTP local (LAN)  ┌───────────────────┐
                                         │  Node.js (Beaba)  │
                                         │  - subscribers    │
                                         │  - HTTP pollers   │
                                         │  - REST API       │
                                         └────────┬──────────┘
                                                  │
                                       ┌──────────┴───────────┐
                                       ▼                      ▼
                                ┌──────────────┐      ┌──────────────────┐
                                │   SQLite     │      │  InfluxDB cloud  │
                                │ (data/beaba) │      │ (sync par batch  │
                                │              │      │  toutes les 5min)│
                                └──────────────┘      └──────────────────┘
                                       │
                                       │  HTTPS via Cloudflare Tunnel
                                       ▼
                                ┌──────────────────────────────────────┐
                                │  Browser (frontend React)            │
                                │  Cookie JWT cross-domain             │
                                │  beaba.450ppm.be                     │
                                └──────────────────────────────────────┘
```

## Composants backend

| Module | Rôle |
|---|---|
| `src/index.js` | Point d'entrée : monte Express, lance mqtt/shelly/shellyPlus pollers, planifie le cron InfluxDB sync. |
| `src/db/migrate.js` | Crée toutes les tables si absentes (campaigns, rooms, plugs, plug_appliances, temp_sensors, co2_sensors, readings_*, meter_readings, pipe_sensors, readings_pipe_temp, users, auth_tokens). Idempotent. |
| `src/api/*.js` | Sous-routeurs Express par domaine fonctionnel. Tous protégés par `requireAuth` sauf `/auth/*` ; la plupart par `requireActiveCampaign` pour scoper les requêtes à la campagne en cours. |
| `src/mqtt/subscriber.js` | Écoute les topics zigbee2mqtt, route chaque message vers la table de lectures correspondante (readings_temp / readings_power / readings_co2). |
| `src/mqtt/shelly.js` | Poll HTTP du Shelly EM en local toutes les `SHELLY_POLL_INTERVAL_S` secondes. |
| `src/mqtt/shellyPlus.js` | Poll RPC Gen2 des Shelly Plus + Add-On pour les sondes DS18B20 sur tuyaux. |
| `src/sync/influx.js` | Pousse par batch vers InfluxDB cloud les lectures non encore synchronisées (`synced = 0`). |
| `src/analysis/cycles.js` | Détection des cycles de chauffe (state machine) + heuristiques chauffage et ECS. |
| `src/analysis/profile.js` | Catégorisation heuristique des appareils branchés sur prises Innr à partir de la signature de puissance. |
| `src/lib/comfort.js` | Modèle physique : Magnus pour le point de rosée, calcul de température de surface de mur, évaluation OK/surveiller/moisissure/condensation. |
| `src/lib/weather.js` | Client Open-Meteo (courant + archive) + cache 1h, et CO₂ atmosphérique global Mauna Loa. |
| `src/lib/email.js` | Template HTML/text du magic link Resend. |

## Composants frontend

| Module | Rôle |
|---|---|
| `src/App.jsx` | Routing React Router : `/`, `/login`, `/app/*`, `/app/admin`. |
| `src/pages/LandingPage` | Page publique avec présentation. |
| `src/pages/Dashboard` | Vue principale après login : KPIs (6 cartes), bento (chart, appareils, pièces, capteurs). |
| `src/pages/CartoView` *(component)* | Carte du logement : graphe force-directed des pièces/prises/appareils, mode instantané ou moyenne 7j. |
| `src/pages/ComfortPage` | Confort & condensation : diagramme psychrométrique (chart custom SVG) + simulateur + diagnostic par pièce. |
| `src/pages/ChaudierePage` | Cycles chaudière & ECS : timeline + KPIs + diagnostic textuel. |
| `src/pages/SetupWizard` | Étapes 1→5 de configuration en début de campagne. |
| `src/pages/ReportPage` | Rapport de fin de campagne. |
| `src/components/DashboardCharts` | Charts power / comfort / weather (Recharts). |
| `src/components/CampaignBanner` | Bandeau permanent : nom du foyer, jour de campagne, action "terminer". |
| `src/components/DateNav` | Navigation date+période (jour / semaine / mois) pour vues historiques. |
| `src/lib/comfort.js` | Mirror client de `src/lib/comfort.js` backend pour les calculs en direct dans le simulateur. |

## Authentification

- **Magic link** : pas de mot de passe. POST `/api/auth/login {email}` envoie un mail avec un lien à usage unique (15 min de validité).
- Le clic sur le lien atterrit sur `/api/auth/verify?token=`, qui pose un cookie JWT (`beaba_token`) puis redirige vers `FRONTEND_URL/app`.
- Cookie cross-domain quand `COOKIE_DOMAIN=.450ppm.be` : `sameSite=none`, `secure=true`.
- `requireAuth` valide la signature JWT à chaque requête. `requireAdmin` filtre sur le rôle.
- `requireActiveCampaign` injecte `req.campaign` (vue depuis la campagne `status='active'` du kit courant).

## Stockage

- **SQLite** locale au Pi (`./data/beaba.db`) — source de vérité courte durée. Append-only sur les tables `readings_*`. Index par `(sensor_id, ts)` ou `(plug_id, ts)`.
- **InfluxDB cloud** — pour conservation longue durée et corrélations multi-campagnes. Sync par batch toutes les `SYNC_INTERVAL_MIN` minutes ; la flag `synced` évite les doublons.

## Sécurité

- Le Pi ne s'expose pas sur Internet : tout passe par un **Cloudflare Tunnel** (`cloudflared`) qui ouvre une connexion sortante vers Cloudflare. Aucun port à ouvrir sur la box internet du ménage.
- Les magic links contiennent un token de 32 octets aléatoires, à usage unique, expirant en 15 min.
- Les cookies sont `httpOnly` et `secure`.
- CORS strict : seules les origines listées dans `CORS_ORIGINS` peuvent appeler l'API avec credentials.

## Voir aussi

- [DEPLOY.md](DEPLOY.md) — procédure complète de mise en service
- [HARDWARE.md](HARDWARE.md) — liste matérielle et budgets
- [API.md](API.md) — référence des endpoints
