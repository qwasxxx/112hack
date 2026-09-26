import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { USER_FLUSH_COALESCE_MS } from '../src/lib/speech-pipeline.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(path.join(root, 'src/pages/call-page.tsx'), 'utf8');

test('J: STT final is not delayed by a fixed 1000 ms frontend flush', () => {
  assert.equal(USER_FLUSH_COALESCE_MS, 16);
  assert.ok(USER_FLUSH_COALESCE_MS < 50);
  assert.match(page, /setTimeout\(flushUtterance, USER_FLUSH_COALESCE_MS\)/);
  assert.doesNotMatch(page, /setTimeout\(flushUtterance,\s*1000\)/);
  assert.match(page, /frontend_handoff_ms=/);
  assert.match(page, /callEpochRef/);
  assert.match(page, /callEpochRef\.current !== epoch && !leavingRef\.current|callEpochRef\.current === epoch && !leavingRef\.current/);
});

test('K: one real operator utterance cannot emit duplicate user_final', () => {
  assert.match(page, /seenFinalsRef\.current\.has\(last\.id\)/);
  assert.match(page, /repeatsSent\(text, lastSentRef\.current\)/);
  assert.match(page, /lastSentRef\.current = text/);
  const sendSites = page.match(/llmRef\.current\?\.sendUserFinal/g) ?? [];
  assert.equal(sendSites.length, 1);
});
