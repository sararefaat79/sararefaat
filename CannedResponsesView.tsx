import { useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { RESPONSE_CATEGORIES } from '../../lib/auth-constants';
import {
  ConcurrentEditConflictError,
  deleteCannedResponse,
  formatFirestoreDate,
  getUpdatedAtMs,
  saveCannedResponse,
} from '../../lib/firestore-service';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { CopyButton } from '../CopyButton';
import { ConfirmModal } from '../ConfirmModal';
import type { CannedResponse } from '../../types/hub';

export function CannedResponsesView() {
  const {
    cannedResponses,
    isAdmin,
    notify,
    dataLoading,
    categories: customCats,
    runTrackedMutation,
  } = useHub();

  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<CannedResponse | null>(null);
  const [editingLoadedAtMs, setEditingLoadedAtMs] = useState<number | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CannedResponse | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields (Arabic Master in Firestore)
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(RESPONSE_CATEGORIES[0]);
  const [content, setContent] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  const allCategories = useMemo(() => {
    const extras = customCats.filter((c) => c.section === 'responses').map((c) => c.name);
    return Array.from(new Set([...RESPONSE_CATEGORIES, ...extras]));
  }, [customCats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cannedResponses.filter((r) => {
      if (selectedCategory !== 'الكل' && r.category !== selectedCategory) return false;
      if (!q) return true;
      const haystack = `${r.title} ${r.content} ${r.category} ${r.internalNotes || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [cannedResponses, selectedCategory, search]);

  const openAddModal = () => {
    setEditingItem(null);
    setEditingLoadedAtMs(null);
    setConflictWarning(null);
    setTitle('');
    setCategory(selectedCategory !== 'الكل' ? selectedCategory : allCategories[0]);
    setContent('');
    setInternalNotes('');
    setModalOpen(true);
  };

  const openEditModal = (item: CannedResponse) => {
    setEditingItem(item);
    setEditingLoadedAtMs(getUpdatedAtMs(item.updatedAt));
    setConflictWarning(null);
    setTitle(item.title);
    setCategory(item.category);
    setContent(item.content);
    setInternalNotes(item.internalNotes || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent, forceOverwrite = false) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      notify('error', 'يُرجى تعبئة عنوان الرد ونصه.');
      return;
    }
    setSaving(true);
    setConflictWarning(null);
    try {
      await runTrackedMutation(() =>
        saveCannedResponse(
          {
            title: title.trim(),
            category,
            content: content.trim(),
            internalNotes: internalNotes.trim(),
          },
          editingItem || undefined,
          editingItem ? { expectedUpdatedAtMs: editingLoadedAtMs, forceOverwrite } : undefined
        )
      );
      notify(
        'success',
        editingItem ? 'تم تحديث الرد وحفظه في قاعدة البيانات.' : 'تمت إضافة الرد الجديد بنجاح.'
      );
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
      await runTrackedMutation(() => deleteCannedResponse(deleteTarget));
      notify('success', 'تم حذف الرد من قاعدة البيانات.');
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
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">مكتبة الردود الجاهزة</h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            ردود باللهجة الكويتية الطبيعية والودودة (أستاذي / أختي / العذر والسموحة / حاضرين) دون لوم أو وعود غير معتمدة.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة رد جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--hub-accent)] absolute top-1/2 -translate-y-1/2 pointer-events-none right-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث داخل مكتبة الردود..."
            className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] placeholder:text-[var(--hub-muted)] py-2 pr-9 pl-4 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('الكل')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
              selectedCategory === 'الكل'
                ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
            }`}
          >
            الكل ({cannedResponses.length})
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      {dataLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-44 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center space-y-2">
          <p className="text-base font-semibold text-[var(--hub-heading)]">لا توجد ردود مطابقة</p>
          <p className="text-sm text-[var(--hub-muted)]">جرب تغيير التصنيف أو كلمة البحث.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <article
              key={item.id}
              dir="rtl"
              className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--hub-accent)] font-medium flex flex-wrap items-center gap-2">
                      <span>{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums text-[var(--hub-muted)]">
                        آخر تعديل: {formatFirestoreDate(item.updatedAt)}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[var(--hub-text)] mt-1">{item.title}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CopyButton text={item.content} />
                  </div>
                </div>

                <div className="rounded-lg bg-[var(--hub-bg)] p-3.5 text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed">
                  {item.content}
                </div>

                {item.internalNotes && (
                  <div className="text-xs text-[var(--hub-muted)]">
                    <span className="font-semibold text-[var(--hub-heading)]">ملاحظات داخلية: </span>
                    <span>{item.internalNotes}</span>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[var(--hub-border)]">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editingItem ? 'تعديل الرد الجاهز' : 'إضافة رد جاهز جديد'}
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

            <form onSubmit={(e) => handleSave(e, false)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">عنوان الرد</label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">التصنيف</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] px-3 py-2 text-sm bg-[var(--hub-bg)] text-[var(--hub-text)] focus:outline-none focus:border-[var(--hub-accent)]"
                >
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                  نص الرد (باللهجة الكويتية)
                </label>
                <textarea
                  rows={4}
                  required
                  dir="rtl"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                  ملاحظات داخلية للموظف (اختياري)
                </label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ في قاعدة البيانات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف الرد الجاهز"
        description={`هل أنت متأكد من حذف الرد «${deleteTarget?.title}»؟ سيتم تسجيل العملية في سجل التعديلات.`}
        confirmLabel="نعم، حذف"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
