import { absorbLessons } from './store';
import { replaceAssignments } from './assignments';
import { replaceClassSession } from './class-session';
import { mergeRemoteLive } from './live-presence';
import { pullAssignments, pullAudit, pullClass, pullLessons, pullLive, pullOverlays } from './remote';

const COMMENTS_KEY = 'sys112.teacher.comments.v1';
const AUDIT_KEY = 'sys112.teacher.audit.v1';

export async function hydrateFromApi(scope?: { login: string; role: string }): Promise<void> {
  const staff = !scope || scope.role === 'TEACHER' || scope.role === 'ADMIN';
  const [lessons, assignments, classState] = await Promise.all([
    pullLessons(staff ? undefined : scope?.login),
    pullAssignments(),
    pullClass(),
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
  if (!staff) {
    return;
  }
  const [overlays, audit, live] = await Promise.all([pullOverlays(), pullAudit(), pullLive()]);
  if (overlays && typeof localStorage !== 'undefined') {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(overlays));
  }
  if (audit && typeof localStorage !== 'undefined') {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(audit));
  }
  mergeRemoteLive(live);
}
