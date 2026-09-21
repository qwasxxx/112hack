import { absorbLessons } from './store';
import { replaceAssignments } from './assignments';
import { replaceClassSession } from './class-session';
import { mergeRemoteLive } from './live-presence';
import { pullAssignments, pullAudit, pullClass, pullLessons, pullLive, pullOverlays } from './remote';

const COMMENTS_KEY = 'sys112.teacher.comments.v1';
const AUDIT_KEY = 'sys112.teacher.audit.v1';

export async function hydrateFromApi(): Promise<void> {
  const [lessons, assignments, classState, overlays, audit, live] = await Promise.all([
    pullLessons(),
    pullAssignments(),
    pullClass(),
    pullOverlays(),
    pullAudit(),
    pullLive(),
  ]);
  if (lessons.length) {
    absorbLessons(lessons);
  }
  if (assignments?.configured) {
    replaceAssignments({
      scenarioIds: assignments.scenarioIds,
      teacherLogin: assignments.teacherLogin,
      updatedAt: assignments.updatedAt,
    });
  }
  if (classState) {
    replaceClassSession(classState);
  }
  if (overlays && typeof localStorage !== 'undefined') {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(overlays));
  }
  if (audit && typeof localStorage !== 'undefined') {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(audit));
  }
  mergeRemoteLive(live);
}
