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

export function useTeacherDashboard(repository: TeacherDashboardRepository, pollMs?: number) {
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

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }
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
    if (!pollMs) {
      return;
    }
    const timer = window.setInterval(() => {
      void load(true);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [load, pollMs]);
  useEffect(() => {
    let timer = 0;
    const stop = repository.watch?.(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void load(true);
      }, 200);
    });
    return () => {
      window.clearTimeout(timer);
      stop?.();
    };
  }, [load, repository]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const operations = useMemo(
    () => ({
      saveScenario: async (draft: ScenarioDraft) => {
        try {
          const saved = await repository.saveScenario(draft);
          setState((current) => ({
            ...current,
            scenarios: current.scenarios.some((item) => item.id === saved.id)
              ? current.scenarios.map((item) => (item.id === saved.id ? saved : item))
              : [...current.scenarios, saved],
          }));
          setNotice('Билет сохранён и доступен ученикам');
          return saved;
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Не удалось назначить билет');
        }
      },
      importCatalog: async (raw: string) => {
        if (!repository.importCatalog) {
          setNotice('Импорт недоступен в этом режиме');
          return;
        }
        try {
          const result = await repository.importCatalog(raw);
          const scenarios = await repository.getScenarios();
          setState((current) => ({ ...current, scenarios }));
          setNotice(`Импорт: +${result.added}, обновлено ${result.updated}`);
          return result;
        } catch (error) {
          setNotice(error instanceof Error ? error.message : 'Не удалось импортировать файл');
        }
      },
      deleteScenario: async (id: string) => {
        await repository.deleteScenario(id);
        setState((current) => ({
          ...current,
          scenarios: current.scenarios.filter((item) => item.id !== id),
        }));
        setNotice('Билет удалён');
      },
      deleteResult: async (id: string) => {
        await repository.deleteResult(id);
        setState((current) => ({
          ...current,
          results: current.results.filter((item) => item.id !== id),
        }));
        setNotice('Попытка удалена из списка');
      },
      toggleArchive: async (id: string, archived: boolean) => {
        const saved = await repository.setScenarioArchived(id, archived);
        setState((current) => ({
          ...current,
          scenarios: current.scenarios.map((item) => (item.id === id ? saved : item)),
        }));
        setNotice(archived ? 'Билет снят с назначения' : 'Билет назначен ученикам');
      },
      intervene: async (callId: string, type: InterventionType, note: string) => {
        const saved = await repository.applyIntervention({ callId, type, note });
        setState((current) => ({
          ...current,
          sessions: current.sessions.map((item) => (item.callId === callId ? saved : item)),
        }));
        setNotice('Указание отправлено ученику');
      },
      saveComment: async (resultId: string, comment: string) => {
        const saved = await repository.saveExpertComment(resultId, comment);
        setState((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === resultId ? saved : item)),
        }));
          setNotice('Комментарий сохранён');
      },
      adjustScore: async (resultId: string, score: number, reason: string) => {
        const saved = await repository.adjustExpertScore(resultId, score, reason);
        const audit = await repository.getAudit();
        setState((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === resultId ? saved : item)),
          audit,
        }));
        setNotice('Оценка скорректирована, запись аудита сохранена');
      },
    }),
    [repository],
  );

  return { state, notice, retry: load, ...operations };
}
