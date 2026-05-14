# Liste matérielle — Kit Beaba

Tout le matériel ci-dessous est disponible en Europe sans contrainte d'importation. Les prix sont indicatifs (TTC, mai 2026) et fluctuent. Privilégier les revendeurs européens (livraison rapide, garantie locale, RMA simple) plutôt que AliExpress/Banggood quand la différence est marginale.

---

## 1. Cœur du kit — obligatoire

### Raspberry Pi (pilote de la box Beaba)

| Article | Modèle | Prix | Notes |
|---|---|---|---|
| Raspberry Pi 4 Model B 4 Go | `RPi 4B 4GB` | ~60 € | 4 Go largement suffisant. 8 Go OK si tu veux marge. RPi 5 fonctionne aussi (~80 €) mais consomme plus. |
| Carte microSD 32 Go A1 | SanDisk Ultra, Kingston Canvas Select Plus | ~10 € | A1/A2 obligatoire pour l'OS et SQLite. |
| Alimentation 5V 3A USB-C | Officielle Raspberry Pi | ~10 € | Ne pas lésiner — sous-alimentation = corruption SQLite. |
| Boîtier ventilé Pi 4 | Argon NEO ou équivalent | ~15 € | Optionnel mais recommandé (le Pi tourne 24/7). |

**Sous-total** : ~95 €

### Dongle Zigbee

| Article | Modèle | Prix | Notes |
|---|---|---|---|
| Sonoff ZBDongle-E | EFR32MG21 (Zigbee 3.0) | ~25 € | Recommandé — meilleure portée et stabilité que la version P. Coordinateur pour zigbee2mqtt. |

Alternative : **Conbee III** (~80 €) si tu veux du USB 2.0 plus pro, mais ZBDongle-E suffit.

---

## 2. Capteurs ambiance — par pièce

Compter typiquement 4 à 8 capteurs selon le logement (1 par pièce de vie + chambres).

| Article | Modèle | Prix unitaire | Quantité | Rôle |
|---|---|---|---|---|
| Sonde T° + humidité Zigbee | Sonoff SNZB-02P | ~10 € | 4-8 | Une par pièce surveillée. Pile CR2477 ~12 mois. |
| Sonde CO₂ + T° + humidité Zigbee | Heiman HS3AQ | ~80 € | 1-2 | Pour les pièces avec occupation prolongée (salon, chambre). Plus cher → 1 ou 2 suffisent. |

**Pour 6 SNZB-02P + 1 HS3AQ** : ~140 €

---

## 3. Mesure électrique — selon installation

Deux philosophies, choisir l'une ou les combiner :

### A. Mesure globale au tableau (recommandé)

| Article | Modèle | Prix | Notes |
|---|---|---|---|
| Wattmètre tableau Wi-Fi | Shelly EM | ~50 € | Un canal courant via pince ampèremétrique. À installer dans le tableau (par électricien si tu n'es pas à l'aise). |
| Pince ampèremétrique 50A ou 120A | Shelly 120A CT clamp | ~10 € | À adapter au calibre du disjoncteur d'abonné. |

**Sous-total** : ~60 €

### B. Mesure par appareil (à compléter)

| Article | Modèle | Prix unitaire | Quantité |
|---|---|---|---|
| Prise mesure conso Zigbee | Innr SP 234 / SP 240 | ~25 € | 4-10 selon ce qu'on veut tracer (TV, frigo, lave-linge, multiprise bureau…) |

**Pour 6 Innr SP 240** : ~150 €

---

## 4. Sondes chaudière et chauffe-eau — optionnel

| Article | Modèle | Prix | Notes |
|---|---|---|---|
| Shelly Plus 1PM | Shelly Plus 1PM | ~22 € | Module Wi-Fi + relais + mesure de puissance. À alimenter en 110-240 V près de la chaudière. |
| Shelly Plus Add-On | Shelly Plus Add-On | ~13 € | Extension qui ajoute jusqu'à 3 entrées DS18B20 au Shelly Plus. |
| Sonde DS18B20 inox waterproof | DS18B20, câble 1-3 m | ~7 € × pack de 5 ≈ 35 € | 2 sondes minimum : départ chaudière + ballon ECS. |
| Pâte thermique + collier + manchon isolant | Arctic MX-4, rilsans, mousse adhésive | ~10 € | Pour fixer correctement la sonde au tuyau cuivre. |

**Pour 1 module (chaudière OU ECS)** : ~50 € | **Pour 2 modules** : ~85 €

Détails de câblage et placement : voir [README backend](../README.md#chaudière--ecs) et `ChaudierePage` empty state dans la frontend.

---

## 5. Réseau et accès distant — selon contexte

| Article | Prix | Notes |
|---|---|---|
| Câble Ethernet Cat 6 | ~5 € | Préférer Ethernet au Wi-Fi pour le Pi (stabilité). |
| Switch Wi-Fi mesh ou répéteur | 30-80 € | Optionnel si le Wi-Fi du ménage ne couvre pas le tableau (Shelly EM). |
| Tunnel Cloudflare | gratuit | Pour exposer l'API du Pi sans ouvrir de port. Voir [DEPLOY.md](DEPLOY.md). |

---

## 6. Budget total — kit type

| Configuration | Total approximatif |
|---|---|
| **Minimum viable** (Pi + ZBDongle + 4 SNZB-02P + Shelly EM) | **~250 €** |
| **Standard** (+ 6 Innr SP240 + 1 HS3AQ CO₂) | **~450 €** |
| **Complet** (+ Shelly Plus 1PM + Add-On + 2 DS18B20 chaudière/ECS) | **~535 €** |

---

## 7. Où acheter

### Fournisseurs européens recommandés

- **[Domadoo](https://www.domadoo.fr)** — Sonoff, Heiman, Innr, Shelly, livraison BE rapide
- **[Shelly officiel](https://shelly.com)** — Shelly EM, Plus 1PM, Add-On
- **[Amazon BE/FR](https://www.amazon.be)** — RPi, microSD, alim, DS18B20 (pack de 5)
- **[Kubii](https://www.kubii.com)** — Raspberry Pi officiel et accessoires
- **[Allnet](https://shop.allnet.de)** — alternative pour Shelly et Sonoff

### À éviter

- AliExpress / Banggood sur les Shelly et Innr : versions parfois sans CE, garantie inexistante.
- Cartes microSD "noname" : taux de corruption élevé après quelques mois 24/7.

---

## 8. Notes d'installation

- **Pi headless** : installer Raspberry Pi OS Lite 64-bit avec Raspberry Pi Imager, activer SSH et configurer le Wi-Fi via le menu avancé avant de flasher.
- **Couplage Zigbee** : zigbee2mqtt couple les Sonoff en mode interview (~5 s sur un bouton de la sonde). Voir la doc z2m pour chaque modèle.
- **Shelly EM dans le tableau** : c'est du 230 V. Si tu n'es pas électricien, fais poser par un professionnel — le coût se rentabilise sur la durée de vie de la mesure.
- **Sondes DS18B20** : 3 fils (rouge VCC, noir GND, jaune DATA) à brancher sur les bornes correspondantes de l'Add-On Shelly Plus. Pas de résistance pull-up à ajouter, intégrée.

---

## 9. Évolutivité

Le code accepte d'autres types de capteurs sans modification de schéma :

- Sondes Aqara / Tuya / IKEA Tradfri → ajouter dans zigbee2mqtt, le subscriber les détecte.
- Modbus TCP (poêles à pellets, PAC) → pas implémenté nativement, mais facile à ajouter dans `src/mqtt/`.
- Sondes thermocouple (K) → via Shelly Plus avec carte breakout MAX31855 sur l'Add-On (non testé).

PRs bienvenues pour d'autres intégrations dans [`src/mqtt/`](../src/mqtt/) ou [`src/analysis/`](../src/analysis/).
