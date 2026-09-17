import runtimeJson from './classifier-runtime.json';

export type ServiceCondition =
  | 'default'
  | 'unconditioned'
  | 'ND'
  | 'UL'
  | 'PP'
  | 'victims'
  | 'not-on-scene'
  | 'offense'
  | 'gasification'
  | 'road-blocked';

export type ClassifierServiceColumn = {
  key: string;
  index: number;
  label: string;
  parentBlock: string;
  headerRow3: string;
  displayName: string;
  displayNameSource: string;
  condition: ServiceCondition | string;
};

export type ClassifierRuntimeRecord = {
  row: number;
  n: string | number;
  g: string | null;
  p1: string | null;
  p2?: string;
  p3?: string;
  x?: string;
  t: string | null;
  m: string | null;
  sc?: string;
  hidden?: boolean;
  sv: Array<{ c: string; v: string; k: 'd' | 'n' }>;
};

export type ClassifierRuntimeFile = {
  source: {
    file: string;
    sheet: string;
    version: string;
    dumpFile: string;
    note: string;
  };
  groups: Array<{ code: string; title: string; row: number }>;
  serviceColumns: ClassifierServiceColumn[];
  mainServiceBlocks: Record<string, string>;
  records: ClassifierRuntimeRecord[];
};

export const classifierRuntime = runtimeJson as ClassifierRuntimeFile;

export type ClassifierFilter = {
  groupCode?: string | null;
  priznak1?: string | null;
  priznak2?: string[];
  priznak3?: string[];
  extraTags?: string[];
  finalType?: string | null;
};

export type ServiceFlags = {
  noAccess: boolean;
  threatToPeople: boolean;
  victims: boolean;
  notOnScene: boolean;
  offense: boolean;
  gasification: boolean;
  roadBlocked: boolean;
};

export type AssignedService = {
  name: string;
  autoAssigned: boolean;
  visMark: false;
  isMainForType: boolean;
  kind: 'dispatch' | 'notify';
  sourceColumns: string[];
  sourceRows: number[];
};

export type SearchHit = {
  label: string;
  kind: 'group' | 'priznak1' | 'finalType';
  groupCode?: string;
  priznak1?: string;
  finalType?: string;
  source: string;
};

/** card-manual §4.2 synonyms — search only, not service rules. */
const SEARCH_ALIASES: Array<{ tokens: string[]; groupTitle: string; source: string }> = [
  { tokens: ['101', 'пожар'], groupTitle: 'Пожары и задымления', source: 'card-manual §4.2 синоним пожар=101' },
  { tokens: ['взрыв'], groupTitle: 'Взрывы', source: 'card-manual §4.2' },
  { tokens: ['обрушение'], groupTitle: 'Обрушения', source: 'card-manual §4.2' },
  { tokens: ['дтп'], groupTitle: 'ДТП', source: 'card-manual §4.2' },
  { tokens: ['вызов 03', '03'], groupTitle: 'Оказание медицинской скорой и неотложной помощи', source: 'card-manual §4.2 вызов 03' },
  { tokens: ['запах газа'], groupTitle: 'Запах газа', source: 'card-manual §4.2' },
  { tokens: ['выброс'], groupTitle: 'Угрозы выброса опасных веществ', source: 'card-manual §4.2' },
];

function norm(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function recordNumber(record: ClassifierRuntimeRecord): string {
  return String(record.n);
}

export function visibleRecords(): ClassifierRuntimeRecord[] {
  return classifierRuntime.records.filter((item) => !item.hidden);
}

export function groupByCode(code: string | null | undefined) {
  return classifierRuntime.groups.find((item) => item.code === code);
}

export function matchRecords(filter: ClassifierFilter): ClassifierRuntimeRecord[] {
  return visibleRecords().filter((record) => {
    if (filter.groupCode && record.g !== filter.groupCode) {
      return false;
    }
    if (filter.priznak1 && record.p1 !== filter.priznak1) {
      return false;
    }
    if (filter.priznak2 && filter.priznak2.length > 0) {
      if (!record.p2 || !filter.priznak2.includes(record.p2)) {
        return false;
      }
    }
    if (filter.priznak3 && filter.priznak3.length > 0) {
      if (!record.p3 || !filter.priznak3.includes(record.p3)) {
        return false;
      }
    }
    if (filter.extraTags && filter.extraTags.length > 0) {
      if (!record.x || !filter.extraTags.includes(record.x)) {
        return false;
      }
    }
    if (filter.finalType && record.t !== filter.finalType) {
      return false;
    }
    return true;
  });
}

export function childOptions(filter: ClassifierFilter) {
  const rows = matchRecords(filter);
  const unique = (values: Array<string | null | undefined>) =>
    [...new Set(values.filter((item): item is string => Boolean(item)))];
  return {
    groups: classifierRuntime.groups.map((item) => item.title),
    priznak1: unique(rows.map((item) => item.p1)),
    priznak2: unique(rows.map((item) => item.p2)),
    priznak3: unique(rows.map((item) => item.p3)),
    extra: unique(rows.map((item) => item.x)),
    finalTypes: unique(rows.map((item) => item.t)),
    count: rows.length,
  };
}

export function searchClassifier(query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const push = (hit: SearchHit) => {
    const key = `${hit.kind}:${hit.label}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hits.push(hit);
  };

  for (const alias of SEARCH_ALIASES) {
    if (alias.tokens.some((token) => q === token || q.includes(token))) {
      const group = classifierRuntime.groups.find((item) => item.title === alias.groupTitle);
      if (group) {
        push({
          label: group.title,
          kind: 'group',
          groupCode: group.code,
          source: `${classifierRuntime.source.file} ${classifierRuntime.source.sheet} group row ${group.row}; ${alias.source}`,
        });
      }
    }
  }

  for (const group of classifierRuntime.groups) {
    if (group.title.toLowerCase().includes(q)) {
      push({
        label: group.title,
        kind: 'group',
        groupCode: group.code,
        source: `${classifierRuntime.source.sheet} group row ${group.row} «${group.title}»`,
      });
    }
  }

  for (const record of visibleRecords()) {
    if (hits.length >= limit) {
      break;
    }
    if (record.p1 && record.p1.toLowerCase().includes(q)) {
      push({
        label: record.p1,
        kind: 'priznak1',
        groupCode: record.g ?? undefined,
        priznak1: record.p1,
        source: `${classifierRuntime.source.sheet} r${record.row} c07`,
      });
    }
    if (record.t && record.t.toLowerCase().includes(q)) {
      push({
        label: record.t,
        kind: 'finalType',
        groupCode: record.g ?? undefined,
        priznak1: record.p1 ?? undefined,
        finalType: record.t,
        source: `${classifierRuntime.source.sheet} r${record.row} c11`,
      });
    }
  }

  return hits.slice(0, limit);
}

export function resolveLabel(label: string): ClassifierFilter | null {
  const exactGroup = classifierRuntime.groups.find((item) => item.title === label);
  if (exactGroup) {
    return { groupCode: exactGroup.code };
  }
  const alias = SEARCH_ALIASES.find((item) => item.tokens.includes(norm(label)));
  if (alias) {
    const group = classifierRuntime.groups.find((item) => item.title === alias.groupTitle);
    if (group) {
      return { groupCode: group.code };
    }
  }
  const p1Hit = visibleRecords().find((item) => item.p1 === label);
  if (p1Hit) {
    return { groupCode: p1Hit.g, priznak1: p1Hit.p1 };
  }
  const finalHit = visibleRecords().find((item) => item.t === label);
  if (finalHit) {
    return {
      groupCode: finalHit.g,
      priznak1: finalHit.p1,
      priznak2: finalHit.p2 ? [finalHit.p2] : [],
      priznak3: finalHit.p3 ? [finalHit.p3] : [],
      finalType: finalHit.t,
    };
  }
  return null;
}

function conditionAllowed(condition: string, flags: ServiceFlags): boolean {
  switch (condition) {
    case 'ND':
      return flags.noAccess;
    case 'UL':
      return flags.threatToPeople;
    case 'PP':
      return flags.victims;
    case 'victims':
      return flags.victims;
    case 'not-on-scene':
      return flags.notOnScene;
    case 'offense':
      return flags.offense;
    case 'gasification':
      return flags.gasification;
    case 'road-blocked':
      return flags.roadBlocked;
    case 'default':
    case 'unconditioned':
      return true;
    default:
      return true;
  }
}

function mainDisplayName(code: string | null): string | null {
  if (!code) {
    return null;
  }
  const block = classifierRuntime.mainServiceBlocks[code];
  if (!block) {
    return null;
  }
  const column = classifierRuntime.serviceColumns.find((item) => item.parentBlock.startsWith(block));
  return column?.displayName ?? block;
}

export function assignedServices(records: ClassifierRuntimeRecord[], flags: ServiceFlags): AssignedService[] {
  if (records.length === 0) {
    return [];
  }
  const columns = new Map(classifierRuntime.serviceColumns.map((item) => [item.key, item]));
  const perRecord = records.map((record) => {
    const byName = new Map<string, Array<{ col: ClassifierServiceColumn; kind: 'd' | 'n'; value: string }>>();
    for (const cell of record.sv) {
      const col = columns.get(cell.c);
      if (!col || !conditionAllowed(col.condition, flags)) {
        continue;
      }
      const list = byName.get(col.displayName) ?? [];
      list.push({ col, kind: cell.k, value: cell.v });
      byName.set(col.displayName, list);
    }
    return { record, byName };
  });

  const names = [...perRecord[0].byName.keys()].filter((name) => perRecord.every((item) => item.byName.has(name)));
  const mainNames = new Set(
    records.map((item) => mainDisplayName(item.m)).filter((item): item is string => Boolean(item)),
  );
  const singleMain = mainNames.size === 1 ? [...mainNames][0] : null;

  return names.map((name) => {
    const sourceColumns: string[] = [];
    const sourceRows: number[] = [];
    let kind: 'dispatch' | 'notify' = 'notify';
    for (const item of perRecord) {
      const cells = item.byName.get(name) ?? [];
      if (cells.some((cell) => cell.kind === 'd')) {
        kind = 'dispatch';
      }
      sourceRows.push(item.record.row);
      for (const cell of cells) {
        sourceColumns.push(cell.col.key);
      }
    }
    return {
      name,
      autoAssigned: true,
      visMark: false as const,
      isMainForType: singleMain === name,
      kind,
      sourceColumns: [...new Set(sourceColumns)],
      sourceRows: [...new Set(sourceRows)],
    };
  });
}

export function uniqueServiceCatalog(): Array<{ name: string; source: string }> {
  const map = new Map<string, string>();
  for (const col of classifierRuntime.serviceColumns) {
    if (!map.has(col.displayName)) {
      map.set(col.displayName, col.displayNameSource);
    }
  }
  return [...map.entries()].map(([name, source]) => ({ name, source }));
}

export function exactPriznakMatch(label: string, options: string[]): string | null {
  const found = options.find((item) => norm(item) === norm(label));
  return found ?? null;
}
