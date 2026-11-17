import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  HardDrive,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import {
  BACKUP_COLLECTION_LABELS,
  BACKUP_COLLECTIONS,
  downloadBackupJson,
  exportFullBackupFromFirestore,
  formatBytesAr,
  restoreBackupToFirestore,
  validateAndPreviewBackupFile,
  type BackupCollectionName,
  type BackupPreviewSummary,
} from '../../lib/backup';
import { formatFirestoreDate } from '../../lib/firestore-service';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { ConfirmModal } from '../ConfirmModal';

export function BackupRestoreView() {
  const { isSensitiveAdmin, backups, notify, runTrackedMutation } = useHub();

  const [exporting, setExporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<BackupPreviewSummary | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge_skip_conflicts' | 'overwrite_conflicts'>('merge_skip_conflicts');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [selectedExportCols, setSelectedExportCols] = useState<BackupCollectionName[]>([...BACKUP_COLLECTIONS]);
  const [selectedRestoreCols, setSelectedRestoreCols] = useState<BackupCollectionName[]>(
    BACKUP_COLLECTIONS.filter((c) => c !== 'audit_logs' && c !== 'user_preferences')
  );

  if (!isSensitiveAdmin) {
    return (
      <div
        dir="rtl"
        className="rounded-xl border border-red-200 dark:border-red-900/50 bg-[var(--hub-surface)] p-8 text-center text-sm text-red-800 dark:text-red-300 space-y-2"
      >
        <ShieldAlert className="w-7 h-7 mx-auto text-red-600 dark:text-red-400" />
        <div className="font-bold">هذا القسم مخصص للمديرين الحساسين (Tier 1) فقط.</div>
      </div>
    );
  }

  const toggleExportCol = (col: BackupCollectionName) => {
    setSelectedExportCols((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
  };

  const toggleRestoreCol = (col: BackupCollectionName) => {
    setSelectedRestoreCols((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]));
  };

  const handleExport = async () => {
    if (selectedExportCols.length === 0) {
      notify('error', 'يُرجى تحديد مجموعة واحدة على الأقل للتصدير.');
      return;
    }
    setExporting(true);
    try {
      const { payload, payloadSizeBytes } = await runTrackedMutation(() =>
        exportFullBackupFromFirestore(selectedExportCols)
      );
      downloadBackupJson(payload, 'mashaer-hub-backup');
      notify(
        'success',
        `تم تصدير النسخة الاحتياطية (${selectedExportCols.length} مجموعة · ${formatBytesAr(payloadSizeBytes)}) وتنزيل ملف JSON بنجاح.`
      );
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValidating(true);
    try {
      const summary = await validateAndPreviewBackupFile(file);
      setPreview(summary);
      if (summary.valid) {
        const available = BACKUP_COLLECTIONS.filter(
          (c) => c !== 'audit_logs' && c !== 'user_preferences' && (summary.counts[c] || 0) > 0
        );
        setSelectedRestoreCols(available);
      }
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!preview?.payload) return;
    if (selectedRestoreCols.length === 0) {
      notify('error', 'يُرجى تحديد مجموعة واحدة على الأقل للاستعادة.');
      return;
    }

    setRestoring(true);
    try {
      await runTrackedMutation(async () => {
        const { payload: safetyBackup } = await exportFullBackupFromFirestore(undefined, {
          isPreRestoreSnapshot: true,
        });
        downloadBackupJson(safetyBackup, 'mashaer-pre-restore-safety');
        notify('info', 'تم إنشاء وتنزيل لقطة أمان تلقائية للوضع الحالي في السحابة قبل بدء الاستعادة.');

        const res = await restoreBackupToFirestore(preview.payload!, restoreMode, selectedRestoreCols);
        notify('success', `تمت استعادة ${res.restoredCount} سجل في Firestore (تم تخطي ${res.skippedCount} سجل).`);
      });
      setConfirmOpen(false);
      setPreview(null);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">
            النسخ الاحتياطي والاستعادة – للمديرين الحساسين (Tier 1) فقط
          </h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            يعتمد بالكامل على بيانات Cloud Firestore الفعلية مع حساب الحجم بالبايت والتحديد الانتقائي وإنشاء لقطة أمان تلقائية قبل كل استعادة.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
        <div>
          تنبيه أمني وتقني: تشمل النسخة الاحتياطية مجموعات Firestore المحددة فقط، ولا تشمل كلمات مرور حسابات Firebase Authentication أو رموز الجلسات لأسباب أمنية. قبل تنفيذ أي عملية استعادة (دمج أو استبدال) يقوم النظام تلقائياً بأخذ وتنزيل نسخة أمان سحابية كاملة للوضع الراهن.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Selective Export */}
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Download className="w-5 h-5 text-[var(--hub-accent)]" />
              <h2 className="text-base font-bold text-[var(--hub-heading)]">تصدير نسخة احتياطية انتقائية (JSON)</h2>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedExportCols([...BACKUP_COLLECTIONS])}
                className="text-[var(--hub-accent)] hover:underline cursor-pointer"
              >
                تحديد الكل
              </button>
              <span className="text-[var(--hub-border)]">|</span>
              <button
                type="button"
                onClick={() => setSelectedExportCols([])}
                className="text-[var(--hub-muted)] hover:underline cursor-pointer"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
            اختر المجموعات المطلوب تصديرها من Cloud Firestore مباشرة إلى ملف JSON موثق:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
            {BACKUP_COLLECTIONS.map((col) => (
              <label key={col} className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={selectedExportCols.includes(col)}
                  onChange={() => toggleExportCol(col)}
                  className="accent-[var(--hub-accent)]"
                />
                <span className="truncate">{BACKUP_COLLECTION_LABELS[col] || col}</span>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || selectedExportCols.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] px-5 py-2.5 text-sm font-semibold text-[var(--hub-button-text)] disabled:opacity-60 cursor-pointer"
          >
            <DatabaseBackup className="w-4 h-4" />
            <span>{exporting ? 'جاري التصدير...' : `تصدير وتنزيل (${selectedExportCols.length} مجموعة)`}</span>
          </button>
        </section>

        {/* Import / Restore */}
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <Upload className="w-5 h-5 text-[var(--hub-accent)]" />
            <h2 className="text-base font-bold text-[var(--hub-heading)]">استيراد ومعاينة قبل الاستعادة</h2>
          </div>
          <p className="text-sm text-[var(--hub-muted)] leading-relaxed">
            ارفع ملف JSON لفحص سلامته ومعاينة السجلات والتعارضات وتحديد المجموعات المراد استعادتها قبل تنفيذ أي تعديل في قاعدة البيانات.
          </p>
          <div className="rounded-xl border border-dashed border-[var(--hub-accent-soft)] bg-[var(--hub-bg)] p-6 text-center space-y-2">
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              className="text-sm text-[var(--hub-text)] file:me-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--hub-button)] file:text-[var(--hub-button-text)] file:text-xs file:font-semibold cursor-pointer"
            />
            {validating && (
              <p className="text-xs text-[var(--hub-heading)]">جاري التحقق من سلامة الملف ومقارنة المعرفات...</p>
            )}
          </div>
          <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 text-xs text-[var(--hub-muted)] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-[var(--hub-accent)] shrink-0 mt-0.5" />
            <span>
              سجل التعديلات (audit_logs) وتفضيلات الأفراد (user_preferences) وصلاحيات المديرين السبعة الأساسية محمية ولا تتأثر بالاستعادة.
            </span>
          </div>
        </section>
      </div>

      {/* Preview Panel */}
      {preview && (
        <section className="rounded-xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 space-y-5">
          {!preview.valid ? (
            <div className="space-y-2 text-sm text-red-800 dark:text-red-300">
              <div className="font-bold">فشل التحقق من سلامة الملف:</div>
              <ul className="list-disc ps-5 space-y-1">
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--hub-border)]">
                <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-300 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>ملف النسخة الاحتياطية سليم وجاهز للمعاينة الانتقائية</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--hub-muted)] tabular-nums">
                  <span>الحجم: {formatBytesAr(preview.payloadSizeBytes)}</span>
                  <span>·</span>
                  <span>إجمالي السجلات: {preview.totalRecords}</span>
                  <span>·</span>
                  <span>التعارضات الحالية: {preview.totalConflicts}</span>
                </div>
              </div>

              {(preview.exportedBy || preview.exportedAt) && (
                <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] px-3.5 py-2.5 text-xs text-[var(--hub-muted)] flex flex-wrap items-center gap-3">
                  {preview.exportedBy && (
                    <span>
                      صادرة بواسطة:{' '}
                      <strong className="font-mono-tabular text-[var(--hub-text)]" dir="ltr">
                        {preview.exportedBy}
                      </strong>
                    </span>
                  )}
                  {preview.exportedAt && (
                    <span className="tabular-nums">
                      بتاريخ: {new Date(preview.exportedAt).toLocaleString('ar-KW')}
                    </span>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-[var(--hub-heading)] mb-2">
                  حدد المجموعات المراد استعادتها من هذا الملف:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {BACKUP_COLLECTIONS.map((col) => {
                    const count = preview.counts[col] || 0;
                    const conflict = preview.conflicts[col] || 0;
                    const disabled = col === 'audit_logs' || col === 'user_preferences' || count === 0;
                    return (
                      <label
                        key={col}
                        className={`rounded-lg border p-3 flex items-start gap-2.5 transition-colors ${
                          disabled
                            ? 'opacity-50 bg-[var(--hub-bg)] border-[var(--hub-border)] cursor-not-allowed'
                            : selectedRestoreCols.includes(col)
                              ? 'bg-[var(--hub-surface-alt)] border-[var(--hub-accent-soft)] cursor-pointer'
                              : 'bg-[var(--hub-bg)] border-[var(--hub-border)] cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={!disabled && selectedRestoreCols.includes(col)}
                          onChange={() => !disabled && toggleRestoreCol(col)}
                          className="accent-[var(--hub-accent)] mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[var(--hub-heading)] truncate">
                            {BACKUP_COLLECTION_LABELS[col] || col}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-[var(--hub-muted)] truncate" dir="ltr">
                            {col}
                          </div>
                          <div className="mt-1 text-[var(--hub-text)] tabular-nums">
                            سجلات: {count} · تعارضات: {conflict}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="text-xs font-semibold text-[var(--hub-heading)]">خيار التعامل مع السجلات المتعارضة:</div>
                <div className="flex flex-wrap gap-4 text-xs text-[var(--hub-text)]">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge_skip_conflicts'}
                      onChange={() => setRestoreMode('merge_skip_conflicts')}
                      className="accent-[var(--hub-accent)]"
                    />
                    <span>استيراد السجلات الجديدة فقط وتخطي المتعارض (آمن)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'overwrite_conflicts'}
                      onChange={() => setRestoreMode('overwrite_conflicts')}
                      className="accent-[var(--hub-accent)]"
                    />
                    <span>تحديث السجلات المتعارضة بقيم النسخة الاحتياطية</span>
                  </label>
                </div>
                <p className="text-[11px] text-[var(--hub-muted)]">
                  * يتم أخذ وتنزيل لقطة أمان سحابية كاملة تلقائياً قبل تنفيذ أي من الخيارين.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-[var(--hub-border)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={selectedRestoreCols.length === 0}
                  onClick={() => setConfirmOpen(true)}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] disabled:opacity-50 cursor-pointer"
                >
                  متابعة وتأكيد الاستعادة ({selectedRestoreCols.length} مجموعة)
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* History */}
      <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[var(--hub-accent)]" />
          <h2 className="text-base font-bold text-[var(--hub-heading)]">سجل عمليات النسخ والاستعادة</h2>
        </div>
        {backups.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)]">لا توجد عمليات نسخ احتياطي مسجلة بعد.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-[var(--hub-surface)] border border-[var(--hub-border)] px-2 py-0.5 font-semibold text-[var(--hub-heading)]">
                    {b.action === 'restore' ? 'استعادة' : 'تصدير'}
                  </span>
                  <span className="font-semibold text-[var(--hub-heading)]">{b.name}</span>
                  <span className="text-[var(--hub-muted)] font-mono-tabular" dir="ltr">
                    ({b.createdByEmail})
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[var(--hub-accent)] font-semibold tabular-nums">
                  <span>{formatBytesAr(b.payloadSizeBytes ?? 0)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{b.totalRecords} سجل</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--hub-muted)] font-normal">{formatFirestoreDate(b.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        open={confirmOpen}
        title="تأكيد استعادة النسخة الاحتياطية"
        description={`سيتم أولاً إنشاء وتنزيل نسخة أمان سحابية تلقائية للوضع الراهن، ثم استعادة ${selectedRestoreCols.length} مجموعة بوضع (${
          restoreMode === 'merge_skip_conflicts'
            ? 'تخطي السجلات المتعارضة'
            : 'تحديث السجلات المتعارضة بقيم النسخة'
        }). لن يتم المساس بسجل التعديلات أو صلاحيات المديرين السبعة. هل توافق على التنفيذ؟`}
        confirmLabel="نعم، أخذ نسخة الأمان واستعادة الآن"
        danger={restoreMode === 'overwrite_conflicts'}
        loading={restoring}
        onConfirm={handleConfirmRestore}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
