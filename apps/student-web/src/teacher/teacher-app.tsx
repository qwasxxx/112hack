import { useEffect, useMemo, useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import { TeacherDashboard } from '../../../teacher-web/src/teacher-dashboard';
import '../../../teacher-web/src/app.css';
import type { Session } from '../auth/accounts';
import { AccountBar } from '../auth/account-bar';
import { LocalTeacherDashboardRepository } from './local-teacher-repository';
import { readClassSession, readLiveSessions, startClass, stopClass, hydrateFromApi } from '../progress';

const EXAM_ACTIONS: Array<{ type: InterventionType; label: string; hint: string }> = [
  {
    type: 'set_emotional_state',
    label: 'Негативные эмоции',
    hint: 'Паника, злость, растерянность',
  },
  {
    type: 'add_circumstance',
    label: 'Новое обстоятельство',
    hint: 'Дым усилился, появился пострадавший',
  },
  { type: 'inject_event', label: 'Внезапное событие', hint: 'Слышен удар, связь прерывается' },
  { type: 'adjust_difficulty', label: 'Усложнить диалог', hint: 'Заявитель путает адрес и факты' },
];

type Props = {
  operator: Session;
  onLogout: () => void;
};

function Dot(props: { tone: 'ok' | 'warn' | 'bad'; label: string }) {
  const color = props.tone === 'ok' ? '#3dcc8a' : props.tone === 'warn' ? '#e0b341' : '#e35d6a';
  return (
    <span className="dot">
      <span style={{ background: color }} />
      {props.label}
    </span>
  );
}

export function TeacherApp(props: Props) {
  const [apiStatus, setApiStatus] = useState<'ok' | 'bad' | 'pending'>('pending');
  const [realtimeStatus, setRealtimeStatus] = useState<'ok' | 'bad' | 'pending'>('pending');
  const [classActive, setClassActive] = useState(() => readClassSession().active);
  const repository = useMemo(() => new LocalTeacherDashboardRepository(), []);

  useEffect(() => {
    void hydrateFromApi({ login: props.operator.login, role: props.operator.role }).then(() =>
      setClassActive(readClassSession().active),
    );
    void fetch('/api/v1/health')
      .then((response) => setApiStatus(response.ok ? 'ok' : 'bad'))
      .catch(() => setApiStatus('bad'));

    let cancelled = false;
    let disconnect: (() => void) | undefined;
    void import('@sys112/api-client')
      .then(({ RealtimeClient }) => {
        if (cancelled) return;
        const realtime = new RealtimeClient(window.location.origin);
        realtime.connect();
        const off = realtime.onEvent((event) => {
          if (event.type === 'ConnectionEstablished') setRealtimeStatus('ok');
        });
        disconnect = () => {
          off();
          realtime.disconnect();
        };
      })
      .catch(() => {
        if (!cancelled) setRealtimeStatus('bad');
      });

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, []);

  function toggleClass(input?: { categories?: string[] }) {
    if (readClassSession().active) {
      stopClass();
    } else {
      startClass(props.operator.login, 'Учебное занятие', input?.categories ?? []);
    }
    setClassActive(readClassSession().active);
  }

  async function applyExamCue(type: InterventionType, hint: string) {
    const live = readLiveSessions();
    if (!live.length) {
      window.alert('Нет активных занятий. Пусть ученик откроет билет в другой вкладке.');
      return;
    }
    await Promise.all(
      live.map((item) => repository.applyIntervention({ callId: `live-${item.login}`, type, note: hint })),
    );
  }

  return (
    <TeacherDashboard
      apiStatus={apiStatus}
      realtimeStatus={realtimeStatus}
      examActions={EXAM_ACTIONS}
      repository={repository}
      pollMs={2000}
      classActive={classActive}
      onToggleClass={toggleClass}
      accountBar={<AccountBar user={props.operator} onLogout={props.onLogout} />}
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
          <h2>Экзамен</h2>
          <p className="muted">
            Команда сразу уходит ученику на АРМ и в реплику заявителя, если идёт живой звонок.
          </p>
          <div className="exam-actions">
            {EXAM_ACTIONS.map((action) => (
              <button
                key={action.type}
                type="button"
                className="exam-btn"
                title={action.hint}
                onClick={() => void applyExamCue(action.type, action.hint)}
              >
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
