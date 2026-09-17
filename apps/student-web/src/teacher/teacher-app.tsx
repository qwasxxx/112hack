import { useEffect, useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import type { Session } from '../auth/accounts';
import { AccountBar } from '../auth/account-bar';

const EXAM_ACTIONS: Array<{ type: InterventionType; label: string; hint: string }> = [
  { type: 'set_emotional_state', label: 'Негативные эмоции', hint: 'Паника, злость, растерянность' },
  { type: 'add_circumstance', label: 'Новое обстоятельство', hint: 'Дым усилился, появился пострадавший' },
  { type: 'inject_event', label: 'Внезапное событие', hint: 'Слышен удар, связь прерывается' },
  { type: 'adjust_difficulty', label: 'Усложнить диалог', hint: 'Заявитель путает адрес и факты' },
];

type Props = {
  operator: Session;
  onLogout: () => void;
};

export function TeacherApp(props: Props) {
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
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">112</span>
          <div>
            <p className="brand-title">Панель преподавателя</p>
            <p className="brand-sub">Мониторинг занятия и экзамена</p>
          </div>
        </div>
        <AccountBar user={props.operator} onLogout={props.onLogout} />
      </header>

      <section className="stats">
        <article className="panel stat">
          <span>API</span>
          <strong>{apiStatus === 'ok' ? 'ок' : apiStatus === 'pending' ? '…' : 'нет'}</strong>
        </article>
        <article className="panel stat">
          <span>Realtime</span>
          <strong>
            {realtimeStatus === 'ok' ? 'ок' : realtimeStatus === 'pending' ? '…' : 'нет'}
          </strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h1>Экзамен</h1>
          <p>
            Преподаватель видит ход экзамена и может вмешаться в разговор. Команды пока размечены,
            диалоговый сервис ответит not_implemented.
          </p>
        </div>
        <div className="stack">
          {EXAM_ACTIONS.map((action) => (
            <button key={action.type} type="button" className="btn" disabled>
              <strong>{action.label}</strong>
              <span className="row-sub"> — {action.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
