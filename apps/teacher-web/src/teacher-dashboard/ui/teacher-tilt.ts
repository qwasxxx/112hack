import { useEffect, useRef, type PointerEvent } from 'react';

export type TeacherTiltKind = 'strong' | 'medium' | 'light' | 'button';
export type TeacherTiltRole = 'surface' | 'card' | 'nested';

const INNER_SELECTOR = [
  '.td-metric',
  '.td-scenario-card',
  '.td-risk-row',
  '.td-list-item',
  '.td-error-card',
  '.td-heatmap > *',
  '.td-audit',
  '.td-action-btn',
  '.td-session-clock',
  '.td-score-hero',
  '.td-risk-callout',
  '.exam-btn',
].join(', ');

const OUTER_SELECTOR = [
  '.td-panel:not(.td-form)',
  '.td-filters',
  '.td-table-wrap',
  '.td-legacy-exam',
  '.exam',
  '.td-observe-summary',
].join(', ');

const TILT_CLASSES = ['td-tilt', 'td-tilt--button', 'td-tilt--light', 'td-tilt--surface', 'td-tilt--nested'];

function applyTiltFrame(
  node: HTMLElement,
  current: { rx: number; ry: number; gx: number; gy: number; i: number },
  kind: TeacherTiltKind,
) {
  node.style.setProperty('--td-tilt-x', `${current.rx.toFixed(3)}deg`);
  node.style.setProperty('--td-tilt-y', `${current.ry.toFixed(3)}deg`);
  node.style.setProperty('--td-tilt-gx', `${current.gx.toFixed(1)}%`);
  node.style.setProperty('--td-tilt-gy', `${current.gy.toFixed(1)}%`);
  node.style.setProperty('--td-tilt-i', current.i.toFixed(3));
  const depth = kind === 'strong' ? 10 : kind === 'button' ? 6 : kind === 'light' ? 4 : 8;
  const shadowGain = kind === 'button' ? 1.8 : kind === 'strong' ? 2.8 : kind === 'light' ? 1.3 : 2;
  node.style.setProperty('--td-tilt-z', `${(current.i * depth).toFixed(2)}px`);
  node.style.setProperty('--td-tilt-sx', `${(-current.ry * shadowGain).toFixed(2)}px`);
  node.style.setProperty('--td-tilt-sy', `${((kind === 'button' ? 7 : 10) + current.rx * 0.85).toFixed(2)}px`);
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function pointerRatio(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) {
  return {
    x: clamp(rect.width ? (clientX - rect.left) / rect.width : 0.5),
    y: clamp(rect.height ? (clientY - rect.top) / rect.height : 0.5),
  };
}

function relatedInside(node: HTMLElement, related: EventTarget | null) {
  return related instanceof Node && node.contains(related);
}

export function bindTeacherTilt(
  node: HTMLElement,
  rotation: { x: number; y: number },
  kind: TeacherTiltKind,
  role: TeacherTiltRole = 'card',
  pressable = false,
) {
  node.classList.add('td-tilt');
  if (kind === 'button') {
    node.classList.add('td-tilt--button');
  } else if (kind === 'light') {
    node.classList.add('td-tilt--light');
  }
  if (role === 'surface') {
    node.classList.add('td-tilt--surface');
  } else if (role === 'nested') {
    node.classList.add('td-tilt--nested');
  }
  let reduced = false;
  let hover = false;
  let frame = 0;
  let lockedRect: DOMRect | null = null;
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
    const ease = kind === 'button' ? 0.2 : kind === 'strong' ? 0.14 : 0.17;
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
    if (!lockedRect) {
      lockedRect = node.getBoundingClientRect();
    }
    const { x, y } = pointerRatio(lockedRect, event.clientX, event.clientY);
    target.rx = (0.5 - y) * rotation.x;
    target.ry = (x - 0.5) * rotation.y;
    target.gx = x * 100;
    target.gy = y * 100;
    target.i = 1;
    startLoop();
  }

  function onLeave(event: globalThis.PointerEvent) {
    if (relatedInside(node, event.relatedTarget)) {
      return;
    }
    hover = false;
    lockedRect = null;
    target.rx = 0;
    target.ry = 0;
    target.gx = 50;
    target.gy = 50;
    target.i = 0;
    startLoop();
  }

  function onDown(event: globalThis.PointerEvent) {
    if (pressable && event.button === 0) {
      playTeacherPress(node, pressFrame);
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
    node.classList.remove(...TILT_CLASSES);
    node.style.removeProperty('--td-tilt-x');
    node.style.removeProperty('--td-tilt-y');
    node.style.removeProperty('--td-tilt-gx');
    node.style.removeProperty('--td-tilt-gy');
    node.style.removeProperty('--td-tilt-i');
    node.style.removeProperty('--td-tilt-z');
    node.style.removeProperty('--td-tilt-sx');
    node.style.removeProperty('--td-tilt-sy');
  };
}

function collectOutermost(nodes: HTMLElement[]) {
  return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
}

function rotationFor(node: HTMLElement, role: TeacherTiltRole): { x: number; y: number } {
  if (node.matches('.td-action-btn, .exam-btn')) {
    return { x: 4.2, y: 4.6 };
  }
  if (role === 'surface') {
    return { x: 1.6, y: 1.8 };
  }
  if (node.matches('.td-risk-row, .td-list-item, .td-audit')) {
    return { x: 2.4, y: 2.8 };
  }
  return { x: 3.2, y: 3.6 };
}

function kindFor(node: HTMLElement, role: TeacherTiltRole): TeacherTiltKind {
  if (node.matches('.td-action-btn, .exam-btn')) {
    return 'button';
  }
  if (role === 'surface') {
    return 'light';
  }
  if (node.matches('.td-risk-row, .td-list-item, .td-audit, .td-session-clock')) {
    return 'light';
  }
  return 'light';
}

function tooLargeForTilt(node: HTMLElement) {
  return node.offsetHeight > 360 || node.offsetWidth > 760;
}

export function bindTeacherDashboardTilt(root: HTMLElement | null) {
  if (!root) {
    return () => {};
  }

  const host = root;
  const bound = new Map<HTMLElement, () => void>();

  function bind() {
    const surfaces = collectOutermost([...host.querySelectorAll<HTMLElement>(OUTER_SELECTOR)]).filter(
      (node) => !tooLargeForTilt(node),
    );
    const inners = [...host.querySelectorAll<HTMLElement>(INNER_SELECTOR)].filter(
      (node) => !node.closest('.td-form') && !tooLargeForTilt(node),
    );
    const wanted = new Set<HTMLElement>([...surfaces, ...inners]);
    for (const [node, release] of bound) {
      if (!wanted.has(node) || !host.contains(node)) {
        release();
        bound.delete(node);
      }
    }
    for (const node of surfaces) {
      if (bound.has(node)) {
        continue;
      }
      bound.set(node, bindTeacherTilt(node, rotationFor(node, 'surface'), kindFor(node, 'surface'), 'surface'));
    }
    for (const node of inners) {
      if (bound.has(node)) {
        continue;
      }
      const nested = surfaces.some((surface) => surface.contains(node));
      const role: TeacherTiltRole = nested ? 'nested' : 'card';
      bound.set(
        node,
        bindTeacherTilt(node, rotationFor(node, role), kindFor(node, role), role, node.matches('button')),
      );
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
    bound.forEach((release) => release());
    bound.clear();
  };
}

export function useTeacherTilt<T extends HTMLElement>(
  rotation: { x: number; y: number },
  kind: TeacherTiltKind = 'medium',
) {
  const ref = useRef<T>(null);
  const reducedRef = useRef(false);
  const hoverRef = useRef(false);
  const frameRef = useRef(0);
  const rectRef = useRef<DOMRect | null>(null);
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
    const ease = kind === 'button' ? 0.2 : 0.16;
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
    if (!rectRef.current) {
      rectRef.current = node.getBoundingClientRect();
    }
    const { x, y } = pointerRatio(rectRef.current, event.clientX, event.clientY);
    targetRef.current = {
      rx: (0.5 - y) * rotation.x,
      ry: (x - 0.5) * rotation.y,
      gx: x * 100,
      gy: y * 100,
      i: 1,
    };
    startLoop();
  }

  function onPointerLeave(event: PointerEvent<T>) {
    const node = ref.current;
    if (node && relatedInside(node, event.relatedTarget)) {
      return;
    }
    hoverRef.current = false;
    rectRef.current = null;
    targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 50, i: 0 };
    startLoop();
  }

  return { ref, onPointerMove, onPointerLeave };
}

let lastPressAt = 0;

export function playTeacherPress(element: HTMLElement | null, frameRef: { current: number }) {
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
    node.style.setProperty('--td-press-y', `${y.toFixed(2)}px`);
    node.style.setProperty('--td-press-s', scale.toFixed(4));
    if (t < 1) {
      frameRef.current = requestAnimationFrame(frame);
      return;
    }
    node.style.setProperty('--td-press-y', '0px');
    node.style.setProperty('--td-press-s', '1');
    frameRef.current = 0;
  }
  frameRef.current = requestAnimationFrame(frame);
}
