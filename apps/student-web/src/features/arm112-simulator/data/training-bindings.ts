import type { TrainingScenario } from '../../../data/scenarios';
import { classifierRuntime, matchRecords, type ClassifierFilter } from './classifier-runtime';

/**
 * Catalog scenarios stay in `src/data/scenarios.ts`.
 * This file only binds them to classifier rows that actually exist in Лист1.
 */
export type TrainingBinding = {
  scenarioId: string;
  scenarioCode: string;
  incomingNumber: string;
  incomingNumberSource: string;
  callerOpening: string;
  summary: string;
  normativeDurationMin: number;
  cardTimerLimitSec: 30;
  cardTimerSource: string;
  classifier: ClassifierFilter & {
    number: string;
    row: number;
    finalType: string;
    mainService: string | null;
    source: string;
  };
};

const INCOMING_NUMBER = '+7 (499) 550-34-56';
const INCOMING_SOURCE = 'Инструкция_по_заведению_карточки Рисунок 3 / image4 «с номера +7 (499) 550-34-56»';

function rowByNumber(number: string) {
  const record = classifierRuntime.records.find((item) => String(item.n) === number);
  if (!record) {
    throw new Error(`Classifier row ${number} missing from runtime dataset`);
  }
  return record;
}

export function trainingBindingFor(scenario: TrainingScenario): TrainingBinding {
  const classifierId =
    scenario.classifierNumber ||
    (scenario.id === 'apartment-fire' || scenario.code === '112-01'
      ? '1050101'
      : scenario.id === 'road-accident' || scenario.code === '112-02'
        ? '2020000'
        : scenario.services[0] === 'fire'
          ? '1050101'
          : scenario.services[0] === 'ambulance' || scenario.services.includes('ambulance')
            ? '2020000'
            : '18070000');
  const record = rowByNumber(classifierId);
  return {
    scenarioId: scenario.id,
    scenarioCode: scenario.code,
    incomingNumber: INCOMING_NUMBER,
    incomingNumberSource: INCOMING_SOURCE,
    callerOpening: scenario.callerOpening,
    summary: scenario.summary,
    normativeDurationMin: scenario.durationMin,
    cardTimerLimitSec: 30,
    cardTimerSource: 'case-spec преподаватель default 30 сек',
    classifier: {
      groupCode: record.g,
      priznak1: record.p1,
      priznak2: record.p2 ? [record.p2] : [],
      priznak3: record.p3 ? [record.p3] : [],
      number: String(record.n),
      row: record.row,
      finalType: record.t ?? '',
      mainService: record.m,
      source: `${classifierRuntime.source.sheet} r${record.row} c05=${record.n} c07=${record.p1} c11=${record.t} c14=${record.m}`,
    },
  };
}

export function expectedRecordsFor(binding: TrainingBinding) {
  return matchRecords({
    groupCode: binding.classifier.groupCode,
    priznak1: binding.classifier.priznak1,
    priznak2: binding.classifier.priznak2,
    priznak3: binding.classifier.priznak3,
    finalType: binding.classifier.finalType,
  });
}
