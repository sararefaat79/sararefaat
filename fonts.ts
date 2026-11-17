import type { ArabicFontId, TypographyConfig } from '../types/hub';

export interface ArabicFontOption {
  id: ArabicFontId;
  nameAr: string;
  nameEn: string;
  fontFamilyCss: string;
  character: string;
  description: string;
  sampleHeadline: string;
  sampleBody: string;
}

export const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  fontId: 'ibm_plex',
  baseSizePx: 15,
  headingScale: 1,
  bodyScale: 1,
};

export const ARABIC_FONT_OPTIONS: ArabicFontOption[] = [
  {
    id: 'ibm_plex',
    nameAr: 'IBM Plex Sans Arabic',
    nameEn: 'IBM Plex Sans Arabic',
    fontFamilyCss: "'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif",
    character: 'مؤسسي دقيق ومتوازن',
    description: 'وضوح هندسي ممتاز للقراءة الطويلة، الجداول، والأرقام.',
    sampleHeadline: 'دار مشاعر للعطور — المرجع الموحد لخدمة العملاء',
    sampleBody: 'أهلاً بك يا غالي، يسعدنا خدمتك ومتابعة طلبك بكل اهتمام واحترافية.',
  },
  {
    id: 'tajawal',
    nameAr: 'تجوّل (Tajawal)',
    nameEn: 'Tajawal',
    fontFamilyCss: "'Tajawal', system-ui, -apple-system, sans-serif",
    character: 'أنيق وعصري ناعم',
    description: 'انسيابية دافئة تعكس فخامة دور العطور وسلاسة القراءة العربية.',
    sampleHeadline: 'دار مشاعر للعطور — تجربة خدمة عملاء استثنائية',
    sampleBody: 'عطر الرئيس متوفر الآن بالضمان الذهبي مع شحن سريع لجميع دول الخليج.',
  },
  {
    id: 'cairo',
    nameAr: 'القاهرة (Cairo)',
    nameEn: 'Cairo',
    fontFamilyCss: "'Cairo', system-ui, -apple-system, sans-serif",
    character: 'حديث وبارز للعناوين',
    description: 'خط عربي شهير يوازن بين القوة البصرية للعناوين ونقاء النصوص.',
    sampleHeadline: 'لوحة التشغيل اليومية لخدمة العملاء',
    sampleBody: 'يمكنك نسخ الرد المعتمد أو مراجعة سياسة الاسترجاع خلال ثوانٍ.',
  },
  {
    id: 'almarai',
    nameAr: 'المراعي (Almarai)',
    nameEn: 'Almarai',
    fontFamilyCss: "'Almarai', system-ui, -apple-system, sans-serif",
    character: 'نظيف ومكثف للوحة التحكم',
    description: 'مثالي للواجهات التشغيلية الكثيفة والبطاقات والجداول اليومية.',
    sampleHeadline: 'دليل المواقف التشغيلية والسياسات المعتمدة',
    sampleBody: 'معدل وضوح عالٍ في الشاشات الصغيرة وأجهزة الجوال دون إجهاد بصري.',
  },
  {
    id: 'readex_pro',
    nameAr: 'ريدكس برو (Readex Pro)',
    nameEn: 'Readex Pro',
    fontFamilyCss: "'Readex Pro', system-ui, -apple-system, sans-serif",
    character: 'إنساني راقٍ ومتسق',
    description: 'إيقاع حروف متناسق يجمع بين العصرية والدفء في الرسائل اليومية.',
    sampleHeadline: 'منصة مشاعر لإدارة المعرفة وخدمة العملاء',
    sampleBody: 'تم تحديث الأسعار الخليجية ومراجعة الردود الكويتية المعتمدة.',
  },
  {
    id: 'noto_kufi',
    nameAr: 'نوتو كوفي (Noto Kufi Arabic)',
    nameEn: 'Noto Kufi Arabic',
    fontFamilyCss: "'Noto Kufi Arabic', system-ui, -apple-system, sans-serif",
    character: 'كوفي هندسي رصين',
    description: 'طابع معماري فخم يمنح المنصة هيبة بصرية متزنة ورسمية.',
    sampleHeadline: 'بوابة الهوية الملكية لشركة مشاعر',
    sampleBody: 'جميع الإجراءات والسياسات والردود موثقة ومعتمدة رسمياً للفريق.',
  },
  {
    id: 'changa',
    nameAr: 'تشانجا (Changa)',
    nameEn: 'Changa',
    fontFamilyCss: "'Changa', system-ui, -apple-system, sans-serif",
    character: 'هندسي معبّر ومميز',
    description: 'حروف مربعة عصرية تضفي طابعاً فاخراً ومميزاً على البطاقات والعناوين.',
    sampleHeadline: 'فخامة العطور ودقة الخدمة في مكان واحد',
    sampleBody: 'اطّلع على دليل المنتجات والأسعار والمواقف التشغيلية بكل يسر.',
  },
];

const VALID_FONT_IDS = new Set<ArabicFontId>(ARABIC_FONT_OPTIONS.map((f) => f.id));

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num * 100) / 100));
}

export function sanitizeTypographyConfig(raw?: Partial<TypographyConfig> | null): TypographyConfig {
  const fontId = raw?.fontId && VALID_FONT_IDS.has(raw.fontId) ? raw.fontId : DEFAULT_TYPOGRAPHY.fontId;
  const baseSizePx = Math.round(clampNumber(raw?.baseSizePx, 13, 18, DEFAULT_TYPOGRAPHY.baseSizePx));
  const headingScale = clampNumber(raw?.headingScale, 0.85, 1.35, DEFAULT_TYPOGRAPHY.headingScale);
  const bodyScale = clampNumber(raw?.bodyScale, 0.85, 1.25, DEFAULT_TYPOGRAPHY.bodyScale);
  return {
    fontId,
    baseSizePx,
    headingScale,
    bodyScale,
  };
}

export function findArabicFontOption(fontId?: ArabicFontId | string): ArabicFontOption {
  return ARABIC_FONT_OPTIONS.find((f) => f.id === fontId) || ARABIC_FONT_OPTIONS[0];
}

export function applyTypographyToDocument(typography?: Partial<TypographyConfig> | null): TypographyConfig {
  const resolved = sanitizeTypographyConfig(typography);
  const fontOpt = findArabicFontOption(resolved.fontId);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--hub-font-sans', fontOpt.fontFamilyCss);
    root.style.setProperty('--hub-font-display', fontOpt.fontFamilyCss);
    root.style.setProperty('--hub-font-base-px', `${resolved.baseSizePx}px`);
    root.style.setProperty('--hub-heading-scale', String(resolved.headingScale));
    root.style.setProperty('--hub-body-scale', String(resolved.bodyScale));
    root.dataset.hubFont = resolved.fontId;
  }
  return resolved;
}
