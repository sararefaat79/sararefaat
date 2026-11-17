import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CopyCheck,
  DatabaseZap,
  Download,
  Eye,
  FlaskConical,
  History,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  executeSafeProductsMigration,
  formatFirestoreDate,
  runIsolatedProductProbeTestSuite,
  runLiveProductsIntegrityDryRun,
  saveProduct,
  type ProductMigrationExecutionReport,
  type ProductProbeTestSuiteResult,
} from '../../../lib/firestore-service';
import {
  downloadBackupJson,
  exportFullBackupFromFirestore,
  type HubBackupPayload,
} from '../../../lib/backup';
import { parseFriendlyFirestoreError } from '../../../lib/firebase';
import type { CatalogIntegrityDryRunReport } from '../../../lib/product-integrity';
import {
  loadUndoSnapshots,
  removeUndoSnapshot,
  type ProductUndoSnapshot,
} from '../../../lib/product-undo';
import { detectCatalogAnomalies } from '../../../lib/product-utils';
import type { AuditLog, Product } from '../../../types/hub';

interface CatalogHealthModalProps {
  open: boolean;
  initialTab?: 'anomalies' | 'history' | 'integrity';
  products: Product[];
  auditLogs: AuditLog[];
  isSensitiveAdmin: boolean;
  onClose: () => void;
  onOpenDetails: (p: Product) => void;
  onEdit: (p: Product) => void;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
  onRunTrackedMutation: <T>(fn: () => Promise<T>) => Promise<T>;
}

export function CatalogHealthModal({
  open,
  initialTab = 'anomalies',
  products,
  auditLogs,
  isSensitiveAdmin,
  onClose,
  onOpenDetails,
  onEdit,
  onNotify,
  onRunTrackedMutation,
}: CatalogHealthModalProps) {
  const [tab, setTab] = useState<'anomalies' | 'history' | 'integrity'>(initialTab);
  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);
  const [undoVersion, setUndoVersion] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Live Firestore Integrity Audit, Dry Run, Recoverable Backup, Safe Migration & Isolated Probe Tests
  const [auditingLive, setAuditingLive] = useState(false);
  const [dryRunReport, setDryRunReport] = useState<CatalogIntegrityDryRunReport | null>(null);
  const [rawBackupDocs, setRawBackupDocs] = useState<Array<{ id: string; data: Record<string, unknown> }>>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [backupCompletedThisSession, setBackupCompletedThisSession] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState<ProductMigrationExecutionReport | null>(null);
  const [runningProbeSuite, setRunningProbeSuite] = useState(false);
  const [probeSuiteResult, setProbeSuiteResult] = useState<ProductProbeTestSuiteResult | null>(null);

  const report = useMemo(() => detectCatalogAnomalies(products), [products]);
  const undoSnapshots = useMemo(() => loadUndoSnapshots(), [open, undoVersion]);
  const productAuditLogs = useMemo(
    () => auditLogs.filter((log) => log.section === 'دليل المنتجات').slice(0, 30),
    [auditLogs]
  );

  if (!open) return null;

  const serializeRawValue = (val: unknown): unknown => {
    if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
      return (val as { toDate: () => Date }).toDate().toISOString();
    }
    return val;
  };

  const handleRunDryRunAudit = async () => {
    setAuditingLive(true);
    setMigrationReport(null);
    try {
      const res = await runLiveProductsIntegrityDryRun();
      setDryRunReport(res.report);
      setRawBackupDocs(res.rawDocs);
      if (res.report.needingCleanupDocs === 0) {
        onNotify('success', `جميع مستندات المنتجات الحية (${res.report.totalDocs}) سليمة ومطابقة لقواعد Firestore.`);
      } else {
        onNotify(
          'info',
          `تم فحص ${res.report.totalDocs} مستنداً: ${res.report.needingCleanupDocs} مستند يحتاج معالجة أو تنظيف حقول قديمة.`
        );
      }
    } catch (err) {
      onNotify('error', parseFriendlyFirestoreError(err));
    } finally {
      setAuditingLive(false);
    }
  };

  const handleDownloadProductsBackup = async () => {
    setBackingUp(true);
    try {
      if (isSensitiveAdmin) {
        const { payload } = await exportFullBackupFromFirestore(['products'], { isPreRestoreSnapshot: true });
        downloadBackupJson(payload, 'mashaer-products-pre-migration');
      } else {
        const docsToSave =
          rawBackupDocs.length > 0 ? rawBackupDocs : (await runLiveProductsIntegrityDryRun()).rawDocs;
        const payload: HubBackupPayload = {
          schemaVersion: '3.0',
          systemName: 'مشاعر | Mashaer Customer Care Hub',
          exportedAt: new Date().toISOString(),
          exportedBy: 'admin',
          includesAuthPasswords: false,
          selectedCollections: ['products'],
          note: 'نسخة احتياطية كاملة لمجموعة products قبل أي ترحيل أو تنظيف حقول قديمة.',
          collections: {
            products: docsToSave.map((d) => ({
              id: d.id,
              data: Object.fromEntries(
                Object.entries(d.data).map(([k, v]) => [k, serializeRawValue(v)])
              ),
            })),
          },
        };
        downloadBackupJson(payload, 'mashaer-products-pre-migration');
      }
      setBackupCompletedThisSession(true);
      onNotify('success', 'تم إنشاء وتنزيل النسخة الاحتياطية الكاملة للمنتجات بنجاح.');
    } catch (err) {
      onNotify('error', parseFriendlyFirestoreError(err));
    } finally {
      setBackingUp(false);
    }
  };

  const handleExecuteSafeMigration = async () => {
    if (!backupCompletedThisSession || migrating) return;
    setMigrating(true);
    try {
      const res = await onRunTrackedMutation(() => executeSafeProductsMigration());
      setMigrationReport(res);
      const refreshed = await runLiveProductsIntegrityDryRun();
      setDryRunReport(refreshed.report);
      setRawBackupDocs(refreshed.rawDocs);
      if (res.failedDocs.length > 0) {
        onNotify(
          'error',
          `تم ترحيل ${res.updatedCount} مستند مع تعذر ${res.failedDocs.length} مستند. راجع التفاصيل أدناه.`
        );
      } else if (res.updatedCount > 0) {
        onNotify('success', `تم ترحيل وتوحيد ${res.verifiedCount} منتج بنجاح وتأكيد مطابقتها من الخادم.`);
      } else {
        onNotify('info', 'لا توجد مستندات تحتاج إلى ترحيل.');
      }
    } catch (err) {
      onNotify('error', parseFriendlyFirestoreError(err));
    } finally {
      setMigrating(false);
    }
  };

  const handleRunProbeTestSuite = async () => {
    setRunningProbeSuite(true);
    try {
      const res = await onRunTrackedMutation(() => runIsolatedProductProbeTestSuite());
      setProbeSuiteResult(res);
      if (res.allPassed) {
        onNotify('success', 'نجحت جميع اختبارات الحفظ والقراءة والتنظيف المعزولة (7/7) في Firestore.');
      } else {
        onNotify('error', 'فشل أحد اختبارات التحقق المعزولة — راجع النتيجة التفصيلية.');
      }
    } catch (err) {
      onNotify('error', parseFriendlyFirestoreError(err));
    } finally {
      setRunningProbeSuite(false);
    }
  };

  const handleRestoreSnapshot = async (snap: ProductUndoSnapshot) => {
    const currentProd = products.find((p) => p.id === snap.productId);
    if (!currentProd) {
      onNotify('error', 'لم يعد هذا المنتج موجوداً في الدليل لاستعادة نسخته.');
      return;
    }

    setRestoringId(snap.snapshotId);
    try {
      const prev = snap.previousProduct;
      await onRunTrackedMutation(() =>
        saveProduct(
          {
            sku: prev.sku || '',
            nameAr: prev.nameAr,
            nameEn: prev.nameEn || '',
            category: prev.category,
            officialDescription: prev.officialDescription,
            fragranceFamily: prev.fragranceFamily || '',
            fragranceCharacter: prev.fragranceCharacter || '',
            perfumeType: prev.perfumeType || '',
            sillage: prev.sillage || '',
            longevity: prev.longevity || '',
            occasionUsage: prev.occasionUsage || '',
            seasons: prev.seasons || '',
            notesAndIngredients: prev.notesAndIngredients || '',
            topNotes: prev.topNotes || '',
            heartNotes: prev.heartNotes || '',
            baseNotes: prev.baseNotes || '',
            size: prev.size || '',
            availability: prev.availability || '',
            usageInstructions: prev.usageInstructions || '',
            extraInfo: prev.extraInfo || '',
            internalNotes: prev.internalNotes || '',
            companionGift: prev.companionGift ?? null,
            countryPrices: prev.countryPrices,
            priceHistory: prev.priceHistory,
            manuallyEditedFields: prev.manuallyEditedFields || [],
            syncConflictNote: prev.syncConflictNote || '',
            lastSyncedAt: prev.lastSyncedAt,
            syncStatus: prev.syncStatus || 'restored_undo',
            reviewStatus: prev.reviewStatus,
            sourceUrl: prev.sourceUrl || '',
            sortOrder: prev.sortOrder,
          },
          currentProd,
          { forceOverwrite: true, preserveExplicitManualFields: true }
        )
      );
      removeUndoSnapshot(snap.snapshotId);
      setUndoVersion((v) => v + 1);
      onNotify('success', `تم التراجع واستعادة النسخة السابقة من «${snap.productNameAr}».`);
    } catch (err) {
      onNotify('error', parseFriendlyFirestoreError(err));
    } finally {
      setRestoringId(null);
    }
  };

  const totalAnomalies = report.duplicates.length + report.conflicts.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-health-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] shadow-2xl">
        <div className="sticky top-0 z-10 bg-gradient-to-l from-[var(--hub-sidebar-alt)] via-[var(--hub-sidebar)] to-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)] px-5 sm:px-6 py-4 border-b-2 border-[var(--hub-sidebar-accent)]/50 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[var(--hub-sidebar-accent)] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>أدوات تدقيق الدليل وحماية التعديلات</span>
            </div>
            <h2 id="catalog-health-modal-title" className="font-display text-lg sm:text-xl font-bold">
              فحص المكررات والتعارضات وسجل التراجع
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--hub-sidebar-text)]/80 hover:bg-white/10 hover:text-[var(--hub-sidebar-text)] cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-[var(--hub-border)] pb-3">
            <button
              type="button"
              onClick={() => setTab('anomalies')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                tab === 'anomalies'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-border)]'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>المكررات والتعارضات ({totalAnomalies})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                tab === 'history'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-border)]'
              }`}
            >
              <History className="w-4 h-4" />
              <span>التراجع عن التعديلات والسجل ({undoSnapshots.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('integrity')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer ${
                tab === 'integrity'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-border)]'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>فحص النزاهة والترحيل (Dry Run)</span>
            </button>
          </div>

          {tab === 'anomalies' ? (
            <div className="space-y-5">
              {totalAnomalies === 0 ? (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-6 text-center space-y-1 text-emerald-900 dark:text-emerald-200">
                  <CopyCheck className="w-6 h-6 mx-auto text-emerald-600 dark:text-emerald-400" />
                  <div className="font-bold text-sm">الدليل سليم ولا توجد منتجات مكررة أو تعارضات بيانات حالياً.</div>
                  <div className="text-xs opacity-80">تم فحص SKU، الأسماء العربية، الروابط الرسمية، حالة التوفر والأسعار.</div>
                </div>
              ) : (
                <>
                  {report.duplicates.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-sm font-bold text-[var(--hub-heading)]">
                        منتجات مكررة محتملة ({report.duplicates.length})
                      </h3>
                      <div className="space-y-2">
                        {report.duplicates.map((dup, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3.5 space-y-2 text-xs"
                          >
                            <div className="font-bold text-amber-900 dark:text-amber-200">
                              {dup.reason}: <span dir="ltr">{dup.matchKey}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {dup.products.map((p) => (
                                <div
                                  key={p.id}
                                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5"
                                >
                                  <span className="font-semibold text-[var(--hub-heading)]">{p.nameAr}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onOpenDetails(p);
                                    }}
                                    className="text-[var(--hub-accent)] hover:underline cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>عرض</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      onEdit(p);
                                    }}
                                    className="text-[var(--hub-heading)] hover:underline cursor-pointer inline-flex items-center gap-1"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    <span>تعديل</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.conflicts.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-sm font-bold text-[var(--hub-heading)]">
                        تعارضات وملاحظات مراجعة ({report.conflicts.length})
                      </h3>
                      <div className="space-y-2">
                        {report.conflicts.map((issue, idx) => (
                          <div
                            key={idx}
                            className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
                              issue.severity === 'error'
                                ? 'border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30 text-red-950 dark:text-red-200'
                                : 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200'
                            }`}
                          >
                            <div className="space-y-0.5 flex-1 min-w-[220px]">
                              <div className="font-bold">{issue.product.nameAr}</div>
                              <div className="leading-relaxed">{issue.message}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenDetails(issue.product);
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] font-semibold text-[var(--hub-heading)] cursor-pointer"
                              >
                                التفاصيل
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onEdit(issue.product);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] font-semibold cursor-pointer"
                              >
                                معالجة وتعديل
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : tab === 'history' ? (
            <div className="space-y-5">
              {/* Local Undo Snapshots */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold text-[var(--hub-heading)]">
                  لقطات التراجع السريع عن التعديلات الأخيرة
                </h3>
                {undoSnapshots.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--hub-border)] p-5 text-center text-xs text-[var(--hub-muted)]">
                    تُحفظ هنا نسخة احتياطية تلقائية قبل كل حفظ أو تعديل لتتمكن من التراجع الفوري.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {undoSnapshots.map((snap) => (
                      <div
                        key={snap.snapshotId}
                        className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-[var(--hub-heading)]">
                            {snap.productNameAr} · <span className="text-[var(--hub-accent)]">{snap.summary}</span>
                          </div>
                          <div className="text-[11px] text-[var(--hub-muted)] tabular-nums">
                            النسخة المحفوظة قبل تعديل: {new Date(snap.savedAt).toLocaleString('ar-KW')}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={restoringId === snap.snapshotId}
                          onClick={() => handleRestoreSnapshot(snap)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>
                            {restoringId === snap.snapshotId ? 'جاري الاستعادة...' : 'تراجع واستعادة هذه النسخة'}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cloud Audit Trail (Sensitive Admins) */}
              {isSensitiveAdmin && (
                <div className="space-y-2.5 pt-2 border-t border-[var(--hub-border)]">
                  <h3 className="text-sm font-bold text-[var(--hub-heading)]">
                    سجل التعديلات السحابي لدليل المنتجات
                  </h3>
                  {productAuditLogs.length === 0 ? (
                    <div className="text-xs text-[var(--hub-muted)]">لا توجد عمليات مسجلة حديثاً على المنتجات.</div>
                  ) : (
                    <div className="space-y-1.5 text-xs max-h-60 overflow-y-auto">
                      {productAuditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <strong className="text-[var(--hub-heading)]">{log.itemName}</strong>
                            <span className="text-[var(--hub-muted)] mr-1.5">({log.actionType})</span>
                            <span className="text-[var(--hub-accent)] mr-1.5">بواسطة {log.actorEmail}</span>
                            {log.summary && (
                              <span className="text-[var(--hub-text)] mr-1.5">— {log.summary}</span>
                            )}
                          </div>
                          <span className="text-[11px] text-[var(--hub-muted)] tabular-nums">
                            {formatFirestoreDate(log.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Step 1: Read-Only Live Dry Run Audit + Step 2: Recoverable Backup + Step 3: Explicit Safe Migration */}
              <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[var(--hub-heading)]">
                    تدقيق النزاهة الشامل لمستندات Firestore الحية (Dry Run &amp; Safe Migration)
                  </h3>
                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    يفحص هذا المعالج جميع مستندات <span dir="ltr">products</span> على الخادم مباشرة مقارنة بقواعد الأمان دون تعديل أي سجل، ويتيح تنزيل نسخة احتياطية كاملة قبل تنفيذ أي ترحيل آمن للحقول القديمة.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={auditingLive}
                    onClick={handleRunDryRunAudit}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--hub-button)] text-[var(--hub-button-text)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{auditingLive ? 'جاري الفحص المباشر...' : '1. تشغيل فحص Dry Run (قراءة فقط)'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={backingUp}
                    onClick={handleDownloadProductsBackup}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-heading)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 text-[var(--hub-accent)]" />
                    <span>
                      {backingUp
                        ? 'جاري التصدير...'
                        : backupCompletedThisSession
                          ? 'تم حفظ النسخة الاحتياطية (تنزيل مجدداً)'
                          : '2. تنزيل نسخة احتياطية كاملة (JSON)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      migrating ||
                      !backupCompletedThisSession ||
                      !dryRunReport ||
                      dryRunReport.needingCleanupDocs === 0
                    }
                    onClick={handleExecuteSafeMigration}
                    title={
                      !backupCompletedThisSession
                        ? 'يجب تنزيل النسخة الاحتياطية أولاً قبل تفعيل الترحيل الآمن'
                        : 'تنفيذ الترحيل الآمن للمستندات المتأثرة فقط'
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-500/50 bg-emerald-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    <DatabaseZap className="w-4 h-4" />
                    <span>{migrating ? 'جاري الترحيل والتحقق...' : '3. تنفيذ الترحيل الآمن بعد النسخ الاحتياطي'}</span>
                  </button>
                </div>

                {dryRunReport && (
                  <div className="space-y-3 pt-2 border-t border-[var(--hub-border)]">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
                      <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-2.5">
                        <div className="text-[var(--hub-muted)]">إجمالي المستندات</div>
                        <div className="text-base font-bold text-[var(--hub-heading)]">{dryRunReport.totalDocs}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
                        <div className="text-emerald-800 dark:text-emerald-300">سليمة ومطابقة</div>
                        <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{dryRunReport.healthyDocs}</div>
                      </div>
                      <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
                        <div className="text-amber-800 dark:text-amber-300">تحتاج تنظيف/ربط</div>
                        <div className="text-base font-bold text-amber-700 dark:text-amber-300">{dryRunReport.needingCleanupDocs}</div>
                      </div>
                      <div className="rounded-lg border border-red-300/60 bg-red-50/50 dark:bg-red-950/20 p-2.5">
                        <div className="text-red-800 dark:text-red-300">ستفشل في القواعد</div>
                        <div className="text-base font-bold text-red-700 dark:text-red-300">{dryRunReport.failingRulesDocs}</div>
                      </div>
                    </div>

                    {dryRunReport.needingCleanupDocs > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {dryRunReport.items
                          .filter((item) => item.needsCleanupOrMigration)
                          .map((item) => (
                            <div
                              key={item.id}
                              className="rounded-lg border border-amber-300 dark:border-amber-800 bg-[var(--hub-surface)] p-3 text-xs space-y-1"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold text-[var(--hub-heading)]">
                                  {item.nameAr} <span dir="ltr" className="text-[var(--hub-muted)]">({item.id})</span>
                                </span>
                                {item.wouldFailFirestoreRules && (
                                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200 font-semibold">
                                    مرفوض في القواعد قبل المعالجة
                                  </span>
                                )}
                              </div>
                              {item.blockingReasons.length > 0 && (
                                <div className="text-red-700 dark:text-red-300">
                                  الأسباب: {item.blockingReasons.join(' · ')}
                                </div>
                              )}
                              {item.proposedActions.length > 0 && (
                                <div className="text-[var(--hub-muted)]">
                                  الإجراء المقترح: {item.proposedActions.join(' · ')}
                                </div>
                              )}
                              {item.timestampIssues.length > 0 && (
                                <div className="text-amber-700 dark:text-amber-300">
                                  ملاحظة الطوابع: {item.timestampIssues.join(' · ')}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {migrationReport && (
                  <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs space-y-1">
                    <div className="font-bold text-emerald-900 dark:text-emerald-200">
                      نتيجة الترحيل الآمن: محاولة {migrationReport.attemptedCount} · تم تحديث {migrationReport.updatedCount} · تحقق خادمي {migrationReport.verifiedCount}
                    </div>
                    {migrationReport.failedDocs.length > 0 && (
                      <div className="text-red-700 dark:text-red-300">
                        مستندات متعذرة: {migrationReport.failedDocs.map((f) => `${f.id}: ${f.reason}`).join(' | ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Isolated Live Probe Test Suite */}
              <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-[var(--hub-heading)] flex items-center gap-1.5">
                      <FlaskConical className="w-4 h-4 text-[var(--hub-accent)]" />
                      <span>اختبار حي معزول للصلاحيات والحفظ (دون لمس المنتجات الحقيقية)</span>
                    </h3>
                    <p className="text-xs text-[var(--hub-muted)]">
                      ينفذ 7 اختبارات حقيقية على مستند اختباري مؤقت (<span dir="ltr">prd_test_integrity_probe</span>) ثم يحذفه تلقائياً فوراً.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={runningProbeSuite}
                    onClick={handleRunProbeTestSuite}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--hub-button)] text-[var(--hub-button-text)] text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <FlaskConical className="w-4 h-4" />
                    <span>{runningProbeSuite ? 'جاري الاختبار الحي...' : 'تشغيل الاختبارات الحية (7 حالات)'}</span>
                  </button>
                </div>

                {probeSuiteResult && (
                  <div className="space-y-2 pt-2 border-t border-[var(--hub-border)] text-xs">
                    <div className="flex flex-wrap gap-3 text-[var(--hub-muted)] tabular-nums">
                      <span>الحساب: <strong dir="ltr">{probeSuiteResult.actorEmail}</strong></span>
                      <span>UID: <strong dir="ltr">{probeSuiteResult.actorUid}</strong></span>
                      <span>التوثيق: <strong>{probeSuiteResult.emailVerified ? 'موثق' : 'غير موثق'}</strong></span>
                    </div>
                    <div className="space-y-1.5">
                      {probeSuiteResult.cases.map((c) => (
                        <div
                          key={c.id}
                          className={`rounded-lg border px-3 py-2 flex flex-wrap items-center justify-between gap-2 ${
                            c.passed
                              ? 'border-emerald-300/70 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
                              : 'border-red-300/70 bg-red-50/50 dark:bg-red-950/20 text-red-900 dark:text-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{c.label}</span>
                          </div>
                          <span className="text-[11px] opacity-90">{c.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
