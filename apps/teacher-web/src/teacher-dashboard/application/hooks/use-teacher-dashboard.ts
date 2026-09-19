import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InterventionType } from '@sys112/shared-types';
import type { TeacherDashboardRepository } from '../ports/teacher-dashboard-repository';
import type {
  ActiveSession,
  AuditRecord,
  CompletedResult,
  DashboardSnapshot,
  Scenario,
  ScenarioDraft,
  TrainingMaterial,
} from '../../domain/entities';

export interface DashboardState {
  snapshot: DashboardSnapshot | null;
  sessions: ActiveSession[];
  scenarios: Scenario[];
  materials: TrainingMaterial[];
  results: CompletedResult[];
  audit: AuditRecord[];
  loading: boolean;
  error: string | null;
}

export function useTeacherDashboard(repository: TeacherDashboardRepository) {
  const [state, setState] = useState<DashboardState>({
    snapshot: null,
    sessions: [],
    scenarios: [],
    materials: [],
    results: [],
    audit: [],
    loading: true,
    error: null,
  });
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [snapshot, sessions, scenarios, materials, results, audit] = await Promise.all([
        repository.getDashboardSnapshot(),
        repository.getActiveSessions(),
        repository.getScenarios(),
        repository.getMaterials(),
        repository.getResults(),
        repository.getAudit(),
      ]);
      setState({
        snapshot,
        sessions,
        scenarios,
        materials,
        results,
        audit,
        loading: false,
        error: null,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Не удалось загрузить панель',
      }));
    }
  }, [repository]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const operations = useMemo(
    () => ({
      saveScenario: async (draft: ScenarioDraft) => {
        const saved = await repository.saveScenario(draft);
        setState((current) => ({
          ...current,
          scenarios: current.scenarios.some((item) => item.id === saved.id)
            ? current.scenarios.map((item) => (item.id === saved.id ? saved : item))
            : [...current.scenarios, saved],
        }));
        setNotice('Сценарий сохранён только в памяти');
      },
      toggleArchive: async (id: string, archived: boolean) => {
        const saved = await repository.setScenarioArchived(id, archived);
        setState((current) => ({
          ...current,
          scenarios: current.scenarios.map((item) => (item.id === id ? saved : item)),
        }));
        setNotice(
          archived ? 'Сценарий архивирован в mock-хранилище' : 'Сценарий восстановлен как черновик',
        );
      },
      intervene: async (callId: string, type: InterventionType, note: string) => {
        const saved = await repository.applyIntervention({ callId, type, note });
        setState((current) => ({
          ...current,
          sessions: current.sessions.map((item) => (item.callId === callId ? saved : item)),
        }));
        setNotice('Mock-вмешательство добавлено в ленту');
      },
      saveComment: async (resultId: string, comment: string) => {
        const saved = await repository.saveExpertComment(resultId, comment);
        setState((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === resultId ? saved : item)),
        }));
        setNotice('Комментарий сохранён в памяти');
      },
      adjustScore: async (resultId: string, score: number, reason: string) => {
        const saved = await repository.adjustExpertScore(resultId, score, reason);
        const audit = await repository.getAudit();
        setState((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === resultId ? saved : item)),
          audit,
        }));
        setNotice('Оценка скорректирована; создана mock-запись аудита');
      },
    }),
    [repository],
  );

  return { state, notice, retry: load, ...operations };
}
