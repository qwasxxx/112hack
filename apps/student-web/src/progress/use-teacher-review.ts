import { useEffect, useState } from 'react';
import { pullOverlays } from './remote';

export type TeacherReview = {
  expertScore?: number;
  comment?: string;
};

const COMMENTS_KEY = 'sys112.teacher.comments.v1';

function asReview(row: { expertScore?: number; comment?: string } | undefined): TeacherReview | null {
  const expertScore = typeof row?.expertScore === 'number' ? row.expertScore : undefined;
  const comment = typeof row?.comment === 'string' ? row.comment.trim() : '';
  if (expertScore == null && !comment) {
    return null;
  }
  return { expertScore, comment: comment || undefined };
}

function readLocalReviews(): Record<string, TeacherReview> {
  if (typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(COMMENTS_KEY) ?? '{}') as Record<
      string,
      { expertScore?: number; comment?: string }
    >;
    const next: Record<string, TeacherReview> = {};
    for (const [id, row] of Object.entries(parsed ?? {})) {
      const review = asReview(row);
      if (review) {
        next[id] = review;
      }
    }
    return next;
  } catch {
    return {};
  }
}

export function useTeacherReviews(): Record<string, TeacherReview> {
  const [reviews, setReviews] = useState<Record<string, TeacherReview>>(readLocalReviews);
  useEffect(() => {
    let stop = false;
    const tick = () => {
      const local = readLocalReviews();
      void pullOverlays()
        .then((map) => {
          if (stop) {
            return;
          }
          const next = { ...local };
          if (map) {
            for (const [id, row] of Object.entries(map)) {
              const review = asReview(row);
              if (review) {
                next[id] = { ...next[id], ...review };
              }
            }
          }
          setReviews(next);
        })
        .catch(() => {
          if (!stop) {
            setReviews(local);
          }
        });
    };
    tick();
    const timer = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);
  return reviews;
}
