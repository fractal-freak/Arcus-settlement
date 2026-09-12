import { plainTask } from './journalData.js';
/** Public simulation assignments; no private sessions or invented progress. */
export function citizenProject(resident = {}) {
  if (typeof resident.want !== 'string' || !resident.want.trim()) return null;
  const progress = Number.isFinite(resident.progress) ? Math.max(0, Math.min(1, resident.progress)) : 0;
  return {
    task: plainTask(resident.want),
    dimension: resident.dim || 'village',
    progress,
    percent: Math.floor(progress * 100),
    finished: Number.isFinite(resident.finished) ? Math.max(0, Math.floor(resident.finished)) : 0,
  };
}
