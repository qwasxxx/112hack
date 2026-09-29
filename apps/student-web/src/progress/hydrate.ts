import { replaceLessonsFromServer } from './store';
import { replaceAssignments } from './assignments';
import { replaceClassSession } from './class-session';
import { mergeRemoteLive } from './live-presence';
import { mergeRemoteCues } from './teacher-cues';
import {
  pullAssignments,
  pullAudit,
  pullCatalog,
  pullClass,
  pullCues,
  forgetLessonOutbox,
  pullLessons,
  pullLive,
  pullOverlays,
} from './remote';
import { replaceCatalogStore } from '../data/ticket-catalog';
import { refreshScenarioCatalog } from '../data/scenarios';

const COMMENTS_KEY = 'sys112.teacher.comments.v1';
const AUDIT_KEY = 'sys112.teacher.audit.v1';

export async function hydrateFromApi(scope?: { login: string; role: string }): Promise<void> {
  const staff = !scope || scope.role === 'TEACHER' || scope.role === 'ADMIN';
  const [lessons, assignments, classState, catalog, cues] = await Promise.all([
    pullLessons(staff ? undefined : scope?.login),
    pullAssignments(),
    pullClass(),
    pullCatalog(),
    pullCues(staff ? undefined : scope?.login),
  ]);
  if (lessons) {
    replaceLessonsFromServer(lessons, staff ? undefined : scope?.login);
    forgetLessonOutbox();
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
  const overlays = catalog?.overlays && typeof catalog.overlays === 'object' ? catalog.overlays : {};
  const custom = Array.isArray(catalog?.custom) ? catalog.custom : [];
  if (Object.keys(overlays).length || custom.length) {
    replaceCatalogStore({ overlays, custom });
    refreshScenarioCatalog();
  }
  mergeRemoteCues(cues);
  if (!staff) {
    return;
  }
  const [scoreOverlays, audit, live] = await Promise.all([pullOverlays(), pullAudit(), pullLive()]);
  if (scoreOverlays && typeof localStorage !== 'undefined') {
    localStorage.setItem(COMMENTS_KEY, JSON.stringify(scoreOverlays));
  }
  if (audit && typeof localStorage !== 'undefined') {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(audit));
  }
  mergeRemoteLive(live);
}
