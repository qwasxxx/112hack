import {
  ADMIN_AUDIT_STORE,
  ADMIN_BACKUPS_STORE,
  ADMIN_SERVICES_STORE,
  ADMIN_SETTINGS_STORE,
  ADMIN_TRAINING_STORE,
  SYS112_DB_NAME,
  USERS_STORE,
  openSys112Db,
  putInStore,
  readAllFromStore,
  writeAllToStore,
} from '../../local-db/open';
import {
  INITIAL_AUDIT,
  INITIAL_BACKUPS,
  INITIAL_PROGRESS,
  INITIAL_SERVICES,
  INITIAL_SETTINGS,
  type AuditEntry,
  type BackupRecord,
  type ContourSettings,
  type ServiceRecord,
  type StudentProgress,
} from './admin';

export type AdminSystemState = {
  services: ServiceRecord[];
  settings: ContourSettings;
  audit: AuditEntry[];
  backups: BackupRecord[];
  progress: StudentProgress[];
  auditLive: boolean;
  backupsLive: boolean;
  progressLive: boolean;
};

export type LocalPersistenceStats = {
  online: boolean;
  persistence: 'IndexedDB';
  dbName: string;
  userCount: number;
  auditCount: number;
  backupCount: number;
};

function normalizeService(row: ServiceRecord): ServiceRecord {
  return {
    ...row,
    lastChangeAt: row.lastChangeAt || row.startedAt || INITIAL_SETTINGS.lastBackupAt,
    startedAt: row.running ? row.startedAt || row.lastChangeAt : undefined,
  };
}

function normalizeAudit(row: AuditEntry): AuditEntry {
  return {
    ...row,
    eventType: row.eventType ?? 'login',
    details: row.details ?? row.target,
    severity: row.severity ?? 'info',
    actorId: row.actorId,
    actorLogin: row.actorLogin,
  };
}

function normalizeSettings(row: Partial<ContourSettings> | undefined): ContourSettings {
  return {
    ...INITIAL_SETTINGS,
    ...row,
    id: 'contour',
    lastBackupStatus: row?.lastBackupStatus ?? INITIAL_SETTINGS.lastBackupStatus,
  };
}

export async function probeLocalDatabase(): Promise<boolean> {
  try {
    const db = await openSys112Db();
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadLocalPersistenceStats(): Promise<LocalPersistenceStats> {
  const online = await probeLocalDatabase();
  if (!online) {
    return {
      online: false,
      persistence: 'IndexedDB',
      dbName: SYS112_DB_NAME,
      userCount: 0,
      auditCount: 0,
      backupCount: 0,
    };
  }
  const [users, audit, backups] = await Promise.all([
    readAllFromStore<{ id: string }>(USERS_STORE),
    readAllFromStore<AuditEntry>(ADMIN_AUDIT_STORE),
    readAllFromStore<BackupRecord>(ADMIN_BACKUPS_STORE),
  ]);
  return {
    online: true,
    persistence: 'IndexedDB',
    dbName: SYS112_DB_NAME,
    userCount: users.length,
    auditCount: audit.length,
    backupCount: backups.length,
  };
}

export async function loadAdminSystemState(): Promise<AdminSystemState> {
  const [services, settingsRows, audit, backups, progress] = await Promise.all([
    readAllFromStore<ServiceRecord>(ADMIN_SERVICES_STORE),
    readAllFromStore<ContourSettings>(ADMIN_SETTINGS_STORE),
    readAllFromStore<AuditEntry>(ADMIN_AUDIT_STORE),
    readAllFromStore<BackupRecord>(ADMIN_BACKUPS_STORE),
    readAllFromStore<StudentProgress>(ADMIN_TRAINING_STORE),
  ]);

  const state: AdminSystemState = {
    services: (services.length > 0 ? services : INITIAL_SERVICES).map(normalizeService),
    settings: normalizeSettings(settingsRows[0]),
    audit: (audit.length > 0 ? audit : INITIAL_AUDIT)
      .map(normalizeAudit)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    backups: (backups.length > 0 ? backups : INITIAL_BACKUPS).sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    ),
    // Real rows from adminTraining replace the seed automatically once anything is stored.
    progress: progress.length > 0 ? progress : INITIAL_PROGRESS,
    auditLive: audit.length > 0,
    backupsLive: backups.length > 0,
    progressLive: progress.length > 0,
  };

  if (services.length === 0) {
    await persistServices(state.services);
  }
  if (settingsRows.length === 0) {
    await persistSettings(state.settings);
  }
  return state;
}

export async function persistAdminSystemState(state: AdminSystemState): Promise<void> {
  await Promise.all([
    writeAllToStore(ADMIN_SERVICES_STORE, state.services),
    writeAllToStore(ADMIN_SETTINGS_STORE, [state.settings]),
    writeAllToStore(ADMIN_AUDIT_STORE, state.audit),
    writeAllToStore(ADMIN_BACKUPS_STORE, state.backups),
    writeAllToStore(ADMIN_TRAINING_STORE, state.progress),
  ]);
}

export async function persistServices(services: ServiceRecord[]): Promise<void> {
  await writeAllToStore(ADMIN_SERVICES_STORE, services);
}

export async function persistService(service: ServiceRecord): Promise<void> {
  await putInStore(ADMIN_SERVICES_STORE, service);
}

export async function persistSettings(settings: ContourSettings): Promise<void> {
  await writeAllToStore(ADMIN_SETTINGS_STORE, [settings]);
}

export async function persistAudit(audit: AuditEntry[]): Promise<void> {
  await writeAllToStore(ADMIN_AUDIT_STORE, audit);
}

/** Append one event without clearing the store — safe for parallel Users-agent writes. */
export async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  await putInStore(ADMIN_AUDIT_STORE, entry);
}

export async function persistBackups(backups: BackupRecord[]): Promise<void> {
  await writeAllToStore(ADMIN_BACKUPS_STORE, backups);
}

export async function persistBackup(backup: BackupRecord): Promise<void> {
  await putInStore(ADMIN_BACKUPS_STORE, backup);
}

export async function persistTraining(progress: StudentProgress[]): Promise<void> {
  await writeAllToStore(ADMIN_TRAINING_STORE, progress);
}
