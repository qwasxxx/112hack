import { useEffect, useRef, type PointerEvent } from 'react';

export type AdminTiltKind = 'strong' | 'medium' | 'light' | 'button';

const CARD_SELECTOR = [
  '.ad-metric',
  '.ad-service',
  '.ad-account-row',
  '.ad-user-row',
  '.ad-env-item',
  '.ad-backup-stat',
  '.ad-action',
  '.ad-health-mod',
  '.ad-train-card',
].join(', ');

const SURFACE_SELECTOR = ['.ad-surface', '.ad-inner > .panel', '.ad-inner .stack > .panel'].join(', ');

function applyTiltFrame(
  node: HTMLElement,
  current: { rx: number; ry: number; gx: number; gy: number; i: number },
  kind: AdminTiltKind,
) {
  node.style.setProperty('--ad-tilt-x', `${current.rx.toFixed(3)}deg`);
  node.style.setProperty('--ad-tilt-y', `${current.ry.toFixed(3)}deg`);
  node.style.setProperty('--ad-tilt-gx', `${current.gx.toFixed(1)}%`);
  node.style.setProperty('--ad-tilt-gy', `${current.gy.toFixed(1)}%`);
  node.style.setProperty('--ad-tilt-i', current.i.toFixed(3));
  const shadowGain = kind === 'button' ? 1.6 : kind === 'strong' ? 2.4 : kind === 'light' ? 1.15 : 1.8;
  node.style.setProperty('--ad-tilt-sx', `${(-current.ry * shadowGain).toFixed(2)}px`);
  node.style.setProperty('--ad-tilt-sy', `${((kind === 'button' ? 6 : 10) + current.rx * 0.75).toFixed(2)}px`);
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function bindAdminTilt(
  node: HTMLElement,
  rotation: { x: number; y: number },
  kind: AdminTiltKind,
  pressable = false,
) {
  node.classList.add('ad-tilt');
  if (kind === 'button') {
    node.classList.add('ad-tilt--button');
  } else if (kind === 'light') {
    node.classList.add('ad-tilt--light');
  } else if (kind === 'strong') {
    node.classList.add('ad-tilt--strong');
  }
  let reduced = false;
  let hover = false;
  let frame = 0;
  const pressFrame = { current: 0 };
  const target = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
  const current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  const sync = () => {
    reduced = motion.matches || coarse.matches;
    if (reduced) {
      target.rx = 0;
      target.ry = 0;
      target.i = 0;
    }
  };
  sync();
  motion.addEventListener('change', sync);
  coarse.addEventListener('change', sync);

  function animate() {
    const ease = kind === 'button' ? 0.18 : 0.15;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    applyTiltFrame(node, current, kind);
    const settled =
      Math.abs(current.rx - target.rx) < 0.012 &&
      Math.abs(current.ry - target.ry) < 0.012 &&
      Math.abs(current.i - target.i) < 0.012;
    if (!settled || hover) {
      frame = requestAnimationFrame(animate);
      return;
    }
    frame = 0;
  }

  function startLoop() {
    if (!frame) {
      frame = requestAnimationFrame(animate);
    }
  }

  function onMove(event: globalThis.PointerEvent) {
    if (event.pointerType !== 'mouse' || reduced) {
      return;
    }
    hover = true;
    const rect = node.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    target.rx = (0.5 - y) * rotation.x;
    target.ry = (x - 0.5) * rotation.y;
    target.gx = x * 100;
    target.gy = y * 100;
    target.i = 1;
    startLoop();
  }

  function onLeave() {
    hover = false;
    target.rx = 0;
    target.ry = 0;
    target.gx = 50;
    target.gy = 50;
    target.i = 0;
    startLoop();
  }

  function onDown(event: globalThis.PointerEvent) {
    if (pressable && event.button === 0) {
      playAdminPress(node, pressFrame);
    }
  }

  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerleave', onLeave);
  node.addEventListener('pointercancel', onLeave);
  node.addEventListener('pointerdown', onDown);
  return () => {
    motion.removeEventListener('change', sync);
    coarse.removeEventListener('change', sync);
    node.removeEventListener('pointermove', onMove);
    node.removeEventListener('pointerleave', onLeave);
    node.removeEventListener('pointercancel', onLeave);
    node.removeEventListener('pointerdown', onDown);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(pressFrame.current);
    node.classList.remove('ad-tilt', 'ad-tilt--button', 'ad-tilt--light', 'ad-tilt--strong');
    node.style.removeProperty('--ad-tilt-x');
    node.style.removeProperty('--ad-tilt-y');
    node.style.removeProperty('--ad-tilt-gx');
    node.style.removeProperty('--ad-tilt-gy');
    node.style.removeProperty('--ad-tilt-i');
    node.style.removeProperty('--ad-tilt-sx');
    node.style.removeProperty('--ad-tilt-sy');
  };
}

function rotationFor(node: HTMLElement, kind: 'card' | 'surface'): { x: number; y: number } {
  if (kind === 'card') {
    if (node.matches('.ad-account-row, .ad-user-row, .ad-env-item')) {
      return { x: 5.4, y: 6.6 };
    }
    if (node.matches('.ad-service, .ad-backup-stat, .ad-health-mod, .ad-train-card')) {
      return { x: 6.8, y: 8.2 };
    }
    return { x: 7.4, y: 9 };
  }
  return { x: 6.6, y: 8.4 };
}

function kindFor(node: HTMLElement, role: 'card' | 'surface'): AdminTiltKind {
  if (node.matches('.ad-action')) {
    return 'button';
  }
  if (role === 'surface') {
    return 'medium';
  }
  if (node.matches('.ad-account-row, .ad-user-row, .ad-env-item')) {
    return 'light';
  }
  return 'strong';
}

function hasInteractiveFields(node: HTMLElement) {
  return Boolean(node.querySelector('input, select, textarea, form, button, a'));
}

function isReactTiltSurface(node: HTMLElement) {
  return node.matches('.ad-users-board, .ad-user-profile');
}

export function bindAdminDashboardTilt(root: HTMLElement | null) {
  if (!root) {
    return () => {};
  }

  const host = root;
  let releases: Array<() => void> = [];

  function bind() {
    releases.forEach((release) => release());
    releases = [];
    const cards = [...host.querySelectorAll<HTMLElement>(CARD_SELECTOR)].filter(
      (node) => !node.closest('.ad-audit-list, .ad-flat-list') && !node.matches('.ad-flat'),
    ).slice(0, 16);
    const surfaces = [...host.querySelectorAll<HTMLElement>(SURFACE_SELECTOR)].filter(
      (surface) =>
        !hasInteractiveFields(surface) &&
        !isReactTiltSurface(surface) &&
        !surface.querySelector('.ad-audit-list, .ad-flat-list'),
    );
    for (const node of cards) {
      releases.push(
        bindAdminTilt(node, rotationFor(node, 'card'), kindFor(node, 'card'), node.matches('button')),
      );
    }
    for (const node of surfaces) {
      releases.push(bindAdminTilt(node, rotationFor(node, 'surface'), kindFor(node, 'surface')));
    }
  }

  bind();
  let scheduled = 0;
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === 'childList') || scheduled) {
      return;
    }
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      bind();
    });
  });
  observer.observe(host, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    cancelAnimationFrame(scheduled);
    releases.forEach((release) => release());
  };
}

export function useAdminTilt<T extends HTMLElement>(
  rotation: { x: number; y: number },
  kind: AdminTiltKind = 'medium',
) {
  const ref = useRef<T>(null);
  const reducedRef = useRef(false);
  const hoverRef = useRef(false);
  const frameRef = useRef(0);
  const targetRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50, i: 0 });
  const currentRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 50, i: 0 });

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      reducedRef.current = motion.matches || coarse.matches;
      if (reducedRef.current) {
        targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
      }
    };
    sync();
    motion.addEventListener('change', sync);
    coarse.addEventListener('change', sync);
    return () => {
      motion.removeEventListener('change', sync);
      coarse.removeEventListener('change', sync);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function animate() {
    const node = ref.current;
    if (!node) {
      return;
    }
    const target = targetRef.current;
    const current = currentRef.current;
    const ease = kind === 'button' ? 0.18 : 0.15;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    applyTiltFrame(node, current, kind);
    const settled =
      Math.abs(current.rx - target.rx) < 0.012 &&
      Math.abs(current.ry - target.ry) < 0.012 &&
      Math.abs(current.i - target.i) < 0.012;
    if (!settled || hoverRef.current) {
      frameRef.current = requestAnimationFrame(animate);
      return;
    }
    frameRef.current = 0;
  }

  function startLoop() {
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(animate);
    }
  }

  function onPointerMove(event: PointerEvent<T>) {
    if (event.pointerType !== 'mouse' || reducedRef.current) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }
    hoverRef.current = true;
    const rect = node.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    targetRef.current = {
      rx: (0.5 - y) * rotation.x,
      ry: (x - 0.5) * rotation.y,
      gx: x * 100,
      gy: y * 100,
      i: 1,
    };
    startLoop();
  }

  function onPointerLeave() {
    hoverRef.current = false;
    targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
    startLoop();
  }

  return { ref, onPointerMove, onPointerLeave };
}

let lastPressAt = 0;

export function playAdminPress(element: HTMLElement | null, frameRef: { current: number }) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const now = performance.now();
  if (now - lastPressAt < 80) {
    return;
  }
  lastPressAt = now;
  const node = element;
  const start = performance.now();
  const duration = 128;
  cancelAnimationFrame(frameRef.current);
  function frame(time: number) {
    const t = Math.min(1, (time - start) / duration);
    let y = 0;
    let scale = 1;
    if (t < 0.22) {
      const p = t / 0.22;
      scale = 1 - 0.012 * p;
      y = 0.55 * p;
    } else if (t < 0.58) {
      const p = (t - 0.22) / 0.36;
      y = 0.5 - p * 0.7;
      scale = 0.988 + p * 0.014;
    } else {
      const p = (t - 0.58) / 0.42;
      scale = 1 + 0.004 * (1 - p);
      y = -0.18 * (1 - p);
    }
    node.style.setProperty('--ad-press-y', `${y.toFixed(2)}px`);
    node.style.setProperty('--ad-press-s', scale.toFixed(4));
    if (t < 1) {
      frameRef.current = requestAnimationFrame(frame);
      return;
    }
    node.style.setProperty('--ad-press-y', '0px');
    node.style.setProperty('--ad-press-s', '1');
    frameRef.current = 0;
  }
  frameRef.current = requestAnimationFrame(frame);
}
