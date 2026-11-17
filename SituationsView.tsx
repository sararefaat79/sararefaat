import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  FileText,
  FileUp,
  Pencil,
  Pin,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import {
  ConcurrentEditConflictError,
  deleteEmployeeAlert,
  deleteQuickPhrase,
  deleteSituation,
  formatFirestoreDate,
  getUpdatedAtMs,
  saveEmployeeAlert,
  saveQuickPhrase,
  saveSituation,
} from '../../lib/firestore-service';
import {
  commitFourSheetsToFirestore,
  parseFourSheetsFile,
  type ParsedFourSheetsResult,
} from '../../lib/document-importers';
import { normalizeArabicSearch, tokenizeArabicWithSynonyms } from '../../lib/assistant-engine';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { CopyButton } from '../CopyButton';
import { ConfirmModal } from '../ConfirmModal';
import type { EmployeeAlert, QuickPhrase, Situation } from '../../types/hub';

type SubTab = 'situations' | 'phrases' | 'alerts';

const ALERT_SEVERITY_LABELS: Record<'important' | 'warning' | 'info', string> = {
  important: 'مهم',
  warning: 'تحذير',
  info: 'تنبيه',
};

function findSimilarSituations(target: Situation, all: Situation[]): Situation[] {
  const baseTokens = new Set(
    tokenizeArabicWithSynonyms(`${target.category} ${target.subCategory || ''} ${target.customerInquiry} ${target.cannedReply}`)
  );
  return all
    .filter((s) => s.id !== target.id)
    .map((s) => {
      let score = s.category === target.category ? 3 : 0;
      const tokens = tokenizeArabicWithSynonyms(`${s.category} ${s.subCategory || ''} ${s.customerInquiry}`);
      for (const tok of tokens) {
        if (baseTokens.has(tok)) score += 1.5;
      }
      return { item: s, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.item);
}

export function SituationsView() {
  const {
    situations,
    policies,
    returnStages,
    quickPhrases,
    employeeAlerts,
    isAdmin,
    notify,
    dataLoading,
    branding,
    userPreferences,
    toggleFavorite,
    runTrackedMutation,
  } = useHub();

  const [tab, setTab] = useState<SubTab>('situations');
  const [selectedCat, setSelectedCat] = useState<string>('الكل');
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [expandedSimilarId, setExpandedSimilarId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Import Modal (4 sheets PDF / Excel)
  const [importOpen, setImportOpen] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedFourSheetsResult | null>(null);
  const [skipExactDuplicates, setSkipExactDuplicates] = useState(false);

  // Situation Edit Modal + Concurrency Guard
  const [sitModalOpen, setSitModalOpen] = useState(false);
  const [editingSit, setEditingSit] = useState<Situation | null>(null);
  const [openedAtUpdatedMs, setOpenedAtUpdatedMs] = useState<number | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [sitNumber, setSitNumber] = useState('');
  const [sitCat, setSitCat] = useState('');
  const [sitSubCat, setSitSubCat] = useState('');
  const [sitInquiry, setSitInquiry] = useState('');
  const [sitReqData, setSitReqData] = useState('');
  const [sitProcedure, setSitProcedure] = useState('');
  const [sitReply, setSitReply] = useState('');
  const [sitDept, setSitDept] = useState('');
  const [sitInternalNotes, setSitInternalNotes] = useState('');
  const [sitLinkedPolicyId, setSitLinkedPolicyId] = useState('');
  const [sitIsImportant, setSitIsImportant] = useState(false);
  const [sitReview, setSitReview] = useState(false);

  // Phrase Edit Modal
  const [phrModalOpen, setPhrModalOpen] = useState(false);
  const [editingPhr, setEditingPhr] = useState<QuickPhrase | null>(null);
  const [phrPurpose, setPhrPurpose] = useState('');
  const [phrText, setPhrText] = useState('');

  // Alert Edit Modal
  const [altModalOpen, setAltModalOpen] = useState(false);
  const [editingAlt, setEditingAlt] = useState<EmployeeAlert | null>(null);
  const [altTitle, setAltTitle] = useState('');
  const [altRule, setAltRule] = useState('');
  const [altClarification, setAltClarification] = useState('');
  const [altSeverity, setAltSeverity] = useState<'important' | 'warning' | 'info'>('important');

  // Delete Confirm
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'sit'; item: Situation }
    | { type: 'phr'; item: QuickPhrase }
    | { type: 'alt'; item: EmployeeAlert }
    | null
  >(null);

  const favSet = useMemo(() => new Set(userPreferences?.favoriteSituations || []), [userPreferences?.favoriteSituations]);
  const policyById = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  const situationCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of situations) {
      const cat = s.category?.trim() || 'عام';
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [situations]);

  const filteredSituations = useMemo(() => {
    const rawQ = search.trim();
    const qNorm = normalizeArabicSearch(rawQ);
    const qTokens = qNorm ? tokenizeArabicWithSynonyms(search) : [];
    return situations
      .filter((s) => {
        if (selectedCat !== 'الكل' && (s.category?.trim() || 'عام') !== selectedCat) return false;
        if (onlyImportant && !s.isImportant) return false;
        if (onlyFavorites && !favSet.has(s.id)) return false;
        if (!rawQ) return true;
        const haystack = normalizeArabicSearch(
          `${s.situationNumber} ${s.category} ${s.subCategory || ''} ${s.customerInquiry} ${s.requiredData || ''} ${s.internalProcedure} ${s.cannedReply} ${s.responsibleDept} ${s.internalNotes || ''}`
        );
        if (!qNorm) return true;
        return haystack.includes(qNorm) || qTokens.some((t) => haystack.includes(t));
      })
      .sort((a, b) => Number(Boolean(b.isImportant)) - Number(Boolean(a.isImportant)));
  }, [situations, selectedCat, onlyImportant, onlyFavorites, favSet, search]);

  const filteredPhrases = useMemo(() => {
    const rawQ = search.trim();
    if (!rawQ) return quickPhrases;
    const qNorm = normalizeArabicSearch(rawQ);
    const tokens = qNorm ? tokenizeArabicWithSynonyms(search) : [];
    return quickPhrases.filter((p) => {
      const hay = normalizeArabicSearch(`${p.purpose} ${p.phrase}`);
      return !qNorm || hay.includes(qNorm) || tokens.some((t) => hay.includes(t));
    });
  }, [quickPhrases, search]);

  const filteredAlerts = useMemo(() => {
    const rawQ = search.trim();
    if (!rawQ) return employeeAlerts;
    const qNorm = normalizeArabicSearch(rawQ);
    const tokens = qNorm ? tokenizeArabicWithSynonyms(search) : [];
    return employeeAlerts.filter((a) => {
      const hay = normalizeArabicSearch(`${a.title} ${a.ruleText} ${a.clarification || ''}`);
      return !qNorm || hay.includes(qNorm) || tokens.some((t) => hay.includes(t));
    });
  }, [employeeAlerts, search]);

  // Handlers
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingFile(true);
    try {
      const parsed = await parseFourSheetsFile(file, {
        situations,
        returnStages,
        quickPhrases,
        employeeAlerts,
      });
      setParsedResult(parsed);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setParsingFile(false);
    }
  };

  const handleCommitImport = async () => {
    if (!parsedResult) return;
    setSaving(true);
    try {
      const res = await runTrackedMutation(() => commitFourSheetsToFirestore(parsedResult, skipExactDuplicates));
      notify(
        'success',
        `تم استيراد ${res.totalImported} سجل عبر الأوراق الأربع إلى Firestore${
          res.duplicateFlagged > 0 ? ` (مع تمييز ${res.duplicateFlagged} كمكرر للمراجعة)` : ''
        }.`
      );
      setImportOpen(false);
      setParsedResult(null);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const populateSitForm = (s: Situation) => {
    setSitNumber(s.situationNumber);
    setSitCat(s.category);
    setSitSubCat(s.subCategory || '');
    setSitInquiry(s.customerInquiry);
    setSitReqData(s.requiredData || '');
    setSitProcedure(s.internalProcedure);
    setSitReply(s.cannedReply);
    setSitDept(s.responsibleDept);
    setSitInternalNotes(s.internalNotes || '');
    setSitLinkedPolicyId(s.linkedPolicyId || '');
    setSitIsImportant(Boolean(s.isImportant));
    setSitReview(Boolean(s.needsAdminReview));
  };

  const openAddSit = () => {
    setEditingSit(null);
    setOpenedAtUpdatedMs(null);
    setConflictMsg(null);
    setSitNumber(String(situations.length + 1));
    setSitCat(selectedCat !== 'الكل' ? selectedCat : '');
    setSitSubCat('');
    setSitInquiry('');
    setSitReqData('');
    setSitProcedure('');
    setSitReply('');
    setSitDept('خدمة العملاء');
    setSitInternalNotes('');
    setSitLinkedPolicyId('');
    setSitIsImportant(false);
    setSitReview(false);
    setSitModalOpen(true);
  };

  const openEditSit = (s: Situation) => {
    setEditingSit(s);
    setOpenedAtUpdatedMs(getUpdatedAtMs(s.updatedAt));
    setConflictMsg(null);
    populateSitForm(s);
    setSitModalOpen(true);
  };

  const submitSaveSit = async (forceOverwrite = false) => {
    setSaving(true);
    setConflictMsg(null);
    try {
      const payload = {
        situationNumber: sitNumber.trim(),
        category: sitCat.trim() || 'عام',
        subCategory: sitSubCat.trim(),
        customerInquiry: sitInquiry.trim(),
        requiredData: sitReqData.trim(),
        internalProcedure: sitProcedure.trim(),
        cannedReply: sitReply.trim(),
        responsibleDept: sitDept.trim() || 'خدمة العملاء',
        internalNotes: sitInternalNotes.trim(),
        linkedPolicyId: sitLinkedPolicyId.trim(),
        isImportant: sitIsImportant,
        needsAdminReview: sitReview,
        duplicateFlag: false,
        sortOrder: editingSit?.sortOrder ?? situations.length + 1,
      };
      await runTrackedMutation(() =>
        saveSituation(
          payload,
          editingSit || undefined,
          editingSit ? { expectedUpdatedAtMs: openedAtUpdatedMs, forceOverwrite } : undefined
        )
      );
      notify('success', editingSit ? 'تم تحديث الموقف.' : 'تمت إضافة الموقف.');
      setSitModalOpen(false);
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

  const handleSaveSit = (e: React.FormEvent) => {
    e.preventDefault();
    submitSaveSit(false);
  };

  const handleReloadLatestSit = () => {
    if (!editingSit) return;
    const latest = situations.find((s) => s.id === editingSit.id);
    if (!latest) return;
    setEditingSit(latest);
    setOpenedAtUpdatedMs(getUpdatedAtMs(latest.updatedAt));
    populateSitForm(latest);
    setConflictMsg(null);
    notify('info', 'تم تحميل أحدث نسخة للموقف.');
  };

  const openAddPhr = () => {
    setEditingPhr(null);
    setPhrPurpose('');
    setPhrText('');
    setPhrModalOpen(true);
  };

  const openEditPhr = (p: QuickPhrase) => {
    setEditingPhr(p);
    setPhrPurpose(p.purpose);
    setPhrText(p.phrase);
    setPhrModalOpen(true);
  };

  const handleSavePhr = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        purpose: phrPurpose.trim(),
        phrase: phrText.trim(),
        category: 'عبارات سريعة',
        duplicateFlag: false,
        sortOrder: editingPhr?.sortOrder ?? quickPhrases.length + 1,
      };
      await runTrackedMutation(() => saveQuickPhrase(payload, editingPhr || undefined));
      notify('success', editingPhr ? 'تم تحديث العبارة.' : 'تمت إضافة العبارة.');
      setPhrModalOpen(false);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const openAddAlt = () => {
    setEditingAlt(null);
    setAltTitle('');
    setAltRule('');
    setAltClarification('');
    setAltSeverity('important');
    setAltModalOpen(true);
  };

  const openEditAlt = (a: EmployeeAlert) => {
    setEditingAlt(a);
    setAltTitle(a.title);
    setAltRule(a.ruleText);
    setAltClarification(a.clarification || '');
    setAltSeverity(a.severity);
    setAltModalOpen(true);
  };

  const handleSaveAlt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: altTitle.trim(),
        ruleText: altRule.trim(),
        clarification: altClarification.trim(),
        severity: altSeverity,
        duplicateFlag: false,
        sortOrder: editingAlt?.sortOrder ?? employeeAlerts.length + 1,
      };
      await runTrackedMutation(() => saveEmployeeAlert(payload, editingAlt || undefined));
      notify('success', editingAlt ? 'تم تحديث التنبيه.' : 'تمت إضافة التنبيه.');
      setAltModalOpen(false);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await runTrackedMutation(async () => {
        if (deleteTarget.type === 'sit') await deleteSituation(deleteTarget.item);
        if (deleteTarget.type === 'phr') await deleteQuickPhrase(deleteTarget.item);
        if (deleteTarget.type === 'alt') await deleteEmployeeAlert(deleteTarget.item);
      });
      notify('success', 'تم الحذف بنجاح.');
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
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">
            دليل المواقف والعبارات والتنبيهات
          </h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            يشمل جميع المواقف المرقمة ({situations.length})، العبارات السريعة ({quickPhrases.length})، وتنبيهات الموظف ({employeeAlerts.length}) مع بحث ذكي باللهجة والمرادفات.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer whitespace-nowrap"
              >
                <FileUp className="w-4 h-4 text-[var(--hub-accent)]" />
                <span>استيراد PDF / Excel (4 أوراق)</span>
              </button>
              <button
                type="button"
                onClick={tab === 'situations' ? openAddSit : tab === 'phrases' ? openAddPhr : openAddAlt}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {tab === 'situations'
                    ? 'إضافة موقف'
                    : tab === 'phrases'
                      ? 'إضافة عبارة'
                      : 'إضافة تنبيه'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs, Search & Category Filter */}
      <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('situations')}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
                tab === 'situations'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
              }`}
            >
              دليل المواقف ({situations.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('phrases')}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
                tab === 'phrases'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
              }`}
            >
              عبارات سريعة ({quickPhrases.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('alerts')}
              className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
                tab === 'alerts'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
              }`}
            >
              تنبيهات للموظف ({employeeAlerts.length})
            </button>
          </div>

          {tab === 'situations' && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5 font-medium text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyImportant}
                  onChange={(e) => setOnlyImportant(e.target.checked)}
                  className="accent-[var(--hub-accent)]"
                />
                <span>المواقف الهامة المثبتة</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-medium text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(e) => setOnlyFavorites(e.target.checked)}
                  className="accent-[var(--hub-accent)]"
                />
                <span>المفضلة فقط ({favSet.size})</span>
              </label>
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--hub-accent)] absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالرقم أو الحالة أو المرادفات (مثال: ارجع / ابدل / ما وصل / كم سعر)..."
            className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] placeholder:text-[var(--hub-muted)] py-2 pr-9 pl-4 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
          />
        </div>

        {tab === 'situations' && situationCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setSelectedCat('الكل')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
                selectedCat === 'الكل'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
              }`}
            >
              كل التصنيفات ({situations.length})
            </button>
            {situationCategories.map(([cat, count]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCat(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
                  selectedCat === cat
                    ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                    : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)] hover:text-[var(--hub-text)]'
                }`}
              >
                {cat} ({count})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Content */}
      {dataLoading ? (
        <div className="h-48 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] animate-pulse" />
      ) : tab === 'situations' ? (
        filteredSituations.length === 0 ? (
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center text-sm text-[var(--hub-muted)]">
            لا توجد مواقف مطابقة للبحث أو التصنيف المحدد.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSituations.map((s) => {
              const isFav = favSet.has(s.id);
              const linkedPol = s.linkedPolicyId ? policyById.get(s.linkedPolicyId) : undefined;
              const isSimOpen = expandedSimilarId === s.id;
              const similars = isSimOpen ? findSimilarSituations(s, situations) : [];

              return (
                <article
                  key={s.id}
                  dir="rtl"
                  className={`rounded-xl border p-5 space-y-3 bg-[var(--hub-surface)] ${
                    s.isImportant ? 'border-amber-400 dark:border-amber-700' : 'border-[var(--hub-border)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--hub-muted)]">
                      {s.isImportant && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">
                          <Pin className="w-3 h-3" />
                          مهم
                        </span>
                      )}
                      <span className="font-bold text-[var(--hub-heading)] tabular-nums">
                        موقف #{s.situationNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-[var(--hub-accent)] font-medium">
                        {s.category}
                        {s.subCategory ? ` / ${s.subCategory}` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>القسم المسؤول: {s.responsibleDept}</span>
                      {Boolean(s.updatedAt) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">تحديث: {formatFirestoreDate(s.updatedAt)}</span>
                        </>
                      )}
                      {s.needsAdminReview && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5" />
                            تحتاج مراجعة الإدارة
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFavorite('situations', s.id)}
                        className={`p-1.5 rounded-lg border border-[var(--hub-border)] cursor-pointer ${
                          isFav ? 'text-amber-500 bg-amber-50/50 dark:bg-amber-950/30' : 'text-[var(--hub-muted)]'
                        }`}
                        title={isFav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                      >
                        <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedSimilarId(isSimOpen ? null : s.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                        <span>مواقف مشابهة</span>
                      </button>
                      <CopyButton text={s.cannedReply} label="نسخ الرد الجاهز" />
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-[var(--hub-text)]">{s.customerInquiry}</h3>

                  {linkedPol && (
                    <div className="rounded-lg bg-[var(--hub-surface-alt)]/80 border border-[var(--hub-border)] px-3.5 py-2 text-xs flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-[var(--hub-accent)] shrink-0" />
                      <span>
                        <strong className="text-[var(--hub-heading)]">السياسة المرتبطة: </strong>
                        {linkedPol.title} ({linkedPol.category})
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {s.requiredData && (
                      <div className="rounded-lg bg-[var(--hub-bg)] p-3 border border-[var(--hub-border)]">
                        <div className="text-xs font-semibold text-[var(--hub-heading)] mb-1">
                          البيانات المطلوبة
                        </div>
                        <div className="text-[var(--hub-text)] whitespace-pre-line">{s.requiredData}</div>
                      </div>
                    )}
                    <div className="rounded-lg bg-[var(--hub-bg)] p-3 border border-[var(--hub-border)]">
                      <div className="text-xs font-semibold text-[var(--hub-heading)] mb-1">
                        الإجراء الداخلي
                      </div>
                      <div className="text-[var(--hub-text)] whitespace-pre-line">{s.internalProcedure}</div>
                    </div>
                  </div>

                  {s.internalNotes && (
                    <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3.5 py-2 text-xs text-amber-950 dark:text-amber-200">
                      <strong>ملاحظات داخلية للموظف: </strong>
                      {s.internalNotes}
                    </div>
                  )}

                  <div className="rounded-lg bg-[var(--hub-surface-alt)] p-3.5 text-sm text-[var(--hub-text)] whitespace-pre-line">
                    <div className="text-xs font-semibold text-[var(--hub-accent)] mb-1">
                      الرد الجاهز للعميل
                    </div>
                    {s.cannedReply}
                  </div>

                  {isSimOpen && (
                    <div className="rounded-lg border border-[var(--hub-accent-soft)]/50 bg-[var(--hub-bg)] p-3.5 space-y-2 text-xs">
                      <div className="font-bold text-[var(--hub-heading)]">مواقف مشابهة في القاعدة:</div>
                      {similars.length === 0 ? (
                        <div className="text-[var(--hub-muted)]">لا توجد مواقف شديدة التشابه حالياً.</div>
                      ) : (
                        similars.map((sim) => (
                          <div
                            key={sim.id}
                            className="rounded border border-[var(--hub-border)] bg-[var(--hub-surface)] p-2.5 flex items-start justify-between gap-2"
                          >
                            <div>
                              <span className="font-bold text-[var(--hub-heading)]">#{sim.situationNumber}</span>
                              <span className="mx-1 text-[var(--hub-muted)]">·</span>
                              <span className="text-[var(--hub-text)]">{sim.customerInquiry}</span>
                            </div>
                            <CopyButton text={sim.cannedReply} label="نسخ" />
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hub-border)]">
                      <button
                        type="button"
                        onClick={() => openEditSit(s)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ type: 'sit', item: s })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
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
        )
      ) : tab === 'phrases' ? (
        filteredPhrases.length === 0 ? (
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center text-sm text-[var(--hub-muted)]">
            لا توجد عبارات سريعة بعد.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPhrases.map((p) => (
              <article
                key={p.id}
                dir="rtl"
                className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[var(--hub-accent)]">{p.purpose}</div>
                      {p.duplicateFlag && (
                        <div className="text-[11px] text-red-700 dark:text-red-400 font-semibold">
                          تكرار للمراجعة
                        </div>
                      )}
                    </div>
                    <CopyButton text={p.phrase} label="نسخ" />
                  </div>
                  <p className="text-sm text-[var(--hub-text)] bg-[var(--hub-bg)] rounded-lg p-3 whitespace-pre-line">
                    {p.phrase}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hub-border)]">
                    <button
                      type="button"
                      onClick={() => openEditPhr(p)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ type: 'phr', item: p })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )
      ) : filteredAlerts.length === 0 ? (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center text-sm text-[var(--hub-muted)]">
          لا توجد تنبيهات مسجلة بعد.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAlerts.map((a) => (
            <article
              key={a.id}
              dir="rtl"
              className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-[var(--hub-heading)]">{a.title}</h3>
                <span className="text-xs font-semibold text-[var(--hub-accent)]">
                  {ALERT_SEVERITY_LABELS[a.severity] || a.severity}
                </span>
              </div>
              <p className="text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed">{a.ruleText}</p>
              {a.clarification && (
                <p className="text-xs text-[var(--hub-muted)] bg-[var(--hub-bg)] rounded-lg p-3">{a.clarification}</p>
              )}
              {isAdmin && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hub-border)]">
                  <button
                    type="button"
                    onClick={() => openEditAlt(a)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ type: 'alt', item: a })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 cursor-pointer"
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

      {/* 4-Sheets Importer Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-[var(--hub-border)]">
              <div>
                <h3 className="text-base font-bold text-[var(--hub-heading)]">
                  استيراد الأوراق الأربع (دليل المواقف / مسار المرتجع / عبارات سريعة / تنبيهات للموظف)
                </h3>
                <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                  يدعم ملف PDF (دليل_خدمة_عملاء_مشاعر.pdf) أو ملف Excel (.xlsx / .xls) بأربع أوراق عمل دون حذف أو دمج تلقائي.
                </p>
              </div>
              <button type="button" onClick={() => setImportOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {branding?.pdfImportedAt && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-950 dark:text-amber-200">
                  تنبيه عدم التكرار: سبق استيراد ملف الأوراق الأربع بتاريخ{' '}
                  <span className="tabular-nums font-semibold">
                    {new Date(branding.pdfImportedAt).toLocaleString('ar-KW')}
                  </span>{' '}
                  (عدد {branding.pdfImportCount || 0} سجل). سيتم فحص كل صف قبل الإضافة.
                </div>
              )}

              <div className="rounded-xl border border-dashed border-[var(--hub-accent-soft)] bg-[var(--hub-bg)] p-5 text-center space-y-2">
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="text-sm text-[var(--hub-text)] file:me-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--hub-button)] file:text-[var(--hub-button-text)] file:text-xs file:font-semibold cursor-pointer"
                />
                {parsingFile && (
                  <p className="text-xs text-[var(--hub-heading)]">
                    جاري قراءة الأوراق الأربع وفحص التكرار...
                  </p>
                )}
              </div>

              {parsedResult && (
                <div className="space-y-4">
                  {parsedResult.rawNotes.map((n, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-3 text-xs text-amber-950 dark:text-amber-200"
                    >
                      {n}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="rounded-lg bg-[var(--hub-bg)] p-3 border border-[var(--hub-border)]">
                      <div className="text-xs text-[var(--hub-muted)]">دليل المواقف</div>
                      <div className="text-lg font-bold text-[var(--hub-heading)] tabular-nums">{parsedResult.situations.length}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--hub-bg)] p-3 border border-[var(--hub-border)]">
                      <div className="text-xs text-[var(--hub-muted)]">مسار المرتجع</div>
                      <div className="text-lg font-bold text-[var(--hub-heading)] tabular-nums">{parsedResult.returnStages.length}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--hub-bg)] p-3 border border-[var(--hub-border)]">
                      <div className="text-xs text-[var(--hub-muted)]">عبارات سريعة</div>
                      <div className="text-lg font-bold text-[var(--hub-heading)] tabular-nums">{parsedResult.quickPhrases.length}</div>
                    </div>
                    <div className="rounded-lg bg-[var(--hub-bg)] p-3 border border-[var(--hub-border)]">
                      <div className="text-xs text-[var(--hub-muted)]">تنبيهات الموظف</div>
                      <div className="text-lg font-bold text-[var(--hub-heading)] tabular-nums">{parsedResult.employeeAlerts.length}</div>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipExactDuplicates}
                      onChange={(e) => setSkipExactDuplicates(e.target.checked)}
                      className="accent-[var(--hub-accent)]"
                    />
                    <span>
                      تخطي الصفوف المطابقة تماماً بدلاً من استيرادها مع علامة تكرار للمراجعة
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--hub-border)] bg-[var(--hub-bg)]">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-muted)] cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                disabled={!parsedResult || saving}
                onClick={handleCommitImport}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'جاري الحفظ...' : 'اعتماد الاستيراد إلى Firestore'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Situation Modal */}
      {sitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editingSit ? 'تعديل موقف' : 'إضافة موقف جديد'}
              </h3>
              <button type="button" onClick={() => setSitModalOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
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
                    onClick={handleReloadLatestSit}
                    className="px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-border)] font-semibold text-[var(--hub-heading)] cursor-pointer"
                  >
                    إعادة تحميل أحدث نسخة
                  </button>
                  <button
                    type="button"
                    onClick={() => submitSaveSit(true)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-orange-700 text-white font-semibold cursor-pointer"
                  >
                    اعتماد والحفظ بالقوة
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">رقم الموقف</label>
                  <input
                    dir="ltr"
                    required
                    value={sitNumber}
                    onChange={(e) => setSitNumber(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">التصنيف</label>
                  <input
                    dir="rtl"
                    required
                    value={sitCat}
                    onChange={(e) => setSitCat(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">التصنيف الفرعي</label>
                  <input
                    dir="rtl"
                    value={sitSubCat}
                    onChange={(e) => setSitSubCat(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الحالة أو استفسار العميل</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  required
                  value={sitInquiry}
                  onChange={(e) => setSitInquiry(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">البيانات المطلوبة</label>
                <input
                  dir="rtl"
                  value={sitReqData}
                  onChange={(e) => setSitReqData(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الإجراء الداخلي</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  required
                  value={sitProcedure}
                  onChange={(e) => setSitProcedure(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الرد الجاهز للعميل</label>
                <textarea
                  dir="rtl"
                  rows={3}
                  required
                  value={sitReply}
                  onChange={(e) => setSitReply(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">القسم المسؤول</label>
                  <input
                    dir="rtl"
                    required
                    value={sitDept}
                    onChange={(e) => setSitDept(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الربط بسياسة رسمية</label>
                  <select
                    value={sitLinkedPolicyId}
                    onChange={(e) => setSitLinkedPolicyId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                  >
                    <option value="">بدون ربط مباشر</option>
                    {policies.map((pol) => (
                      <option key={pol.id} value={pol.id}>
                        {pol.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ملاحظات داخلية للموظف</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  value={sitInternalNotes}
                  onChange={(e) => setSitInternalNotes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sitIsImportant}
                    onChange={(e) => setSitIsImportant(e.target.checked)}
                    className="accent-[var(--hub-accent)]"
                  />
                  <span>تثبيت كموقف هام / أولوية</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sitReview}
                    onChange={(e) => setSitReview(e.target.checked)}
                    className="accent-[var(--hub-accent)]"
                  />
                  <span>تحتاج مراجعة الإدارة</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSitModalOpen(false)}
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

      {/* Phrase Modal */}
      {phrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editingPhr ? 'تعديل عبارة سريعة' : 'إضافة عبارة سريعة'}
              </h3>
              <button type="button" onClick={() => setPhrModalOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSavePhr} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الغرض</label>
                <input
                  dir="rtl"
                  required
                  value={phrPurpose}
                  onChange={(e) => setPhrPurpose(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">العبارة</label>
                <textarea
                  dir="rtl"
                  rows={3}
                  required
                  value={phrText}
                  onChange={(e) => setPhrText(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPhrModalOpen(false)}
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

      {/* Alert Modal */}
      {altModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editingAlt ? 'تعديل تنبيه موظف' : 'إضافة تنبيه للموظف'}
              </h3>
              <button type="button" onClick={() => setAltModalOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAlt} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">العنوان</label>
                <input
                  dir="rtl"
                  required
                  value={altTitle}
                  onChange={(e) => setAltTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">القاعدة أو التنبيه</label>
                <textarea
                  dir="rtl"
                  rows={3}
                  required
                  value={altRule}
                  onChange={(e) => setAltRule(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">التوضيح الإضافي</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  value={altClarification}
                  onChange={(e) => setAltClarification(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الأهمية</label>
                <select
                  value={altSeverity}
                  onChange={(e) => setAltSeverity(e.target.value as 'important' | 'warning' | 'info')}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                >
                  <option value="important">{ALERT_SEVERITY_LABELS.important}</option>
                  <option value="warning">{ALERT_SEVERITY_LABELS.warning}</option>
                  <option value="info">{ALERT_SEVERITY_LABELS.info}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAltModalOpen(false)}
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
        title="تأكيد الحذف"
        description="هل أنت متأكد من حذف هذا السجل نهائياً من قاعدة البيانات؟"
        confirmLabel="نعم، حذف"
        loading={saving}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
