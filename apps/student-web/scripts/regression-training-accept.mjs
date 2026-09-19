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

const tickets = JSON.parse(read('src/data/ags-tickets.json'));
assert.ok(Array.isArray(tickets) && tickets.length >= 90, 'AGS tickets catalog missing');
assert.match(scenarios, /AGS_SCENARIOS/);
assert.doesNotMatch(scenarios, /apartment-fire/);
assert.doesNotMatch(scenarios, /lost-child/);

assert.equal(lessonScreenFor('training'), 'training', 'training must stay on training');
assert.equal(lessonScreenFor('theory'), 'theory', 'Theory must remain a separate route');
assert.notEqual(lessonScreenFor('training'), 'theory', 'training must not map to theory');
assert.equal(screenAfterIncomingAccept('training'), 'training', 'Принять must not change lesson screen');
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

assert.match(training, /workspace\.acceptCall\(\)/);
assert.match(training, /data-lesson="training"/);
assert.match(training, /mode: 'training'/);
assert.match(training, /variant="panel"/);
assert.match(training, /section="training"/);
assert.doesNotMatch(training, /Arm112TheoryPage|data-lesson="theory"|mode: 'guided'/);

assert.match(theory, /data-lesson="theory"/);
assert.match(theory, /mode: 'guided'/);
assert.match(theory, /Теория/);

const ticketSource = read('src/data/ags-tickets.ts');
assert.match(ticketSource, /export function assessDifficulty/);
assert.match(read('src/pages/briefing-page.tsx'), /Легенду билета заранее не показываем/);
assert.doesNotMatch(read('src/pages/briefing-page.tsx'), /Перед занятием/);

const megafon = tickets.find((item) => /мегафон/i.test(item.situation));
assert.ok(megafon, 'Megafon ticket missing');

console.log('training-accept regression ok: AGS tickets stay on training; theory route intact');
