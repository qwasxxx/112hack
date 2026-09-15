import { useEffect, useState } from 'react';

const tones = { ok: '#3dcc8a', warn: '#e0b341', bad: '#e35d6a' } as const;

function Dot(props: { tone: keyof typeof tones; label: string }) {
  return (
    <span className="dot">
      <span style={{ background: tones[props.tone] }} />
      {props.label}
    </span>
  );
}

export function App() {
  const [apiStatus, setApiStatus] = useState<'ok' | 'bad' | 'pending'>('pending');
  const [realtimeStatus, setRealtimeStatus] = useState<'ok' | 'bad' | 'pending'>('pending');

  useEffect(() => {
    void fetch('/api/v1/health')
      .then((response) => setApiStatus(response.ok ? 'ok' : 'bad'))
      .catch(() => setApiStatus('bad'));

    let cancelled = false;
    let disconnect: (() => void) | undefined;

    void import('@sys112/api-client')
      .then(({ RealtimeClient }) => {
        if (cancelled) {
          return;
        }
        const realtime = new RealtimeClient(window.location.origin);
        realtime.connect();
        const off = realtime.onEvent((event) => {
          if (event.type === 'ConnectionEstablished') {
            setRealtimeStatus('ok');
          }
        });
        disconnect = () => {
          off();
          realtime.disconnect();
        };
      })
      .catch(() => {
        if (!cancelled) {
          setRealtimeStatus('bad');
        }
      });

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, []);

  return (
    <main className="shell">
      <p className="eyebrow">Teacher Web</p>
      <h1>Мониторинг и управление сценарием</h1>
      <p className="lead">
        Отдельное приложение преподавателя. Intervention уходит доменной командой, не в параметры модели.
      </p>
      <div className="status">
        <Dot tone={apiStatus === 'ok' ? 'ok' : apiStatus === 'pending' ? 'warn' : 'bad'} label={`API ${apiStatus}`} />
        <Dot
          tone={realtimeStatus === 'ok' ? 'ok' : realtimeStatus === 'pending' ? 'warn' : 'bad'}
          label={`Realtime ${realtimeStatus}`}
        />
      </div>
    </main>
  );
}
