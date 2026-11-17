import React, { useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Cloud,
  CloudOff,
  DatabaseBackup,
  Eye,
  FileText,
  History,
  Home,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MessageSquareQuote,
  Moon,
  Package,
  Palette,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { SECTION_LABELS } from '../lib/auth-constants';
import { getNavSectionLabel } from '../lib/ui-defaults';
import { LogoPlacementBadge } from './LogoPlacementBadge';
import { PersonalThemeModal } from './PersonalThemeModal';
import type { RoleTier, SaveSyncStatus, SectionId, StaffSectionId } from '../types/hub';

interface NavItem {
  id: SectionId;
  defaultLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  sensitiveAdminOnly?: boolean;
}

const STAFF_NAV: NavItem[] = [
  { id: 'home', defaultLabel: 'الصفحة الرئيسية', icon: Home },
  { id: 'products', defaultLabel: 'دليل المنتجات والأسعار', icon: Package },
  { id: 'situations', defaultLabel: 'دليل المواقف (67)', icon: ClipboardList },
  { id: 'inquiries', defaultLabel: 'استفسارات العملاء', icon: BookOpen },
  { id: 'responses', defaultLabel: 'مكتبة الردود الجاهزة', icon: MessageSquareQuote },
  { id: 'policies', defaultLabel: 'السياسات والإجراءات', icon: FileText },
  { id: 'returns', defaultLabel: 'مسار المرتجع والاسترداد', icon: RefreshCw },
  { id: 'systems', defaultLabel: 'روابط الأنظمة والتشغيل', icon: Link2 },
];

const SENSITIVE_ADMIN_NAV: NavItem[] = [
  { id: 'audit', defaultLabel: 'سجل التعديلات', icon: History, sensitiveAdminOnly: true },
  { id: 'backup', defaultLabel: 'النسخ الاحتياطي والاستعادة', icon: DatabaseBackup, sensitiveAdminOnly: true },
  { id: 'users', defaultLabel: 'إدارة المستخدمين', icon: Users, sensitiveAdminOnly: true },
  { id: 'settings', defaultLabel: 'إعدادات النظام والمزامنة', icon: Settings, sensitiveAdminOnly: true },
];

const ROLE_LABELS_AR: Record<RoleTier, string> = {
  sensitive_admin: 'مدير نظام حساس',
  operational_admin: 'مدير تشغيلي',
  employee: 'موظف خدمة عملاء',
};

function renderSaveStatusBadge(status: SaveSyncStatus, errorMsg: string | null) {
  switch (status) {
    case 'saving':
      return {
        label: 'جاري الحفظ...',
        className: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200',
        icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      };
    case 'syncing':
      return {
        label: 'جاري المزامنة...',
        className: 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200',
        icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      };
    case 'saved':
      return {
        label: 'تم الحفظ سحابياً',
        className: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      };
    case 'synced':
      return {
        label: 'متزامن ومحدّث',
        className: 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200',
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      };
    case 'conflict':
      return {
        label: 'تعارض تعديل',
        title: errorMsg || 'يوجد تعارض تعديل سحابي',
        className: 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/50 text-orange-900 dark:text-orange-200',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
      };
    case 'error':
      return {
        label: 'تعذر الحفظ',
        title: errorMsg || 'تعذر الحفظ في السحابة',
        className: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200',
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
      };
    case 'offline':
      return {
        label: 'غير متصل',
        className: 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/50 text-red-900 dark:text-red-200',
        icon: <CloudOff className="w-3.5 h-3.5" />,
      };
    default:
      return {
        label: 'متصل بالسحابة',
        className: 'border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-muted)]',
        icon: <Cloud className="w-3.5 h-3.5 text-[var(--hub-accent)]" />,
      };
  }
}

interface AppShellProps {
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  children: React.ReactNode;
}

export function AppShell({
  activeSection,
  onSelectSection,
  searchQuery,
  onSearchChange,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  const {
    firebaseUser,
    roleTier,
    isSensitiveAdmin,
    isAdmin,
    allowedSections,
    uiConfig,
    previewUiConfig,
    setPreviewUiConfig,
    logout,
    toasts,
    dismissToast,
    isOffline,
    saveStatus,
    lastSyncError,
    themeMode,
    toggleTheme,
    previewTheme,
  } = useHub();

  const visibleStaffNav = STAFF_NAV.filter((item) =>
    isAdmin ? true : allowedSections.includes(item.id as StaffSectionId)
  );

  const statusBadge = renderSaveStatusBadge(saveStatus, lastSyncError);
  const roleLabel = ROLE_LABELS_AR[roleTier];

  const handleNavClick = (id: SectionId) => {
    onSelectSection(id);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = (collapsed: boolean, isMobileDrawer: boolean) => (
    <div className="flex flex-col h-full bg-[var(--hub-sidebar)] text-[var(--hub-sidebar-text)] border-l border-[var(--hub-sidebar-alt)]">
      <div
        className={`px-3.5 py-3.5 border-b border-white/10 flex items-center ${
          collapsed ? 'justify-center' : 'justify-between gap-2.5'
        }`}
      >
        {!collapsed ? (
          <>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <LogoPlacementBadge
                slot={uiConfig.logoPlacements.sidebar}
                alt="شعار شركة مشاعر للعطور"
                compact
                tone="on-dark"
                className="flex-1"
              />
              {(!uiConfig.logoPlacements.sidebar.enabled || !uiConfig.logoPlacements.sidebar.imageUrl?.trim()) && (
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-snug text-[var(--hub-sidebar-text)] truncate">
                    {uiConfig.logoPlacements.sidebar.labelText || 'شركة مشاعر للعطور'}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => (isMobileDrawer ? setMobileMenuOpen(false) : setSidebarCollapsed(true))}
              className="p-1.5 rounded-lg text-[var(--hub-sidebar-text)]/75 hover:text-[var(--hub-sidebar-text)] hover:bg-white/10 cursor-pointer shrink-0"
              title="إغلاق القائمة الجانبية"
              aria-label="إغلاق القائمة الجانبية"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="p-2 rounded-lg text-[var(--hub-sidebar-accent)] hover:bg-white/10 cursor-pointer"
            title="فتح القائمة الجانبية"
            aria-label="فتح القائمة الجانبية"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 pb-1 text-[11px] font-medium text-[var(--hub-sidebar-accent)]/85">
              أقسام خدمة العملاء
            </div>
          )}
          {visibleStaffNav.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const navLabel = getNavSectionLabel(uiConfig, item.id) || item.defaultLabel;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={collapsed ? navLabel : undefined}
                className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm font-medium transition-[background-color,color,box-shadow] text-right cursor-pointer ${
                  active
                    ? 'bg-[var(--hub-sidebar-accent)] text-[#191214] font-bold shadow-xs'
                    : 'text-[var(--hub-sidebar-text)]/85 hover:bg-white/10 hover:text-[var(--hub-sidebar-text)]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#191214]' : 'text-[var(--hub-sidebar-accent)]'}`} />
                {!collapsed && <span className="truncate">{navLabel}</span>}
              </button>
            );
          })}
        </div>

        {/* Tier 1 ONLY: 3 Sensitive System Admins */}
        {isSensitiveAdmin && (
          <div className="space-y-1 pt-3 border-t border-white/10">
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-medium text-[var(--hub-sidebar-accent)]/85 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                <span>إدارة النظام الحساسة</span>
              </div>
            )}
            {SENSITIVE_ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed ? item.defaultLabel : undefined}
                  className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2.5 rounded-xl text-sm font-medium transition-[background-color,color,box-shadow] text-right cursor-pointer ${
                    active
                      ? 'bg-[var(--hub-sidebar-accent)] text-[#191214] font-bold shadow-xs'
                      : 'text-[var(--hub-sidebar-text)]/85 hover:bg-white/10 hover:text-[var(--hub-sidebar-text)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#191214]' : 'text-[var(--hub-sidebar-accent)]'}`} />
                  {!collapsed && <span className="truncate">{item.defaultLabel}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-white/10 bg-[var(--hub-sidebar-alt)]/80 space-y-2.5">
        {!collapsed && (
          <div className="min-w-0 px-1">
            <div className="text-xs font-semibold text-[var(--hub-sidebar-text)] truncate">
              {firebaseUser?.displayName || firebaseUser?.email}
            </div>
            <div className="text-[11px] text-[var(--hub-sidebar-accent)] truncate" dir="ltr">
              {firebaseUser?.email}
            </div>
            <div className="mt-1 text-[11px] text-[var(--hub-sidebar-text)]/80">
              {roleLabel}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          title={collapsed ? 'تسجيل الخروج' : undefined}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-[var(--hub-sidebar-text)] hover:bg-white/15 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-[var(--hub-sidebar-accent)] shrink-0" />
          {!collapsed && <span>تسجيل الخروج</span>}
        </button>
      </div>
    </div>
  );

  const currentSectionTitle =
    getNavSectionLabel(uiConfig, activeSection) || SECTION_LABELS[activeSection] || 'الصفحة الرئيسية';

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--hub-bg)] text-[var(--hub-text)] flex transition-colors">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-200 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[276px]'
        }`}
      >
        {renderSidebarContent(sidebarCollapsed, false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[276px] max-w-[85vw] h-full shadow-2xl">{renderSidebarContent(false, true)}</div>
          <div
            className="flex-1 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-[var(--hub-surface)]/92 backdrop-blur-md border-b border-[var(--hub-border)] px-4 sm:px-6 py-3 shadow-[0_1px_12px_-6px_rgba(74,14,28,0.12)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer shrink-0"
                aria-label="فتح القائمة"
              >
                <Menu className="w-5 h-5" />
              </button>

              <LogoPlacementBadge
                slot={uiConfig.logoPlacements.header}
                alt="شعار مشاعر"
                compact
                tone="surface"
              />
              <div className="min-w-0 flex items-center gap-2">
                <span className="font-display text-sm sm:text-base font-bold text-[var(--hub-heading)] shrink-0">
                  {uiConfig.headerTitle || 'مشاعر'}
                </span>
                <span className="text-[var(--hub-border)] hidden sm:inline">|</span>
                <h2 className="text-xs sm:text-sm font-medium text-[var(--hub-muted)] truncate">
                  {currentSectionTitle}
                  {uiConfig.headerSubtitle ? ` · ${uiConfig.headerSubtitle}` : ''}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end max-w-2xl">
              {/* Global Search Bar */}
              <div className="flex-1 max-w-sm relative">
                <Search className="w-4 h-4 text-[var(--hub-accent)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={uiConfig.searchPlaceholder}
                  className="w-full rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] pr-9 pl-8 py-2 text-xs sm:text-sm text-[var(--hub-text)] placeholder:text-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent-soft)] focus:bg-[var(--hub-surface)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--hub-muted)] hover:text-[var(--hub-heading)] cursor-pointer"
                    aria-label="مسح البحث"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Cloud Save & Sync Indicator */}
              <div
                title={statusBadge.title || statusBadge.label}
                className={`hidden md:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold shrink-0 whitespace-nowrap ${statusBadge.className}`}
              >
                {statusBadge.icon}
                <span>{statusBadge.label}</span>
              </div>

              {/* Personal Theme Picker Modal Trigger */}
              <button
                type="button"
                onClick={() => setThemeModalOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium cursor-pointer shrink-0 whitespace-nowrap ${
                  previewTheme
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200'
                    : 'border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)]'
                }`}
                title="تخصيص الثيم والمظهر الشخصي"
              >
                <Palette className="w-4 h-4 text-[var(--hub-accent)]" />
                <span className="hidden sm:inline">
                  {previewTheme ? 'معاينة الثيم' : uiConfig.themeBtnLabel || 'الثيم'}
                </span>
              </button>

              {/* Light / Dark Mode Switch */}
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-2.5 py-2 text-xs font-medium text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] cursor-pointer shrink-0 whitespace-nowrap"
                title={themeMode === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
                aria-label="تبديل المظهر"
              >
                {themeMode === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 text-[var(--hub-accent)]" />
                    <span className="hidden sm:inline">{uiConfig.lightModeLabel || 'نهاري'}</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-[var(--hub-heading)]" />
                    <span className="hidden sm:inline">{uiConfig.darkModeLabel || 'داكن'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {previewUiConfig && (
            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <Eye className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0" />
                <span>وضع المعاينة المباشرة لتعديلات التصميم نشط حالياً — التغييرات غير محفوظة بعد في السحابة.</span>
              </div>
              <div className="flex items-center gap-2">
                {isSensitiveAdmin && activeSection !== 'settings' && (
                  <button
                    type="button"
                    onClick={() => onSelectSection('settings')}
                    className="px-2.5 py-1 rounded-md bg-[var(--hub-button)] text-[var(--hub-button-text)] font-semibold cursor-pointer"
                  >
                    العودة لمحرر التصميم للحفظ
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewUiConfig(null)}
                  className="px-2.5 py-1 rounded-md border border-amber-400 dark:border-amber-700 bg-white/70 dark:bg-black/20 font-medium cursor-pointer"
                >
                  إنهاء المعاينة
                </button>
              </div>
            </div>
          )}

          {isOffline && (
            <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">
              تعذر الوصول لخادم قاعدة البيانات حالياً. تأكد من الاتصال بالإنترنت قبل إجراء أي تعديلات.
            </div>
          )}
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1380px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Personal Theme Modal */}
      <PersonalThemeModal open={themeModalOpen} onClose={() => setThemeModalOpen(false)} />

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg bg-[var(--hub-surface)] ${
                t.type === 'success'
                  ? 'border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200'
                  : t.type === 'error'
                    ? 'border-red-300 dark:border-red-700 text-red-950 dark:text-red-200'
                    : 'border-[var(--hub-accent-soft)] text-[var(--hub-heading)]'
              }`}
            >
              <span className="leading-snug">{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-current/60 hover:text-current shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
