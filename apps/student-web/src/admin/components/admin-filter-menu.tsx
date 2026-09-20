import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

export function AdminFilterMenu(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const selected = props.options.find((option) => option.value === props.value)?.label ?? props.label;

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
        width: Math.max(rect.width, 188),
        zIndex: 90,
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
        return;
      }
      const options = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
      if (options.length === 0) {
        return;
      }
      const current = options.findIndex((item) => item === document.activeElement);
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        options[(current + 1) % options.length]?.focus();
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        options[(current <= 0 ? options.length : current) - 1]?.focus();
      }
      if (event.key === 'Home') {
        event.preventDefault();
        options[0]?.focus();
      }
      if (event.key === 'End') {
        event.preventDefault();
        options[options.length - 1]?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <div ref={rootRef} className={`ad-filter${props.open ? ' is-open' : ''}`}>
      <span className="ad-filter-label">{props.label}</span>
      <button
        ref={buttonRef}
        type="button"
        className="ad-filter-button"
        aria-haspopup="listbox"
        aria-expanded={props.open}
        aria-label={props.label}
        disabled={props.disabled}
        title={props.title}
        onClick={() => {
          if (!props.disabled) {
            props.onOpenChange(!props.open);
          }
        }}
      >
        <span>{selected}</span>
      </button>
      {props.open
        ? createPortal(
            <div
              ref={panelRef}
              className="ad-filter-panel"
              style={panelStyle}
              role="listbox"
              aria-label={props.label}
            >
              {props.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  className={`ad-filter-option${option.value === props.value ? ' is-selected' : ''}`}
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

export function AdminSearchField(props: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{props.label}</span>
      <input
        id={id}
        type="search"
        value={props.value}
        placeholder={props.placeholder}
        autoComplete="off"
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}
