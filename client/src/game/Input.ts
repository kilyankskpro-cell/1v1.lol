/**
 * Clavier + souris + Pointer Lock.
 * On utilise `KeyboardEvent.code` (position physique de la touche) et des
 * actions reconfigurables (voir Settings) : ZQSD (AZERTY) = WASD (QWERTY).
 */
import { settings, type Action } from './Settings';

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private dx = 0;
  private dy = 0;
  private abort = new AbortController();
  /** Pointer Lock refusé (ex. iframe sans permission) : visée souris sans capture. */
  private fallback = false;
  private lastUnlock = 0;
  mouseLeft = false;
  mouseRight = false;
  mouseLeftPressed = false;
  mouseRightPressed = false;
  wheel = 0;
  locked = false;
  /** Appelé à chaque prise / perte de la souris (pause automatique). */
  onLockChange: (locked: boolean) => void = () => {};
  /** Clic dans la scène alors que la souris n'est pas capturée. */
  onCanvasClick: () => void = () => {};

  constructor(private el: HTMLElement) {
    const opts = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.locked && e.code !== 'Escape' && !e.code.startsWith('F')) e.preventDefault();
        if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
        this.down.add(e.code);
        // En mode secours, Échap libère la souris comme le ferait le Pointer Lock.
        if (e.code === 'Escape' && this.fallback && this.locked) this.setLocked(false);
      },
      opts,
    );
    window.addEventListener('keyup', (e) => this.down.delete(e.code), opts);
    window.addEventListener(
      'blur',
      () => {
        this.down.clear();
        this.mouseLeft = this.mouseRight = false;
      },
      opts,
    );

    el.addEventListener(
      'mousedown',
      (e) => {
        if (!this.locked) {
          this.onCanvasClick();
          return;
        }
        if (e.button === 0) {
          this.mouseLeft = true;
          this.mouseLeftPressed = true;
        }
        if (e.button === 2) {
          this.mouseRight = true;
          this.mouseRightPressed = true;
        }
      },
      opts,
    );
    window.addEventListener(
      'mouseup',
      (e) => {
        if (e.button === 0) this.mouseLeft = false;
        if (e.button === 2) this.mouseRight = false;
      },
      opts,
    );
    window.addEventListener(
      'mousemove',
      (e) => {
        if (!this.locked) return;
        this.dx += e.movementX;
        this.dy += e.movementY;
      },
      opts,
    );
    window.addEventListener('wheel', (e) => this.locked && (this.wheel += Math.sign(e.deltaY)), { passive: true, signal: this.abort.signal });
    el.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    document.addEventListener('pointerlockchange', () => this.setLocked(document.pointerLockElement === this.el), opts);
    document.addEventListener('pointerlockerror', () => this.onLockError(), opts);
  }

  requestLock() {
    if (this.fallback) return this.setLocked(true);
    try {
      const res = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      res?.catch?.(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  releaseLock() {
    if (this.fallback) this.setLocked(false);
    else if (document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /**
   * Chrome refuse un nouveau verrouillage ~1 s après une sortie par Échap : ce n'est
   * pas une interdiction, on ne bascule en mode secours que si le refus n'a pas cette cause.
   */
  private onLockError() {
    if (performance.now() - this.lastUnlock < 1500) return;
    this.fallback = true;
    this.setLocked(true);
  }

  private setLocked(locked: boolean) {
    if (locked === this.locked) return;
    this.locked = locked;
    this.el.style.cursor = locked && this.fallback ? 'none' : '';
    if (!locked) {
      this.lastUnlock = performance.now();
      this.mouseLeft = this.mouseRight = false;
      this.down.clear();
    }
    this.onLockChange(locked);
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  /** Vrai uniquement à la frame où la touche a été enfoncée. */
  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  action(a: Action) {
    return this.down.has(settings.data.keys[a]);
  }

  actionPressed(a: Action) {
    return this.pressed.has(settings.data.keys[a]);
  }

  consumeMouseDelta() {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = this.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
    this.wheel = 0;
  }

  dispose() {
    this.abort.abort();
    if (document.pointerLockElement === this.el) document.exitPointerLock();
  }
}
