import { useEffect, useRef, type PointerEvent } from 'react';

export type TiltKind = 'strong' | 'medium' | 'light' | 'button';

export function applyTiltFrame(
  node: HTMLElement,
  current: { rx: number; ry: number; gx: number; gy: number; i: number },
  kind: TiltKind,
) {
  node.style.setProperty('--catalog-tilt-x', `${current.rx.toFixed(3)}deg`);
  node.style.setProperty('--catalog-tilt-y', `${current.ry.toFixed(3)}deg`);
  node.style.setProperty('--catalog-tilt-gx', `${current.gx.toFixed(1)}%`);
  node.style.setProperty('--catalog-tilt-gy', `${current.gy.toFixed(1)}%`);
  node.style.setProperty('--catalog-tilt-i', current.i.toFixed(3));
  const shadowGain = kind === 'button' ? 1.6 : kind === 'strong' ? 2.2 : kind === 'light' ? 1 : 1.6;
  node.style.setProperty('--catalog-tilt-sx', `${(-current.ry * shadowGain).toFixed(2)}px`);
  node.style.setProperty('--catalog-tilt-sy', `${((kind === 'button' ? 6 : 8) + current.rx * 0.7).toFixed(2)}px`);
}

export function bindElementTilt(
  node: HTMLElement,
  rotation: { x: number; y: number },
  kind: TiltKind,
  pressable: boolean,
) {
  node.classList.add('catalog-tilt', 'catalog-control-tilt');
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
    const ease = 0.18;
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
      playStudentPress(node, pressFrame);
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
    node.classList.remove('catalog-tilt', 'catalog-control-tilt');
  };
}

export function useStudentTilt<T extends HTMLElement>(rotation: { x: number; y: number }, kind: TiltKind = 'medium') {
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
    const ease = kind === 'button' ? 0.18 : 0.16;
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

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

let lastPressAt = 0;

export function playStudentPress(element: HTMLElement | null, frameRef: { current: number }) {
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
    node.style.setProperty('--catalog-press-y', `${y.toFixed(2)}px`);
    node.style.setProperty('--catalog-press-s', scale.toFixed(4));
    if (t < 1) {
      frameRef.current = requestAnimationFrame(frame);
      return;
    }
    node.style.setProperty('--catalog-press-y', '0px');
    node.style.setProperty('--catalog-press-s', '1');
    frameRef.current = 0;
  }
  frameRef.current = requestAnimationFrame(frame);
}
