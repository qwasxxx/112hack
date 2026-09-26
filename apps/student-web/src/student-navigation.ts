export type StudentScreenName =
  | 'catalog'
  | 'sessions'
  | 'handbook'
  | 'briefing'
  | 'theory'
  | 'training'
  | 'exam'
  | 'dds'
  | 'debrief'
  | 'dds-debrief';

const BACK_TO_BRIEFING: ReadonlySet<StudentScreenName> = new Set(['training', 'exam', 'dds']);

export const STUDENT_BACK_EVENT = 'sys112:navigate-back';

export function previousStudentScreenName(name: StudentScreenName): StudentScreenName {
  if (BACK_TO_BRIEFING.has(name)) {
    return 'briefing';
  }
  return 'catalog';
}
