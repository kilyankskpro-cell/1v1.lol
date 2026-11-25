/**
 * Constantes de gameplay partagées entre le client et le serveur.
 * Toute valeur utilisée pour une validation serveur DOIT vivre ici
 * afin que la prédiction client et l'autorité serveur restent cohérentes.
 */

/** Taille d'une cellule de la grille de construction (unités monde ≈ mètres). */
export const GRID = 4;
export const WALL_THICKNESS = 0.25;
export const FLOOR_THICKNESS = 0.25;
/** Hauteur de la pyramide (toit) posée sur une cellule. */
export const ROOF_HEIGHT = 2;
/** Nombre maximal d'étages constructibles (0 = sol). */
export const BUILD_MAX_LEVEL = 10;
/** Coût en matériaux d'une pièce (mode Duel uniquement). */
export const BUILD_COST = 10;
export const STARTING_MATERIALS = 500;
/** Distance maximale (œil → centre de la pièce) acceptée par le serveur. */
export const BUILD_MAX_DISTANCE = 14;

export const PLAYER = {
  radius: 0.4,
  height: 1.85,
  crouchHeight: 1.25,
  eyeHeight: 1.6,
  crouchEyeHeight: 1.05,
  headRadius: 0.27,
  walkSpeed: 6,
  sprintSpeed: 9,
  crouchSpeed: 3,
  jumpSpeed: 8.5,
  gravity: 24,
  /** Hauteur franchissable sans sauter (marches, bas de rampe). */
  stepHeight: 0.55,
} as const;

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;

/** Snapshots serveur → clients par seconde. */
export const SERVER_TICK_RATE = 20;
/** États client → serveur par seconde. */
export const CLIENT_SEND_RATE = 30;
/** Délai de remise à zéro de l'arène après une élimination. */
export const ROUND_RESTART_DELAY_MS = 3000;
