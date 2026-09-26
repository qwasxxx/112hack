import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public/audio/ambience');
const vite = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

try {
  const ticketsMod = await vite.ssrLoadModule('/src/data/ags-tickets.ts');
  const truthMod = await vite.ssrLoadModule('/src/data/caller-truth.ts');
  const profileMod = await vite.ssrLoadModule('/src/lib/ambience-profile.ts');
  const manifestMod = await vite.ssrLoadModule('/src/lib/ambience-manifest.ts');
  const { AGS_TICKETS } = ticketsMod;
  const { classifyIncident } = truthMod;
  const { ambienceProfileForIncident, AMBIENCE_TYPES } = profileMod;
  const { AMBIENCE_FILES } = manifestMod;

  assert.equal(AGS_TICKETS.length, 96, 'expected 96 AGS tickets');
  const counts = Object.fromEntries(AMBIENCE_TYPES.map((type) => [type, 0]));
  const missing = [];

  for (const ticket of AGS_TICKETS) {
    const source = {
      id: `ags-${String(ticket.ticket).padStart(2, '0')}-${ticket.n}`,
      ticketNo: ticket.ticket,
      situationNo: ticket.n,
      situation: ticket.situation,
      address: ticket.address,
    };
    const classified = classifyIncident(source);
    const profile = ambienceProfileForIncident(classified.class, source);
    assert.ok(profile, `${source.id} undefined profile`);
    assert.ok(AMBIENCE_TYPES.includes(profile.type), `${source.id} unknown ${profile.type}`);
    assert.ok(profile.layers.length > 0, `${source.id} empty layers`);
    assert.ok(profile.gain > 0, `${source.id} accidental silence`);
    counts[profile.type] += 1;
    for (const layer of profile.layers) {
      assert.ok(layer.assetUrl, `${source.id} ${layer.id} missing url`);
      const name = layer.assetUrl.replace('/audio/ambience/', '');
      const full = path.join(dir, name);
      if (!existsSync(full) || statSync(full).size < 40000) {
        missing.push(`${source.id} ${layer.id} ${name}`);
      }
    }
  }

  assert.deepEqual(missing, []);
  const mapped = Object.values(counts).reduce((sum, n) => sum + n, 0);
  assert.equal(mapped, 96);
  for (const url of Object.values(AMBIENCE_FILES)) {
    const full = path.join(dir, url.replace('/audio/ambience/', ''));
    assert.ok(existsSync(full), `missing ${url}`);
  }
  console.log('ambience 96-scenario mapping ok', counts);
} finally {
  await vite.close();
}
