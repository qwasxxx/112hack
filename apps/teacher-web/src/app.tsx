import { useEffect, useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import { TeacherDashboard } from './teacher-dashboard';

const tones = { ok: '#3dcc8a', warn: '#e0b341', bad: '#e35d6a' } as const;

const EXAM_ACTIONS: Array<{ type: InterventionType; label: string; hint: string }> = [
  { type: 'set_emotional_state', label: 'Негативные эмоции', hint: 'Паника, злость, растерянность' },
  { type: 'add_circumstance', label: 'Новое обстоятельство', hint: 'Дым усилился, появился пострадавший' },
  { type: 'inject_event', label: 'Внезапное событие', hint: 'Слышен удар, связь прерывается' },
  { type: 'adjust_difficulty', label: 'Усложнить диалог', hint: 'Заявитель путает адрес и факты' },
];

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
    <TeacherDashboard
      apiStatus={apiStatus}
      realtimeStatus={realtimeStatus}
      examActions={EXAM_ACTIONS}
      legacyStatus={
        <div className="status">
          <Dot tone={apiStatus === 'ok' ? 'ok' : apiStatus === 'pending' ? 'warn' : 'bad'} label={`API ${apiStatus}`} />
          <Dot
            tone={realtimeStatus === 'ok' ? 'ok' : realtimeStatus === 'pending' ? 'warn' : 'bad'}
            label={`Realtime ${realtimeStatus}`}
          />
        </div>
      }
      examPanel={
        <section className="exam td-legacy-exam">
          <h2>Экзамен</h2>
          <p className="muted">
            На экзамене преподаватель сможет вмешиваться в разговор: эмоции, новые обстоятельства, внезапные события.
            Пока команды только размечены — сервис диалога отвечает <code>not_implemented</code>.
          </p>
          <div className="exam-actions">
            {EXAM_ACTIONS.map((action) => (
              <button key={action.type} type="button" className="exam-btn" disabled title={action.hint}>
                <strong>{action.label}</strong>
                <span>{action.hint}</span>
              </button>
            ))}
          </div>
        </section>
      }
    />
  );
}
