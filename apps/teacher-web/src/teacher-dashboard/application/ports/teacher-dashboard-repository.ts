import type {
  ActiveSession,
  AuditRecord,
  CompletedResult,
  DashboardSnapshot,
  InterventionInput,
  Scenario,
  ScenarioDraft,
  TrainingMaterial,
} from '../../domain/entities';

export interface TeacherDashboardRepository {
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
  getActiveSessions(): Promise<ActiveSession[]>;
  getSession(callId: string): Promise<ActiveSession | null>;
  getScenarios(): Promise<Scenario[]>;
  getMaterials(): Promise<TrainingMaterial[]>;
  saveScenario(draft: ScenarioDraft): Promise<Scenario>;
  setScenarioArchived(id: string, archived: boolean): Promise<Scenario>;
  getResults(): Promise<CompletedResult[]>;
  saveExpertComment(resultId: string, comment: string): Promise<CompletedResult>;
  adjustExpertScore(resultId: string, score: number, reason: string): Promise<CompletedResult>;
  applyIntervention(input: InterventionInput): Promise<ActiveSession>;
  getAudit(): Promise<AuditRecord[]>;
  watch?(onChange: () => void): () => void;
}
