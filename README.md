# Build Fight — TPS + construction sur grille

Jeu de tir à la troisième personne avec construction rapide sur grille, inspiré du gameplay de 1v1.LOL.
Graphismes, modèles et sons sont 100 % originaux (géométrie low-poly, textures et sons générés par le code).

**Stack :** Three.js + TypeScript (client, Vite, aucun framework UI) · Node.js + Socket.io (serveur autoritaire léger) · code partagé TypeScript (`shared/`) exécuté à l'identique côté client, serveur et bots.

## Modes de jeu

| Mode | Description |
| --- | --- |
| **1 contre 1 — Bot** | Duel en manches contre une IA (Facile / Normal / Difficile). 100 PV + 100 bouclier, 500 matériaux, arène remise à zéro à chaque manche, **premier à 5 manches** → écran Victoire / Défaite. |
| **Duel en ligne** | Deux joueurs humains appairés par le serveur (ouvrez un 2ᵉ onglet pour tester). Sans serveur : entraînement solo dans l'arène. |
| **Entraînement** | Grande carte avec plateformes, caisses et 8 cibles (fixes, mobiles, en hauteur) qui réapparaissent automatiquement. Munitions et matériaux illimités. |
| **Free Build** | Aucun ennemi, matériaux illimités, toutes les constructions modifiables et destructibles. |

Le Bot, l'Entraînement et le Free Build tournent entièrement dans le navigateur (zéro latence, pause possible) : la même classe `Room` que le serveur est exécutée via un transport en mémoire.

## Arborescence

```
.
├── shared/src/               # logique pure, sans Three.js, partagée client ↔ serveur ↔ bots
│   ├── constants.ts          # grille (4 u), joueur, PV/bouclier, manches, ticks
│   ├── movement.ts           # moteur de déplacement (gravité, collisions, pentes, coyote time)
│   ├── buildTarget.ts        # choix de la case de construction visée (joueur ET bots)
│   ├── geometry.ts           # AABB / pentes / pyramides : hauteurs de sol + raycasts
│   ├── structures.ts         # pièces (mur, sol, rampe, toit), clés de grille, édition 3×3, PV
│   ├── arena.ts              # cartes Duel, Entraînement (cibles), Free Build
│   ├── weapons.ts            # fusil d'assaut, pompe, pistolet, pioche, sniper
│   ├── raycast.ts            # raycast des armes (tête ×2, corps, structures)
│   └── protocol.ts           # messages typés (Socket.io / transport local)
├── server/src/
│   ├── index.ts              # HTTP (/health) + Socket.io + boucle 20 Hz
│   ├── Matchmaker.ts         # file Duel / salles privées
│   ├── Room.ts               # autorité : mouvements, tirs, dégâts, constructions, manches, bots, cibles
│   └── Bot.ts                # IA des bots (visée, déplacement, couvert, ramp rush, difficultés)
└── client/
    ├── index.html            # menus (principal, modes, pause, fin de match, paramètres) + HUD
    └── src/
        ├── main.ts           # navigation des menus → lancement / arrêt d'une partie
        ├── style.css
        ├── ui/
        │   ├── SettingsPanel.ts    # paramètres (sensibilité, volume, qualité, FOV, inversion, plein écran, touches)
        │   └── Overlays.ts         # pause et fin de match
        └── game/
            ├── Game.ts             # boucle, réseau, pause, orchestration
            ├── Settings.ts         # paramètres persistés (localStorage) + touches reconfigurables
            ├── Audio.ts            # sons synthétisés (Web Audio), atténuation par distance
            ├── Input.ts            # clavier (codes physiques) + Pointer Lock
            ├── PlayerController.ts # moteur de déplacement partagé, en vecteurs Three.js
            ├── ThirdPersonCamera.ts# caméra épaule droite, visée, anti-clipping
            ├── BuildSystem.ts      # prévisualisation bleu/rouge, pose instantanée, rafale
            ├── EditSystem.ts       # édition des murs sur grille 3×3
            ├── WeaponSystem.ts     # inventaire, munitions, rechargement, dispersion, recul
            ├── World.ts            # arène, structures (pop, dégâts, destruction), raycasts
            ├── StructureMesh.ts    # meshes générés depuis les colliders (géométries en cache)
            ├── StructureMaterials.ts # textures procédurales (bois, pierre, tuiles)
            ├── Avatar.ts           # personnage articulé : marche, course, saut, chute, armes
            ├── RemotePlayer.ts     # autres joueurs / bots / cibles interpolés (110 ms)
            ├── Effects.ts          # traçantes, impacts, flash, particules
            ├── HUD.ts              # vie, bouclier, munitions, matériaux, éliminations, manches…
            └── LocalServer.ts      # Room exécutée dans le navigateur
```

## Lancer en local

Prérequis : **Node.js 20+**.

```bash
npm install          # installe client + serveur (workspaces)
npm run dev          # serveur de jeu :3001 + client Vite :5173
```

Ouvrez http://localhost:5173, choisissez un pseudo puis **Jouer**. Cliquez dans la scène pour capturer la souris ; **Échap** ouvre le menu pause.

```bash
npm run typecheck    # vérification TypeScript de shared, server et client
npm run build        # build de production du client (client/dist)
```

Variables d'environnement : `PORT` (serveur, défaut 3001) et `GAME_SERVER_URL` (cible du proxy Vite, défaut `http://localhost:3001`).

## Commandes (modifiables dans Paramètres)

Les touches utilisent la **position physique** : ZQSD sur AZERTY = WASD sur QWERTY (le jeu affiche la vraie lettre sous Chrome / Edge).

| Action | Touche |
| --- | --- |
| Déplacement | Z Q S D |
| Caméra / visée | Souris |
| Tirer / placer une construction | Clic gauche (maintenu = construction en rafale) |
| Viser | Clic droit |
| Sauter / Courir / S'accroupir | Espace / Shift / Ctrl |
| Recharger | R |
| Mur · Sol · Rampe · Toit | F · C · V · T (re-appuyer = retour aux armes) |
| Modifier (édition 3×3) | G : cliquez les cases à retirer, G ou Entrée valide, clic droit annule, R réinitialise |
| Détruire la construction visée | X (les siennes ; toutes en Entraînement / Free Build) |
| Fusil d'assaut · Pompe · Pistolet · Pioche · Sniper | 1 · 2 · 3 · 4 · 5 (ou molette) |
| Pause | Échap |

> Astuce : *Ctrl + W* ferme l'onglet sous Chrome hors plein écran — réassignez « S'accroupir » si besoin.

## Intelligence artificielle

Les bots (`server/src/Bot.ts`) utilisent **les mêmes règles que le joueur** : même moteur physique, même ciblage de grille, mêmes tirs validés par le serveur, aucune vision à travers les murs.

- repère le joueur (ligne de vue), le poursuit et garde une distance adaptée à son arme (pompe de près, fusil d'assaut sinon, pistolet en secours) ;
- vise avec un temps de réaction, une vitesse de suivi et une erreur qui dépendent de la difficulté ; recharge ;
- strafe, saute, se débloque quand il est coincé ;
- casse les constructions qui le séparent du joueur ;
- touché : se couvre derrière un mur, souvent suivi d'un **ramp rush** (rampes + murs de protection) ;
- cherche à prendre la hauteur, surtout si le joueur est au-dessus de lui.

## Paramètres

Sensibilité, volume, qualité graphique (résolution de rendu, ombres, particules), plein écran, champ de vision, inversion verticale et touches : appliqués immédiatement et conservés dans `localStorage`.

## Architecture réseau

- **Déplacement** : simulé côté client (zéro latence ressentie), envoyé à 30 Hz. Le serveur vérifie la vitesse et les limites et renvoie une correction (`correct`) en cas d'écart.
- **Tirs** : le client affiche immédiatement traçantes et impacts, puis envoie origine + directions. Le serveur vérifie cadence et origine, refait le raycast avec le **même code** (`shared/raycast.ts`) et applique les dégâts (bouclier d'abord ; tête ×2).
- **Constructions / éditions / destructions** : prédites puis confirmées ou annulées par le serveur (emplacement libre, dans l'arène, à portée, matériaux, propriétaire).
- **Autres joueurs** : snapshots 20 Hz, affichés avec 110 ms d'interpolation.

Pistes d'évolution : compensation de latence (rembobinage des hitbox), intégrité structurelle (effondrement sans support), édition des sols / rampes.

En développement, l'instance du jeu est exposée dans la console via `window.__game`.
