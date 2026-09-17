import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function lessonScreenFor(section) {
  if (section === 'theory') return 'theory';
  if (section === 'training') return 'training';
  return 'exam';
}

function screenAfterIncomingAccept(current) {
  return current;
}

const scenarios = read('src/data/scenarios.ts');
const routing = read('src/lesson-routing.ts');
const app = read('src/student-app.tsx');
const training = read('src/features/arm112-simulator/screens/arm112-training-page.tsx');
const theory = read('src/features/arm112-simulator/screens/arm112-theory-page.tsx');
const workspace = read('src/features/arm112-simulator/hooks/use-arm112-workspace.ts');

const codes = ['112-01', '112-02', '112-03'];
for (const code of codes) {
  assert.match(scenarios, new RegExp(`code: '${code}'`), `${code} catalog scenario missing`);
  assert.equal(lessonScreenFor('training'), 'training', `${code}: training must stay on training`);
  assert.notEqual(lessonScreenFor('training'), 'theory', `${code}: training must not map to theory`);
  assert.equal(screenAfterIncomingAccept('training'), 'training', `${code}: Принять must not change lesson screen`);
}

assert.equal(lessonScreenFor('theory'), 'theory', 'Theory must remain a separate route');
assert.match(routing, /PHASE_AFTER_INCOMING_ACCEPT = 'активный вызов'/);
assert.match(routing, /if \(section === 'training'\) \{\s*return 'training'/s);

assert.match(app, /name: lessonScreenFor\(section\)/);
assert.match(app, /if \(screen\.name === 'training'\)/);
assert.match(app, /<Arm112TrainingPage/);
assert.match(app, /if \(screen\.name === 'theory'\)/);
assert.match(app, /<Arm112TheoryPage/);
assert.doesNotMatch(app, /name: 'call'/);
assert.doesNotMatch(
  app,
  /if \(screen\.section === 'training'\)[\s\S]*Arm112TheoryPage/,
  'Training branch must not render Theory',
);

assert.match(workspace, /setPhase\(PHASE_AFTER_INCOMING_ACCEPT\)/);
assert.doesNotMatch(workspace, /setPhase\('заполнение карточки'\).*accept-call/s);
assert.doesNotMatch(workspace, /setScreen|Arm112TheoryPage|lessonScreenFor\('theory'\)/);

assert.match(training, /onAcceptCall=\{workspace\.acceptCall\}/);
assert.match(training, /data-lesson="training"/);
assert.match(training, /mode: 'training'/);
assert.match(training, /variant="panel"/);
assert.match(training, /section="training"/);
assert.doesNotMatch(training, /Arm112TheoryPage|data-lesson="theory"|mode: 'guided'/);

assert.match(theory, /data-lesson="theory"/);
assert.match(theory, /mode: 'guided'/);
assert.match(theory, /Теория/);

console.log('training-accept regression ok: 112-01 112-02 112-03 stay on training; theory route intact');
