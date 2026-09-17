export type ClassifierColumn = {
  index: number;
  key: string;
  label: string;
  headerRow1: string;
  headerRow2: string;
  headerRow3: string;
  parentBlock: string;
};

export type ClassifierGroup = {
  code: string;
  title: string;
  row: number;
};

export type ClassifierRecord = {
  _row: number;
  _groupCode: string | null;
  _groupTitle: string | null;
  [key: string]: string | number | null;
};

export type ClassifierFile = {
  sourceFile: string;
  sourceSheet: string;
  sourceVersion: string;
  note: string;
  columns: ClassifierColumn[];
  groups: ClassifierGroup[];
  records: ClassifierRecord[];
};

export const CLASSIFIER_FIELD_KEYS = {
  generationG: 'c01',
  p1: 'c02',
  p2: 'c03',
  p3: 'c04',
  number: 'c05',
  statisticsGroup: 'c06',
  priznak1: 'c07',
  priznak2: 'c08',
  priznak3: 'c09',
  extraPriznaki: 'c10',
  finalType: 'c11',
  ekp35: 'c12',
  responseScenario: 'c13',
  mainService: 'c14',
} as const;
