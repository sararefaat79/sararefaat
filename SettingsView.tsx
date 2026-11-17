import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  Eye,
  FileSpreadsheet,
  Globe,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { PDF_IMPORT_AUDIT_SUMMARY } from '../../lib/attached-pdfs-data';
import { saveSiteBranding } from '../../lib/firestore-service';
import { SPARK_FREE_LIMITS } from '../../lib/quota-monitor';
import {
  ARABIC_FONT_OPTIONS,
  DEFAULT_TYPOGRAPHY,
  findArabicFontOption,
  sanitizeTypographyConfig,
} from '../../lib/fonts';
import {
  BUILT_IN_THEMES,
  buildCustomThemeFromColors,
  DEFAULT_THEME_ID,
  findThemeById,
  getContrastRatio,
} from '../../lib/themes';
import { resolveUiConfig } from '../../lib/ui-defaults';
import { makeSafeDocId } from '../../lib/validation';
import { parseFriendlyFirestoreError, testFirestoreConnection } from '../../lib/firebase';
import { DesignStudioEditor } from '../DesignStudioEditor';
import type { ArabicFontId, MashaerTheme, TypographyConfig } from '../../types/hub';

function QuotaBar({
  label,
  current,
  limit,
  unit = '',
}: {
  label: string;
  current: number;
  limit: number;
  unit?: string;
}) {
  const pct = Math.min(100, Math.round((current / Math.max(1, limit)) * 100));
  const tone =
    pct >= 80
      ? 'bg-red-600 dark:bg-red-500'
      : pct >= 50
        ? 'bg-amber-600 dark:bg-amber-500'
        : 'bg-emerald-600 dark:bg-emerald-500';
  return (
    <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-[var(--hub-heading)]">{label}</span>
        <span className="tabular-nums font-mono-tabular text-[var(--hub-text)]">
          {current.toLocaleString('en-US')} / {limit.toLocaleString('en-US')} {unit} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--hub-surface)] border border-[var(--hub-border)] overflow-hidden">
        <div className={`h-full transition-all ${tone}`} style={{ width: `${Math.max(pct, current > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

export function SettingsView() {
  const {
    branding,
    isSensitiveAdmin,
    notify,
    runPhase2MissingSeed,
    runInitialSeed,
    syncLiveCatalog,
    syncingCatalog,
    seedingPhase2,
    schemaUpgradePending,
    themeMode,
    setThemeModeExplicit,
    previewTheme,
    setPreviewTheme,
    quotaStats,
    runTrackedMutation,
    lastSyncError,
    firebaseUser,
    products,
    situations,
    inquiries,
    policies,
    systemLinks,
    returnStages,
    quickPhrases,
    employeeAlerts,
    uiConfig,
    previewUiConfig,
    setPreviewUiConfig,
  } = useHub();

  const [savingThemeId, setSavingThemeId] = useState<string | null>(null);
  const [savingTypography, setSavingTypography] = useState(false);

  const savedTypography = useMemo(
    () => sanitizeTypographyConfig(branding?.uiConfig?.typography || DEFAULT_TYPOGRAPHY),
    [branding?.uiConfig?.typography]
  );
  const [draftTypography, setDraftTypography] = useState<TypographyConfig>(savedTypography);

  useEffect(() => {
    if (!previewUiConfig?.typography) {
      setDraftTypography(savedTypography);
    }
  }, [savedTypography, previewUiConfig?.typography]);

  // Custom Theme Creator State
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [customNameAr, setCustomNameAr] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customPrimaryHex, setCustomPrimaryHex] = useState('#4A0E1C');
  const [customAccentHex, setCustomAccentHex] = useState('#C5A059');
  const [customLightBgHex, setCustomLightBgHex] = useState('#FAF7F2');
  const [customDarkBgHex, setCustomDarkBgHex] = useState('#13080B');

  const [diagResults, setDiagResults] = useState<string[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

  const activeThemeId = branding?.activeThemeId || DEFAULT_THEME_ID;
  const previousThemeId = branding?.previousThemeId;
  const customThemes = branding?.customThemes || [];
  const allThemes: MashaerTheme[] = useMemo(
    () => [...BUILT_IN_THEMES, ...customThemes],
    [customThemes]
  );
  const activeThemeObj = useMemo(
    () => findThemeById(activeThemeId, customThemes),
    [activeThemeId, customThemes]
  );
  const previousThemeObj = useMemo(
    () => (previousThemeId ? findThemeById(previousThemeId, customThemes) : null),
    [previousThemeId, customThemes]
  );

  const previewCustomTheme = useMemo(
    () =>
      buildCustomThemeFromColors({
        id: editingCustomId || 'preview',
        nameAr: customNameAr || 'معاينة الثيم المخصص',
        nameEn: customNameAr.trim() || 'ثيم مخصص',
        description: customDesc,
        primaryHex: customPrimaryHex,
        accentHex: customAccentHex,
        lightBgHex: customLightBgHex,
        darkBgHex: customDarkBgHex,
      }),
    [editingCustomId, customNameAr, customDesc, customPrimaryHex, customAccentHex, customLightBgHex, customDarkBgHex]
  );

  const latestSyncEntry = useMemo(() => {
    const hist = branding?.syncHistory;
    if (!Array.isArray(hist) || hist.length === 0) return null;
    return hist[hist.length - 1];
  }, [branding]);

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

  const handleApplyTheme = async (targetThemeId: string, nextMode?: 'light' | 'dark') => {
    setSavingThemeId(targetThemeId);
    try {
      const nextPrevious = targetThemeId !== activeThemeId ? activeThemeId : previousThemeId;
      await runTrackedMutation(() =>
        saveSiteBranding(
          {
            activeThemeId: targetThemeId,
            previousThemeId: nextPrevious,
            themeMode: nextMode || themeMode,
          },
          branding
        )
      );
      setPreviewTheme(null);
      if (nextMode) setThemeModeExplicit(nextMode);
      const chosen = findThemeById(targetThemeId, customThemes);
      notify('success', `تم اعتماد وتعميم الثيم العام الافتراضي «${chosen.nameAr}» في Firestore.`);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSavingThemeId(null);
    }
  };

  const handleRevertTheme = async () => {
    if (!previousThemeId || previousThemeId === activeThemeId) return;
    await handleApplyTheme(previousThemeId);
  };

  const handleResetDefaultTheme = async () => {
    await handleApplyTheme(DEFAULT_THEME_ID, 'light');
  };

  const openCreateCustomTheme = () => {
    setEditingCustomId(null);
    setCustomNameAr('');
    setCustomDesc('');
    setCustomPrimaryHex('#4A0E1C');
    setCustomAccentHex('#C5A059');
    setCustomLightBgHex('#FAF7F2');
    setCustomDarkBgHex('#13080B');
    setCustomFormOpen(true);
  };

  const openEditCustomTheme = (t: MashaerTheme) => {
    setEditingCustomId(t.id);
    setCustomNameAr(t.nameAr);
    setCustomDesc(t.description);
    setCustomPrimaryHex(t.swatchHexes[0] || t.light.primary);
    setCustomAccentHex(t.swatchHexes[1] || t.light.accentSoft);
    setCustomLightBgHex(t.light.bg);
    setCustomDarkBgHex(t.dark.bg);
    setCustomFormOpen(true);
  };

  const handleSaveCustomTheme = async (e: React.FormEvent, applyImmediately: boolean) => {
    e.preventDefault();
    if (!customNameAr.trim()) {
      notify('error', 'يُرجى إدخال اسم الثيم المخصص.');
      return;
    }
    const id = editingCustomId || makeSafeDocId('custom_theme');
    const built = buildCustomThemeFromColors({
      id,
      nameAr: customNameAr,
      nameEn: customNameAr.trim() || 'ثيم مخصص',
      description: customDesc,
      primaryHex: customPrimaryHex,
      accentHex: customAccentHex,
      lightBgHex: customLightBgHex,
      darkBgHex: customDarkBgHex,
    });
    const nextList = editingCustomId
      ? customThemes.map((item) => (item.id === editingCustomId ? built : item))
      : [...customThemes, built].slice(-15);

    setSavingThemeId(id);
    try {
      await runTrackedMutation(() =>
        saveSiteBranding(
          {
            customThemes: nextList,
            ...(applyImmediately
              ? {
                  activeThemeId: id,
                  previousThemeId: activeThemeId !== id ? activeThemeId : previousThemeId,
                }
              : {}),
          },
          branding
        )
      );
      setPreviewTheme(null);
      setCustomFormOpen(false);
      notify(
        'success',
        applyImmediately
          ? `تم حفظ وتطبيق الثيم المخصص «${built.nameAr}» وتعميمه في Firestore.`
          : `تم حفظ الثيم المخصص «${built.nameAr}» بنجاح.`
      );
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSavingThemeId(null);
    }
  };

  const handleDeleteCustomTheme = async (theme: MashaerTheme) => {
    const nextList = customThemes.filter((c) => c.id !== theme.id);
    const revertingToDefault = activeThemeId === theme.id;
    setSavingThemeId(theme.id);
    try {
      await runTrackedMutation(() =>
        saveSiteBranding(
          {
            customThemes: nextList,
            ...(revertingToDefault ? { activeThemeId: DEFAULT_THEME_ID, previousThemeId: DEFAULT_THEME_ID } : {}),
          },
          branding
        )
      );
      notify('info', `تم حذف الثيم المخصص «${theme.nameAr}».`);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSavingThemeId(null);
    }
  };

  const handleUpdateTypographyDraft = (patch: Partial<TypographyConfig>) => {
    const next = sanitizeTypographyConfig({ ...draftTypography, ...patch });
    setDraftTypography(next);
    setPreviewUiConfig({
      ...(previewUiConfig || {}),
      typography: next,
    });
  };

  const handleSaveTypography = async () => {
    setSavingTypography(true);
    try {
      const currentResolved = resolveUiConfig(branding);
      const nextTypography = sanitizeTypographyConfig(draftTypography);
      await runTrackedMutation(() =>
        saveSiteBranding(
          {
            uiConfig: {
              ...currentResolved,
              typography: nextTypography,
            },
          },
          branding
        )
      );
      setPreviewUiConfig(null);
      const fontMeta = findArabicFontOption(nextTypography.fontId);
      notify('success', `تم حفظ وتعميم إعدادات الخطوط والمظهر (${fontMeta.nameAr}) في Firestore لجميع الصفحات.`);
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSavingTypography(false);
    }
  };

  const handleResetTypographyDefaults = async () => {
    setSavingTypography(true);
    try {
      const currentResolved = resolveUiConfig(branding);
      await runTrackedMutation(() =>
        saveSiteBranding(
          {
            uiConfig: {
              ...currentResolved,
              typography: DEFAULT_TYPOGRAPHY,
            },
          },
          branding
        )
      );
      setDraftTypography(DEFAULT_TYPOGRAPHY);
      setPreviewUiConfig(null);
      notify('success', 'تمت استعادة الخط وأحجام النصوص الافتراضية وحفظها في Firestore.');
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSavingTypography(false);
    }
  };

  const handleCancelTypographyPreview = () => {
    setDraftTypography(savedTypography);
    if (previewUiConfig) {
      const { typography: _ignored, ...rest } = previewUiConfig;
      setPreviewUiConfig(Object.keys(rest).length > 0 ? rest : null);
    }
  };

  const handleRunDiagnostics = async () => {
    setRunningDiag(true);
    const logs: string[] = [];
    try {
      const conn = await testFirestoreConnection();
      const activeFont = findArabicFontOption(uiConfig.typography.fontId);
      logs.push(conn.ok ? 'اتصال Cloud Firestore: متصل بنجاح' : 'اتصال Cloud Firestore: غير متصل');
      logs.push(
        `المستخدم الحالي: ${firebaseUser?.email} (موثق: ${firebaseUser?.emailVerified ? 'نعم' : 'لا'})`
      );
      logs.push('حالة الصلاحية: مدير نظام حساس (Tier 1 — صلاحية كاملة)');
      logs.push(`الثيم الافتراضي العام: ${activeThemeObj.nameAr} (${themeMode === 'dark' ? 'ليلي' : 'نهاري'})`);
      logs.push(`الخط المعتمد: ${activeFont.nameAr} (${uiConfig.typography.baseSizePx}px)`);
      logs.push(
        schemaUpgradePending
          ? 'تحديث قواعد الأمان (firestore.rules): ينتظر مراجعة'
          : 'قواعد الأمان (firestore.rules): منشورة ومتوافقة'
      );
      setDiagResults(logs);
    } finally {
      setRunningDiag(false);
    }
  };

  const totalCollectionDocs =
    products.length +
    situations.length +
    inquiries.length +
    policies.length +
    systemLinks.length +
    returnStages.length +
    quickPhrases.length +
    employeeAlerts.length;

  return (
    <div className="space-y-8" dir="rtl" lang="ar">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--hub-heading)]">
            إعدادات النظام والثيمات والمزامنة – للمديرين الحساسين (Tier 1) فقط
          </h1>
          <p className="text-xs text-[var(--hub-muted)] mt-1">
            مركز المزامنة الحية مع mashaer.store لـ 6 دول، مراقب باقة Firebase Spark المجانية، محرك 18 ثيم مع المعاينة الحية، وتقرير الملفات الثلاثة.
          </p>
        </div>
      </div>

      {/* Preview Mode Banner */}
      {previewTheme && (
        <div className="rounded-xl border border-[var(--hub-accent)] bg-[var(--hub-surface-alt)] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[var(--hub-heading)]">
            <Eye className="w-4 h-4 text-[var(--hub-accent)]" />
            <span>
              أنت الآن في وضع المعاينة المؤقتة لثيم «{findThemeById(previewTheme.themeId, customThemes).nameAr}» (
              {previewTheme.themeMode === 'dark' ? 'ليلي' : 'نهاري'}).
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleApplyTheme(previewTheme.themeId, previewTheme.themeMode)}
              className="px-3 py-1.5 rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] font-semibold cursor-pointer"
            >
              تعميم هذا الثيم الآن
            </button>
            <button
              type="button"
              onClick={() => setPreviewTheme(null)}
              className="px-3 py-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-heading)] cursor-pointer"
            >
              إلغاء المعاينة
            </button>
          </div>
        </div>
      )}

      {/* 1. Live Store Sync Hub (Moved out of HomeView into Tier 1 Settings) */}
      <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-[var(--hub-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--hub-heading)]">
                مزامنة متجر مشاعر الرسمي (mashaer.store · 6 دول)
              </h2>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5 tabular-nums">
                آخر مزامنة ناجحة:{' '}
                {branding?.lastStoreSyncAt
                  ? new Date(branding.lastStoreSyncAt).toLocaleString('ar-KW')
                  : 'لم تتم مزامنة حية بعد'}
                {branding?.lastStoreSyncStatus ? ` · ${branding.lastStoreSyncStatus}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={syncLiveCatalog}
              disabled={syncingCatalog}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--hub-button)] px-4 py-2 text-xs sm:text-sm font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncingCatalog ? 'animate-spin' : ''}`} />
              <span>{syncingCatalog ? 'جاري السحب والمطابقة...' : 'تشغيل المزامنة الحية الآن'}</span>
            </button>

            <button
              type="button"
              onClick={runPhase2MissingSeed}
              disabled={seedingPhase2}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-[var(--hub-accent-soft)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] disabled:opacity-60 cursor-pointer"
            >
              {seedingPhase2 ? 'جاري الاستكمال...' : 'استكمال السجلات المرجعية الناقصة (دون استبدال)'}
            </button>

            <button
              type="button"
              onClick={runInitialSeed}
              disabled={seedingPhase2}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--hub-border)] text-[var(--hub-muted)] hover:text-[var(--hub-heading)] hover:bg-[var(--hub-bg)] disabled:opacity-60 cursor-pointer"
            >
              تحديث/زرع القيم المبدئية الناقصة
            </button>
          </div>
        </div>

        {lastSyncError && (
          <div className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>تنبيه آخر خطأ مزامنة: {lastSyncError}</span>
            </div>
            <button
              type="button"
              onClick={syncLiveCatalog}
              disabled={syncingCatalog}
              className="px-3 py-1 rounded-md bg-red-700 text-white font-semibold hover:bg-red-800 cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {latestSyncEntry && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
            <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3">
              <div className="text-[var(--hub-muted)]">إجمالي المتجر</div>
              <div className="text-base font-bold text-[var(--hub-heading)] mt-0.5">
                {latestSyncEntry.productCount} منتج
              </div>
            </div>
            <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3">
              <div className="text-[var(--hub-muted)]">محدّثة</div>
              <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">{latestSyncEntry.updatedCount ?? 0}</div>
            </div>
            <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3">
              <div className="text-[var(--hub-muted)]">جديدة</div>
              <div className="text-base font-bold text-[var(--hub-accent)] mt-0.5">{latestSyncEntry.createdCount ?? 0}</div>
            </div>
            <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3">
              <div className="text-[var(--hub-muted)]">تغييرات أسعار</div>
              <div className="text-base font-bold text-[var(--hub-heading)] mt-0.5">{latestSyncEntry.priceChanges}</div>
            </div>
            <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3">
              <div className="text-[var(--hub-muted)]">تعارض تعديل يدوي</div>
              <div className="text-base font-bold text-amber-700 dark:text-amber-300 mt-0.5">{latestSyncEntry.conflictCount ?? 0}</div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-[var(--hub-muted)]">
          حماية التعديلات اليدوية: عند قيام أي مدير بتعديل اسم أو وصف أو رابط منتج يدوياً، تحتفظ المزامنة بتعديل المدير وتُضيف ملاحظة تعارض للتحقق بدلاً من الكتابة فوقه.
        </p>

        {/* Sync History Log */}
        {Array.isArray(branding?.syncHistory) && branding.syncHistory.length > 0 && (
          <div className="pt-3 border-t border-[var(--hub-border)] space-y-2">
            <div className="text-xs font-semibold text-[var(--hub-heading)]">
              سجل عمليات المزامنة الحية المحفوظة في Firestore:
            </div>
            <div className="space-y-1.5 text-xs">
              {branding.syncHistory.slice(-6).reverse().map((entry, idx) => (
                <div
                  key={`${entry.syncedAt}_${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] px-3 py-2 tabular-nums"
                >
                  <span className="font-medium text-[var(--hub-text)]">{entry.status}</span>
                  <span className="text-[var(--hub-muted)]">
                    {new Date(entry.syncedAt).toLocaleString('ar-KW')} · بواسطة {entry.actorEmail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. 100% Free Firebase Spark Quota Monitor */}
      <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-[var(--hub-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--hub-heading)]">
                مراقب استهلاك باقة Firebase Spark المجانية (100% Free Tier)
              </h2>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                عدّاد لحظي داخل الذاكرة للجلسة الحالية (0 كتابات إضافية على Firestore) مقارنة بالحدود اليومية المجانية لخطة Spark.
              </p>
            </div>
          </div>
          <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            السجلات النشطة بالجلسة: {quotaStats.estimatedTotalDocs || totalCollectionDocs} مستند
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuotaBar
            label="قراءات الجلسة مقابل الحد اليومي"
            current={quotaStats.sessionReads}
            limit={SPARK_FREE_LIMITS.dailyReads}
            unit="قراءة"
          />
          <QuotaBar
            label="كتابات الجلسة مقابل الحد اليومي"
            current={quotaStats.sessionWrites}
            limit={SPARK_FREE_LIMITS.dailyWrites}
            unit="كتابة"
          />
          <QuotaBar
            label="حذف الجلسة مقابل الحد اليومي"
            current={quotaStats.sessionDeletes}
            limit={SPARK_FREE_LIMITS.dailyDeletes}
            unit="حذف"
          />
        </div>

        <div className="text-[11px] text-[var(--hub-muted)] flex flex-wrap items-center justify-between gap-2">
          <span>
            تعمل المنصة بدون ترقية Blaze، وبدون Cloud Storage مدفوع، وبدون أي واجهات خارجية مدفوعة.
          </span>
          <span className="tabular-nums">
            آخر تحديث للعداد: {new Date(quotaStats.lastUpdatedAt).toLocaleTimeString('ar-KW')}
          </span>
        </div>
      </section>

      {/* 2.5. Fonts & Global Appearance («الخطوط والمظهر») */}
      {(() => {
        const hasTypographyChanges =
          draftTypography.fontId !== savedTypography.fontId ||
          draftTypography.baseSizePx !== savedTypography.baseSizePx ||
          draftTypography.headingScale !== savedTypography.headingScale ||
          draftTypography.bodyScale !== savedTypography.bodyScale;
        const selectedFontMeta = findArabicFontOption(draftTypography.fontId);

        return (
          <section className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-6 hub-card-elevated">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--hub-border)]">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--hub-surface-alt)] border border-[var(--hub-border)] flex items-center justify-center shrink-0">
                  <Type className="w-5 h-5 text-[var(--hub-accent)]" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-[var(--hub-heading)]">الخطوط والمظهر</h2>
                    {hasTypographyChanges && (
                      <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                        معاينة مباشرة غير محفوظة
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--hub-muted)] mt-1">
                    اختر الخط العربي الرسمي للمنصة واضبط حجم الخط العام والعناوين والنصوص — يُطبّق تلقائياً على جميع الصفحات ويُحفظ سحابياً في Firestore.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {hasTypographyChanges && (
                  <button
                    type="button"
                    onClick={handleCancelTypographyPreview}
                    disabled={savingTypography}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer disabled:opacity-50"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>تراجع</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleResetTypographyDefaults}
                  disabled={savingTypography}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                  <span>استعادة الافتراضي</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveTypography}
                  disabled={savingTypography}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hub-button)] px-4 py-2 text-xs font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingTypography ? 'جارٍ الحفظ...' : 'حفظ وتعميم الخط والمظهر'}</span>
                </button>
              </div>
            </div>

            {/* Live Typography Cards Grid */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--hub-heading)]">اختيار الخط العربي مع معاينة حية لكل خط:</span>
                <span className="text-[11px] text-[var(--hub-muted)]">
                  الخط المختار الآن:{' '}
                  <strong className="text-[var(--hub-accent)]">{selectedFontMeta.nameAr}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {ARABIC_FONT_OPTIONS.map((font) => {
                  const isSelected = draftTypography.fontId === font.id;
                  const isSaved = savedTypography.fontId === font.id;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      onClick={() => handleUpdateTypographyDraft({ fontId: font.id as ArabicFontId })}
                      style={{ fontFamily: font.fontFamilyCss }}
                      className={`text-right rounded-xl border p-4 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-[var(--hub-accent)] bg-[var(--hub-surface-alt)] ring-2 ring-[var(--hub-accent-soft)]/50'
                          : 'border-[var(--hub-border)] bg-[var(--hub-bg)] hover:border-[var(--hub-accent-soft)]'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-[var(--hub-heading)]">{font.nameAr}</div>
                            <div className="text-[11px] text-[var(--hub-accent)] font-medium">{font.character}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isSaved && (
                              <span className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                محفوظ
                              </span>
                            )}
                            {isSelected && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--hub-button)] text-[var(--hub-button-text)] px-2 py-0.5 text-[10px] font-bold">
                                <Check className="w-3 h-3" />
                                مختار
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 space-y-1">
                          <div className="text-sm font-bold text-[var(--hub-heading)] leading-snug">
                            {font.sampleHeadline}
                          </div>
                          <p className="text-xs text-[var(--hub-text)]/90 leading-relaxed">
                            {font.sampleBody}
                          </p>
                        </div>
                      </div>

                      <div className="text-[11px] text-[var(--hub-muted)]">{font.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Global, Heading, and Body Font Size Controls + Combined Live Specimen */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
              <div className="lg:col-span-7 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)]">
                  <SlidersHorizontal className="w-4 h-4 text-[var(--hub-accent)]" />
                  <span>التحكم في أحجام الخطوط على مستوى المنصة بالكامل</span>
                </div>

                {/* Base Global Size */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <label className="font-semibold text-[var(--hub-heading)]">حجم الخط العام للمنصة</label>
                    <span className="font-mono-tabular font-bold text-[var(--hub-accent)]" dir="ltr">
                      {draftTypography.baseSizePx}px
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="range"
                      min={13}
                      max={18}
                      step={1}
                      value={draftTypography.baseSizePx}
                      onChange={(e) => handleUpdateTypographyDraft({ baseSizePx: Number(e.target.value) })}
                      className="flex-1 min-w-[160px] accent-[var(--hub-button)]"
                    />
                    <div className="flex items-center gap-1">
                      {[13, 14, 15, 16, 17, 18].map((px) => (
                        <button
                          key={px}
                          type="button"
                          onClick={() => handleUpdateTypographyDraft({ baseSizePx: px })}
                          className={`rounded-md border px-2 py-1 text-[11px] font-mono-tabular font-semibold cursor-pointer ${
                            draftTypography.baseSizePx === px
                              ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                              : 'bg-[var(--hub-surface)] text-[var(--hub-heading)] border-[var(--hub-border)] hover:border-[var(--hub-accent-soft)]'
                          }`}
                        >
                          {px}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Headings Scale */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--hub-border)]">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-[var(--hub-heading)]">حجم العناوين (H1 – H4)</label>
                    <span className="font-mono-tabular font-bold text-[var(--hub-accent)]" dir="ltr">
                      {Math.round(draftTypography.headingScale * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.85}
                      max={1.35}
                      step={0.05}
                      value={draftTypography.headingScale}
                      onChange={(e) => handleUpdateTypographyDraft({ headingScale: Number(e.target.value) })}
                      className="flex-1 accent-[var(--hub-button)]"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateTypographyDraft({ headingScale: 1 })}
                      className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1 text-[11px] text-[var(--hub-muted)] hover:text-[var(--hub-heading)] cursor-pointer"
                    >
                      100%
                    </button>
                  </div>
                </div>

                {/* Body Scale */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--hub-border)]">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-[var(--hub-heading)]">حجم النصوص والبطاقات والجداول</label>
                    <span className="font-mono-tabular font-bold text-[var(--hub-accent)]" dir="ltr">
                      {Math.round(draftTypography.bodyScale * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0.85}
                      max={1.25}
                      step={0.05}
                      value={draftTypography.bodyScale}
                      onChange={(e) => handleUpdateTypographyDraft({ bodyScale: Number(e.target.value) })}
                      className="flex-1 accent-[var(--hub-button)]"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateTypographyDraft({ bodyScale: 1 })}
                      className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1 text-[11px] text-[var(--hub-muted)] hover:text-[var(--hub-heading)] cursor-pointer"
                    >
                      100%
                    </button>
                  </div>
                </div>
              </div>

              {/* Combined Live Specimen Preview */}
              <div
                className="lg:col-span-5 rounded-xl border border-dashed border-[var(--hub-accent-soft)] bg-[var(--hub-bg)] p-5 flex flex-col justify-between gap-4"
                style={{ fontFamily: selectedFontMeta.fontFamilyCss }}
              >
                <div className="space-y-2.5">
                  <div className="text-[11px] font-semibold text-[var(--hub-accent)]">
                    معاينة تطبيقية فورية بالخط والأحجام المختارة:
                  </div>
                  <h3 className="text-xl font-bold text-[var(--hub-heading)] leading-snug">
                    عطر الرئيس — دار مشاعر للعطور
                  </h3>
                  <p className="text-sm text-[var(--hub-text)] leading-relaxed">
                    هلا والله يا غالي، عطر الرئيس من الإصدارات الملكية الأكثر مبيعاً لدينا ويأتيك مع الضمان الذهبي المعتمد والشحن السريع لجميع دول الخليج.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--hub-border)] text-xs text-[var(--hub-muted)] tabular-nums">
                  <span>الكويت: 24.500 د.ك · السعودية: 295 ر.س</span>
                  <span className="font-mono-tabular text-[var(--hub-accent)]">{selectedFontMeta.nameAr}</span>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* 3. Global 18 Perfume & Luxury Themes Engine */}
      <section className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-5 hub-card-elevated">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Palette className="w-5 h-5 text-[var(--hub-accent)] shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold text-[var(--hub-heading)]">
                الثيم الافتراضي العام (18 ثيم فاخر وعطري + مخصص)
              </h2>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                جميع الثيمات معتمدة التباين (WCAG AA ≥ 4.5:1) في الوضعين النهاري والليلي — ويمكن لكل موظف أيضاً تخصيص ثيمه الشخصي من زر «المظهر» دون التأثير على الآخرين.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {previousThemeObj && previousThemeObj.id !== activeThemeId && (
              <button
                type="button"
                onClick={handleRevertTheme}
                disabled={Boolean(savingThemeId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer disabled:opacity-60"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>التراجع للثيم السابق ({previousThemeObj.nameAr.split('(')[0].trim()})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetDefaultTheme}
              disabled={Boolean(savingThemeId) || (activeThemeId === DEFAULT_THEME_ID && themeMode === 'light')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>العودة للثيم الافتراضي</span>
            </button>

            <button
              type="button"
              onClick={openCreateCustomTheme}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hub-button)] px-3.5 py-2 text-xs font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إنشاء ثيم مخصص</span>
            </button>
          </div>
        </div>

        {/* Light / Dark Mode Selector Bar */}
        <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--hub-text)]">
            الثيم الافتراضي المعتمد: <strong className="text-[var(--hub-heading)]">{activeThemeObj.nameAr}</strong>
          </div>
          <div className="inline-flex rounded-lg border border-[var(--hub-border)] p-1 bg-[var(--hub-surface)]">
            <button
              type="button"
              onClick={() => handleApplyTheme(activeThemeId, 'light')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                themeMode === 'light'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'text-[var(--hub-muted)]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>الوضع النهاري</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyTheme(activeThemeId, 'dark')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                  : 'text-[var(--hub-muted)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>الوضع الليلي الفاخر</span>
            </button>
          </div>
        </div>

        {/* Custom Theme Creator Form */}
        {customFormOpen && (
          <form
            onSubmit={(e) => handleSaveCustomTheme(e, true)}
            className="rounded-xl border border-[var(--hub-accent-soft)] bg-[var(--hub-bg)] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--hub-heading)]">
                {editingCustomId
                  ? 'تعديل الثيم المخصص'
                  : 'تصميم ثيم مخصص جديد (مع ضبط التباين التلقائي WCAG AA)'}
              </h3>
              <button
                type="button"
                onClick={() => setCustomFormOpen(false)}
                className="text-xs text-[var(--hub-muted)] hover:underline cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">اسم الثيم</label>
                <input
                  required
                  value={customNameAr}
                  onChange={(e) => setCustomNameAr(e.target.value)}
                  placeholder="مثال: عود السهرة الملكي"
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">الوصف</label>
                <input
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="وصف مختصر لهوية الألوان"
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block text-xs font-semibold text-[var(--hub-heading)] space-y-1">
                <span>اللون الأساسي</span>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-1.5">
                  <input type="color" value={customPrimaryHex} onChange={(e) => setCustomPrimaryHex(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                  <span className="font-mono-tabular text-[11px]" dir="ltr">{customPrimaryHex}</span>
                </div>
              </label>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] space-y-1">
                <span>اللون الثانوي / الذهبي</span>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-1.5">
                  <input type="color" value={customAccentHex} onChange={(e) => setCustomAccentHex(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                  <span className="font-mono-tabular text-[11px]" dir="ltr">{customAccentHex}</span>
                </div>
              </label>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] space-y-1">
                <span>خلفية الوضع النهاري</span>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-1.5">
                  <input type="color" value={customLightBgHex} onChange={(e) => setCustomLightBgHex(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                  <span className="font-mono-tabular text-[11px]" dir="ltr">{customLightBgHex}</span>
                </div>
              </label>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] space-y-1">
                <span>خلفية الوضع الليلي</span>
                <div className="flex items-center gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-1.5">
                  <input type="color" value={customDarkBgHex} onChange={(e) => setCustomDarkBgHex(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                  <span className="font-mono-tabular text-[11px]" dir="ltr">{customDarkBgHex}</span>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--hub-border)]">
              <div className="flex items-center gap-2 text-xs text-[var(--hub-muted)] tabular-nums">
                <span>تباين النص (نهاري): {getContrastRatio(previewCustomTheme.light.text, previewCustomTheme.light.bg).toFixed(1)}:1</span>
                <span>·</span>
                <span>تباين النص (ليلي): {getContrastRatio(previewCustomTheme.dark.text, previewCustomTheme.dark.bg).toFixed(1)}:1</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleSaveCustomTheme(e as unknown as React.FormEvent, false)}
                  disabled={Boolean(savingThemeId)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-heading)] cursor-pointer"
                >
                  حفظ فقط
                </button>
                <button
                  type="submit"
                  disabled={Boolean(savingThemeId)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer"
                >
                  حفظ وتعميم الثيم الآن
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Theme Swatch Cards Grid (Pure Hex Swatches Only) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {allThemes.map((t) => {
            const isActive = activeThemeId === t.id;
            const isPreviewing = previewTheme?.themeId === t.id;
            const lightContrast = getContrastRatio(t.light.text, t.light.surface);
            const darkContrast = getContrastRatio(t.dark.text, t.dark.surface);
            return (
              <div
                key={t.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors ${
                  isActive
                    ? 'border-[var(--hub-accent-soft)] bg-[var(--hub-surface-alt)] ring-1 ring-[var(--hub-accent-soft)]'
                    : isPreviewing
                      ? 'border-[var(--hub-accent)] bg-[var(--hub-surface-alt)]'
                      : 'border-[var(--hub-border)] bg-[var(--hub-bg)] hover:border-[var(--hub-accent-soft)]'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    {t.swatchHexes.slice(0, 6).map((hex, i) => (
                      <span
                        key={`${t.id}_sw_${i}`}
                        className="h-5 flex-1 rounded-md border border-black/10 dark:border-white/15"
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <h3 className="text-xs font-bold text-[var(--hub-heading)] leading-snug">{t.nameAr}</h3>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          افتراضي
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--hub-accent)] mt-0.5">{t.perfumeSource}</div>
                    <p className="text-[11px] text-[var(--hub-muted)] mt-1 leading-relaxed">{t.description}</p>
                  </div>

                  <div className="text-[11px] text-[var(--hub-muted)] tabular-nums leading-relaxed">
                    WCAG AA · نهاري {lightContrast.toFixed(1)}:1 · ليلي {darkContrast.toFixed(1)}:1
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[var(--hub-border)]">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewTheme(
                        isPreviewing ? null : { themeId: t.id, themeMode }
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[11px] font-medium text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{isPreviewing ? 'إنهاء' : 'معاينة'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isActive || savingThemeId === t.id}
                    onClick={() => handleApplyTheme(t.id)}
                    className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-300 cursor-default'
                        : 'bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)]'
                    }`}
                  >
                    {savingThemeId === t.id ? 'جاري التعميم...' : isActive ? 'مُعمّم' : 'تعميم'}
                  </button>

                  {t.isCustom && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditCustomTheme(t)}
                        className="px-2 py-1.5 rounded-lg border border-[var(--hub-border)] text-[11px] text-[var(--hub-heading)] hover:bg-[var(--hub-surface)] cursor-pointer"
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomTheme(t)}
                        className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        title="حذف الثيم المخصص"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Three-File Import Audit Report */}
      <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[var(--hub-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--hub-heading)]">
                تقرير استيراد الملفات الثلاثة وتوحيد البيانات (تقرير الاستيراد)
              </h2>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5 tabular-nums">
                تم حصر ومعالجة {PDF_IMPORT_AUDIT_SUMMARY.filesCount} ملفات رسمية بإجمالي {PDF_IMPORT_AUDIT_SUMMARY.totalPdfRowsImported} بند مرجعي
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { label: 'دليل المواقف', count: situations.length, expected: 67 },
            { label: 'الاستفسارات والأسئلة', count: inquiries.length, expected: 99 },
            { label: 'المنتجات والعطور', count: products.length, expected: 20 },
            { label: 'السياسات الرسمية', count: policies.length, expected: 15 },
            { label: 'روابط الأنظمة', count: systemLinks.length, expected: 11 },
            { label: 'مراحل المرتجع', count: returnStages.length, expected: 5 },
            { label: 'العبارات السريعة', count: quickPhrases.length, expected: 7 },
            { label: 'تنبيهات الموظف', count: employeeAlerts.length, expected: 4 },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3 tabular-nums">
              <div className="text-[var(--hub-muted)]">{stat.label}</div>
              <div className="text-base font-bold text-[var(--hub-heading)] mt-0.5">
                {stat.count}{' '}
                <span className="text-[11px] font-normal text-[var(--hub-muted)]">/ {stat.expected} مرجعي</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PDF_IMPORT_AUDIT_SUMMARY.files.map((f) => (
            <div key={f.fileId} className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-2 text-xs">
              <div className="font-bold text-[var(--hub-heading)]" dir="ltr">{f.fileName}</div>
              <div className="text-[var(--hub-accent)] font-medium">{f.titleAr}</div>
              <div className="font-semibold text-[var(--hub-text)] tabular-nums">{f.importedCountsLabel}</div>
              <p className="text-[var(--hub-muted)] leading-relaxed">{f.notes}</p>
              <div className="text-[11px] font-mono-tabular text-[var(--hub-muted)]" dir="ltr">
                {f.targetCollections.join(' · ')}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2.5">
          <div className="text-xs font-bold text-[var(--hub-heading)] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>التعارضات والفروقات المرصودة بين الملفات والمتجر الرسمي (تُترك للإدارة ولا تُخفى):</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {PDF_IMPORT_AUDIT_SUMMARY.documentedConflicts.map((c) => (
              <div key={c.id} className="rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3 space-y-1">
                <div className="font-bold text-amber-950 dark:text-amber-200">{c.title}</div>
                <p className="text-amber-900 dark:text-amber-300 leading-relaxed">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Comprehensive Admin Design Studio (Cover, Header, Texts, Cards, Buttons, Custom Links, Restore Defaults) */}
      <DesignStudioEditor />

      {/* 6. Connection & Security Check */}
      <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--hub-accent)]" />
            <h2 className="text-base font-bold text-[var(--hub-heading)]">فحص الاتصال وحالة التوثيق في Firestore</h2>
          </div>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={runningDiag}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-heading)] cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{runningDiag ? 'جاري الفحص...' : 'تشغيل الفحص الفعلي'}</span>
          </button>
        </div>
        {diagResults.length > 0 && (
          <ul className="space-y-1.5 text-xs text-emerald-900 dark:text-emerald-300 pt-2">
            {diagResults.map((line, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
