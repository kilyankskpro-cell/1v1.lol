# RIFT DUEL

Jeu de tir et de construction en 3D inspiré des duels 1v1. Les parties solo et l’entraînement se jouent dans le navigateur ; les salons privés utilisent le serveur WebSocket du jeu et ne nécessitent ni compte ni base de données.

## Jouer

- **Duel 1v1** : affronte un bot. Le premier à remporter trois manches gagne.
- **Construction libre** : entraîne-toi sans adversaire avec des matériaux illimités. Le bouton corbeille permet d’effacer les structures.
- **Partie privée** : partage le code ou le lien du salon. Les deux joueurs doivent ouvrir la même instance du jeu depuis un navigateur compatible WebGL 2.

Clavier : **ZQSD / WASD / flèches** pour se déplacer, **Espace** pour sauter, **R** pour recharger, **1–2** pour les armes, **3–6** pour les constructions. Utilise la souris pour viser, le clic gauche pour tirer ou placer, et **Échap** pour la pause. Sur mobile, utilise le joystick, le glissement et les boutons tactiles.

## Développement

Avec Node.js 22.12 ou supérieur : `npm ci`, puis `npm run dev`. Le jeu est servi sur `http://localhost:3000`. `npm test` exécute les tests de simulation et de salons ; `npm run build` compile le client.

Pour servir le build localement, lance `npm start` après `npm run build`. Le serveur HTTP et la connexion WebSocket `/duel` partagent le même port (`PORT`, défaut `3000`). Derrière un proxy, transmets les mises à niveau WebSocket et préserve l’hôte public ; `DUEL_PUBLIC_HOST` permet de déclarer cet hôte (sans protocole) s’il diffère de celui transmis au serveur. Les salons sont en mémoire et ne survivent pas à un redémarrage.
