import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { playTeacherPress } from '../teacher-tilt';

export function TeacherSearchField(props: {
  id?: string;
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label className="td-search" htmlFor={id}>
      <FilterGlyph name="search" />
      <input
        id={id}
        type="search"
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        aria-label={props.label}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

export function TeacherFilterMenu(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  icon: FilterGlyphName;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pressFrame = useRef(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const selected =
    props.options.find((option) => option.value === props.value)?.label ?? props.label;
  const selectedIndex = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.value),
  );

  useEffect(() => () => cancelAnimationFrame(pressFrame.current), []);

  useLayoutEffect(() => {
    if (!props.open) {
      return;
    }
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setPanelStyle({
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(rect.width, 168),
        zIndex: 120,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [props.open]);

  useEffect(() => {
    if (!props.open) {
      return;
    }
    const onOpenChange = props.onOpenChange;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [props.open, props.onOpenChange]);

  function move(delta: number) {
    const next = (selectedIndex + delta + props.options.length) % props.options.length;
    props.onChange(props.options[next].value);
  }

  return (
    <div ref={rootRef} className={`td-menu${props.open ? ' is-open' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="td-filter"
        aria-haspopup="listbox"
        aria-expanded={props.open}
        aria-label={props.label}
        onClick={() => props.onOpenChange(!props.open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            props.onOpenChange(true);
          }
          if (event.key === 'ArrowDown' && props.open) {
            move(1);
          }
          if (event.key === 'ArrowUp' && props.open) {
            move(-1);
          }
        }}
        onPointerDown={(event) => {
          if (event.button === 0) {
            playTeacherPress(buttonRef.current, pressFrame);
          }
        }}
      >
        <FilterGlyph name={props.icon} />
        <span>{selected}</span>
      </button>
      {props.open
        ? createPortal(
            <div
              ref={panelRef}
              className="td-menu-panel"
              style={panelStyle}
              role="listbox"
              aria-label={props.label}
            >
              {props.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  className={`td-menu-option${option.value === props.value ? ' is-selected' : ''}`}
                  aria-selected={option.value === props.value}
                  onClick={() => {
                    props.onChange(option.value);
                    props.onOpenChange(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function TeacherFilterBar(props: { label: string; children: ReactNode }) {
  return (
    <section className="td-filters" aria-label={props.label}>
      {props.children}
    </section>
  );
}

type FilterGlyphName = 'search' | 'people' | 'book' | 'bars' | 'clock' | 'shield';

function FilterGlyph(props: { name: FilterGlyphName }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {props.name === 'search' ? (
        <path
          d="M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4zm5.3-1.9L21 21"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'people' ? (
        <path
          d="M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zm10.2-1.2a2.6 2.6 0 1 0-2.4-4.3M3.5 19.4c.7-3 2.8-4.6 5.5-4.6s4.8 1.6 5.5 4.6M16.8 13.8c2.1.2 3.8 1.5 4.4 3.8"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'book' ? (
        <path
          d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      ) : null}
      {props.name === 'bars' ? (
        <path d="M5 19V10m7 9V5m7 14v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
      {props.name === 'clock' ? (
        <path
          d="M12 20.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17zm0-8.5V8.2m0 3.8 3.4 2.2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : null}
      {props.name === 'shield' ? (
        <path
          d="M12 3.2 19 6v6.2c0 4.4-2.8 7.4-7 8.8-4.2-1.4-7-4.4-7-8.8V6l7-2.8z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
