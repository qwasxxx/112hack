import { useEffect, useState } from 'react';
import { CUE_LABEL, dismissCue, latestCue, subscribeCues, type TeacherCue } from './teacher-cues';

export function TeacherCueBanner(props: { login: string }) {
  const [cue, setCue] = useState<TeacherCue | null>(() => latestCue(props.login));

  useEffect(() => {
    function tick() {
      setCue(latestCue(props.login));
    }
    tick();
    const timer = window.setInterval(tick, 800);
    const stop = subscribeCues(tick);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [props.login]);

  if (!cue) {
    return null;
  }

  return (
    <div className="teacher-cue" role="status">
      <strong>Преподаватель</strong>
      <span>
        {CUE_LABEL[cue.type]}
      </span>
      <button type="button" onClick={() => dismissCue(cue.id)}>
        Скрыть
      </button>
    </div>
  );
}
