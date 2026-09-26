import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

try {
  const truthMod = await vite.ssrLoadModule('/src/data/caller-truth.ts');
  const profileMod = await vite.ssrLoadModule('/src/lib/ambience-profile.ts');
  const { classifyIncident } = truthMod;
  const { ambienceProfileForIncident } = profileMod;

  const fire = {
    situation: 'Возгорание мусорного контейнера, пострадавших нет, Сидоров Иван Сергеевич, 916-126-34-71',
    address: 'Москва, Депо, около ст. Москва-Пассажирская Киевская',
    services: ['fire'],
  };
  assert.equal(classifyIncident(fire).class, 'fire');
  assert.equal(ambienceProfileForIncident(classifyIncident(fire).class, fire).type, 'FIRE');

  const traffic = {
    situation: 'ДТП, Б/П, Б/Р, пежо + фольксваген, Иванова Елена Сергеевна, 916 896 3254',
    address: 'Москва, МКАД, от Варшавского шоссе в сторону Каширского',
    services: ['ambulance', 'police'],
  };
  assert.equal(classifyIncident(traffic).class, 'traffic_accident');
  assert.equal(ambienceProfileForIncident(classifyIncident(traffic).class, traffic).type, 'TRAFFIC_ACCIDENT');

  const medical = {
    situation: 'Сильная головная, А/Д 150/80, Крючков Станислав Дмитриевич, д/р 30.06.2001, вызывает себе, 916 897 5623',
    address: 'Рязань, ул. Вишневая, дом 15 ч/дом',
    services: ['ambulance'],
  };
  assert.equal(classifyIncident(medical).class, 'medical');
  const medicalProfile = ambienceProfileForIncident(classifyIncident(medical).class, medical);
  assert.equal(medicalProfile.type, 'MEDICAL');
  assert.notEqual(medicalProfile.type, 'FIRE');
  assert.notEqual(medicalProfile.type, 'TRAFFIC_ACCIDENT');
} finally {
  await vite.close();
}

console.log('ambience-scenario mapping ok');
