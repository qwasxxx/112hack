import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previousStudentScreenName } from '../src/student-navigation.ts';

test('browser back from a lesson returns to the briefing, not logout', () => {
  assert.equal(previousStudentScreenName('training'), 'briefing');
  assert.equal(previousStudentScreenName('exam'), 'briefing');
  assert.equal(previousStudentScreenName('dds'), 'briefing');
});

test('browser back from inner pages returns to the catalog, not logout', () => {
  assert.equal(previousStudentScreenName('briefing'), 'catalog');
  assert.equal(previousStudentScreenName('theory'), 'catalog');
  assert.equal(previousStudentScreenName('sessions'), 'catalog');
  assert.equal(previousStudentScreenName('handbook'), 'catalog');
  assert.equal(previousStudentScreenName('debrief'), 'catalog');
  assert.equal(previousStudentScreenName('dds-debrief'), 'catalog');
});

test('browser back on the catalog stays in the catalog', () => {
  assert.equal(previousStudentScreenName('catalog'), 'catalog');
});
