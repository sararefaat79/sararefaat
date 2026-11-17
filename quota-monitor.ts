import type { QuotaStats } from '../types/hub';

export const SPARK_FREE_LIMITS = {
  dailyReads: 50000,
  dailyWrites: 20000,
  dailyDeletes: 20000,
  storageBytes: 1024 * 1024 * 1024, // 1 GiB
} as const;

type QuotaListener = (stats: QuotaStats) => void;

const state: QuotaStats = {
  sessionReads: 0,
  sessionWrites: 0,
  sessionDeletes: 0,
  estimatedTotalDocs: 0,
  lastUpdatedAt: new Date().toISOString(),
};

const listeners = new Set<QuotaListener>();

function emit(): void {
  state.lastUpdatedAt = new Date().toISOString();
  const snapshot = { ...state };
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // ignore listener errors
    }
  });
}

export function trackRead(count = 1): void {
  if (count <= 0) return;
  state.sessionReads += count;
  emit();
}

export function trackWrite(count = 1): void {
  if (count <= 0) return;
  state.sessionWrites += count;
  emit();
}

export function trackDelete(count = 1): void {
  if (count <= 0) return;
  state.sessionDeletes += count;
  emit();
}

export function setEstimatedTotalDocs(total: number): void {
  if (total === state.estimatedTotalDocs) return;
  state.estimatedTotalDocs = Math.max(0, total);
  emit();
}

export function getQuotaStats(): QuotaStats {
  return { ...state };
}

export function subscribeQuota(listener: QuotaListener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}
