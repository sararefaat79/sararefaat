import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ExternalLink, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { POLICY_CATEGORIES } from '../../lib/auth-constants';
import {
  ConcurrentEditConflictError,
  deletePolicy,
  formatFirestoreDate,
  getUpdatedAtMs,
  savePolicy,
} from '../../lib/firestore-service';
import { normalizeArabicSearch, tokenizeArabicWithSynonyms } from '../../lib/assistant-engine';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { CopyButton } from '../CopyButton';
import { ConfirmModal } from '../ConfirmModal';
import type { Policy } from '../../types/hub';

export function PoliciesView() {
  const {
    policies,
    isAdmin,
    notify,
    dataLoading,
    userPreferences,
    toggleFavorite,
    runTrackedMutation,
  } = useHub();

  const [selectedCat, setSelectedCat] = useState('الكل');
  const [onlyReview, setOnlyReview] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Policy | null>(null);
  const [openedAtUpdatedMs, setOpenedAtUpdatedMs] = useState<number | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(POLICY_CATEGORIES[0]);
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [applicableCases, setApplicableCases] = useState('');
  const [conditions, setConditions] = useState('');
  const [exceptions, setExceptions] = useState('');
  const [requiredAction, setRequiredAction] = useState('');
  const [suggestedReply, setSuggestedReply] = useState('');
  const [escalationDept, setEscalationDept] = useState('');
  const [source, setSource] = useState('');
  const [conflictNote, setConflictNote] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [needsAdminReview, setNeedsAdminReview] = useState(false);

  const favSet = useMemo(() => new Set(userPreferences?.favoritePolicies || []), [userPreferences?.favoritePolicies]);

  const availableCategories = useMemo(() => {
    const extras = policies.map((p) => p.category).filter(Boolean);
    return Array.from(new Set([...POLICY_CATEGORIES, ...extras]));
  }, [policies]);

  const filtered = useMemo(() => {
    const rawQ = search.trim();
    const qNorm = normalizeArabicSearch(rawQ);
    const qTokens = qNorm ? tokenizeArabicWithSynonyms(search) : [];
    return policies.filter((p) => {
      if (selectedCat !== 'الكل' && p.category !== selectedCat) return false;
      if (onlyReview && !p.needsAdminReview) return false;
      if (onlyFavorites && !favSet.has(p.id)) return false;
      if (!rawQ) return true;
      const haystack = normalizeArabicSearch(
        `${p.title} ${p.category} ${p.escalationDept || ''} ${p.content} ${p.summary || ''} ${p.applicableCases || ''} ${p.conditions || ''} ${p.exceptions || ''} ${p.requiredAction || ''} ${p.suggestedReply || ''}`
      );
      if (!qNorm) return true;
      return haystack.includes(qNorm) || qTokens.some((t) => haystack.includes(t));
    });
  }, [policies, selectedCat, onlyReview, onlyFavorites, favSet, search]);

  const populateFromPolicy = (item: Policy) => {
    setTitle(item.title);
    setCategory(item.category);
    setSummary(item.summary || '');
    setContent(item.content);
    setApplicableCases(item.applicableCases || '');
    setConditions(item.conditions || '');
    setExceptions(item.exceptions || '');
    setRequiredAction(item.requiredAction || '');
    setSuggestedReply(item.suggestedReply || '');
    setEscalationDept(item.escalationDept || '');
    setSource(item.source || '');
    setConflictNote(item.conflictNote || '');
    setSourceUrl(item.sourceUrl || '');
    setNeedsAdminReview(item.needsAdminReview);
  };

  const openAdd = () => {
    setEditingItem(null);
    setOpenedAtUpdatedMs(null);
    setConflictMsg(null);
    setTitle('');
    setCategory(selectedCat !== 'الكل' ? selectedCat : availableCategories[0]);
    setSummary('');
    setContent('');
    setApplicableCases('');
    setConditions('');
    setExceptions('');
    setRequiredAction('');
    setSuggestedReply('');
    setEscalationDept('إدارة خدمة العملاء');
    setSource('الإدارة / دليل مشاعر');
    setConflictNote('');
    setSourceUrl('');
    setNeedsAdminReview(false);
    setModalOpen(true);
  };

  const openEdit = (item: Policy) => {
    setEditingItem(item);
    setOpenedAtUpdatedMs(getUpdatedAtMs(item.updatedAt));
    setConflictMsg(null);
    populateFromPolicy(item);
    setModalOpen(true);
  };

  const submitSavePolicy = async (forceOverwrite = false) => {
    if (!title.trim() || !content.trim()) {
      notify('error', 'يُرجى إدخال عنوان السياسة ونصها.');
      return;
    }
    setSaving(true);
    setConflictMsg(null);
    try {
      const payload = {
        title: title.trim(),
        category,
        summary: summary.trim(),
        content: content.trim(),
        applicableCases: applicableCases.trim(),
        conditions: conditions.trim(),
        exceptions: exceptions.trim(),
        requiredAction: requiredAction.trim(),
        suggestedReply: suggestedReply.trim(),
        escalationDept: escalationDept.trim(),
        source: source.trim(),
        conflictNote: conflictNote.trim(),
        sourceUrl: sourceUrl.trim(),
        needsAdminReview,
        sortOrder: editingItem?.sortOrder ?? policies.length + 1,
      };
      await runTrackedMutation(() =>
        savePolicy(
          payload,
          editingItem || undefined,
          editingItem ? { expectedUpdatedAtMs: openedAtUpdatedMs, forceOverwrite } : undefined
        )
      );
      notify('success', editingItem ? 'تم تحديث السياسة بنجاح.' : 'تمت إضافة السياسة بنجاح.');
      setModalOpen(false);
    } catch (err) {
      if (err instanceof ConcurrentEditConflictError) {
        setConflictMsg(err.message);
      } else {
        notify('error', parseFriendlyFirestoreError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    submitSavePolicy(false);
  };

  const handleReloadLatest = () => {
    if (!editingItem) return;
    const latest = policies.find((p) => p.id === editingItem.id);
    if (!latest) return;
    setEditingItem(latest);
    setOpenedAtUpdatedMs(getUpdatedAtMs(latest.updatedAt));
    populateFromPolicy(latest);
    setConflictMsg(null);
    notify('info', 'تم تحميل أحدث نسخة من السياسة.');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await runTrackedMutation(() => deletePolicy(deleteTarget));
      notify('success', 'تم حذف السياسة.');
      setDeleteTarget(null);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">السياسات والإجراءات المعتمدة</h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            تشمل السياسات المعتمدة ({policies.length}): الضمان الذهبي (شهر للتجربة)، الاسترجاع (14 يوماً غير مفتوح)، الضريبة السعودية 15%، التلف، والأنظمة المعتمدة.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سياسة</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[var(--hub-accent)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في السياسات أو الشروط أو الاستثناءات أو جهة التصعيد..."
              className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] pr-9 pl-4 py-2 text-sm text-[var(--hub-text)] placeholder:text-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)]"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--hub-heading)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyFavorites}
              onChange={(e) => setOnlyFavorites(e.target.checked)}
              className="accent-[var(--hub-accent)]"
            />
            <span>المفضلة فقط ({favSet.size})</span>
          </label>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--hub-heading)] cursor-pointer">
            <input
              type="checkbox"
              checked={onlyReview}
              onChange={(e) => setOnlyReview(e.target.checked)}
              className="accent-[var(--hub-accent)]"
            />
            <span>تحتاج مراجعة الإدارة فقط</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCat('الكل')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
              selectedCat === 'الكل'
                ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
            }`}
          >
            الكل ({policies.length})
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCat(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap ${
                selectedCat === cat
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Policies List */}
      {dataLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center text-sm text-[var(--hub-muted)]">
          لا توجد سياسات مطابقة لخيارات البحث الحالية.
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((item) => {
            const isFav = favSet.has(item.id);
            return (
              <article
                key={item.id}
                dir="rtl"
                className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--hub-muted)]">
                      <span className="font-semibold text-[var(--hub-accent)]">{item.category}</span>
                      {item.escalationDept && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[var(--hub-heading)]">
                            التصعيد: {item.escalationDept}
                          </span>
                        </>
                      )}
                      {item.source && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>المصدر: {item.source}</span>
                        </>
                      )}
                      {item.needsAdminReview && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5" />
                            تحتاج مراجعة الإدارة
                          </span>
                        </>
                      )}
                      {Boolean(item.updatedAt) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">تحديث: {formatFirestoreDate(item.updatedAt)}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-[var(--hub-heading)] mt-1">{item.title}</h3>
                    {item.summary && <p className="text-xs text-[var(--hub-muted)] mt-0.5">{item.summary}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFavorite('policies', item.id)}
                      className={`p-2 rounded-lg border border-[var(--hub-border)] cursor-pointer ${
                        isFav ? 'text-amber-500 bg-amber-50/50 dark:bg-amber-950/30' : 'text-[var(--hub-muted)]'
                      }`}
                      title={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)]"
                      >
                        <span>المصدر الرسمي</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <CopyButton
                      text={item.suggestedReply || item.content}
                      label={item.suggestedReply ? 'نسخ الرد' : 'نسخ النص'}
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-[var(--hub-bg)] p-4 text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed">
                  {item.content}
                </div>

                {(item.applicableCases || item.conditions || item.exceptions || item.requiredAction) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {item.applicableCases && (
                      <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 space-y-1">
                        <div className="font-semibold text-[var(--hub-heading)]">الحالات المشمولة</div>
                        <div className="text-[var(--hub-muted)] leading-relaxed">{item.applicableCases}</div>
                      </div>
                    )}
                    {item.conditions && (
                      <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 space-y-1">
                        <div className="font-semibold text-[var(--hub-heading)]">الشروط والضوابط</div>
                        <div className="text-[var(--hub-muted)] leading-relaxed">{item.conditions}</div>
                      </div>
                    )}
                    {item.exceptions && (
                      <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 space-y-1">
                        <div className="font-semibold text-[var(--hub-heading)]">الاستثناءات</div>
                        <div className="text-[var(--hub-muted)] leading-relaxed">{item.exceptions}</div>
                      </div>
                    )}
                    {item.requiredAction && (
                      <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 space-y-1">
                        <div className="font-semibold text-[var(--hub-heading)]">الإجراء المطلوب من الموظف</div>
                        <div className="text-[var(--hub-muted)] leading-relaxed">{item.requiredAction}</div>
                      </div>
                    )}
                  </div>
                )}

                {item.suggestedReply && (
                  <div className="rounded-lg bg-[var(--hub-surface-alt)] border border-[var(--hub-accent-soft)] p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--hub-accent)]">
                        الرد الجاهز المقترح للعميل
                      </span>
                      <CopyButton text={item.suggestedReply} label="نسخ الرد" />
                    </div>
                    <div className="text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed">
                      {item.suggestedReply}
                    </div>
                  </div>
                )}

                {item.conflictNote && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3.5 py-2.5 text-xs text-amber-950 dark:text-amber-200">
                    <strong>ملاحظة التوثيق / المراجعة: </strong>
                    {item.conflictNote}
                  </div>
                )}

                {isAdmin && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hub-border)]">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Structured Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editingItem ? 'تعديل السياسة' : 'إضافة سياسة جديدة'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {conflictMsg && (
              <div className="rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/50 p-3.5 space-y-2 text-xs text-orange-950 dark:text-orange-200">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{conflictMsg}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleReloadLatest}
                    className="px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-border)] font-semibold text-[var(--hub-heading)] cursor-pointer"
                  >
                    إعادة تحميل أحدث نسخة
                  </button>
                  <button
                    type="button"
                    onClick={() => submitSavePolicy(true)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-orange-700 text-white font-semibold cursor-pointer"
                  >
                    اعتماد والحفظ بالقوة
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">العنوان</label>
                  <input
                    dir="rtl"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">القسم</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  >
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ملخص سريع</label>
                  <input
                    dir="rtl"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">جهة التصعيد</label>
                  <input
                    dir="rtl"
                    value={escalationDept}
                    onChange={(e) => setEscalationDept(e.target.value)}
                    placeholder="مثال: المالية / الشحن / الإدارة"
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">المصدر</label>
                  <input
                    dir="rtl"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">نص السياسة المعتمد</label>
                <textarea
                  dir="rtl"
                  rows={4}
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الحالات المشمولة</label>
                  <textarea
                    dir="rtl"
                    rows={2}
                    value={applicableCases}
                    onChange={(e) => setApplicableCases(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الشروط والضوابط</label>
                  <textarea
                    dir="rtl"
                    rows={2}
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الاستثناءات</label>
                  <textarea
                    dir="rtl"
                    rows={2}
                    value={exceptions}
                    onChange={(e) => setExceptions(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الإجراء المطلوب</label>
                  <textarea
                    dir="rtl"
                    rows={2}
                    value={requiredAction}
                    onChange={(e) => setRequiredAction(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الرد المقترح للعميل</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  value={suggestedReply}
                  onChange={(e) => setSuggestedReply(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ملاحظة تعارض أو مراجعة</label>
                  <input
                    dir="rtl"
                    value={conflictNote}
                    onChange={(e) => setConflictNote(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">رابط المرجع الرسمي</label>
                  <input
                    type="url"
                    dir="ltr"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsAdminReview}
                  onChange={(e) => setNeedsAdminReview(e.target.checked)}
                  className="accent-[var(--hub-accent)]"
                />
                <span>تحتاج مراجعة الإدارة</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-2">
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
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] disabled:opacity-60 cursor-pointer"
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
        title="حذف السياسة"
        description={`هل أنت متأكد من حذف السياسة «${deleteTarget?.title || ''}»؟`}
        confirmLabel="نعم، حذف"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
