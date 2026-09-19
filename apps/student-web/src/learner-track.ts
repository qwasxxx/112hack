export type LearnerTrack = 'operator112' | 'dds';

export const LEARNER_TRACK_LABEL: Record<LearnerTrack, string> = {
  operator112: 'Оператор 112',
  dds: 'Диспетчер ДДС',
};

const STORAGE_KEY = 'sys112.learnerTrack';

export function readLearnerTrack(): LearnerTrack {
  if (typeof localStorage === 'undefined') {
    return 'operator112';
  }
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dds' ? 'dds' : 'operator112';
  } catch {
    return 'operator112';
  }
}

export function writeLearnerTrack(track: LearnerTrack): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, track);
}
