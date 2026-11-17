import { useMemo, useState } from 'react';
import {
  History,
  Lock,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import {
  ALL_STAFF_SECTIONS,
  emailToKey,
  isCoreAdminEmail,
  OPERATIONAL_ADMIN_EMAILS,
  SECTION_LABELS,
  SENSITIVE_ADMIN_EMAILS,
} from '../../lib/auth-constants';
import {
  deleteAuthorizedEmployee,
  formatFirestoreDate,
  saveAuthorizedUser,
} from '../../lib/firestore-service';
import { parseFriendlyFirestoreError } from '../../lib/firebase';
import { ConfirmModal } from '../ConfirmModal';
import type { AuthorizedUser, StaffSectionId, UserStatus } from '../../types/hub';

export function UsersManagementView() {
  const { authorizedUsers, auditLogs, isSensitiveAdmin, notify, runTrackedMutation } = useHub();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AuthorizedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthorizedUser | null>(null);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'sensitive_admin' | 'operational_admin' | 'employee'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState<UserStatus>('active');
  const [allowedSections, setAllowedSections] = useState<StaffSectionId[]>(ALL_STAFF_SECTIONS);
  const [notes, setNotes] = useState('');

  const employees = useMemo(
    () => authorizedUsers.filter((u) => !isCoreAdminEmail(u.email)),
    [authorizedUsers]
  );

  const filteredSensitiveAdmins = useMemo(() => {
    if (roleFilter !== 'all' && roleFilter !== 'sensitive_admin') return [];
    if (statusFilter === 'suspended') return [];
    const q = search.trim().toLowerCase();
    return SENSITIVE_ADMIN_EMAILS.filter((adminEmail) => {
      if (!q) return true;
      const mirrored = authorizedUsers.find((u) => u.emailKey === emailToKey(adminEmail));
      return (
        adminEmail.toLowerCase().includes(q) ||
        (mirrored?.displayName || '').toLowerCase().includes(q)
      );
    });
  }, [authorizedUsers, search, roleFilter, statusFilter]);

  const filteredOperationalAdmins = useMemo(() => {
    if (roleFilter !== 'all' && roleFilter !== 'operational_admin') return [];
    if (statusFilter === 'suspended') return [];
    const q = search.trim().toLowerCase();
    return OPERATIONAL_ADMIN_EMAILS.filter((adminEmail) => {
      if (!q) return true;
      const mirrored = authorizedUsers.find((u) => u.emailKey === emailToKey(adminEmail));
      return (
        adminEmail.toLowerCase().includes(q) ||
        (mirrored?.displayName || '').toLowerCase().includes(q)
      );
    });
  }, [authorizedUsers, search, roleFilter, statusFilter]);

  const filteredEmployees = useMemo(() => {
    if (roleFilter === 'sensitive_admin' || roleFilter === 'operational_admin') return [];
    const q = search.trim().toLowerCase();
    return employees.filter((emp) => {
      if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
      if (!q) return true;
      return (
        emp.email.toLowerCase().includes(q) ||
        emp.displayName.toLowerCase().includes(q) ||
        (emp.notes || '').toLowerCase().includes(q)
      );
    });
  }, [employees, search, roleFilter, statusFilter]);

  const permissionHistoryLogs = useMemo(
    () => auditLogs.filter((l) => l.section === 'إدارة المستخدمين').slice(0, 25),
    [auditLogs]
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

  const openAddEmployee = () => {
    setEditing(null);
    setEmail('');
    setDisplayName('');
    setStatus('active');
    setAllowedSections(ALL_STAFF_SECTIONS);
    setNotes('');
    setModalOpen(true);
  };

  const openEditEmployee = (emp: AuthorizedUser) => {
    setEditing(emp);
    setEmail(emp.email);
    setDisplayName(emp.displayName);
    setStatus(emp.status);
    setAllowedSections(emp.allowedSections || ALL_STAFF_SECTIONS);
    setNotes(emp.notes || '');
    setModalOpen(true);
  };

  const toggleSection = (sec: StaffSectionId) => {
    setAllowedSections((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !displayName.trim()) {
      notify('error', 'يُرجى إدخال البريد الإلكتروني والاسم.');
      return;
    }
    if (isCoreAdminEmail(cleanEmail)) {
      notify('error', 'هذا الإيميل مدرج ضمن المديرين السبعة المحميين ولا يمكن تحويله لموظف.');
      return;
    }
    setSaving(true);
    try {
      await runTrackedMutation(() =>
        saveAuthorizedUser(
          {
            email: cleanEmail,
            displayName: displayName.trim(),
            role: 'employee',
            status,
            allowedSections: allowedSections.length > 0 ? allowedSections : ['home'],
            notes: notes.trim(),
          },
          editing || undefined
        )
      );
      notify('success', editing ? 'تم تحديث بيانات الموظف.' : 'تمت إضافة الموظف المصرح له بنجاح.');
      setModalOpen(false);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async (emp: AuthorizedUser) => {
    setSaving(true);
    try {
      const nextStatus: UserStatus = emp.status === 'active' ? 'suspended' : 'active';
      await runTrackedMutation(() =>
        saveAuthorizedUser(
          {
            email: emp.email,
            displayName: emp.displayName,
            role: 'employee',
            status: nextStatus,
            allowedSections: emp.allowedSections,
            notes: emp.notes,
          },
          emp
        )
      );
      notify(
        'success',
        nextStatus === 'suspended'
          ? 'تم إيقاف الموظف ومنعه من الوصول فوراً.'
          : 'تم تفعيل حساب الموظف.'
      );
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await runTrackedMutation(() => deleteAuthorizedEmployee(deleteTarget));
      notify('success', 'تم حذف صلاحية الموظف.');
      setDeleteTarget(null);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">
            إدارة المستخدمين – للمديرين الحساسين (Tier 1) فقط
          </h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            تقسيم ثلاثي المستويات: 3 مديرين حساسين (Tier 1) بصلاحية كاملة، و4 مديرين تشغيليين (Tier 2) لإدارة المحتوى فقط، وموظفون للقراءة والنسخ. المديرون السبعة محميون بقواعد Firestore.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddEmployee}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة موظف مصرح له</span>
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--hub-accent)] absolute top-1/2 -translate-y-1/2 pointer-events-none right-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو البريد الإلكتروني..."
            className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] py-2 pr-9 pl-4 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
        >
          <option value="all">جميع الأدوار</option>
          <option value="sensitive_admin">المديرون الحساسون (Tier 1)</option>
          <option value="operational_admin">المديرون التشغيليون (Tier 2)</option>
          <option value="employee">الموظفون (Tier 3)</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
        >
          <option value="all">جميع الحالات</option>
          <option value="active">نشط</option>
          <option value="suspended">موقوف</option>
        </select>
      </div>

      {/* Tier 1 + Tier 2 Protected Core Admins */}
      {(filteredSensitiveAdmins.length > 0 || filteredOperationalAdmins.length > 0) && (
        <section className="rounded-xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--hub-border)]">
            <ShieldCheck className="w-5 h-5 text-[var(--hub-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--hub-heading)]">
                حسابات الإدارة المعتمدة والمحمية ({filteredSensitiveAdmins.length + filteredOperationalAdmins.length})
              </h2>
              <p className="text-xs text-[var(--hub-muted)]">
                محمية على مستوى قواعد الأمان في Firestore ضد الحذف أو التعطيل أو تخفيض الصلاحية.
              </p>
            </div>
          </div>

          {filteredSensitiveAdmins.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-[var(--hub-heading)]">
                المستوى الأول (Tier 1): المديرون الحساسون — صلاحية تشغيلية وحساسة كاملة
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSensitiveAdmins.map((adminEmail, idx) => {
                  const mirrored = authorizedUsers.find((u) => u.emailKey === emailToKey(adminEmail));
                  return (
                    <div
                      key={adminEmail}
                      className="rounded-lg border border-[var(--hub-accent-soft)]/50 bg-[var(--hub-bg)] p-3.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--hub-accent)] tabular-nums">
                          مدير حساس #{idx + 1} · Tier 1
                        </div>
                        <div className="text-sm font-mono-tabular font-semibold text-[var(--hub-text)] truncate mt-0.5" dir="ltr">
                          {adminEmail}
                        </div>
                        {mirrored?.displayName && (
                          <div className="text-xs text-[var(--hub-muted)] truncate">{mirrored.displayName}</div>
                        )}
                      </div>
                      <Lock className="w-4 h-4 text-[var(--hub-accent)] shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredOperationalAdmins.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[var(--hub-border)]">
              <div className="text-xs font-bold text-[var(--hub-heading)]">
                المستوى الثاني (Tier 2): المديرون التشغيليون — إدارة المحتوى دون الأقسام الحساسة
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {filteredOperationalAdmins.map((adminEmail, idx) => {
                  const mirrored = authorizedUsers.find((u) => u.emailKey === emailToKey(adminEmail));
                  return (
                    <div
                      key={adminEmail}
                      className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--hub-heading)] tabular-nums">
                          مدير تشغيلي #{idx + 1} · Tier 2
                        </div>
                        <div className="text-sm font-mono-tabular font-semibold text-[var(--hub-text)] truncate mt-0.5" dir="ltr">
                          {adminEmail}
                        </div>
                        {mirrored?.displayName && (
                          <div className="text-xs text-[var(--hub-muted)] truncate">{mirrored.displayName}</div>
                        )}
                      </div>
                      <Lock className="w-4 h-4 text-[var(--hub-muted)] shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Employees (Tier 3) */}
      {(roleFilter === 'all' || roleFilter === 'employee') && (
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--hub-border)] pb-3">
            <h2 className="text-base font-bold text-[var(--hub-heading)]">
              الموظفون المصرح لهم — Tier 3 ({filteredEmployees.length})
            </h2>
          </div>

          {filteredEmployees.length === 0 ? (
            <p className="text-sm text-[var(--hub-muted)]">
              {employees.length === 0
                ? 'لم تتم إضافة موظفين بعد. اضغط «إضافة موظف مصرح له» لتحديد البريد الإلكتروني والأقسام المسموح بها.'
                : 'لا توجد حسابات موظفين مطابقة للبحث أو التصفية.'}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredEmployees.map((emp) => (
                <div
                  key={emp.emailKey}
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--hub-text)]">
                      <span>{emp.displayName}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          emp.status === 'active'
                            ? 'text-emerald-800 dark:text-emerald-400 text-xs'
                            : 'text-red-700 dark:text-red-400 text-xs'
                        }
                      >
                        {emp.status === 'active' ? 'نشط' : 'موقوف'}
                      </span>
                    </div>
                    <div className="text-xs font-mono-tabular text-[var(--hub-accent)]" dir="ltr">
                      {emp.email}
                    </div>
                    <div className="text-xs text-[var(--hub-muted)]">
                      الأقسام المسموحة: {emp.allowedSections.map((s) => SECTION_LABELS[s] || s).join('، ')}
                    </div>
                    {emp.notes && (
                      <div className="text-[11px] text-[var(--hub-muted)]">ملاحظات: {emp.notes}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditEmployee(emp)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSuspend(emp)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-800/60 bg-[var(--hub-surface)] text-amber-900 dark:text-amber-300 cursor-pointer"
                    >
                      {emp.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      <span>{emp.status === 'active' ? 'إيقاف' : 'تفعيل'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(emp)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 dark:border-red-900/50 bg-[var(--hub-surface)] text-red-700 dark:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Permission Change History Timeline */}
      <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--hub-border)] pb-3">
          <History className="w-5 h-5 text-[var(--hub-accent)]" />
          <h2 className="text-base font-bold text-[var(--hub-heading)]">سجل تغييرات الصلاحيات والمستخدمين</h2>
        </div>

        {permissionHistoryLogs.length === 0 ? (
          <p className="text-xs text-[var(--hub-muted)]">لا توجد تغييرات مسجلة على حسابات الموظفين بعد.</p>
        ) : (
          <div className="space-y-2.5">
            {permissionHistoryLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3.5 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[var(--hub-muted)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[var(--hub-heading)]">{log.itemName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular" dir="ltr">
                      بواسطة: {log.actorEmail}
                    </span>
                  </div>
                  <span className="tabular-nums">{formatFirestoreDate(log.createdAt)}</span>
                </div>
                <div className="text-[var(--hub-text)]">{log.summary}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-border)]">
              <h3 className="text-base font-bold text-[var(--hub-heading)]">
                {editing ? 'تعديل صلاحيات الموظف' : 'إضافة موظف مصرح له'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-[var(--hub-muted)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                  البريد الإلكتروني (Google)
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  disabled={Boolean(editing)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@mashaer.store"
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm disabled:opacity-70 focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">اسم الموظف</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">حالة الحساب</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserStatus)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                >
                  <option value="active">نشط (مصرح له بالقراءة والنسخ)</option>
                  <option value="suspended">موقوف (ممنوع من الوصول)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-2">
                  الأقسام المسموح للموظف بمشاهدتها
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_STAFF_SECTIONS.map((sec) => (
                    <label key={sec} className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowedSections.includes(sec)}
                        onChange={() => toggleSection(sec)}
                        className="accent-[var(--hub-accent)]"
                      />
                      <span>{SECTION_LABELS[sec] || sec}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--hub-accent)]"
                />
              </div>
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
                  {saving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف صلاحية موظف"
        description={`هل أنت متأكد من إزالة صلاحية الموظف (${deleteTarget?.email})؟ سيتم منعه من الوصول فوراً.`}
        confirmLabel="نعم، حذف"
        loading={saving}
        onConfirm={handleDeleteEmployee}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
