/**
 * Clavier + souris + Pointer Lock.
 * On utilise `KeyboardEvent.code` (position physique de la touche) : la touche
 * "Z" d'un clavier AZERTY a le code "KeyW", donc ZQSD (AZERTY) = WASD (QWERTY)
 * sans configuration. Idem pour "A" (AZERTY) = code "KeyQ" → Mur.
 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private dx = 0;
  private dy = 0;
  mouseLeft = false;
  mouseRight = false;
  mouseLeftPressed = false;
  wheel = 0;
  locked = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.locked) e.preventDefault();
      if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseLeft = this.mouseRight = false;
    });

    el.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) {
        this.mouseLeft = true;
        this.mouseLeftPressed = true;
      }
      if (e.button === 2) this.mouseRight = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.locked) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => this.setLocked(document.pointerLockElement === this.el));
    document.addEventListener('pointerlockerror', () => this.enableFallback());
    // En mode secours, Échap libère la souris comme le ferait le Pointer Lock.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.fallback) this.setLocked(false);
    });
  }

  /** Vrai si le Pointer Lock est refusé (ex. iframe sans permission) : visée souris sans capture. */
  private fallback = false;

  private requestLock() {
    if (this.fallback) return this.setLocked(true);
    try {
      const res = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      res?.catch?.(() => this.enableFallback());
    } catch {
      this.enableFallback();
    }
  }

  private enableFallback() {
    this.fallback = true;
    this.setLocked(true);
  }

  private setLocked(locked: boolean) {
    this.locked = locked;
    this.el.style.cursor = locked && this.fallback ? 'none' : '';
    if (!locked) this.mouseLeft = this.mouseRight = false;
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  /** Vrai uniquement à la frame où la touche a été enfoncée. */
  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  consumeMouseDelta() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseLeftPressed = false;
    this.wheel = 0;
  }
}
