import { useEffect, useState } from 'react';
import { pullOverlays } from './remote';

export function useTeacherReviews(): Record<string, number> {
  const [scores, setScores] = useState<Record<string, number>>({});
  useEffect(() => {
    let stop = false;
    const tick = () => {
      void pullOverlays()
        .then((map) => {
          if (stop || !map) {
            return;
          }
          const next: Record<string, number> = {};
          for (const [id, row] of Object.entries(map)) {
            if (typeof row?.expertScore === 'number') {
              next[id] = row.expertScore;
            }
          }
          setScores(next);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return scores;
}
