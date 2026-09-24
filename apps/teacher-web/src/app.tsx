import { useEffect, useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import { TeacherDashboard } from './teacher-dashboard';

const tones = { ok: '#3dcc8a', warn: '#e0b341', bad: '#e35d6a' } as const;

const EXAM_ACTIONS: Array<{ type: InterventionType; label: string; hint: string }> = [
  {
    type: 'add_circumstance',
    label: 'Новое обстоятельство',
    hint: 'Заявитель сразу говорит ваш текст',
  },
  {
    type: 'adjust_difficulty',
    label: 'Усложнить',
    hint: 'Заявитель путается так, как вы написали',
  },
  {
    type: 'set_emotional_state',
    label: 'Сменить тон',
    hint: 'Голос и речь меняются по вашему тексту',
  },
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
          <Dot
            tone={apiStatus === 'ok' ? 'ok' : apiStatus === 'pending' ? 'warn' : 'bad'}
            label={`API ${apiStatus}`}
          />
          <Dot
            tone={realtimeStatus === 'ok' ? 'ok' : realtimeStatus === 'pending' ? 'warn' : 'bad'}
            label={`Realtime ${realtimeStatus}`}
          />
        </div>
      }
      examPanel={
        <section className="exam td-legacy-exam">
          <h2>Живой звонок</h2>
          <p className="muted">
            Откройте занятие ученика, напишите что произошло и отправьте. Пока текст не отправлен, заявитель ничего нового не говорит.
          </p>
        </section>
      }
    />
  );
}
