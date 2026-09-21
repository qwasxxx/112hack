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

assert.match(app, /setScreen\(\{ name: 'training', scenario: screen.scenario \}\)/);
assert.match(app, /if \(screen\.name === 'training' \|\| screen\.name === 'exam'\)/);
assert.match(app, /if \(screen\.name === 'theory'\)/);
assert.match(app, /<Arm112TrainingPage/);
assert.match(app, /<Arm112TheoryPage/);
assert.match(app, /kind=\{screen\.name\}/);
assert.match(app, /onHandbook/);
assert.doesNotMatch(app, /name: 'call'/);
assert.doesNotMatch(app, /<CallPage/);
assert.doesNotMatch(
  app,
  /if \(screen\.section === 'training'\)[\s\S]*Arm112TheoryPage/,
  'Training branch must not render Theory',
);

assert.match(workspace, /setPhase\(PHASE_AFTER_INCOMING_ACCEPT\)/);
assert.match(workspace, /function acceptSms/);
assert.doesNotMatch(workspace, /setPhase\('заполнение карточки'\).*accept-call/s);
assert.doesNotMatch(workspace, /setScreen|Arm112TheoryPage|lessonScreenFor\('theory'\)/);

assert.match(training, /workspace\.acceptCall\(\)/);
assert.match(training, /workspace\.acceptSms\(\)/);
assert.match(training, /data-lesson=\{kind\}/);
assert.match(training, /mode: 'training'/);
assert.match(training, /variant="panel"/);
assert.match(training, /section=\{kind\}/);
assert.match(training, /Завершить обработку/);
assert.doesNotMatch(training, /Arm112TheoryPage|data-lesson="theory"|mode: 'guided'/);

assert.match(theory, /data-lesson="theory"/);
assert.match(theory, /mode: 'guided'/);
assert.match(theory, /Теория/);

const ticketSource = read('src/data/ags-tickets.ts');
assert.match(ticketSource, /export function assessDifficulty/);
assert.match(read('src/pages/briefing-page.tsx'), /Легенду билета выясняете на линии/);
assert.doesNotMatch(read('src/pages/briefing-page.tsx'), /Перед занятием/);

assert.match(app, /track={track}/);
assert.match(app, /onStartDds/);
assert.match(read('src/pages/briefing-page.tsx'), /диспетчер ДДС/);
assert.match(read('src/pages/catalog-page.tsx'), /LEARNER_TRACK_LABEL/);
assert.match(read('src/pages/catalog-page.tsx'), /onSessions/);
assert.match(read('src/pages/catalog-page.tsx'), /onHandbook/);
assert.doesNotMatch(read('src/pages/catalog-page.tsx'), /onSettings/);
assert.doesNotMatch(read('src/pages/catalog-page.tsx'), /Настройки/);
assert.match(read('src/dds-lanes.ts'), /export const DDS_LANES/);
assert.match(read('src/pages/catalog-page.tsx'), /Случайная карточка/);
assert.match(read('src/progress/certificate.ts'), /printLessonCertificate/);
assert.match(read('src/progress/ticket-facts.ts'), /export function incomingChannelFor/);
assert.match(read('src/progress/ticket-facts.ts'), /export function smsFromTicket/);
assert.match(read('src/progress/ticket-facts.ts'), /Адрес: \$\{address\}/);
assert.doesNotMatch(read('src/progress/ticket-facts.ts'), /slice\(0, 87\)/);
assert.match(read('src/data/ags-tickets.ts'), /15060202/);
assert.match(read('src/features/arm112-simulator/data/training-bindings.ts'), /incomingNumberFor/);
assert.match(read('src/progress/score-training.ts'), /PASS_SCORE_EXAM/);
assert.match(read('src/data/scenarios.ts'), /id: 'exam'/);
assert.doesNotMatch(read('src/data/scenarios.ts'), /enabled: false/);
assert.match(read('src/progress/score-arm.ts'), /export function scoreArmTraining/);
assert.match(read('src/progress/store.ts'), /Append-only/);
assert.match(training, /onCallEnded/);
assert.match(app, /name: 'debrief'/);
assert.match(read('src/progress/score-training.ts'), /export function scoreTrainingLesson/);
assert.match(read('src/features/dds-training/incoming-card.ts'), /export function factsFromScenario/);
assert.match(read('src/dds-lanes.ts'), /export function buildDdsShift/);
assert.match(read('src/dds-lanes.ts'), /ddsWorkplaceName/);
assert.match(read('src/features/dds-training/dds-card.tsx'), /записи звонков/);
assert.match(read('src/features/dds-training/dds-card.tsx'), /ФИО заявителя/);
assert.match(read('src/features/dds-training/dds-card.tsx'), /С112 - карта/);
assert.match(read('src/features/dds-training/use-dds-session.ts'), /transferCard/);
assert.match(read('src/features/dds-training/use-dds-session.ts'), /completeActive/);
assert.match(read('src/features/dds-training/use-dds-session.ts'), /Получена службой/);
assert.match(read('src/features/dds-training/types.ts'), /export function nextDdsStatuses/);
assert.match(read('src/features/dds-training/callback-prompt.ts'), /buildDdsCallbackPrompt/);
assert.match(read('src/features/dds-training/display.ts'), /export function splitDdsAddress/);
assert.match(read('src/progress/score-dds.ts'), /dds-services-missing/);
assert.match(read('src/progress/score-dds.ts'), /serviceVeto/);
assert.match(read('src/pages/catalog-page.tsx'), /Назначенные/);
assert.match(read('src/progress/assignments.ts'), /assignedScenarioIds/);
assert.match(read('src/progress/live-presence.ts'), /upsertLive/);
assert.match(read('src/teacher/local-teacher-repository.ts'), /LocalTeacherDashboardRepository/);
assert.match(read('src/student-app.tsx'), /upsertLive/);
assert.match(read('src/student-app.tsx'), /liveCardSnapshot/);
assert.match(read('src/student-app.tsx'), /TeacherCueBanner/);
assert.match(read('src/progress/class-session.ts'), /startClass/);
assert.match(read('src/progress/teacher-cues.ts'), /pushTeacherCue/);
assert.match(read('src/progress/card-progress.ts'), /liveCardSnapshot/);
assert.match(read('src/teacher/local-teacher-repository.ts'), /pushTeacherCue/);
assert.match(read('src/teacher/local-teacher-repository.ts'), /saveTicketPatch/);
assert.match(read('src/teacher/local-teacher-repository.ts'), /createCustomTicket/);
assert.doesNotMatch(read('src/teacher/local-teacher-repository.ts'), /custom-\$\{Date/);
assert.match(read('src/lib/llm-stream.ts'), /intervene/);
assert.match(read('src/pages/call-page.tsx'), /takePendingLlmCues/);
assert.match(read('src/pages/catalog-page.tsx'), /readClassSession/);
assert.match(read('src/teacher/teacher-app.tsx'), /onToggleClass/);
assert.match(read('src/features/dds-training/incoming-card.ts'), /export function expandTicketShorthand/);
assert.match(read('src/features/dds-training/incoming-card.ts'), /головная боль/);
assert.match(read('src/features/dds-training/dds-journal.tsx'), /Завершить смену/);
assert.match(read('src/features/dds-training/use-dds-session.ts'), /closeShift/);
assert.match(read('src/pages/debrief-page.tsx'), /export function DdsDebriefPage/);
assert.match(app, /dds-debrief/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /Отмена вызова/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /Справка-102/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /Трава, пух/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /Общественный транспорт/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /Горит человек/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /Есть правонарушение/);
assert.match(read('src/features/arm112-simulator/data/evidenced-questionnaires.ts'), /showWhen/);
assert.match(read('src/features/arm112-simulator/data/gsi-services.ts'), /Служба 102 \(Дежурная часть ГУ МВД России по г.Москве\)/);
assert.match(read('src/features/arm112-simulator/data/gsi-services.ts'), /ОАТИ \(Объединение Административно-Технических Инспекций города Москвы\)/);
assert.match(read('src/features/arm112-simulator/data/gsi-services.ts'), /Мосжилинспекция/);
assert.match(read('src/features/arm112-simulator/components/services-modal.tsx'), /Поиск \.\.\./);
assert.match(read('src/features/arm112-simulator/components/incident-type-panel.tsx'), /onFocus/);
assert.match(read('src/progress/score-call.ts'), /WHAT_VOLUNTEERED/);
assert.match(read('src/progress/score-call.ts'), /callerCovers/);
assert.match(read('src/progress/score-training.ts'), /opening: input.scenario.callerOpening/);
assert.match(read('src/features/dds-training/dds-journal.tsx'), /dds-link-cell/);
assert.match(read('src/features/dds-training/dds-journal.tsx'), /УМЦ\| О\. п\./);
assert.match(read('src/features/dds-training/dds-journal.tsx'), /UserIcon/);
assert.match(read('src/features/dds-training/display.ts'), /journalIncidentLine/);
assert.doesNotMatch(read('src/features/dds-training/dds-journal.tsx'), /dds-col-gap/);
assert.match(read('src/progress/score-training.ts'), /WHAT_REASK/);
assert.match(read('src/progress/score-training.ts'), /scrubWhatRemark/);
assert.match(read('src/data/ags-tickets.ts'), /22530000/);
assert.match(read('src/progress/ticket-facts.ts'), /namesFromTicket/);
assert.match(read('src/progress/ticket-facts.ts'), /упал\|отек/);
assert.match(read('src/progress/score-card.ts'), /nameOverlap/);
assert.match(read('src/progress/score-card.ts'), /medicalClose/);

console.log('training-accept regression ok: AGS tickets stay on training; theory route intact');
