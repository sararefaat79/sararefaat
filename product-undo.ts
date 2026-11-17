import type { Product } from '../types/hub';

export interface ProductUndoSnapshot {
  snapshotId: string;
  productId: string;
  productNameAr: string;
  savedAt: string;
  summary: string;
  previousProduct: Product;
}

const UNDO_HISTORY_KEY = 'mashaer_product_undo_v1';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return null;
}

export function loadUndoSnapshots(productId?: string): ProductUndoSnapshot[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(UNDO_HISTORY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ProductUndoSnapshot[];
    if (!Array.isArray(list)) return [];
    return productId ? list.filter((item) => item.productId === productId) : list;
  } catch {
    return [];
  }
}

export function pushUndoSnapshot(product: Product, summary: string): ProductUndoSnapshot {
  const snapshot: ProductUndoSnapshot = {
    snapshotId: `undo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    productId: product.id,
    productNameAr: product.nameAr,
    savedAt: new Date().toISOString(),
    summary,
    previousProduct: JSON.parse(JSON.stringify(product)) as Product,
  };

  const storage = getStorage();
  if (storage) {
    try {
      const existing = loadUndoSnapshots();
      const updated = [snapshot, ...existing].slice(0, 25);
      storage.setItem(UNDO_HISTORY_KEY, JSON.stringify(updated));
    } catch {
      // Non-fatal
    }
  }
  return snapshot;
}

export function removeUndoSnapshot(snapshotId: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const existing = loadUndoSnapshots();
    storage.setItem(
      UNDO_HISTORY_KEY,
      JSON.stringify(existing.filter((item) => item.snapshotId !== snapshotId))
    );
  } catch {
    // Non-fatal
  }
}
