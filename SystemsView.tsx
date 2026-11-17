import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Server,
  Share2,
  ShieldAlert,
  Store,
  Trash2,
  Truck,
  WalletCards,
  X,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { SYSTEM_CATEGORIES } from '../../lib/auth-constants';
import {
  ConcurrentEditConflictError,
  deleteSystemWithCredentials,
  formatFirestoreDate,
  getUpdatedAtMs,
  saveSystemWithCredentials,
} from '../../lib/firestore-service';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { CopyButton } from '../CopyButton';
import { ConfirmModal } from '../ConfirmModal';
import type {
  SystemLink,
  SystemLoginMethod,
  SystemOperationalStatus,
  SystemVisibility,
} from '../../types/hub';

const LOGIN_METHOD_LABELS: Record<SystemLoginMethod, string> = {
  password: 'كلمة مرور',
  otp: 'OTP',
  sso: 'SSO',
  unknown: 'غير محدد',
};

const SYSTEM_STATUS_LABELS: Record<SystemOperationalStatus, string> = {
  active: 'معتمد ويعمل',
  legacy: 'نظام قديم',
  needs_review: 'يحتاج مراجعة الإدارة',
};

function renderCategoryIcon(category?: string) {
  const cls = 'w-4 h-4 text-[var(--hub-accent)] shrink-0';
  switch (category) {
    case 'المتجر والمنصات':
      return <Store className={cls} />;
    case 'أنظمة الطلبات':
      return <ClipboardList className={cls} />;
    case 'بوابات الدفع الإلكتروني':
      return <CreditCard className={cls} />;
    case 'بوابات الدفع والتقسيط':
      return <WalletCards className={cls} />;
    case 'شركات الشحن والتوصيل':
      return <Truck className={cls} />;
    case 'خدمة العملاء والواتساب':
      return <MessageCircle className={cls} />;
    case 'منصات التواصل':
      return <Share2 className={cls} />;
    case 'أدوات العمل':
      return <Briefcase className={cls} />;
    case 'مواقع الشركة':
      return <Globe className={cls} />;
    case 'أنظمة داخلية':
    default:
      return <Server className={cls} />;
  }
}

export function SystemsView() {
  const {
    systemLinks,
    systemCredentials,
    isAdmin,
    schemaUpgradePending,
    notify,
    dataLoading,
    runTrackedMutation,
  } = useHub();

  const [selectedCat, setSelectedCat] = useState('الكل');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SystemLink | null>(null);
  const [editingLoadedAtMs, setEditingLoadedAtMs] = useState<number | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SystemLink | null>(null);
  const [saving, setSaving] = useState(false);

  const [systemName, setSystemName] = useState('');
  const [url, setUrl] = useState('');
  const [mainCategory, setMainCategory] = useState(SYSTEM_CATEGORIES[0]);
  const [subCategory, setSubCategory] = useState('');
  const [loginMethod, setLoginMethod] = useState<SystemLoginMethod>('password');
  const [systemStatus, setSystemStatus] = useState<SystemOperationalStatus>('active');
  const [otpNote, setOtpNote] = useState('');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [description, setDescription] = useState('');
  const [usageInstructions, setUsageInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [visibility, setVisibility] = useState<SystemVisibility>('all_staff');

  const visibleSystems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return systemLinks.filter((link) => {
      if (!isAdmin && link.visibility === 'admins_only') return false;
      const cat = link.mainCategory || SYSTEM_CATEGORIES[0];
      if (selectedCat !== 'الكل' && cat !== selectedCat) return false;
      if (!q) return true;
      return `${link.systemName} ${cat} ${link.subCategory || ''} ${link.description || ''} ${link.usageInstructions || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [systemLinks, isAdmin, selectedCat, search]);

  const availableCategories = useMemo(() => {
    const used = new Set(systemLinks.map((s) => s.mainCategory).filter(Boolean) as string[]);
    return Array.from(new Set([...SYSTEM_CATEGORIES, ...used]));
  }, [systemLinks]);

  const openAdd = () => {
    setEditing(null);
    setEditingLoadedAtMs(null);
    setConflictWarning(null);
    setSystemName('');
    setUrl('https://');
    setMainCategory(selectedCat !== 'الكل' ? selectedCat : SYSTEM_CATEGORIES[0]);
    setSubCategory('');
    setLoginMethod('password');
    setSystemStatus('active');
    setOtpNote('');
    setUsernameOrEmail('');
    setPassword('');
    setDescription('');
    setUsageInstructions('');
    setNotes('');
    setVisibility('all_staff');
    setModalOpen(true);
  };

  const openEdit = (link: SystemLink) => {
    const cred = systemCredentials[link.id];
    setEditing(link);
    setEditingLoadedAtMs(getUpdatedAtMs(link.updatedAt));
    setConflictWarning(null);
    setSystemName(link.systemName);
    setUrl(link.url);
    setMainCategory(link.mainCategory || SYSTEM_CATEGORIES[0]);
    setSubCategory(link.subCategory || '');
    setLoginMethod(link.loginMethod || 'password');
    setSystemStatus(link.systemStatus || 'active');
    setOtpNote(link.otpNote || '');
    setUsernameOrEmail(cred?.usernameOrEmail || '');
    setPassword(cred?.password || '');
    setDescription(link.description || '');
    setUsageInstructions(link.usageInstructions || '');
    setNotes(link.notes || '');
    setVisibility(link.visibility);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent, forceOverwrite = false) => {
    e.preventDefault();
    if (!systemName.trim() || !url.trim()) {
      notify('error', 'يُرجى إدخال اسم النظام والرابط.');
      return;
    }
    setSaving(true);
    setConflictWarning(null);
    try {
      const payload = {
        systemName: systemName.trim(),
        url: url.trim(),
        mainCategory,
        subCategory: subCategory.trim(),
        loginMethod,
        systemStatus,
        otpNote: otpNote.trim(),
        description: description.trim(),
        usageInstructions: usageInstructions.trim(),
        notes: notes.trim(),
        visibility,
        sortOrder: editing?.sortOrder ?? systemLinks.length + 1,
      };
      await runTrackedMutation(() =>
        saveSystemWithCredentials(
          payload,
          {
            // Preserve spaces & symbols verbatim inside credentials (no .trim())
            usernameOrEmail,
            password,
          },
          editing || undefined,
          editing ? { expectedUpdatedAtMs: editingLoadedAtMs, forceOverwrite } : undefined
        )
      );
      notify('success', 'تم حفظ النظام وبيانات الدخول المعتمدة بنجاح.');
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
      await runTrackedMutation(() => deleteSystemWithCredentials(deleteTarget));
      notify('success', 'تم حذف بطاقة النظام وبيانات الدخول.');
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
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">روابط الأنظمة والتشغيل</h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            روابط التشغيل والشحن والدفع الرسمية مع بيانات الدخول المعتمدة — الأنظمة المقيدة للمديرين لا تظهر للموظفين.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة نظام تشغيل</span>
          </button>
        )}
      </div>

      {!isAdmin && schemaUpgradePending && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
          <Info className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>
            ملاحظة: عرض بيانات الدخول المخصصة للموظفين يتطلب اعتماد نشر تحديث قواعد Firestore من الإدارة.
          </span>
        </div>
      )}

      {/* Category Filter & Search */}
      <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--hub-accent)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم النظام أو شركة الشحن أو بوابة الدفع..."
            className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] pr-9 pl-4 py-2 text-sm text-[var(--hub-text)] focus:outline-none focus:border-[var(--hub-accent-soft)] focus:bg-[var(--hub-surface)]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCat('الكل')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap tabular-nums ${
              selectedCat === 'الكل'
                ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)]'
            }`}
          >
            الكل ({systemLinks.filter((s) => isAdmin || s.visibility === 'all_staff').length})
          </button>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCat(cat)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap ${
                selectedCat === cat
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:bg-[var(--hub-surface-alt)]'
              }`}
            >
              <span>{cat}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Responsive 3-Column Card Grid */}
      {dataLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-60 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] animate-pulse" />
          ))}
        </div>
      ) : visibleSystems.length === 0 ? (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center text-sm text-[var(--hub-muted)]">
          لا توجد أنظمة مطابقة للبحث أو التصنيف المحدد.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleSystems.map((link) => {
            const canViewCreds = isAdmin || link.visibility === 'all_staff';
            const cred = canViewCreds ? systemCredentials[link.id] : undefined;
            const hasUsername = Boolean(cred?.usernameOrEmail && cred.usernameOrEmail.length > 0);
            const hasPassword = Boolean(cred?.password && cred.password.length > 0);
            const isNeedsReview = link.systemStatus === 'needs_review';
            const hasValidUrl = Boolean(link.url && link.url.startsWith('http'));
            const statusKey = link.systemStatus || 'active';
            const loginKey = link.loginMethod || 'password';

            return (
              <article
                key={link.id}
                dir="rtl"
                className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 flex flex-col justify-between gap-4 hover:border-[var(--hub-accent-soft)] transition-colors"
              >
                <div className="space-y-3">
                  {/* Metadata Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--hub-muted)]">
                      {renderCategoryIcon(link.mainCategory)}
                      <span className="font-semibold text-[var(--hub-accent)]">
                        {link.mainCategory || 'أنظمة تشغيلية'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          isNeedsReview
                            ? 'text-amber-700 dark:text-amber-300 font-semibold'
                            : link.systemStatus === 'legacy'
                              ? 'text-[var(--hub-muted)] font-medium'
                              : 'text-emerald-700 dark:text-emerald-400 font-medium'
                        }
                      >
                        {SYSTEM_STATUS_LABELS[statusKey] || 'معتمد ويعمل'}
                      </span>
                    </div>

                    {link.visibility === 'admins_only' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--hub-heading)]">
                        <Lock className="w-3 h-3" />
                        مديرون فقط
                      </span>
                    )}
                  </div>

                  {/* Title & Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-[var(--hub-heading)] leading-snug">{link.systemName}</h3>
                      {link.subCategory && (
                        <div className="text-xs text-[var(--hub-muted)] mt-0.5">{link.subCategory}</div>
                      )}
                    </div>

                    {hasValidUrl ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <CopyButton text={link.url} label="نسخ الرابط" />
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--hub-button)] px-2.5 py-1.5 text-xs font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] whitespace-nowrap"
                        >
                          <span>فتح</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-[11px] text-amber-800 dark:text-amber-300 font-medium shrink-0">
                        الرابط يحتاج مراجعة
                      </span>
                    )}
                  </div>

                  {/* Login Method Note */}
                  <div className="flex items-center gap-1.5 text-xs text-[var(--hub-text)]">
                    <KeyRound className="w-3.5 h-3.5 text-[var(--hub-accent)] shrink-0" />
                    <span>آلية الدخول: {LOGIN_METHOD_LABELS[loginKey] || 'غير محدد'}</span>
                  </div>

                  {link.otpNote && (
                    <div className="text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                      <span>{link.otpNote}</span>
                    </div>
                  )}

                  {link.description && <p className="text-xs text-[var(--hub-text)] leading-relaxed">{link.description}</p>}

                  {/* Credentials Box (Credentials preserved verbatim with dir="ltr") */}
                  {canViewCreds && (
                    <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-[var(--hub-muted)]">اسم المستخدم / الإيميل</div>
                          <div
                            className="text-xs font-mono-tabular text-[var(--hub-text)] whitespace-pre-wrap break-all select-all"
                            dir={hasUsername ? 'ltr' : 'rtl'}
                          >
                            {hasUsername ? cred!.usernameOrEmail : 'غير مدخل بعد'}
                          </div>
                        </div>
                        {hasUsername && <CopyButton text={cred!.usernameOrEmail} label="نسخ" />}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--hub-border)]">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-[var(--hub-muted)]">كلمة المرور</div>
                          <div
                            className="text-xs font-mono-tabular text-[var(--hub-text)] whitespace-pre-wrap break-all select-all"
                            dir={hasPassword ? 'ltr' : 'rtl'}
                          >
                            {hasPassword ? cred!.password : 'غير مدخل بعد'}
                          </div>
                        </div>
                        {hasPassword && <CopyButton text={cred!.password} label="نسخ" />}
                      </div>
                    </div>
                  )}

                  {link.usageInstructions && (
                    <div className="text-xs text-[var(--hub-text)]">
                      <strong className="text-[var(--hub-heading)]">الاستخدام: </strong>
                      {link.usageInstructions}
                    </div>
                  )}
                  {link.notes && (
                    <div className="text-xs text-[var(--hub-muted)]">
                      <strong>ملاحظات: </strong>
                      {link.notes}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--hub-border)] text-[11px] text-[var(--hub-muted)]">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3 h-3" />
                    <span>تحديث: {formatFirestoreDate(link.updatedAt)}</span>
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(link)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(link)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Admin Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editing ? 'تعديل بطاقة النظام' : 'إضافة نظام تشغيل جديد'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">اسم النظام</label>
                  <input
                    dir="rtl"
                    required
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">التصنيف الرئيسي</label>
                  <select
                    value={mainCategory}
                    onChange={(e) => setMainCategory(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  >
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الرابط</label>
                  <input
                    required
                    dir="ltr"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">التصنيف الفرعي</label>
                  <input
                    dir="rtl"
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">آلية الدخول</label>
                  <select
                    value={loginMethod}
                    onChange={(e) => setLoginMethod(e.target.value as SystemLoginMethod)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  >
                    <option value="password">كلمة مرور</option>
                    <option value="otp">OTP</option>
                    <option value="sso">SSO</option>
                    <option value="unknown">غير محدد</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">حالة النظام</label>
                  <select
                    value={systemStatus}
                    onChange={(e) => setSystemStatus(e.target.value as SystemOperationalStatus)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  >
                    <option value="active">{SYSTEM_STATUS_LABELS.active}</option>
                    <option value="legacy">{SYSTEM_STATUS_LABELS.legacy}</option>
                    <option value="needs_review">{SYSTEM_STATUS_LABELS.needs_review}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">صلاحية المشاهدة</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as SystemVisibility)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                  >
                    <option value="all_staff">الموظفون والمديرون</option>
                    <option value="admins_only">المديرون فقط</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                  تنبيه OTP أو صلاحية الدخول
                </label>
                <input
                  dir="rtl"
                  value={otpNote}
                  onChange={(e) => setOtpNote(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                    اسم المستخدم / الإيميل
                  </label>
                  <input
                    dir="ltr"
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    placeholder="يُحفظ كما هو دون قص"
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm font-mono-tabular text-[var(--hub-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">كلمة المرور</label>
                  <input
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="تُحفظ كما هي دون قص"
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm font-mono-tabular text-[var(--hub-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">وصف النظام</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">تعليمات الاستخدام</label>
                <textarea
                  dir="rtl"
                  rows={2}
                  value={usageInstructions}
                  onChange={(e) => setUsageInstructions(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ملاحظات</label>
                <input
                  dir="rtl"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-sm text-[var(--hub-text)]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-[var(--hub-border)] text-[var(--hub-text)] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer"
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
        title="حذف نظام تشغيل"
        description={`هل أنت متأكد من حذف بطاقة «${deleteTarget?.systemName || ''}» وبيانات الدخول المرتبطة بها؟`}
        confirmLabel="نعم، حذف"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
