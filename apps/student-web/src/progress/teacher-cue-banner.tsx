import { useEffect, useState } from 'react';
import { CUE_LABEL, dismissCue, latestCue, type TeacherCue } from './teacher-cues';

export function TeacherCueBanner(props: { login: string }) {
  const [cue, setCue] = useState<TeacherCue | null>(() => latestCue(props.login));

  useEffect(() => {
    function tick() {
      setCue(latestCue(props.login));
    }
    tick();
    const timer = window.setInterval(tick, 1200);
    return () => window.clearInterval(timer);
  }, [props.login]);

  if (!cue) {
    return null;
  }

  return (
    <div className="teacher-cue" role="status">
      <strong>Преподаватель</strong>
      <span>
        {CUE_LABEL[cue.type]}
        {cue.note ? ` — ${cue.note}` : ''}
      </span>
      <button type="button" onClick={() => dismissCue(cue.id)}>
        Скрыть
      </button>
    </div>
  );
}
