import type { ClassifierColumn, ClassifierGroup } from '../model/classifier';
import metaJson from './classifier-meta.json';
import priznak1Json from './classifier-priznak1.json';

export type ClassifierMeta = {
  sourceFile: string;
  sourceSheet: string;
  sourceVersion: string;
  note: string;
  recordCount: number;
  columnCount: number;
  columns: ClassifierColumn[];
  groups: ClassifierGroup[];
  fullRecordsFile: string;
};

export type ClassifierPriznak1Item = {
  code: string;
  groupCode: string | null;
  groupTitle: string | null;
  priznak1: string;
};

export const classifierMeta = metaJson as ClassifierMeta;

export const classifierPriznak1 = priznak1Json as {
  sourceFile: string;
  items: ClassifierPriznak1Item[];
};

export function classifierColumns() {
  return classifierMeta.columns;
}

export function classifierGroups() {
  return classifierMeta.groups;
}

/** Full 1282-row dump; not imported into the bundle in this scaffold to keep tsc light. */
export const CLASSIFIER_RECORDS_FILE = 'classifier-v046.json';
