import type { LessonSection } from './data/scenarios';

export type LessonScreenName = 'theory' | 'training' | 'exam';

/** Incoming call accept stays on the current training session. */
export const PHASE_AFTER_INCOMING_ACCEPT = 'активный вызов' as const;

export function lessonScreenFor(section: LessonSection): LessonScreenName {
  if (section === 'theory') {
    return 'theory';
  }
  if (section === 'training') {
    return 'training';
  }
  return 'exam';
}

export function screenAfterIncomingAccept(current: LessonScreenName): LessonScreenName {
  return current;
}
