import { useEffect, useMemo, useState } from 'react';
import { ApiClient, RealtimeClient } from '@sys112/api-client';
import { StatusDot } from '@sys112/ui';

const api = new ApiClient('');
const realtime = new RealtimeClient(window.location.origin);

export function App() {
  const [apiStatus, setApiStatus] = useState<'ok' | 'bad' | 'pending'>('pending');
  const [realtimeStatus, setRealtimeStatus] = useState<'ok' | 'bad' | 'pending'>('pending');

  const apiTone = useMemo(() => (apiStatus === 'ok' ? 'ok' : apiStatus === 'pending' ? 'warn' : 'bad'), [apiStatus]);
  const rtTone = useMemo(
    () => (realtimeStatus === 'ok' ? 'ok' : realtimeStatus === 'pending' ? 'warn' : 'bad'),
    [realtimeStatus],
  );

  useEffect(() => {
    void api
      .health()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('bad'));

    realtime.connect();
    const off = realtime.onEvent((event) => {
      if (event.type === 'ConnectionEstablished') {
        setRealtimeStatus('ok');
      }
    });
    return () => {
      off();
      realtime.disconnect();
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
        <StatusDot tone={apiTone} label={`API ${apiStatus}`} />
        <StatusDot tone={rtTone} label={`Realtime ${realtimeStatus}`} />
      </div>
    </main>
  );
}
