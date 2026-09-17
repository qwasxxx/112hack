import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { DEMO_PASSWORD, SEED_ACCOUNTS, ROLE_LABEL } from '../auth/accounts';
import loginCommandCenterBg from '../assets/login-command-center-background.webp';
import './login-page.css';

type Props = {
  error?: string;
  onSubmit: (login: string, password: string) => void;
};

const HIGHLIGHTS = [
  { label: 'Учебный контур', note: 'Локальная среда' },
  { label: 'Имитация вызовов', note: 'Тренировка диалога' },
  { label: 'Карточки происшествий', note: 'Учебное заполнение' },
] as const;

const SCENE_SERVICES = [
  { label: 'Полиция', icon: 'shield' },
  { label: 'Скорая помощь', icon: 'cross' },
  { label: 'Пожарная охрана', icon: 'fire' },
  { label: 'Аварийные службы', icon: 'alert' },
] as const;

export function LoginPage(props: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);
  const errorId = 'login-auth-error';

  return (
    <div className="login-screen">
      <div className="login-atmosphere" aria-hidden="true">
        <div
          className="login-atmosphere-photo"
          style={{ backgroundImage: `url(${loginCommandCenterBg})` }}
        />
        <div className="login-atmosphere-tint" />
        <div className="login-atmosphere-center" />
      </div>

      <div className="login-scene-copy login-scene-copy-left" aria-hidden="true">
        <span className="login-scene-rule" />
        <p>Технологии</p>
        <p>во имя жизни</p>
      </div>
      <div className="login-scene-copy login-scene-copy-right" aria-hidden="true">
        <p className="login-scene-claim">
          Безопасная
          <br />
          страна —
          <br />
          наша общая цель
        </p>
        <span className="login-scene-rule" />
        <ul className="login-scene-services">
          {SCENE_SERVICES.map((item) => (
            <li key={item.label}>
              <SceneServiceIcon name={item.icon} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <header className="login-header">
        <div className="login-header-inner">
          <div className="login-brand">
            <span className="login-mark" aria-hidden="true">
              112
            </span>
            <div className="login-brand-text">
              <p className="login-product">Учебный комплекс Системы-112</p>
              <p className="login-product-sub">Тренажёр оператора АРМ-112</p>
            </div>
          </div>
          <LoginEnvChip />
        </div>
      </header>

      <main className="login-main">
        <LoginTilt labelledBy="login-auth-title">
          <div className="login-shell-body">
            <section className="login-info-side" aria-labelledby="login-info-title">
              <p className="login-kicker">Учебный комплекс</p>
              <h2 id="login-info-title" className="login-info-title">
                Система подготовки оператора АРМ-112
              </h2>
              <p className="login-info-lead">
                Локальная учебная среда для отработки сценариев, работы с карточками вызова и оценки
                действий оператора.
              </p>
              <ul className="login-highlights">
                {HIGHLIGHTS.map((item) => (
                  <LoginHighlightRow key={item.label} label={item.label} note={item.note} />
                ))}
              </ul>
            </section>

            <section className="login-auth-side" aria-labelledby="login-auth-title">
              <p className="login-kicker">Авторизация</p>
              <h1 id="login-auth-title" className="login-auth-title">
                Вход в систему
              </h1>
              <p className="login-auth-sub">Введите данные учебной учётной записи</p>
              <form
                className="login-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  props.onSubmit(login, password);
                }}
              >
                <label className="login-field" htmlFor="login-username">
                  <span>Логин</span>
                  <input
                    id="login-username"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Учётная запись"
                    value={login}
                    aria-invalid={props.error ? true : undefined}
                    aria-describedby={props.error ? errorId : undefined}
                    onChange={(event) => setLogin(event.target.value)}
                  />
                </label>
                <label className="login-field" htmlFor="login-password">
                  <span>Пароль</span>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Пароль"
                    value={password}
                    aria-invalid={props.error ? true : undefined}
                    aria-describedby={props.error ? errorId : undefined}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                {props.error ? (
                  <p id={errorId} className="login-error" role="alert">
                    {props.error}
                  </p>
                ) : null}
                <LoginSubmit />
              </form>
              <p className="login-auth-foot">Учебный контур · роль определяется автоматически</p>
            </section>
          </div>

          <section className="login-demo" aria-labelledby="login-demo-title">
            <LoginDemoToggle open={demoOpen} onToggle={() => setDemoOpen((open) => !open)} />
            {demoOpen ? (
              <div id="login-demo-panel" className="login-demo-panel">
                <ul className="login-demo-list">
                  {SEED_ACCOUNTS.map((account) => (
                    <LoginDemoCard
                      key={account.id}
                      login={account.login}
                      role={ROLE_LABEL[account.role]}
                    />
                  ))}
                </ul>
                <p className="login-demo-pass">
                  Пароль: <span className="login-mono">{DEMO_PASSWORD}</span>
                </p>
              </div>
            ) : null}
          </section>
        </LoginTilt>
      </main>
    </div>
  );
}

function LoginEnvChip() {
  const tilt = useLoginSurfaceTilt<HTMLDivElement>('chip', { x: 7.4, y: 8 });

  return (
    <div
      ref={tilt.ref}
      className="login-env"
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <span className="login-env-dot" aria-hidden="true" />
      <div className="login-env-copy">
        <p className="login-env-status">Учебный контур</p>
        <p className="login-env-meta">Локальная среда</p>
      </div>
    </div>
  );
}

function LoginDemoToggle(props: { open: boolean; onToggle: () => void }) {
  const tilt = useLoginSurfaceTilt<HTMLButtonElement>('demo', { x: 7.2, y: 7.8 });

  return (
    <button
      ref={tilt.ref}
      type="button"
      className="login-demo-toggle"
      aria-expanded={props.open}
      aria-controls="login-demo-panel"
      onPointerDown={(event) => {
        if (event.button === 0) {
          playLoginPressFeedback(tilt.ref.current, 'soft');
        }
      }}
      onClick={() => {
        playLoginPressFeedback(tilt.ref.current, 'soft');
        props.onToggle();
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <span className="login-demo-copy">
        <span id="login-demo-title" className="login-demo-title">
          Демо-доступ
        </span>
        <span className="login-demo-hint">Тестовые учётные записи локального контура</span>
      </span>
      <span className={`login-demo-chevron${props.open ? ' is-open' : ''}`} aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.4 4.4L6 8l3.6-3.6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
    </button>
  );
}

function SceneServiceIcon(props: { name: (typeof SCENE_SERVICES)[number]['icon'] }) {
  if (props.name === 'shield') {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M8 1.6l5.2 1.7v4.4c0 3.1-2.2 5.6-5.2 6.7-3-1.1-5.2-3.6-5.2-6.7V3.3L8 1.6z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    );
  }
  if (props.name === 'cross') {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.1" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 4.7v6.6M4.7 8h6.6" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }
  if (props.name === 'fire') {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <path
          d="M8.2 1.8c.2 1.8-1 2.9-1 4.4 0 1 .7 1.8 1.7 1.8 1.2 0 2.1-1.1 2.1-2.6 1.4 1.3 2.4 3 2.4 4.8 0 3-2.3 5-5.4 5S2.6 13.2 2.6 10.2c0-2.4 1.5-4.3 3-5.8.4 1.2 1.3 2 2.6 2.2C7.8 4.8 7.6 3.2 8.2 1.8z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M8 2.2L14 13.4H2L8 2.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.4v3.3M8 11.4v.7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function LoginSubmit() {
  const ref = useRef<HTMLButtonElement>(null);
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
    const ease = 0.18;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    node.style.setProperty('--login-btn-x', `${current.rx.toFixed(3)}deg`);
    node.style.setProperty('--login-btn-y', `${current.ry.toFixed(3)}deg`);
    node.style.setProperty('--login-btn-gx', `${current.gx.toFixed(1)}%`);
    node.style.setProperty('--login-btn-gy', `${current.gy.toFixed(1)}%`);
    node.style.setProperty('--login-btn-i', current.i.toFixed(3));
    node.style.setProperty('--login-btn-sx', `${(-current.ry * 2.4).toFixed(2)}px`);
    node.style.setProperty('--login-btn-sy', `${(10 + current.rx * 1.8).toFixed(2)}px`);
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

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
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
      rx: (0.5 - y) * 8.4,
      ry: (x - 0.5) * 9.6,
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

  return (
    <button
      ref={ref}
      type="submit"
      className="login-submit"
      onPointerDown={(event) => {
        if (event.button === 0) {
          playLoginPressFeedback(ref.current, 'strong');
        }
      }}
      onClick={() => {
        playLoginPressFeedback(ref.current, 'strong');
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
    >
      Войти
    </button>
  );
}

function LoginTilt(props: { labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedRef = useRef(false);
  const hoverRef = useRef(false);
  const frameRef = useRef(0);
  const targetRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 18, i: 0 });
  const currentRef = useRef({ rx: 0, ry: 0, gx: 50, gy: 18, i: 0 });

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      reducedRef.current = motion.matches || coarse.matches;
      if (reducedRef.current) {
        targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 18, i: 0 };
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
    const ease = 0.16;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    node.style.setProperty('--login-tilt-x', `${current.rx.toFixed(3)}deg`);
    node.style.setProperty('--login-tilt-y', `${current.ry.toFixed(3)}deg`);
    node.style.setProperty('--login-glare-x', `${current.gx.toFixed(1)}%`);
    node.style.setProperty('--login-glare-y', `${current.gy.toFixed(1)}%`);
    node.style.setProperty('--login-tilt-i', current.i.toFixed(3));
    node.style.setProperty('--login-shadow-x', `${(-current.ry * 5.5).toFixed(2)}px`);
    node.style.setProperty('--login-shadow-y', `${(20 + current.rx * 3.4).toFixed(2)}px`);
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

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
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
      rx: (0.5 - y) * 4.4,
      ry: (x - 0.5) * 4.8,
      gx: x * 100,
      gy: y * 100,
      i: 1,
    };
    startLoop();
  }

  function onPointerLeave() {
    hoverRef.current = false;
    targetRef.current = { rx: 0, ry: 0, gx: 50, gy: 18, i: 0 };
    startLoop();
  }

  return (
    <div
      ref={ref}
      className="login-shell"
      aria-labelledby={props.labelledBy}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
    >
      {props.children}
    </div>
  );
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function useLoginSurfaceTilt<T extends HTMLElement>(
  prefix: 'row' | 'card' | 'chip' | 'demo',
  rotation: { x: number; y: number },
) {
  const ref = useRef<T>(null);
  const reducedRef = useRef(false);
  const hoverRef = useRef(false);
  const frameRef = useRef(0);
  const targetRef = useRef({ rx: 0, ry: 0, gx: 40, gy: 40, i: 0 });
  const currentRef = useRef({ rx: 0, ry: 0, gx: 40, gy: 40, i: 0 });

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      reducedRef.current = motion.matches || coarse.matches;
      if (reducedRef.current) {
        targetRef.current = { rx: 0, ry: 0, gx: 40, gy: 40, i: 0 };
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
    const ease = 0.2;
    current.rx += (target.rx - current.rx) * ease;
    current.ry += (target.ry - current.ry) * ease;
    current.gx += (target.gx - current.gx) * ease;
    current.gy += (target.gy - current.gy) * ease;
    current.i += (target.i - current.i) * ease;
    node.style.setProperty(`--login-${prefix}-x`, `${current.rx.toFixed(3)}deg`);
    node.style.setProperty(`--login-${prefix}-y`, `${current.ry.toFixed(3)}deg`);
    node.style.setProperty(`--login-${prefix}-gx`, `${current.gx.toFixed(1)}%`);
    node.style.setProperty(`--login-${prefix}-gy`, `${current.gy.toFixed(1)}%`);
    node.style.setProperty(`--login-${prefix}-i`, current.i.toFixed(3));
    node.style.setProperty(`--login-${prefix}-sx`, `${(-current.ry * 2.2).toFixed(2)}px`);
    node.style.setProperty(`--login-${prefix}-sy`, `${(8 + current.rx * 1.5).toFixed(2)}px`);
    const settled =
      Math.abs(current.rx - target.rx) < 0.01 &&
      Math.abs(current.ry - target.ry) < 0.01 &&
      Math.abs(current.i - target.i) < 0.01;
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
    targetRef.current = { rx: 0, ry: 0, gx: 40, gy: 40, i: 0 };
    startLoop();
  }

  return {
    ref,
    onPointerMove,
    onPointerLeave,
  };
}

function LoginHighlightRow(props: { label: string; note: string }) {
  const tilt = useLoginSurfaceTilt<HTMLLIElement>('row', { x: 8.2, y: 8.6 });

  return (
    <li
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <span className="login-highlight-mark" aria-hidden="true" />
      <span>
        <strong>{props.label}</strong>
        <em>{props.note}</em>
      </span>
    </li>
  );
}

function LoginDemoCard(props: { login: string; role: string }) {
  const tilt = useLoginSurfaceTilt<HTMLLIElement>('card', { x: 8.4, y: 9 });

  return (
    <li
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <span className="login-mono">{props.login}</span>
      <span>{props.role}</span>
    </li>
  );
}

let loginHapticFrame = 0;
let loginLastPressAt = 0;

function prefersLoginReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function vibrateLogin(duration: number) {
  try {
    navigator.vibrate?.(duration);
  } catch {
    return;
  }
}

function playHapticVisual(element: HTMLElement, strength: number) {
  if (prefersLoginReducedMotion()) {
    return;
  }
  const start = performance.now();
  const duration = strength > 0.9 ? 128 : 104;
  cancelAnimationFrame(loginHapticFrame);
  function frame(now: number) {
    const t = Math.min(1, (now - start) / duration);
    let x = 0;
    let y = 0;
    let scale = 1;
    if (t < 0.2) {
      const p = t / 0.2;
      scale = 1 - 0.015 * strength * p;
      y = 1.1 * strength * p;
    } else if (t < 0.56) {
      const p = (t - 0.2) / 0.36;
      const decay = 1 - p;
      x = Math.sin(p * Math.PI * 3) * 1.15 * strength * decay;
      y = (1.05 - p * 1.2) * strength;
      scale = 0.985 + p * 0.018;
    } else {
      const p = (t - 0.56) / 0.44;
      scale = 1 + 0.006 * (1 - p) * strength;
    }
    element.style.setProperty('--login-haptic-x', `${x.toFixed(2)}px`);
    element.style.setProperty('--login-haptic-y', `${y.toFixed(2)}px`);
    element.style.setProperty('--login-haptic-s', scale.toFixed(4));
    if (t < 1) {
      loginHapticFrame = requestAnimationFrame(frame);
    }
  }
  loginHapticFrame = requestAnimationFrame(frame);
}

function playLoginPressFeedback(element: HTMLElement | null, intensity: 'strong' | 'soft') {
  const now = performance.now();
  if (now - loginLastPressAt < 80) {
    return;
  }
  loginLastPressAt = now;
  vibrateLogin(intensity === 'strong' ? 16 : 10);
  if (element) {
    playHapticVisual(element, intensity === 'strong' ? 1 : 0.72);
  }
}
