import { AlertCircle, Loader2, Lock, LogIn, LogOut, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { LogoPlacementBadge } from './LogoPlacementBadge';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    accessState,
    firebaseUser,
    signInWithGoogle,
    authLoading,
    authError,
    clearAuthError,
    logout,
    uiConfig,
  } = useHub();

  if (accessState === 'loading') {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[var(--hub-bg)] flex flex-col items-center justify-center p-6"
      >
        <div className="w-12 h-12 rounded-full border-2 border-[var(--hub-accent-soft)] border-t-[var(--hub-heading)] animate-spin mb-4" />
        <p className="text-sm font-medium text-[var(--hub-heading)]">
          جاري التحقق من الهوية والصلاحيات...
        </p>
      </div>
    );
  }

  if (accessState === 'authorized') {
    return <>{children}</>;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[var(--hub-bg)] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] hub-card-elevated overflow-hidden">
        <div className="relative bg-gradient-to-b from-[var(--hub-sidebar)] to-[var(--hub-sidebar-alt)] px-8 py-9 text-center text-[var(--hub-sidebar-text)]">
          {uiConfig.logoPlacements.auth_gate.enabled &&
            Boolean(uiConfig.logoPlacements.auth_gate.imageUrl?.trim()) && (
              <div className="mb-4">
                <LogoPlacementBadge
                  slot={uiConfig.logoPlacements.auth_gate}
                  alt="شعار مشاعر"
                  tone="on-dark"
                />
              </div>
            )}
          <div className="inline-flex items-center justify-center px-3.5 py-1 rounded-md border border-[var(--hub-sidebar-accent)]/40 bg-white/5 text-[11px] font-semibold tracking-wider text-[var(--hub-sidebar-accent)] mb-3">
            شركة مشاعر للعطور
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--hub-sidebar-text)] tracking-wide">
            مركز مشاعر لخدمة العملاء
          </h1>
          <div className="my-3 h-px w-24 mx-auto bg-gradient-to-r from-transparent via-[var(--hub-sidebar-accent)]/70 to-transparent" />
          <p className="text-sm text-[var(--hub-sidebar-accent)]">
            النظام المركزي الموحد لإدارة خدمة العملاء والمعرفة التشغيلية
          </p>
        </div>

        <div className="p-7 sm:p-8">
          {accessState === 'unauthenticated' && (
            <div className="space-y-6 text-center">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-[var(--hub-heading)]">
                  تسجيل الدخول المعتمد
                </h2>
                <p className="text-sm text-[var(--hub-muted)] leading-relaxed">
                  الدخول مقتصر على المديرين والموظفين المصرح لهم عبر حساب Google المعتمد فقط.
                </p>
              </div>
              {authError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-right text-xs sm:text-sm text-red-900 dark:text-red-200 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                  <p className="flex-1 leading-relaxed break-words">{authError}</p>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    aria-label="إغلاق رسالة الخطأ"
                    className="text-red-700/70 hover:text-red-900 dark:text-red-300/70 dark:hover:text-red-100 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={authLoading}
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-[var(--hub-button)] px-6 py-3.5 text-sm font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] disabled:opacity-70 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تسجيل الدخول عبر Google...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>تسجيل الدخول باستخدام Google</span>
                  </>
                )}
              </button>
              <div className="pt-4 border-t border-[var(--hub-border)] flex items-center justify-center gap-2 text-xs text-[var(--hub-muted)]">
                <ShieldCheck className="w-4 h-4 text-[var(--hub-accent)]" />
                <span>تُطبق الصلاحيات عبر نظام المصادقة وقواعد الأمان السحابية المعتمدة</span>
              </div>
            </div>
          )}

          {accessState === 'unverified_email' && (
            <div className="space-y-5 text-center">
              <ShieldAlert className="w-10 h-10 text-amber-700 mx-auto" />
              <h2 className="text-lg font-semibold text-[var(--hub-heading)]">
                البريد الإلكتروني غير موثق
              </h2>
              <p className="text-sm text-[var(--hub-muted)] leading-relaxed">
                لأسباب أمنية، لا يُسمح بالوصول دون توثيق البريد الإلكتروني في حساب Google.
              </p>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] px-5 py-2.5 text-sm font-medium text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}

          {accessState === 'unauthorized' && (
            <div className="space-y-5 text-center">
              <Lock className="w-10 h-10 text-red-700 mx-auto" />
              <h2 className="text-lg font-semibold text-[var(--hub-heading)]">
                الحساب غير مصرح له بالدخول
              </h2>
              <p className="text-sm text-[var(--hub-muted)] leading-relaxed">
                البريد الإلكتروني المسجل{' '}
                <span className="font-mono-tabular font-semibold text-[var(--hub-heading)]" dir="ltr">
                  {firebaseUser?.email}
                </span>{' '}
                غير مدرج ضمن قائمة المديرين أو الموظفين المصرح لهم. يُرجى التواصل مع أحد مديري النظام الحساسين لإضافتك.
              </p>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--hub-button)] px-5 py-2.5 text-sm font-medium text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج وتبديل الحساب</span>
              </button>
            </div>
          )}

          {accessState === 'suspended' && (
            <div className="space-y-5 text-center">
              <ShieldAlert className="w-10 h-10 text-red-700 mx-auto" />
              <h2 className="text-lg font-semibold text-[var(--hub-heading)]">
                تم إيقاف صلاحية الحساب
              </h2>
              <p className="text-sm text-[var(--hub-muted)] leading-relaxed">
                الحساب{' '}
                <span className="font-mono-tabular font-semibold text-[var(--hub-heading)]" dir="ltr">
                  {firebaseUser?.email}
                </span>{' '}
                موقوف حالياً من قبل الإدارة ولا يمكنه قراءة بيانات النظام.
              </p>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--hub-button)] px-5 py-2.5 text-sm font-medium text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
