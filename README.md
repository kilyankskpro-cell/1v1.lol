# 1v1.lol — Build Fight (TPS + construction sur grille)

Jeu de tir à la troisième personne avec construction rapide sur grille, inspiré de 1v1.LOL.

**Stack :** Three.js + TypeScript (client, Vite) · Node.js + Socket.io (serveur autoritaire léger) · code partagé TypeScript (`shared/`) exécuté à l'identique des deux côtés.

## Arborescence

```
.
├── package.json              # workspaces npm (client, server) + scripts dev / typecheck
├── shared/src/               # logique pure, sans Three.js, partagée client ↔ serveur
│   ├── constants.ts          # grille (4 u), joueur, PV/bouclier, tick rates
│   ├── math.ts               # Vec3 minimal
│   ├── geometry.ts           # AABB / pentes / pyramides : hauteurs de sol + raycasts
│   ├── structures.ts         # pièces (mur, sol, rampe, toit), clés de grille, éditions, PV
│   ├── arena.ts              # cartes Duel (rampe centrale, 2 spawns) et JustBuild
│   ├── weapons.ts            # pioche, pompe, fusil d'assaut, sniper (dégâts, dispersion, recul…)
│   ├── raycast.ts            # raycast des armes (tête ×2, corps, structures)
│   └── protocol.ts           # messages Socket.io typés
├── server/src/
│   ├── index.ts              # HTTP (/health) + Socket.io + boucle 20 Hz
│   ├── Matchmaker.ts         # file Duel / salles JustBuild privées
│   └── Room.ts               # autorité : validation des mouvements, tirs, dégâts, constructions, manches
└── client/
    ├── index.html            # menu + HUD
    ├── vite.config.ts        # alias @shared + proxy WebSocket vers le serveur
    └── src/
        ├── main.ts           # menu → lancement de la partie
        ├── style.css         # HUD minimaliste
        └── game/
            ├── Game.ts             # boucle, réseau, orchestration
            ├── Input.ts            # clavier (codes physiques AZERTY/QWERTY) + Pointer Lock
            ├── PlayerController.ts # déplacements, saut, sprint, accroupi, collisions, rampes
            ├── ThirdPersonCamera.ts# caméra épaule droite, visée, anti-clipping
            ├── BuildSystem.ts      # ciblage grille, prévisualisation bleu/rouge, pose, édition
            ├── WeaponSystem.ts     # inventaire, munitions, dispersion, recul, raycast
            ├── World.ts            # arène, structures (dégâts visuels), requêtes de raycast
            ├── StructureMesh.ts    # meshes générés depuis les colliders partagés
            ├── Avatar.ts           # personnage + armes
            ├── RemotePlayer.ts     # adversaire interpolé (110 ms)
            ├── Effects.ts          # traçantes, impacts, flash
            └── HUD.ts              # vie, bouclier, pièces, armes, réticule dynamique
```

## Lancer en local

Prérequis : **Node.js 20+**.

```bash
npm install          # installe client + serveur (workspaces)
npm run dev          # serveur de jeu :3001 + client Vite :5173
```

1. Ouvrez http://localhost:5173, saisissez un pseudo.
2. **JustBuild** : entraînement solo, munitions et matériaux illimités.
3. **Duel 1v1** : ouvrez un **2ᵉ onglet** (ou une autre machine du réseau via `http://<ip>:5173`) et cliquez aussi sur *Duel 1v1* : les deux joueurs sont appairés automatiquement.
4. Cliquez dans la scène pour capturer la souris (Échap pour la libérer).

Autres commandes :

```bash
npm run typecheck    # vérification TypeScript de shared, server et client
npm run build        # build de production du client (client/dist)
```

Variables d'environnement : `PORT` (serveur, défaut 3001) et `GAME_SERVER_URL` (cible du proxy Vite, défaut `http://localhost:3001`).

## Contrôles

Les touches utilisent la **position physique** : sur AZERTY c'est ZQSD + A/E/R/V, sur QWERTY WASD + Q/E/R/V (le HUD affiche la bonne lettre sous Chrome/Edge).

| Action | Touche |
| --- | --- |
| Se déplacer | Z Q S D (AZERTY) / W A S D (QWERTY) |
| Sauter / Sprint / S'accroupir | Espace / Shift / Ctrl ou C |
| Tirer – construire / Viser | Clic gauche / Clic droit |
| Armes | 1 Pioche · 2 Pompe · 3 Fusil d'assaut · 4 Sniper, ou molette |
| Recharger | T (automatique quand le chargeur est vide) |
| Mur · Sol · Rampe · Toit | A · E · R · V (re-appuyer = retour aux armes) |
| Éditer son mur (plein → porte → fenêtre) | G |

> Astuce navigateur : *Ctrl + W* ferme l'onglet — utilisez **C** pour s'accroupir en marchant.

## Architecture réseau

- **Déplacement** : simulé côté client (zéro latence ressentie), envoyé à 30 Hz. Le serveur vérifie la vitesse et les limites de l'arène et renvoie une correction (`correct`) en cas d'écart.
- **Tirs** : le client affiche immédiatement traçantes et impacts, puis envoie origine + directions des plombs. Le serveur vérifie la cadence et l'origine, refait le raycast avec le **même code** (`shared/raycast.ts`) et applique les dégâts (bouclier d'abord, puis PV ; tête ×2).
- **Constructions** : posées en prédiction (semi-transparentes) puis confirmées ou annulées par le serveur (emplacement libre, dans l'arène, à portée, matériaux). La clé de grille rend la pose idempotente.
- **Adversaire** : snapshots 20 Hz, affiché avec 110 ms d'interpolation.
- **Manche** : à une élimination, score +1 puis remise à zéro de l'arène après 3 s.

Pistes d'évolution : compensation de latence (rembobinage des hitbox), intégrité structurelle (effondrement sans support), édition sur grille 3×3, sons.

En développement, l'instance du jeu est exposée dans la console via `window.__game`.
