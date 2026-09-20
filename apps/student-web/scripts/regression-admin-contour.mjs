import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const openDb = read('src/local-db/open.ts');
assert.match(openDb, /SYS112_DB_NAME = 'sys112-local-auth'/);
assert.match(openDb, /ADMIN_SERVICES_STORE = 'adminServices'/);
assert.match(openDb, /ADMIN_AUDIT_STORE = 'adminAudit'/);
assert.match(openDb, /ADMIN_BACKUPS_STORE = 'adminBackups'/);
assert.match(openDb, /ADMIN_TRAINING_STORE = 'adminTraining'/);
assert.match(openDb, /USERS_STORE = 'users'/);

const accounts = read('src/auth/accounts.ts');
assert.match(accounts, /readAllUsers/);
assert.match(accounts, /localStorage.removeItem\(FALLBACK_ACCOUNTS_KEY\)/);
assert.match(accounts, /passwordHash/);
assert.match(accounts, /pbkdf2|hashPassword/);

const record = read('src/admin/data/training-record.ts');
assert.match(record, /recordCompletedTraining/);
assert.match(record, /ADMIN_TRAINING_STORE/);
assert.match(record, /training_completed/);

const shell = read('src/app.tsx');
assert.match(shell, /recordAuthEvent/);
assert.match(shell, /recordCompletedTraining/);

const persist = read('src/admin/data/system-persistence.ts');
assert.match(persist, /appendAuditEntry/);
assert.match(persist, /putInStore\(ADMIN_AUDIT_STORE/);
assert.match(persist, /persistService/);
assert.match(persist, /persistBackup/);
assert.doesNotMatch(persist, /localStorage/);
assert.match(persist, /progress\.length > 0 \? progress : INITIAL_PROGRESS/);
assert.match(persist, /progressLive/);
assert.match(persist, /auditLive/);

const status = read('src/admin/data/service-status.ts');
assert.match(status, /if \(state === 'stopped'\) \{\s*return 'Запустить'/s);
assert.match(status, /return 'Остановить'/);
assert.match(status, /return state === 'checking'/);

const contour = read('src/admin/pages/contour-page.tsx');
assert.match(contour, /serviceActionLabel\(view\)/);
assert.match(contour, /Создать резервную копию/);
assert.match(contour, /IndexedDB/);
assert.match(contour, /busyIds/);
assert.doesNotMatch(contour, /catalog-dispatch-center/);

const journal = read('src/admin/pages/journal-page.tsx');
assert.match(journal, /filterAudit/);
assert.match(journal, /account_created/);
assert.match(journal, /service_started/);
assert.match(journal, /password_reset/);
assert.match(journal, /AdminFilterMenu/);
assert.doesNotMatch(journal, /<select/);

const training = read('src/admin/pages/training-page.tsx');
assert.match(training, /buildTrainingAnalytics/);
assert.match(training, /Только просмотр/);
assert.doesNotMatch(training, /onScore|setGrade|экспертн|изменить балл/i);
assert.doesNotMatch(training, /<input/);

const auditModel = read('src/admin/data/admin.ts');
assert.match(auditModel, /actorId\?: string/);
assert.match(auditModel, /actorLogin\?: string/);
assert.match(auditModel, /createAuditEntry/);

const hook = read('src/admin/user-management/audit-hook.ts');
assert.match(hook, /userAuditEvent/);
assert.match(hook, /recordUserAudit/);
assert.match(hook, /recordAuthEvent/);

const app = read('src/admin/admin-app.tsx');
assert.match(app, /appendAuditEntry/);
assert.match(app, /persistService/);
assert.match(app, /persistBackup/);
assert.match(app, /UsersPage/);

const tilt = read('src/admin/admin-tilt.ts');
assert.match(tilt, /x: 7\.4, y: 9/);
assert.match(tilt, /x: 6\.6, y: 8\.4/);
assert.match(tilt, /bindAdminDashboardTilt/);
assert.match(tilt, /isReactTiltSurface/);
assert.match(tilt, /button, a/);

const css = read('src/admin/admin.css');
assert.match(css, /perspective\(1500px\)/);
assert.match(css, /transform-style:\s*flat/);
assert.doesNotMatch(css, /transform-style:\s*preserve-3d/);
assert.match(css, /\.ad-tilt::after \{[\s\S]{0,280}?pointer-events:\s*none/);
assert.match(css, /\.ad-tilt::after \{[\s\S]{0,220}?z-index:\s*0/);
assert.match(css, /\.ad-user-row,[\s\S]{0,180}?--ad-tilt-i:\s*0/);
assert.match(css, /\.ad-user-profile-shell \{[\s\S]{0,160}?pointer-events:\s*none/);
assert.match(css, /\.ad-user-actions \{[\s\S]{0,180}?pointer-events:\s*auto/);
assert.match(css, /\.ad-contour-banner \{[\s\S]{0,180}?height: 44px/);

const users = read('src/admin/pages/users-page.tsx');
assert.match(users, /onResetPassword/);
assert.match(users, /onChangeRole/);
assert.match(users, /AdminFilterMenu/);
assert.doesNotMatch(users, /<select/);

console.log('admin contour/journal/training regression ok');
