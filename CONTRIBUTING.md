# Contribuer à Beaba

Merci de l'intérêt ! Beaba est un projet citoyen — toute contribution est bienvenue, qu'elle vienne d'un développeur, d'un installateur, d'un chercheur en thermique ou d'un partenaire associatif.

## Avant de commencer

- **Lis le [README](README.md)** pour comprendre la vision et le périmètre.
- **Cherche dans les issues existantes** — il y a peut-être déjà une discussion en cours.
- **Pour un changement non trivial** (nouvelle fonctionnalité, refactor important), ouvre d'abord une *issue* pour discuter l'approche avant d'investir du temps en code.

## Setup dev

Voir [docs/DEPLOY.md](docs/DEPLOY.md#installation-locale-dev) pour le dev local.

Le minimum pour faire tourner le backend en dev :
```bash
cp .env.example .env  # mets juste JWT_SECRET et MQTT_BROKER=mqtt://localhost
npm install
node src/db/migrate.js
npm run dev
```

Pas besoin de matériel réel pour la plupart des contributions front/algo/analyse — la base de données reste vide mais l'API et le frontend tournent.

## Style de code

- **JavaScript pur** (pas de TypeScript pour l'instant).
- **2 espaces** d'indentation, **point-virgule** en fin de ligne.
- **Pas de commentaires inutiles** : si un nom de variable suffit à comprendre, le commentaire est en trop. Privilégier *pourquoi* plutôt que *quoi* quand un commentaire est nécessaire.
- **Pas de logs en français** pour les messages destinés au runtime (les commentaires de code peuvent l'être).
- ESLint si présent (`npm run lint`).

## Convention de commit

Format libre mais lisible. Modèle suggéré :

```
<scope>: <résumé court à l'impératif>

Optionnel : explication du pourquoi sur quelques lignes,
notamment si la modification n'est pas triviale.
```

Exemples bons :
- `comfort: switch dew-point formula to Magnus-Tetens`
- `Dashboard: bento layout to avoid empty space below chart`
- `pipe: kind-aware analysis (boiler vs DHW)`

Exemples à éviter :
- `fix`
- `update`
- `WIP`

## Pull requests

1. Créer une branche depuis `master` : `git checkout -b nom-court-explicite`.
2. Faire des commits atomiques et clairs.
3. Tester localement.
4. Ouvrir une PR contre `master` avec :
   - Un titre clair
   - Une description du *pourquoi* et de l'impact utilisateur
   - Des captures d'écran pour les changements UI
   - Une checklist des tests effectués
5. Attendre la review. Pas de merge direct sur `master` même si la PR vient d'un mainteneur — au moins une autre paire d'yeux.

## Sécurité

Si tu découvres une vulnérabilité de sécurité, **n'ouvre pas d'issue publique**. Écris directement à `benoit@450ppm.be`. On répondra sous 48h.

## Code de conduite

Pas de code de conduite formel pour l'instant. Comportement attendu : respect, bienveillance, focus sur le projet. Pas de discrimination, harcèlement, ou contenu offensant. Les mainteneurs se réservent le droit de modérer.

## Domaines où on cherche de l'aide

- **Tests** : pas de suite de tests automatisés pour l'instant. Une base Jest ou Vitest avec quelques tests-clés serait bienvenue.
- **Internationalisation** : aujourd'hui tout est en français.
- **Accessibilité** : audit ARIA / contraste / navigation clavier sur le dashboard.
- **Documentation hardware** : tutos photo de l'installation des sondes (pâte thermique sur tuyau, etc.).
- **Intégrations capteurs** : Modbus pour PAC/poêles à pellets, Aqara/IKEA Tradfri, P1 (compteur intelligent belge), etc.
- **Modèles thermiques avancés** : modèle 2-mur ou multi-zones pour le confort plutôt que la simplification "brique 30 cm".
- **UX de bilan** : la page de rapport de fin de campagne peut être étoffée (comparaisons, recommandations chiffrées, génération PDF imprimable).

## Licence

En contribuant, tu acceptes que ta contribution soit publiée sous la même licence que le projet : **AGPL-3.0**.

Merci !
