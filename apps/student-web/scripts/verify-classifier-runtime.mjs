#!/usr/bin/env node
/** Checks classifier runtime + 112-01/02/03 bindings without a browser XLSX parser. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/features/arm112-simulator/data');
const runtime = JSON.parse(readFileSync(join(root, 'classifier-runtime.json'), 'utf8'));

function must(cond, message) {
  if (!cond) {
    throw new Error(message);
  }
}

must(runtime.source.sheet === 'Лист1', 'sheet must be Лист1');
must(runtime.records.length === 1282, `expected 1282 records, got ${runtime.records.length}`);

const byNumber = Object.fromEntries(runtime.records.map((row) => [String(row.n), row]));
const fire = byNumber['1050101'];
must(fire && fire.p1 === 'жилой дом' && fire.p2 === 'квартира' && fire.m === 'MCHS', '112-01 row 1050101');
const dtp = byNumber['2020000'];
must(dtp && dtp.p1 === 'ДТП пострадавшие' && dtp.t === 'ДТП с пострадавшими' && dtp.m === 'Police', '112-02 row 2020000');
const child = byNumber['18070000'];
must(child && child.p1.includes('городской среде') && child.m === 'Police', '112-03 row 18070000');

const fire101 = fire.sv.some((cell) => cell.c === 'c15');
must(fire101, 'apartment fire must keep Служба 101 column c15');
must(!fire.sv.some((cell) => cell.v.toLowerCase().includes('нет реагирования')), 'no-response cells must be dropped');
must(
  !fire.sv.some((cell) => cell.c === 'c25'),
  '112-01 default row must not invent an extra ambulance column; СМП default c25 is empty on 1050101',
);
const smpVictims = fire.sv.find((cell) => cell.c === 'c26');
must(smpVictims && smpVictims.k === 'd', 'СМП victims column c26 is source data, applied only when Пострадавшие flag is on');

console.log('classifier runtime ok', {
  file: runtime.source.file,
  sheet: runtime.source.sheet,
  records: runtime.records.length,
  '112-01': fire.n,
  '112-02': dtp.n,
  '112-03': child.n,
});
