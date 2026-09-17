import { useEffect, useRef, useState, type ReactNode } from 'react';
import '../pages/catalog-page.css';
import sidebarBase from '../assets/catalog/catalog-sidebar-base.webp';
import { bindElementTilt, playStudentPress, useStudentTilt } from './student-tilt';

const SIDEBAR_ITEMS = [
  { id: 'scenarios', label: 'Учебные сценарии', icon: 'book' as const, active: true },
  { id: 'sessions', label: 'Мои сессии', icon: 'layers' as const, active: false },
  { id: 'reference', label: 'Справочные материалы', icon: 'bars' as const, active: false },
  { id: 'settings', label: 'Настройки', icon: 'gear' as const, active: false },
];

type ShellProps = {
  accountBar: ReactNode;
  onCatalog: () => void;
  children: ReactNode;
};

export function StudentShell(props: ShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`catalog-screen briefing-screen${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
      <StudentSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onCatalog={props.onCatalog}
      />
      <div className="catalog-shell">
        <StudentHeader accountBar={props.accountBar} />
        {props.children}
      </div>
    </div>
  );
}

function StudentSidebar(props: { collapsed: boolean; onToggle: () => void; onCatalog: () => void }) {
  return (
    <aside className="catalog-sidebar" aria-label="Навигация обучающегося">
      <div className="catalog-sidebar-brand">
        <span className="catalog-mark">112</span>
        <div className="catalog-sidebar-identity">
          <p className="catalog-sidebar-product">Система-112</p>
        </div>
        <CollapseButton collapsed={props.collapsed} onToggle={props.onToggle} />
      </div>
      <nav className="catalog-nav">
        {SIDEBAR_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={item.active}
            onActivate={item.active ? props.onCatalog : undefined}
          />
        ))}
      </nav>
      <div className="catalog-sidebar-art" aria-hidden="true">
        <img src={sidebarBase} alt="" />
      </div>
    </aside>
  );
}

function NavItem(props: {
  label: string;
  icon: 'book' | 'layers' | 'bars' | 'gear';
  active: boolean;
  onActivate?: () => void;
}) {
  const tilt = useStudentTilt<HTMLButtonElement>({ x: 2.2, y: 2.4 }, 'button');

  return (
    <button
      ref={tilt.ref}
      type="button"
      className={`catalog-nav-item catalog-tilt${props.active ? ' is-active' : ''}`}
      title={props.label}
      aria-current={props.active ? 'page' : undefined}
      aria-disabled={props.active ? undefined : true}
      onClick={() => {
        if (props.onActivate) {
          props.onActivate();
        }
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <ShellGlyph name={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}

function CollapseButton(props: { collapsed: boolean; onToggle: () => void }) {
  const tilt = useStudentTilt<HTMLButtonElement>({ x: 3.8, y: 4.2 }, 'button');
  const pressFrame = useRef(0);

  useEffect(() => {
    return () => cancelAnimationFrame(pressFrame.current);
  }, []);

  return (
    <button
      ref={tilt.ref}
      type="button"
      className="catalog-collapse catalog-tilt"
      aria-label={props.collapsed ? 'Развернуть навигацию' : 'Свернуть навигацию'}
      aria-expanded={!props.collapsed}
      onClick={() => {
        playStudentPress(tilt.ref.current, pressFrame);
        props.onToggle();
      }}
      onPointerDown={(event) => {
        if (event.button === 0) {
          playStudentPress(tilt.ref.current, pressFrame);
        }
      }}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerLeave}
    >
      <ShellGlyph name={props.collapsed ? 'expand' : 'collapse'} />
    </button>
  );
}

function StudentHeader(props: { accountBar: ReactNode }) {
  return (
    <header className="catalog-header">
      <div className="catalog-brand-text">
        <p className="catalog-product">Учебный комплекс Системы-112</p>
        <p className="catalog-product-sub">Тренажёр оператора АРМ-112</p>
      </div>
      <UserControls>{props.accountBar}</UserControls>
    </header>
  );
}

function UserControls(props: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const nodes = [...root.querySelectorAll<HTMLElement>('.operator > *')];
    const releases = nodes.map((node) =>
      bindElementTilt(node, { x: 3.2, y: 3.4 }, 'button', node.tagName === 'BUTTON'),
    );
    return () => {
      releases.forEach((release) => release());
    };
  }, []);

  return (
    <div ref={rootRef} className="catalog-user">
      {props.children}
    </div>
  );
}

function ShellGlyph(props: { name: 'collapse' | 'expand' | 'book' | 'layers' | 'bars' | 'gear' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {props.name === 'collapse' ? (
        <path
          d="M14.6 5.2 9.2 12l5.4 6.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'expand' ? (
        <path
          d="M9.4 5.2 14.8 12l-5.4 6.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'book' ? (
        <path
          d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      ) : null}
      {props.name === 'layers' ? (
        <path
          d="M4 8.5L12 4l8 4.5-8 4.5L4 8.5zm0 5.5l8 4.5 8-4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ) : null}
      {props.name === 'bars' ? (
        <path d="M5 19V10m7 9V5m7 14v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
      {props.name === 'gear' ? (
        <path
          d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6zm7.2 3.1l1.7-1-1-1.8-2 .4a7 7 0 0 0-1.2-1.2l.4-2-1.8-1-1 1.7a7 7 0 0 0-1.6 0L11 4.7l-1.8 1 .4 2a7 7 0 0 0-1.2 1.2l-2-.4-1 1.8 1.7 1a7 7 0 0 0 0 1.6l-1.7 1 1 1.8 2-.4c.37.45.76.86 1.2 1.2l-.4 2 1.8 1 1-1.7a7 7 0 0 0 1.6 0l1 1.7 1.8-1-.4-2c.44-.34.83-.75 1.2-1.2l2 .4 1-1.8-1.7-1a7 7 0 0 0 0-1.6z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      ) : null}
    </svg>
  );
}
