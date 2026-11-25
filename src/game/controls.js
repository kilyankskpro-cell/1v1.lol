import { TOOLS, clamp } from '../../shared/arena.js';

const keys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space', 'KeyR', ...TOOLS.map((_, i) => `Digit${i + 1}`)]);

export function bindControls(canvas, hud, options) {
  const events = new AbortController();
  const listen = (target, event, handler, config) => target.addEventListener(event, handler, { ...config, signal: events.signal });
  const pressed = new Set();
  const aim = { yaw: 0, pitch: 0 };
  let tool = 'burst';
  let drag;
  let stick;
  let touchFire;
  let firing = false;
  let triggerUntil = 0;
  let reloadUntil = 0;
  let jumpUntil = 0;
  let wasLocked = false;
  let ignoreUnlock = false;
  const joystick = hud.querySelector('.joystick');
  const knob = joystick.firstElementChild;

  const allowed = () => !options.paused();
  function choose(which) {
    if (!TOOLS.includes(which)) return;
    tool = which;
    options.select(tool);
  }
  function look(dx, dy) {
    aim.yaw += dx * .0034;
    aim.yaw = Math.atan2(Math.sin(aim.yaw), Math.cos(aim.yaw));
    aim.pitch = clamp(aim.pitch - dy * .0034, -1.23, 1.12);
  }
  function resetPressed() {
    pressed.clear();
    drag = stick = touchFire = undefined;
    firing = false;
    triggerUntil = reloadUntil = jumpUntil = 0;
    knob.style.transform = '';
  }
  function releaseLock() {
    if (document.pointerLockElement === canvas) {
      ignoreUnlock = true;
      document.exitPointerLock();
    }
    resetPressed();
  }

  listen(window, 'keydown', (event) => {
    if (!allowed() || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || !keys.has(event.code)) return;
    event.preventDefault();
    pressed.add(event.code);
    if (event.code.startsWith('Digit')) choose(TOOLS[Number(event.code.slice(-1)) - 1]);
  });
  listen(window, 'keyup', (event) => pressed.delete(event.code));
  listen(window, 'blur', resetPressed);
  listen(document, 'pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && wasLocked && !ignoreUnlock && allowed()) options.pause();
    wasLocked = locked;
    ignoreUnlock = false;
  });
  listen(canvas, 'contextmenu', (event) => event.preventDefault());
  listen(canvas, 'pointerdown', (event) => {
    if (!allowed() || event.button > 2) return;
    if (event.pointerType === 'touch' || event.button === 2) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    firing = true;
    triggerUntil = performance.now() + 108;
    if (document.pointerLockElement !== canvas) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { Promise.resolve(canvas.requestPointerLock?.()).catch(() => {}); } catch { /* Drag still aims in embedded browsers. */ }
    }
  });
  listen(document, 'pointermove', (event) => {
    if (!allowed()) return;
    if (document.pointerLockElement === canvas && event.pointerType === 'mouse') look(event.movementX, event.movementY);
    else if (drag?.id === event.pointerId) {
      look((event.clientX - drag.x) * 1.45, (event.clientY - drag.y) * 1.45);
      Object.assign(drag, { x: event.clientX, y: event.clientY });
    }
  });
  const stop = (event) => {
    if (drag?.id === event.pointerId) drag = undefined;
    if (event.pointerType === 'mouse') firing = false;
    if (stick?.id === event.pointerId) { stick = undefined; knob.style.transform = ''; }
    if (touchFire === event.pointerId) touchFire = undefined;
  };
  listen(window, 'pointerup', stop);
  listen(window, 'pointercancel', stop);

  function moveJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const max = rect.width * .34;
    const length = Math.max(max, Math.hypot(dx, dy));
    Object.assign(stick, { x: dx / length, z: -dy / length });
    knob.style.transform = `translate(${stick.x * max}px, ${-stick.z * max}px)`;
  }
  listen(joystick, 'pointerdown', (event) => {
    if (!allowed()) return;
    stick = { id: event.pointerId };
    joystick.setPointerCapture(event.pointerId);
    moveJoystick(event);
  });
  listen(joystick, 'pointermove', (event) => { if (stick?.id === event.pointerId) moveJoystick(event); });
  const fire = hud.querySelector('[data-touch="fire"]');
  listen(fire, 'pointerdown', (event) => {
    if (!allowed()) return;
    touchFire = event.pointerId;
    triggerUntil = performance.now() + 108;
    fire.setPointerCapture(event.pointerId);
  });
  listen(fire, 'click', () => { if (allowed()) triggerUntil = performance.now() + 108; });
  listen(hud.querySelector('[data-touch="jump"]'), 'click', () => { if (allowed()) jumpUntil = performance.now() + 100; });
  listen(hud.querySelector('[data-touch="reload"]'), 'click', () => { if (allowed()) reloadUntil = performance.now() + 130; });
  for (const slot of hud.querySelectorAll('[data-tool]')) listen(slot, 'click', () => choose(slot.dataset.tool));

  return {
    aim,
    get tool() { return tool; },
    input(now) {
      const active = allowed();
      const down = (a, b) => Number(pressed.has(a) || pressed.has(b));
      return {
        ...aim, tool,
        mx: active ? stick?.x ?? down('KeyD', 'ArrowRight') - down('KeyA', 'ArrowLeft') : 0,
        mz: active ? stick?.z ?? down('KeyW', 'ArrowUp') - down('KeyS', 'ArrowDown') : 0,
        jump: active && (pressed.has('Space') || now < jumpUntil),
        reload: active && (pressed.has('KeyR') || now < reloadUntil),
        fire: active && (firing || touchFire !== undefined || now < triggerUntil),
      };
    },
    reset(player) {
      resetPressed();
      aim.yaw = player.yaw;
      aim.pitch = player.pitch;
      choose(player.tool);
    },
    releaseLock,
    close() { releaseLock(); events.abort(); },
  };
}
