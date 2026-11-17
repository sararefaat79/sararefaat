import { SECTION_LABELS } from './auth-constants';
import { DEFAULT_BRAND_EMBLEM } from './default-assets';
import { clampNumber, DEFAULT_TYPOGRAPHY, sanitizeTypographyConfig } from './fonts';
import type {
  LogoPlacementsMap,
  LogoSlotConfig,
  LogoSlotFitMode,
  LogoSlotId,
  LogoSlotSize,
  SiteBrandingSettings,
  SiteUiConfig,
  StaffSectionId,
} from '../types/hub';

export const LOGO_SIZE_DEFAULT_PX: Record<LogoSlotSize, number> = {
  sm: 36,
  md: 44,
  lg: 60,
  xl: 88,
};

export const LOGO_SLOT_DIMENSION_BOUNDS: Record<
  LogoSlotId,
  { min: number; maxWidth: number; maxHeight: number }
> = {
  header: { min: 24, maxWidth: 200, maxHeight: 72 },
  sidebar: { min: 24, maxWidth: 220, maxHeight: 120 },
  home: { min: 28, maxWidth: 320, maxHeight: 180 },
  hero_cover: { min: 32, maxWidth: 320, maxHeight: 180 },
  auth_gate: { min: 32, maxWidth: 280, maxHeight: 160 },
};

export const LOGO_SLOT_IDS: LogoSlotId[] = ['header', 'sidebar', 'home', 'hero_cover', 'auth_gate'];

export const LOGO_SLOT_META: Record<
  LogoSlotId,
  { title: string; subtitle: string; locationHint: string }
> = {
  header: {
    title: 'شعار الهيدر العلوي',
    subtitle: 'الشريط العلوي الثابت أعلى جميع الصفحات',
    locationHint: 'يظهر بجانب اسم المنصة والقسم النشط',
  },
  sidebar: {
    title: 'شعار القائمة الجانبية',
    subtitle: 'أعلى القائمة الجانبية عند فتحها (☰)',
    locationHint: 'يختفي تلقائياً عند طيّ القائمة أو إغلاقها',
  },
  home: {
    title: 'شعار الصفحة الرئيسية',
    subtitle: 'شريط تعريفي أعلى لوحة التحكم (اختياري)',
    locationHint: 'مخفي افتراضياً ويمكن تفعيله أو رفعه بشكل مستقل',
  },
  hero_cover: {
    title: 'شعار الغلاف الرئيسي (Hero)',
    subtitle: 'داخل بطاقة الغلاف الترحيبية بالرئيسية',
    locationHint: 'يدعم المحاذاة والأحجام والإطارات المستقلة فوق الغلاف',
  },
  auth_gate: {
    title: 'شعار شاشة تسجيل الدخول',
    subtitle: 'بوابة الدخول قبل الانتقال للنظام',
    locationHint: 'يظهر فوق عنوان المنصة في بطاقة الدخول',
  },
};

export const DEFAULT_LOGO_PLACEMENTS: LogoPlacementsMap = {
  header: {
    enabled: true,
    imageUrl: DEFAULT_BRAND_EMBLEM,
    size: 'sm',
    widthPx: 36,
    heightPx: 36,
    lockAspectRatio: true,
    fitMode: 'contain',
    align: 'right',
    displayStyle: 'rounded',
    showLabel: false,
    labelText: 'مشاعر',
  },
  sidebar: {
    enabled: true,
    imageUrl: DEFAULT_BRAND_EMBLEM,
    size: 'md',
    widthPx: 44,
    heightPx: 44,
    lockAspectRatio: true,
    fitMode: 'contain',
    align: 'right',
    displayStyle: 'rounded',
    showLabel: true,
    labelText: 'شركة مشاعر للعطور',
  },
  home: {
    enabled: false,
    imageUrl: '',
    size: 'md',
    widthPx: 48,
    heightPx: 48,
    lockAspectRatio: true,
    fitMode: 'contain',
    align: 'right',
    displayStyle: 'rounded',
    showLabel: true,
    labelText: 'شركة مشاعر للعطور',
  },
  hero_cover: {
    enabled: false,
    imageUrl: '',
    size: 'lg',
    widthPx: 64,
    heightPx: 64,
    lockAspectRatio: true,
    fitMode: 'contain',
    align: 'right',
    displayStyle: 'framed',
    showLabel: false,
    labelText: 'دار مشاعر للعطور',
  },
  auth_gate: {
    enabled: true,
    imageUrl: DEFAULT_BRAND_EMBLEM,
    size: 'lg',
    widthPx: 72,
    heightPx: 72,
    lockAspectRatio: true,
    fitMode: 'contain',
    align: 'center',
    displayStyle: 'framed',
    showLabel: false,
    labelText: 'مشاعر | Mashaer',
  },
};

export function buildDefaultLogoSlot(slotId: LogoSlotId): LogoSlotConfig {
  const base = DEFAULT_LOGO_PLACEMENTS[slotId];
  return {
    ...base,
    enabled: true,
    imageUrl: base.imageUrl || DEFAULT_BRAND_EMBLEM,
  };
}

export const DEFAULT_UI_CONFIG: SiteUiConfig = {
  // Cover & Hero Banner
  heroVisible: true,
  heroStyle: 'royal_gradient',
  heroCoverUrl: '',
  heroOverlayOpacity: 72,
  logoPlacements: DEFAULT_LOGO_PLACEMENTS,
  typography: DEFAULT_TYPOGRAPHY,
  heroKicker: 'منصة المعرفة وإدارة خدمة العملاء',
  heroTitle: 'لوحة التشغيل اليومية لخدمة العملاء',
  heroDescription:
    'المرجع المركزي الموحد لفريق خدمة العملاء: دليل العطور والأسعار الخليجية، الردود الكويتية المعتمدة، السياسات الرسمية، دليل الـ 67 موقفاً، ومسار المرتجع.',
  heroPrimaryBtnLabel: 'تصفح دليل العطور',
  heroPrimaryBtnTarget: 'products',
  heroSecondaryBtnLabel: 'تخصيص التصميم والإعدادات',

  // Header & Top Bar
  headerTitle: 'مشاعر',
  headerSubtitle: '',
  searchPlaceholder: 'بحث شامل: عطر، سعر دولة، موقف، سياسة...',
  themeBtnLabel: 'الثيم',
  lightModeLabel: 'نهاري',
  darkModeLabel: 'داكن',

  // KPI Cards on Dashboard
  showKpiCards: true,
  kpi1Title: 'العطور والأسعار الخليجية',
  kpi1Cta: 'عرض الكتالوج الكامل',
  kpi2Title: 'دليل المواقف والمرتجع',
  kpi2Cta: 'فتح الـ 67 موقفاً',
  kpi3Title: 'استفسارات العملاء والردود',
  kpi3Cta: 'استعراض الأدلة',
  kpi4Title: 'السياسات والأنظمة',
  kpi4Cta: 'مراجعة السياسات',

  // Dashboard Sections Visibility & Labels
  showShortcutsSection: true,
  shortcutsTitle: 'اختصاراتي السريعة',
  shortcutsEditBtnLabel: 'تخصيص الاختصارات',

  showFavoritesSection: true,
  favoritesTitle: 'مفضلتي السحابية',
  favoritesSubtitle: 'محفوظة لحسابك عبر الأجهزة',
  favoritesEmptyText:
    'اضغط على أيقونة النجمة في دليل المنتجات أو المواقف أو السياسات لإضافة مراجعك اليومية هنا للوصول الفوري.',

  showQuickSystemsSection: true,
  quickSystemsTitle: 'الوصول السريع للأنظمة التشغيلية',
  quickSystemsAllBtnLabel: 'عرض كافة الأنظمة',

  showAssistantSection: true,
  assistantTitle: 'مساعد خدمة العملاء الذكي',
  assistantSubtitle: 'يعمل محلياً عبر قاعدة المعرفة مع فهم اللهجة الكويتية والأسعار الخليجية',
  assistantPlaceholder:
    'الصق رسالة العميل هنا (مثال: جم سعر عطر الرئيس بالسعودية؟ / أبي أرجع العطر ضمن الضمان الذهبي)...',
  assistantBtnLabel: 'اقتراح رد معتمد',

  showReplyCheckerSection: true,
  replyCheckerTitle: 'مدقق الردود',
  replyCheckerSubtitle: 'يفحص اللهجة الكويتية، اللوم، الأسعار، والوعود غير المعتمدة قبل الإرسال',
  replyCheckerPlaceholder: 'اكتب مسودة رد الموظف هنا لفحصها وتنقيحها...',
  replyCheckerBtnLabel: 'فحص الرد',

  showAlertsSection: true,
  alertsTitle: 'تنبيهات ومواقف ذات أولوية',
  alertsAllBtnLabel: 'عرض الكل',

  showUpdatesSection: true,
  updatesTitle: 'أحدث التعديلات والإضافات في المنصة',
  updatesEmptyText: 'لا توجد تحديثات حديثة مسجلة بعد.',

  showPhrasesSection: true,
  phrasesTitle: 'العبارات السريعة المعتمدة',
  phrasesAllBtnLabel: 'عرض الكل',

  showCustomLinksSection: false,
  customLinksTitle: 'روابط سريعة إضافية',
  homeCustomLinks: [],

  // Common Action Buttons
  btnDetailsLabel: 'التفاصيل',
  btnCopyLabel: 'نسخ',
  btnCompareLabel: 'مقارنة',
  btnStoreLinkLabel: 'رابط المتجر الرسمي',

  // Navigation Labels
  navLabels: {
    home: 'الصفحة الرئيسية',
    products: 'دليل المنتجات والأسعار',
    situations: 'دليل المواقف (67)',
    inquiries: 'استفسارات العملاء',
    responses: 'مكتبة الردود الجاهزة',
    policies: 'السياسات والإجراءات',
    returns: 'مسار المرتجع والاسترداد',
    systems: 'روابط الأنظمة والتشغيل',
  },
};

const LEGACY_COMPANY_HERO_TITLES = new Set([
  'مركز مشاعر لخدمة العملاء',
  'مشاعر لخدمة العملاء',
  'مشاعر | Mashaer Customer Care Hub',
]);

const LEGACY_COMPANY_HERO_SUBTITLES = new Set([
  'Mashaer Customer Care Hub',
  'Mashaer Care Hub',
]);

export function sanitizeDashboardHeadline(value: string | undefined, fallback: string, legacySet: Set<string>): string {
  const trimmed = (value || '').trim();
  if (!trimmed || legacySet.has(trimmed)) return fallback;
  return trimmed;
}

function normalizeFitMode(val: unknown, displayStyle: LogoSlotConfig['displayStyle'], fallback: LogoSlotFitMode = 'contain'): LogoSlotFitMode {
  if (val === 'contain' || val === 'cover') return val;
  if (displayStyle === 'clean') return 'contain';
  return fallback;
}

function clampLogoDim(slotId: LogoSlotId, val: unknown, axis: 'w' | 'h', fallback: number): number {
  const bounds = LOGO_SLOT_DIMENSION_BOUNDS[slotId];
  const max = axis === 'w' ? bounds.maxWidth : bounds.maxHeight;
  return Math.round(clampNumber(val, bounds.min, max, fallback));
}

function resolveLogoSlot(
  slotId: LogoSlotId,
  savedSlot: Partial<LogoSlotConfig> | undefined,
  previewSlot: Partial<LogoSlotConfig> | undefined,
  legacyLogoDataUrl?: string
): LogoSlotConfig {
  const def = DEFAULT_LOGO_PLACEMENTS[slotId];
  const hasSaved = savedSlot !== undefined && savedSlot !== null;
  const hasPreview = previewSlot !== undefined && previewSlot !== null;

  // Legacy migration only if this slot was never configured in logoPlacements yet
  const legacyDefaultImage =
    !hasSaved && legacyLogoDataUrl && (slotId === 'header' || slotId === 'sidebar')
      ? legacyLogoDataUrl
      : def.imageUrl;

  const savedSize = savedSlot?.size || def.size;
  const savedFallbackDim = LOGO_SIZE_DEFAULT_PX[savedSize] || def.widthPx || 44;
  const savedDisplayStyle = savedSlot?.displayStyle || def.displayStyle;

  const base: LogoSlotConfig = hasSaved
    ? {
        enabled: typeof savedSlot.enabled === 'boolean' ? savedSlot.enabled : def.enabled,
        // CRITICAL: preserve empty string '' if admin deleted the logo from this slot
        imageUrl: typeof savedSlot.imageUrl === 'string' ? savedSlot.imageUrl : def.imageUrl,
        size: savedSize,
        widthPx: clampLogoDim(slotId, savedSlot.widthPx, 'w', savedSlot.size ? savedFallbackDim : (def.widthPx ?? savedFallbackDim)),
        heightPx: clampLogoDim(slotId, savedSlot.heightPx, 'h', savedSlot.size ? savedFallbackDim : (def.heightPx ?? savedFallbackDim)),
        lockAspectRatio: typeof savedSlot.lockAspectRatio === 'boolean' ? savedSlot.lockAspectRatio : (def.lockAspectRatio ?? true),
        fitMode: normalizeFitMode(savedSlot.fitMode, savedDisplayStyle, def.fitMode ?? 'contain'),
        align: savedSlot.align || def.align,
        displayStyle: savedDisplayStyle,
        showLabel: typeof savedSlot.showLabel === 'boolean' ? savedSlot.showLabel : def.showLabel,
        labelText: typeof savedSlot.labelText === 'string' ? savedSlot.labelText : def.labelText,
      }
    : {
        ...def,
        imageUrl: legacyDefaultImage,
      };

  if (!hasPreview) return base;

  const nextDisplayStyle = previewSlot.displayStyle || base.displayStyle;
  return {
    enabled: typeof previewSlot.enabled === 'boolean' ? previewSlot.enabled : base.enabled,
    imageUrl: typeof previewSlot.imageUrl === 'string' ? previewSlot.imageUrl : base.imageUrl,
    size: previewSlot.size || base.size,
    widthPx: clampLogoDim(slotId, previewSlot.widthPx, 'w', base.widthPx ?? 44),
    heightPx: clampLogoDim(slotId, previewSlot.heightPx, 'h', base.heightPx ?? 44),
    lockAspectRatio:
      typeof previewSlot.lockAspectRatio === 'boolean'
        ? previewSlot.lockAspectRatio
        : base.lockAspectRatio,
    fitMode: normalizeFitMode(previewSlot.fitMode, nextDisplayStyle, base.fitMode ?? 'contain'),
    align: previewSlot.align || base.align,
    displayStyle: nextDisplayStyle,
    showLabel: typeof previewSlot.showLabel === 'boolean' ? previewSlot.showLabel : base.showLabel,
    labelText: typeof previewSlot.labelText === 'string' ? previewSlot.labelText : base.labelText,
  };
}

export function resolveUiConfig(
  branding?: SiteBrandingSettings | null,
  previewOverride?: Partial<SiteUiConfig> | null
): SiteUiConfig {
  const saved = branding?.uiConfig || {};
  const mergedNavLabels: Partial<Record<StaffSectionId, string>> = {
    ...DEFAULT_UI_CONFIG.navLabels,
    ...(saved.navLabels || {}),
    ...(previewOverride?.navLabels || {}),
  };

  const legacyLogo = branding?.logoDataUrl;
  const resolvedLogoPlacements: LogoPlacementsMap = {
    header: resolveLogoSlot('header', saved.logoPlacements?.header, previewOverride?.logoPlacements?.header, legacyLogo),
    sidebar: resolveLogoSlot('sidebar', saved.logoPlacements?.sidebar, previewOverride?.logoPlacements?.sidebar, legacyLogo),
    home: resolveLogoSlot('home', saved.logoPlacements?.home, previewOverride?.logoPlacements?.home, legacyLogo),
    hero_cover: resolveLogoSlot('hero_cover', saved.logoPlacements?.hero_cover, previewOverride?.logoPlacements?.hero_cover, legacyLogo),
    auth_gate: resolveLogoSlot('auth_gate', saved.logoPlacements?.auth_gate, previewOverride?.logoPlacements?.auth_gate, legacyLogo),
  };

  const resolvedTypography = sanitizeTypographyConfig({
    ...DEFAULT_TYPOGRAPHY,
    ...(saved.typography || {}),
    ...(previewOverride?.typography || {}),
  });

  const merged: SiteUiConfig = {
    ...DEFAULT_UI_CONFIG,
    ...saved,
    ...previewOverride,
    logoPlacements: resolvedLogoPlacements,
    typography: resolvedTypography,
    navLabels: mergedNavLabels,
    homeCustomLinks: Array.isArray(previewOverride?.homeCustomLinks)
      ? previewOverride.homeCustomLinks
      : Array.isArray(saved.homeCustomLinks)
        ? saved.homeCustomLinks
        : DEFAULT_UI_CONFIG.homeCustomLinks,
  };

  // Backwards-compatible hero bridge from legacy branding top-level fields if uiConfig has not set custom text
  if (!saved.heroTitle && !previewOverride?.heroTitle && branding?.heroTitle) {
    merged.heroTitle = sanitizeDashboardHeadline(branding.heroTitle, DEFAULT_UI_CONFIG.heroTitle, LEGACY_COMPANY_HERO_TITLES);
  } else {
    merged.heroTitle = sanitizeDashboardHeadline(merged.heroTitle, DEFAULT_UI_CONFIG.heroTitle, LEGACY_COMPANY_HERO_TITLES);
  }

  if (!saved.heroKicker && !previewOverride?.heroKicker && branding?.heroSubtitle) {
    merged.heroKicker = sanitizeDashboardHeadline(
      branding.heroSubtitle,
      DEFAULT_UI_CONFIG.heroKicker,
      LEGACY_COMPANY_HERO_SUBTITLES
    );
  } else {
    merged.heroKicker = sanitizeDashboardHeadline(
      merged.heroKicker,
      DEFAULT_UI_CONFIG.heroKicker,
      LEGACY_COMPANY_HERO_SUBTITLES
    );
  }

  if (!saved.heroDescription && !previewOverride?.heroDescription && branding?.heroDescription) {
    merged.heroDescription = branding.heroDescription.replace(/فريق مشاعر/g, 'فريق خدمة العملاء');
  }

  if (saved.heroVisible === undefined && previewOverride?.heroVisible === undefined && typeof branding?.showHeroText === 'boolean') {
    merged.heroVisible = branding.showHeroText;
  }

  if (!saved.heroCoverUrl && !previewOverride?.heroCoverUrl && branding?.coverDataUrl) {
    merged.heroCoverUrl = branding.coverDataUrl;
  }

  return merged;
}

export function getNavSectionLabel(uiConfig: SiteUiConfig, id: string): string {
  if (uiConfig.navLabels && id in uiConfig.navLabels) {
    const custom = uiConfig.navLabels[id as StaffSectionId];
    if (custom && custom.trim()) return custom.trim();
  }
  return SECTION_LABELS[id] || id;
}

