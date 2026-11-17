import { useState } from 'react';
import { AlertTriangle, ArrowDown, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useHub } from '../../context/HubContext';
import {
  ConcurrentEditConflictError,
  deleteReturnStage,
  formatFirestoreDate,
  getUpdatedAtMs,
  saveReturnStage,
} from '../../lib/firestore-service';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { CopyButton } from '../CopyButton';
import { ConfirmModal } from '../ConfirmModal';
import type { ReturnWorkflowStage } from '../../types/hub';

export function ReturnsWorkflowView() {
  const {
    returnStages,
    isAdmin,
    notify,
    dataLoading,
    runTrackedMutation,
  } = useHub();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReturnWorkflowStage | null>(null);
  const [editingLoadedAtMs, setEditingLoadedAtMs] = useState<number | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReturnWorkflowStage | null>(null);
  const [saving, setSaving] = useState(false);

  const [stageOrder, setStageOrder] = useState(1);
  const [stage, setStage] = useState('');
  const [condition, setCondition] = useState('');
  const [procedure, setProcedure] = useState('');
  const [cannedReply, setCannedReply] = useState('');
  const [employeeNote, setEmployeeNote] = useState('');
  const [needsAdminReview, setNeedsAdminReview] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setEditingLoadedAtMs(null);
    setConflictWarning(null);
    setStageOrder(returnStages.length + 1);
    setStage('');
    setCondition('');
    setProcedure('');
    setCannedReply('');
    setEmployeeNote('');
    setNeedsAdminReview(false);
    setModalOpen(true);
  };

  const openEdit = (item: ReturnWorkflowStage) => {
    setEditing(item);
    setEditingLoadedAtMs(getUpdatedAtMs(item.updatedAt));
    setConflictWarning(null);
    setStageOrder(item.stageOrder);
    setStage(item.stage);
    setCondition(item.condition);
    setProcedure(item.procedure);
    setCannedReply(item.cannedReply);
    setEmployeeNote(item.employeeNote || '');
    setNeedsAdminReview(Boolean(item.needsAdminReview));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent, forceOverwrite = false) => {
    e.preventDefault();
    setSaving(true);
    setConflictWarning(null);
    try {
      const payload = {
        stageOrder,
        stage: stage.trim(),
        condition: condition.trim(),
        procedure: procedure.trim(),
        cannedReply: cannedReply.trim(),
        employeeNote: employeeNote.trim(),
        needsAdminReview,
        duplicateFlag: false,
      };
      await runTrackedMutation(() =>
        saveReturnStage(
          payload,
          editing || undefined,
          editing ? { expectedUpdatedAtMs: editingLoadedAtMs, forceOverwrite } : undefined
        )
      );
      notify('success', editing ? 'تم تحديث المرحلة.' : 'تمت إضافة المرحلة بنجاح.');
      setModalOpen(false);
    } catch (err) {
      if (err instanceof ConcurrentEditConflictError) {
        setConflictWarning(err.message);
      } else {
        notify('error', parseFriendlyFirestoreError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await runTrackedMutation(() => deleteReturnStage(deleteTarget));
      notify('success', 'تم حذف المرحلة.');
      setDeleteTarget(null);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">مسار المرتجع والاسترداد</h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            تسلسل المراحل المعتمد (ورقة العمل الثانية) لمساعدة الموظف على معرفة الحالة والخطوة التالية بدقة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مرحلة</span>
            </button>
          )}
        </div>
      </div>

      {dataLoading ? (
        <div className="h-48 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] animate-pulse" />
      ) : returnStages.length === 0 ? (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center space-y-2">
          <p className="text-base font-semibold text-[var(--hub-heading)]">لم يتم استيراد مراحل مسار المرتجع بعد</p>
          <p className="text-sm text-[var(--hub-muted)]">
            يمكن للمدير استيراد ملف الأوراق الأربع من قسم «دليل المواقف» أو إضافة المراحل يدوياً من هنا.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {returnStages.map((item, idx) => (
            <div key={item.id} className="space-y-2">
              <article
                dir="rtl"
                className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-8 h-8 rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] text-sm font-bold flex items-center justify-center tabular-nums shrink-0">
                      {item.stageOrder}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-[var(--hub-text)]">{item.stage}</h3>
                      <p className="text-xs text-[var(--hub-accent)]">{item.condition}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={item.cannedReply} label="نسخ الرد للعميل" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-[var(--hub-bg)] p-3.5 border border-[var(--hub-border)]">
                    <div className="text-xs font-semibold text-[var(--hub-heading)] mb-1">الإجراء المطلوب</div>
                    <div className="text-[var(--hub-text)] whitespace-pre-line">{item.procedure}</div>
                  </div>
                  <div className="rounded-lg bg-[var(--hub-surface-alt)] p-3.5 border border-[var(--hub-border)]">
                    <div className="text-xs font-semibold text-[var(--hub-accent)] mb-1">الرد الجاهز للعميل</div>
                    <div className="text-[var(--hub-text)] whitespace-pre-line">{item.cannedReply}</div>
                  </div>
                </div>

                {item.employeeNote && (
                  <div className="text-xs text-[var(--hub-muted)] dark:text-amber-200 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 rounded-lg p-3">
                    <strong className="text-[var(--hub-heading)]">ملاحظة الموظف: </strong>
                    {item.employeeNote}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--hub-border)] text-[11px] text-[var(--hub-muted)]">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3 h-3" />
                    <span>تحديث: {formatFirestoreDate(item.updatedAt)}</span>
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
              {idx < returnStages.length - 1 && (
                <div className="flex justify-center">
                  <ArrowDown className="w-5 h-5 text-[var(--hub-accent-soft)]" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editing ? 'تعديل مرحلة' : 'إضافة مرحلة جديدة'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {conflictWarning && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-950 dark:text-amber-200 space-y-2">
                <div className="flex items-start gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>{conflictWarning}</span>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={(e) => handleSave(e as unknown as React.FormEvent, true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800 cursor-pointer"
                >
                  اعتماد تعديلاتي بالقوة
                </button>
              </div>
            )}

            <form onSubmit={(e) => handleSave(e, false)} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ترتيب المرحلة</label>
                  <input
                    dir="ltr"
                    type="number"
                    min={1}
                    required
                    value={stageOrder}
                    onChange={(e) => setStageOrder(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">اسم المرحلة</label>
                  <input
                    dir="rtl"
                    required
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الحالة</label>
                <input
                  dir="rtl"
                  required
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الإجراء</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  required
                  value={procedure}
                  onChange={(e) => setProcedure(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الرد الجاهز للعميل</label>
                <textarea
                  dir="rtl"
                  rows={3}
                  required
                  value={cannedReply}
                  onChange={(e) => setCannedReply(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ملاحظة الموظف</label>
                <input
                  dir="rtl"
                  value={employeeNote}
                  onChange={(e) => setEmployeeNote(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsAdminReview}
                  onChange={(e) => setNeedsAdminReview(e.target.checked)}
                  className="accent-[var(--hub-accent)]"
                />
                <span>تحتاج مراجعة الإدارة</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-[var(--hub-border)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] cursor-pointer"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف مرحلة"
        description={`هل أنت متأكد من حذف مرحلة «${deleteTarget?.stage}»؟`}
        confirmLabel="نعم، حذف"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
