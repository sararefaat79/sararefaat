import { GCC_COUNTRIES } from './auth-constants';
import { normalizeArabicSearch, tokenizeArabicWithSynonyms } from './assistant-engine';
import type {
  CompanionGift,
  CountryCode,
  Product,
  ProductCategory,
} from '../types/hub';

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  perfumes: 'العطور',
  mamoul: 'المعمول',
  spray: 'السبراي',
};

export const GIFT_KIND_LABELS: Record<CompanionGift['kind'], string> = {
  spray: 'سبراي مطابق',
  musk: 'مسك مطابق',
  other: 'هدية مرفقة',
};

export const LONGEVITY_ESTIMATE_DISCLAIMER =
  'مدة الثبات تقديرية وليست ضماناً ثابتاً، وتختلف حسب نوع البشرة والجو وطريقة الاستخدام.';

export const USAGE_TYPE_OPTIONS = [
  'يومي',
  'رسمي',
  'عملي',
  'مناسبات',
  'سهرات',
  'استخدام متعدد',
] as const;

export const OCCASION_OPTIONS = [
  'العمل',
  'الاجتماعات',
  'الزيارات',
  'المناسبات الرسمية',
  'الأعراس',
  'السهرات',
  'الخروجات',
] as const;

export const SEASON_OPTIONS = [
  'الصيف',
  'الشتاء',
  'الربيع',
  'الخريف',
  'مناسب لكل الفصول',
] as const;

export const TIME_OF_DAY_OPTIONS = [
  'صباحي',
  'نهاري',
  'مسائي',
  'ليلي',
  'مناسب طوال اليوم',
] as const;

export const SILLAGE_LEVEL_OPTIONS = [
  'خفيف',
  'متوسط',
  'قوي',
  'قوي جداً',
] as const;

export type LongevityFilterOption = 'all' | 'short' | 'medium' | 'high' | 'unspecified';
export type SillageFilterOption = 'all' | 'light' | 'medium' | 'strong' | 'very_strong' | 'unspecified';
export type UsageFilterOption = 'all' | (typeof USAGE_TYPE_OPTIONS)[number] | 'unspecified';
export type OccasionFilterOption = 'all' | (typeof OCCASION_OPTIONS)[number] | 'unspecified';
export type SeasonFilterOption = 'all' | (typeof SEASON_OPTIONS)[number] | 'unspecified';
export type TimeOfDayFilterOption = 'all' | (typeof TIME_OF_DAY_OPTIONS)[number] | 'unspecified';

export type ProductStatusFilter =
  | 'all'
  | 'verified_in_stock'
  | 'in_stock'
  | 'out_of_stock'
  | 'needs_review';

export type ProductDataFilter =
  | 'all'
  | 'incomplete'
  | 'estimated'
  | 'official_only'
  | 'needs_review'
  | 'anomalies';

export type ProductSortOption =
  | 'default'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'updated_desc'
  | 'completeness_desc'
  | 'completeness_asc';

export type FieldSourceType = 'official' | 'external' | 'estimated' | 'manual';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FieldProvenanceEntry {
  sourceType: FieldSourceType;
  confidence: ConfidenceLevel;
  sourceLabel?: string;
  sourceUrl?: string;
  updatedAt?: string;
}

export const PRODUCT_FIELD_LABELS: Record<string, string> = {
  nameAr: 'اسم المنتج',
  sku: 'رمز المنتج (SKU)',
  officialDescription: 'الوصف الرسمي',
  fragranceFamily: 'العائلة العطرية',
  fragranceCharacter: 'الطابع العطري',
  perfumeType: 'نوع العطر',
  concentration: 'التركيز',
  topNotes: 'المقدمة العطرية',
  heartNotes: 'قلب العطر',
  baseNotes: 'قاعدة العطر',
  notesAndIngredients: 'المكونات الكاملة',
  longevity: 'الثبات',
  sillage: 'مستوى الفوحان',
  sillageReach: 'مدى انتشار الرائحة',
  sillageDuration: 'مدة بقاء الفوحان',
  usageType: 'الاستخدام',
  occasionUsage: 'المناسبات',
  seasons: 'الفصول المناسبة',
  timeOfDay: 'الأوقات المناسبة',
  targetAudience: 'الفئة المناسبة',
  layeringSuggestions: 'تنسيق العطر',
  size: 'الحجم',
  availability: 'التوفر العام',
  usageInstructions: 'إرشادات الاستخدام',
  extraInfo: 'معلومات إضافية',
  sourceUrl: 'رابط المتجر الرسمي',
  companionGift: 'الهدية المصاحبة',
};

export const SOURCE_TYPE_META: Record<
  FieldSourceType,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  official: {
    label: 'مصدر رسمي (مشاعر)',
    shortLabel: 'موثق رسمياً',
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  },
  external: {
    label: 'مصدر خارجي موثوق',
    shortLabel: 'مصدر خارجي',
    badgeClass:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
  },
  estimated: {
    label: 'تقدير إرشادي من معطيات العطر',
    shortLabel: 'تقدير إرشادي',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  },
  manual: {
    label: 'تعديل يدوي محمي',
    shortLabel: 'يدوي محمي',
    badgeClass:
      'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
  },
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'ثقة عالية',
  medium: 'ثقة متوسطة',
  low: 'ثقة منخفضة / يحتاج مراجعة',
};

export interface ProductStatusDisplay {
  code: 'verified_in_stock' | 'verified_out_of_stock' | 'needs_review_in_stock' | 'needs_review_out_of_stock';
  label: string;
  shortLabel: string;
  tone: 'emerald' | 'red' | 'amber';
  isOutOfStock: boolean;
  needsReview: boolean;
}

export interface FragranceMetricLevel {
  recorded: boolean;
  level: number; // 0..5 (0 strictly when unrecorded)
  maxLevel: number;
  text: string;
  scaleLabel: string;
  isEstimated?: boolean;
}

export interface ExtendedFragranceGuidance {
  concentration: string;
  timeOfDay: string;
  usageType: string;
  sillageReach: string;
  sillageDuration: string;
  targetAudience: string;
  layeringSuggestions: string;
  cleanPerfumeType: string;
  cleanUsageInstructions: string;
  cleanExtraInfo: string;
}

export interface AlternativeMatchResult {
  product: Product;
  score: number;
  isExplicit: boolean;
  reasons: string[];
}

export interface ProductCompletenessSummary {
  percent: number;
  filledCount: number;
  totalCount: number;
  missingFields: Array<{ key: string; label: string }>;
  isComplete: boolean;
  hasEstimatedFields: boolean;
  hasOfficialData: boolean;
  hasExternalData: boolean;
  hasManualEdits: boolean;
  estimatedFieldCount: number;
  officialFieldCount: number;
}

export interface CatalogDuplicateGroup {
  reason: string;
  matchKey: string;
  products: Product[];
}

export interface CatalogConflictIssue {
  product: Product;
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

export interface CatalogAnomaliesReport {
  duplicates: CatalogDuplicateGroup[];
  conflicts: CatalogConflictIssue[];
  affectedProductIds: Set<string>;
}

export function isFilledFragranceValue(val?: string | null): boolean {
  const cleaned = (val || '').trim();
  if (!cleaned) return false;
  const low = cleaned.toLowerCase();
  return (
    cleaned !== '—' &&
    cleaned !== '-' &&
    low !== 'غير مسجل' &&
    low !== 'غير محدد' &&
    low !== 'غير معروف' &&
    !low.includes('لم تتوفر معلومات')
  );
}

export function formatPriceNumber(price: number | null | undefined, currency: string): string {
  if (price === null || price === undefined) return 'السعر غير متاح حاليًا لهذه الدولة';
  return `${price} ${currency}`;
}

export function resolveProductStatusDisplay(
  product: Pick<Product, 'availability' | 'reviewStatus' | 'countryPrices'>,
  countryCode: CountryCode
): ProductStatusDisplay {
  const countryAvail = (product.countryPrices?.[countryCode]?.availability || product.availability || '')
    .trim()
    .toLowerCase();
  const isOutOfStock =
    countryAvail.includes('out of stock') ||
    countryAvail.includes('غير متوفر') ||
    countryAvail.includes('نفذ') ||
    countryAvail === 'unavailable';
  const needsReview = product.reviewStatus === 'needs_review';

  if (needsReview && isOutOfStock) {
    return {
      code: 'needs_review_out_of_stock',
      label: 'غير متوفر · قيد المراجعة',
      shortLabel: 'قيد المراجعة',
      tone: 'amber',
      isOutOfStock: true,
      needsReview: true,
    };
  }
  if (needsReview) {
    return {
      code: 'needs_review_in_stock',
      label: 'متوفر · قيد المراجعة',
      shortLabel: 'قيد المراجعة',
      tone: 'amber',
      isOutOfStock: false,
      needsReview: true,
    };
  }
  if (isOutOfStock) {
    return {
      code: 'verified_out_of_stock',
      label: 'غير متوفر حالياً',
      shortLabel: 'غير متوفر',
      tone: 'red',
      isOutOfStock: true,
      needsReview: false,
    };
  }
  return {
    code: 'verified_in_stock',
    label: 'متوفر ومعتمد',
    shortLabel: 'متوفر',
    tone: 'emerald',
    isOutOfStock: false,
    needsReview: false,
  };
}

/**
 * Strictly maps recorded longevity/sillage strings to a visual 1..5 bar without ever fabricating scores.
 * Empty, dash, or explicit "غير محدد" / "غير مسجل" placeholders always return recorded=false and level=0.
 */
export function parseFragranceMetricLevel(rawValue?: string | null): FragranceMetricLevel {
  const cleaned = (rawValue || '').trim();
  const normalized = cleaned.toLowerCase();

  if (!isFilledFragranceValue(cleaned) || normalized === 'تحتاج مراجعة' || normalized === 'n/a') {
    return {
      recorded: false,
      level: 0,
      maxLevel: 5,
      text: normalized.includes('لم تتوفر معلومات') ? cleaned : 'غير محدد',
      scaleLabel: 'غير محدد',
      isEstimated: false,
    };
  }

  if (normalized.startsWith('غير منطبق')) {
    return {
      recorded: false,
      level: 0,
      maxLevel: 5,
      text: cleaned,
      scaleLabel: 'غير منطبق',
      isEstimated: false,
    };
  }

  const isEstimated = normalized.includes('تقدير');

  if (
    normalized.includes('دون مستوى') ||
    normalized.includes('بدون مستوى') ||
    normalized.includes('دون تحديد مستوى')
  ) {
    return {
      recorded: false,
      level: 0,
      maxLevel: 5,
      text: cleaned,
      scaleLabel: 'وصفي',
      isEstimated: isEstimated || normalized.includes('وصفي'),
    };
  }

  const ratioMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:\/|من)\s*5/);
  if (ratioMatch) {
    const val = Math.max(1, Math.min(5, Math.round(Number(ratioMatch[1]))));
    return {
      recorded: true,
      level: val,
      maxLevel: 5,
      text: cleaned,
      scaleLabel: `${val}/5`,
      isEstimated,
    };
  }

  const hourMatches = normalized.match(/(\d+)\s*(?:(\+)|(?:-|–|إلى|to)\s*(\d+))?\s*(?:ساعة|ساعات|hr|hrs|h\b)/);
  if (hourMatches) {
    const minHours = Number(hourMatches[1]);
    const hasPlus = Boolean(hourMatches[2]);
    const maxHours = Number(hourMatches[3] || hourMatches[1]);
    let level = 3;
    if (minHours >= 12 && (hasPlus || maxHours > 12)) level = 5;
    else if (maxHours > 12) level = 5;
    else if (maxHours >= 8) level = 4;
    else if (maxHours >= 5) level = 3;
    else if (maxHours >= 3) level = 2;
    else level = 1;
    return {
      recorded: true,
      level,
      maxLevel: 5,
      text: cleaned,
      scaleLabel: `${level}/5`,
      isEstimated,
    };
  }

  if (
    normalized.includes('قوي جداً') ||
    normalized.includes('قوي جدا') ||
    normalized.includes('ممتاز') ||
    normalized.includes('فائق') ||
    normalized.includes('عالي جداً') ||
    normalized.includes('مرتفع جداً') ||
    normalized.includes('ثبات فائق') ||
    normalized.includes('فواح جداً') ||
    normalized.includes('nuclear') ||
    normalized.includes('eternal')
  ) {
    return { recorded: true, level: 5, maxLevel: 5, text: cleaned, scaleLabel: '5/5', isEstimated };
  }

  if (
    normalized.includes('قوي') ||
    normalized.includes('عالي') ||
    normalized.includes('عالية') ||
    normalized.includes('ثابت جداً') ||
    normalized.includes('فواح') ||
    normalized.includes('مرتفع') ||
    normalized.includes('طويل') ||
    normalized.includes('جيد جداً') ||
    normalized.includes('strong') ||
    normalized.includes('high') ||
    normalized.includes('long')
  ) {
    return { recorded: true, level: 4, maxLevel: 5, text: cleaned, scaleLabel: '4/5', isEstimated };
  }

  if (
    normalized.includes('خفيف') ||
    normalized.includes('ناعم') ||
    normalized.includes('هادئ') ||
    normalized.includes('قريب') ||
    normalized.includes('محدود') ||
    normalized.includes('light') ||
    normalized.includes('intimate') ||
    normalized.includes('soft')
  ) {
    return { recorded: true, level: 2, maxLevel: 5, text: cleaned, scaleLabel: '2/5', isEstimated };
  }

  if (
    normalized.includes('ضعيف') ||
    normalized.includes('بسيط') ||
    normalized.includes('قصير') ||
    normalized.includes('weak')
  ) {
    return { recorded: true, level: 1, maxLevel: 5, text: cleaned, scaleLabel: '1/5', isEstimated };
  }

  return { recorded: true, level: 3, maxLevel: 5, text: cleaned, scaleLabel: '3/5', isEstimated };
}

export function splitOlfactoryNotes(rawNotes?: string | null): string[] {
  if (!rawNotes) return [];
  return rawNotes
    .split(/[،,·/|•\n]+/)
    .map((part) => part.trim())
    .filter((part) => Boolean(part) && !part.includes('لم تتوفر معلومات') && part !== 'غير محدد');
}

// ---------------------------------------------------------------------------
// Internal Notes Markers: [بدائل مرتبطة: ...] + [توثيق: ...]
// Stored strictly inside internalNotes <= 1950 chars to satisfy firestore.rules
// ---------------------------------------------------------------------------
const LINKED_ALT_REGEX = /\[بدائل\s+مرتبطة:\s*([^\]]+)\]/g;
const PROVENANCE_BLOCK_REGEX = /\[توثيق:\s*([^\]]+)\]/g;
const EXT_URLS_BLOCK_REGEX = /\[مصادر_خارجية:\s*([^\]]+)\]/g;

const FIELD_CODE_TO_KEY: Record<string, string> = {
  od: 'officialDescription',
  ff: 'fragranceFamily',
  fc: 'fragranceCharacter',
  pt: 'perfumeType',
  cn: 'concentration',
  tn: 'topNotes',
  hn: 'heartNotes',
  bn: 'baseNotes',
  ni: 'notesAndIngredients',
  lg: 'longevity',
  sg: 'sillage',
  sr: 'sillageReach',
  sd: 'sillageDuration',
  ut: 'usageType',
  oc: 'occasionUsage',
  sn: 'seasons',
  td: 'timeOfDay',
  ta: 'targetAudience',
  ui: 'usageInstructions',
  ly: 'layeringSuggestions',
  ex: 'extraInfo',
};

const KEY_TO_FIELD_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_CODE_TO_KEY).map(([code, key]) => [key, code])
);

const SRC_TO_CHAR: Record<FieldSourceType, string> = {
  official: 'o',
  external: 'e',
  estimated: 'a',
  manual: 'm',
};
const CHAR_TO_SRC: Record<string, FieldSourceType> = {
  o: 'official',
  e: 'external',
  a: 'estimated',
  m: 'manual',
};

const CONF_TO_CHAR: Record<ConfidenceLevel, string> = {
  high: 'h',
  medium: 'm',
  low: 'l',
};
const CHAR_TO_CONF: Record<string, ConfidenceLevel> = {
  h: 'high',
  m: 'medium',
  l: 'low',
};

export function extractLinkedAlternativesFromNotes(internalNotes?: string | null): string[] {
  if (!internalNotes) return [];
  const matches = Array.from(internalNotes.matchAll(/\[بدائل\s+مرتبطة:\s*([^\]]+)\]/g));
  if (matches.length === 0) return [];
  const raw = matches[0][1] || '';
  return raw
    .split(/[،,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractExternalSourceUrlsFromNotes(internalNotes?: string | null): string[] {
  if (!internalNotes) return [];
  const m = internalNotes.match(/\[مصادر_خارجية:\s*([^\]]+)\]/);
  if (!m) return [];
  return m[1]
    .split(/\s*\|\s*/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http'));
}

export function stripAlternativeMarker(internalNotes?: string | null): string {
  if (!internalNotes) return '';
  return internalNotes
    .replace(LINKED_ALT_REGEX, '')
    .replace(PROVENANCE_BLOCK_REGEX, '')
    .replace(EXT_URLS_BLOCK_REGEX, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export const stripSystemMarkers = stripAlternativeMarker;

function encodeProvenanceCompact(provenance: Record<string, FieldProvenanceEntry>): {
  block: string;
  externalUrls: string[];
} {
  const entries: string[] = [];
  const externalUrlsSet = new Set<string>();

  for (const [key, entry] of Object.entries(provenance)) {
    const code = KEY_TO_FIELD_CODE[key] || key.slice(0, 8);
    const sChar = SRC_TO_CHAR[entry.sourceType] || 'a';
    const cChar = CONF_TO_CHAR[entry.confidence] || 'm';
    const stamp = entry.updatedAt ? entry.updatedAt.slice(2, 10).replace(/-/g, '') : '';
    entries.push(stamp ? `${code}=${sChar}|${cChar}|${stamp}` : `${code}=${sChar}|${cChar}`);
    if (entry.sourceType === 'external' && entry.sourceUrl?.startsWith('http')) {
      externalUrlsSet.add(entry.sourceUrl.trim());
    }
  }

  return {
    block: entries.length > 0 ? `[توثيق: ${entries.join(';')}]` : '',
    externalUrls: Array.from(externalUrlsSet).slice(0, 2),
  };
}

function decodeProvenanceCompact(internalNotes?: string | null): Record<string, FieldProvenanceEntry> {
  const result: Record<string, FieldProvenanceEntry> = {};
  if (!internalNotes) return result;
  const match = internalNotes.match(/\[توثيق:\s*([^\]]+)\]/);
  if (!match) return result;

  const externalUrls = extractExternalSourceUrlsFromNotes(internalNotes);
  const parts = match[1].split(';').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const [rawKey, val] = part.split('=');
    if (!rawKey || !val) continue;
    const key = FIELD_CODE_TO_KEY[rawKey] || rawKey;
    const [sChar, cChar, stamp] = val.split('|');
    const sourceType = CHAR_TO_SRC[sChar] || 'estimated';
    const confidence = CHAR_TO_CONF[cChar] || 'medium';
    const updatedAt =
      stamp && /^\d{6}$/.test(stamp)
        ? `20${stamp.slice(0, 2)}-${stamp.slice(2, 4)}-${stamp.slice(4, 6)}`
        : undefined;
    result[key] = {
      sourceType,
      confidence,
      sourceLabel: SOURCE_TYPE_META[sourceType].label,
      ...(sourceType === 'external' && externalUrls[0] ? { sourceUrl: externalUrls[0] } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }
  return result;
}

export function mergeInternalNotesWithMetadata(
  visibleNotes: string,
  linkedIds: string[],
  provenanceMap: Record<string, FieldProvenanceEntry> = {}
): string {
  const cleanNotes = stripSystemMarkers(visibleNotes);
  const uniqueIds = Array.from(new Set(linkedIds.map((id) => id.trim()).filter(Boolean))).slice(0, 5);
  const altTag = uniqueIds.length > 0 ? `[بدائل مرتبطة: ${uniqueIds.join(', ')}]` : '';
  const { block: provTag, externalUrls } = encodeProvenanceCompact(provenanceMap);
  const urlsTag = externalUrls.length > 0 ? `[مصادر_خارجية: ${externalUrls.join(' | ')}]` : '';

  const tags = [altTag, provTag, urlsTag].filter(Boolean);
  const tagsJoined = tags.join('\n');

  const MAX_LEN = 1950;
  if (!cleanNotes) return tagsJoined.slice(0, MAX_LEN);
  if (!tagsJoined) return cleanNotes.slice(0, MAX_LEN);

  const combined = `${cleanNotes}\n${tagsJoined}`;
  if (combined.length <= MAX_LEN) return combined;

  const maxNotesLen = Math.max(200, MAX_LEN - tagsJoined.length - 4);
  return `${cleanNotes.slice(0, maxNotesLen).trim()}\n${tagsJoined}`.slice(0, MAX_LEN);
}

export function mergeLinkedAlternativesIntoNotes(visibleNotes: string, linkedIds: string[]): string {
  const existingProvenance = decodeProvenanceCompact(visibleNotes);
  return mergeInternalNotesWithMetadata(visibleNotes, linkedIds, existingProvenance);
}

export function extractProductProvenance(
  product: Pick<
    Product,
    | 'internalNotes'
    | 'manuallyEditedFields'
    | 'sourceUrl'
    | 'officialDescription'
    | 'topNotes'
    | 'heartNotes'
    | 'baseNotes'
    | 'notesAndIngredients'
    | 'fragranceFamily'
    | 'fragranceCharacter'
    | 'perfumeType'
    | 'longevity'
    | 'sillage'
    | 'occasionUsage'
    | 'seasons'
    | 'usageInstructions'
    | 'extraInfo'
  >
): Record<string, FieldProvenanceEntry> {
  const stored = decodeProvenanceCompact(product.internalNotes);
  const manualSet = new Set(product.manuallyEditedFields || []);
  const externalUrls = extractExternalSourceUrlsFromNotes(product.internalNotes);
  const out: Record<string, FieldProvenanceEntry> = { ...stored };
  const ext = extractExtendedGuidance(product);

  const inspectFields: Array<[string, string | undefined, boolean]> = [
    ['officialDescription', product.officialDescription, true],
    ['topNotes', product.topNotes, true],
    ['heartNotes', product.heartNotes, true],
    ['baseNotes', product.baseNotes, true],
    ['notesAndIngredients', product.notesAndIngredients, true],
    ['fragranceFamily', product.fragranceFamily, false],
    ['fragranceCharacter', product.fragranceCharacter, false],
    ['perfumeType', product.perfumeType, false],
    ['longevity', product.longevity, false],
    ['sillage', product.sillage, false],
    ['sillageReach', ext.sillageReach, false],
    ['sillageDuration', ext.sillageDuration, false],
    ['usageType', ext.usageType, false],
    ['occasionUsage', product.occasionUsage, false],
    ['seasons', product.seasons, false],
    ['timeOfDay', ext.timeOfDay, false],
    ['usageInstructions', product.usageInstructions, false],
    ['extraInfo', product.extraInfo, false],
  ];

  for (const [key, value, defaultOfficialIfPresent] of inspectFields) {
    if (manualSet.has(key)) {
      out[key] = {
        ...(out[key] || {}),
        sourceType: 'manual',
        confidence: 'high',
        sourceLabel: 'تعديل يدوي معتمد ومغلق',
      };
      continue;
    }

    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === 'غير محدد') continue;

    if (out[key]) {
      if (out[key].sourceType === 'official' && !out[key].sourceUrl && product.sourceUrl) {
        out[key].sourceUrl = product.sourceUrl;
      }
      if (out[key].sourceType === 'external' && !out[key].sourceUrl && externalUrls[0]) {
        out[key].sourceUrl = externalUrls[0];
      }
      continue;
    }

    if (trimmed.includes('تقدير') || trimmed.includes('لم تتوفر معلومات')) {
      out[key] = {
        sourceType: 'estimated',
        confidence: trimmed.includes('لم تتوفر معلومات') ? 'low' : 'medium',
        sourceLabel: 'تقدير إرشادي مبني على النوتات والطابع',
      };
    } else if (defaultOfficialIfPresent && product.sourceUrl?.includes('mashaer.store')) {
      out[key] = {
        sourceType: 'official',
        confidence: 'high',
        sourceLabel: 'بيانات المتجر الرسمي لمشاعر',
        sourceUrl: product.sourceUrl,
      };
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Extended Fragrance Guidance Sub-fields (persisted inside existing Firestore fields)
// ---------------------------------------------------------------------------
const TIME_OF_DAY_REGEX = /^(?:الأوقات\s+المناسبة|الوقت\s+المناسب|الأوقات)\s*[:：]\s*(.+)$/m;
const USAGE_TYPE_REGEX = /^(?:الاستخدام|طبيعة\s+الاستخدام|نوع\s+الاستخدام)\s*[:：]\s*(.+)$/m;
const SILLAGE_REACH_REGEX = /^(?:انتشار\s+الفوحان|مدى\s+الانتشار)\s*[:：]\s*(.+)$/m;
const SILLAGE_DURATION_REGEX = /^(?:مدة\s+بقاء\s+الفوحان|مدة\s+الفوحان)\s*[:：]\s*(.+)$/m;
const TARGET_AUDIENCE_REGEX = /^(?:الفئة\s+المناسبة|الجمهور\s+المستهدف)\s*[:：]\s*(.+)$/m;
const LAYERING_REGEX = /^(?:تنسيق\s+العطر|التنسيق\s+والخلط)\s*[:：]\s*(.+)$/m;
const CONCENTRATION_INLINE_REGEX = /(?:التركيز\s*[:：]\s*([^|·\n]+))/i;

function stripStructuredLines(raw: string): string {
  return raw
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return (
        !TIME_OF_DAY_REGEX.test(t) &&
        !USAGE_TYPE_REGEX.test(t) &&
        !SILLAGE_REACH_REGEX.test(t) &&
        !SILLAGE_DURATION_REGEX.test(t) &&
        !LAYERING_REGEX.test(t) &&
        !TARGET_AUDIENCE_REGEX.test(t)
      );
    })
    .join('\n')
    .trim();
}

export function extractExtendedGuidance(
  product: Pick<Product, 'perfumeType' | 'usageInstructions' | 'extraInfo'>
): ExtendedFragranceGuidance {
  const usageRaw = product.usageInstructions || '';
  const extraRaw = product.extraInfo || '';
  const typeRaw = product.perfumeType || '';

  const concMatch = typeRaw.match(CONCENTRATION_INLINE_REGEX);
  const concentration = concMatch ? concMatch[1].trim() : '';

  const timeMatch = usageRaw.match(TIME_OF_DAY_REGEX) || extraRaw.match(TIME_OF_DAY_REGEX);
  const timeOfDay = timeMatch ? timeMatch[1].trim() : '';

  const usageTypeMatch = extraRaw.match(USAGE_TYPE_REGEX) || usageRaw.match(USAGE_TYPE_REGEX);
  const usageType = usageTypeMatch ? usageTypeMatch[1].trim() : '';

  const reachMatch = extraRaw.match(SILLAGE_REACH_REGEX) || usageRaw.match(SILLAGE_REACH_REGEX);
  const sillageReach = reachMatch ? reachMatch[1].trim() : '';

  const durMatch = extraRaw.match(SILLAGE_DURATION_REGEX) || usageRaw.match(SILLAGE_DURATION_REGEX);
  const sillageDuration = durMatch ? durMatch[1].trim() : '';

  const audienceMatch = extraRaw.match(TARGET_AUDIENCE_REGEX) || usageRaw.match(TARGET_AUDIENCE_REGEX);
  const targetAudience = audienceMatch ? audienceMatch[1].trim() : '';

  const layeringMatch = usageRaw.match(LAYERING_REGEX) || extraRaw.match(LAYERING_REGEX);
  const layeringSuggestions = layeringMatch ? layeringMatch[1].trim() : '';

  const cleanPerfumeType = typeRaw
    .replace(CONCENTRATION_INLINE_REGEX, '')
    .replace(/\s*[·|]\s*[·|]\s*/g, ' · ')
    .replace(/^[\s·|]+|[\s·|]+$/g, '')
    .trim();

  return {
    concentration,
    timeOfDay,
    usageType,
    sillageReach,
    sillageDuration,
    targetAudience,
    layeringSuggestions,
    cleanPerfumeType,
    cleanUsageInstructions: stripStructuredLines(usageRaw),
    cleanExtraInfo: stripStructuredLines(extraRaw),
  };
}

export function composeExtendedGuidance(
  base: { perfumeType?: string; usageInstructions?: string; extraInfo?: string },
  patch: Partial<{
    concentration: string;
    timeOfDay: string;
    usageType: string;
    sillageReach: string;
    sillageDuration: string;
    targetAudience: string;
    layeringSuggestions: string;
  }>
): { perfumeType: string; usageInstructions: string; extraInfo: string } {
  const current = extractExtendedGuidance(base);
  const nextConc = (patch.concentration ?? current.concentration).trim();
  const nextTime = (patch.timeOfDay ?? current.timeOfDay).trim();
  const nextUsageType = (patch.usageType ?? current.usageType).trim();
  const nextReach = (patch.sillageReach ?? current.sillageReach).trim();
  const nextSillageDur = (patch.sillageDuration ?? current.sillageDuration).trim();
  const nextAudience = (patch.targetAudience ?? current.targetAudience).trim();
  const nextLayering = (patch.layeringSuggestions ?? current.layeringSuggestions).trim();

  let nextPerfumeType = current.cleanPerfumeType;
  if (nextConc) {
    nextPerfumeType = nextPerfumeType ? `${nextPerfumeType} · التركيز: ${nextConc}` : `التركيز: ${nextConc}`;
  }

  const usageLines: string[] = [];
  if (current.cleanUsageInstructions) usageLines.push(current.cleanUsageInstructions);
  if (nextTime) usageLines.push(`الأوقات المناسبة: ${nextTime}`);
  if (nextLayering) usageLines.push(`تنسيق العطر: ${nextLayering}`);

  const extraLines: string[] = [];
  if (current.cleanExtraInfo) extraLines.push(current.cleanExtraInfo);
  if (nextUsageType) extraLines.push(`الاستخدام: ${nextUsageType}`);
  if (nextReach) extraLines.push(`انتشار الفوحان: ${nextReach}`);
  if (nextSillageDur) extraLines.push(`مدة بقاء الفوحان: ${nextSillageDur}`);
  if (nextAudience) extraLines.push(`الفئة المناسبة: ${nextAudience}`);

  return {
    perfumeType: nextPerfumeType.slice(0, 200),
    usageInstructions: usageLines.join('\n').slice(0, 2000),
    extraInfo: extraLines.join('\n').slice(0, 2000),
  };
}

// ---------------------------------------------------------------------------
// 6-Attribute Filtering Logic (Longevity, Sillage, Usage, Occasions, Seasons, TimeOfDay)
// ---------------------------------------------------------------------------
export interface ProductAttributeFilters {
  longevity: LongevityFilterOption;
  sillage: SillageFilterOption;
  usage: UsageFilterOption;
  occasion: OccasionFilterOption;
  season: SeasonFilterOption;
  timeOfDay: TimeOfDayFilterOption;
}

export const DEFAULT_ATTRIBUTE_FILTERS: ProductAttributeFilters = {
  longevity: 'all',
  sillage: 'all',
  usage: 'all',
  occasion: 'all',
  season: 'all',
  timeOfDay: 'all',
};

export function matchesProductAttributeFilters(
  product: Product,
  filters: ProductAttributeFilters
): boolean {
  const ext = extractExtendedGuidance(product);

  if (filters.longevity !== 'all') {
    const m = parseFragranceMetricLevel(product.longevity);
    if (filters.longevity === 'unspecified') {
      if (m.recorded) return false;
    } else if (!m.recorded) {
      return false;
    } else if (filters.longevity === 'short' && m.level > 2) {
      return false;
    } else if (filters.longevity === 'medium' && m.level !== 3) {
      return false;
    } else if (filters.longevity === 'high' && m.level < 4) {
      return false;
    }
  }

  if (filters.sillage !== 'all') {
    const raw = (product.sillage || '').trim();
    const low = raw.toLowerCase();
    const m = parseFragranceMetricLevel(raw);
    if (filters.sillage === 'unspecified') {
      if (m.recorded) return false;
    } else if (!m.recorded) {
      return false;
    } else if (filters.sillage === 'very_strong' && !(low.includes('قوي جداً') || low.includes('قوي جدا') || m.level === 5)) {
      return false;
    } else if (filters.sillage === 'strong' && !(low.includes('قوي') || low.includes('فواح') || m.level >= 4)) {
      return false;
    } else if (filters.sillage === 'medium' && !(low.includes('متوسط') || low.includes('معتدل') || m.level === 3)) {
      return false;
    } else if (filters.sillage === 'light' && !(low.includes('خفيف') || low.includes('ناعم') || m.level <= 2)) {
      return false;
    }
  }

  if (filters.usage !== 'all') {
    const val = normalizeArabicSearch(ext.usageType);
    if (filters.usage === 'unspecified') {
      if (isFilledFragranceValue(ext.usageType)) return false;
    } else {
      const hay = normalizeArabicSearch(`${ext.usageType} ${product.occasionUsage || ''}`);
      const targetNorm = normalizeArabicSearch(filters.usage);
      const isMulti = val.includes('متعدد');
      if (!hay.includes(targetNorm) && !(filters.usage !== 'استخدام متعدد' && isMulti)) {
        return false;
      }
    }
  }

  if (filters.occasion !== 'all') {
    if (filters.occasion === 'unspecified') {
      if (isFilledFragranceValue(product.occasionUsage)) return false;
    } else {
      const hay = normalizeArabicSearch(product.occasionUsage || '');
      const target = normalizeArabicSearch(filters.occasion);
      if (!hay.includes(target)) return false;
    }
  }

  if (filters.season !== 'all') {
    if (filters.season === 'unspecified') {
      if (isFilledFragranceValue(product.seasons)) return false;
    } else {
      const hay = normalizeArabicSearch(product.seasons || '');
      const target = normalizeArabicSearch(filters.season);
      const allSeasonsMatch =
        hay.includes('كل الفصول') || hay.includes('جميع الفصول') || hay.includes('طوال العام') || hay.includes('الاربع');
      if (filters.season === 'مناسب لكل الفصول') {
        if (!allSeasonsMatch) return false;
      } else if (!hay.includes(target) && !allSeasonsMatch) {
        return false;
      }
    }
  }

  if (filters.timeOfDay !== 'all') {
    if (filters.timeOfDay === 'unspecified') {
      if (isFilledFragranceValue(ext.timeOfDay)) return false;
    } else {
      const hay = normalizeArabicSearch(ext.timeOfDay);
      const target = normalizeArabicSearch(filters.timeOfDay);
      const allDayMatch = hay.includes('طوال اليوم') || hay.includes('كل الاوقات') || hay.includes('جميع الاوقات');
      if (filters.timeOfDay === 'مناسب طوال اليوم') {
        if (!allDayMatch) return false;
      } else if (!hay.includes(target) && !allDayMatch) {
        return false;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Strict Perfume-Only Alternative Matcher (NEVER recommends sprays as perfume alternatives)
// ---------------------------------------------------------------------------
const NON_PERFUME_REGEX = /(?:سبراي|\bspray\b|all\s*over\s*spray|\bmist\b|معطر|بخاخ|معمول|\bmamoul\b|بخور)/i;

export function isSprayOrNonPerfumeProduct(
  p: Pick<Product, 'category' | 'nameAr' | 'nameEn' | 'perfumeType' | 'size'>
): boolean {
  if (p.category !== 'perfumes') return true;
  const hay = `${p.nameAr || ''} ${p.nameEn || ''} ${p.perfumeType || ''}`;
  return NON_PERFUME_REGEX.test(hay);
}

function isCompatibleAlternative(target: Product, candidate: Product): boolean {
  if (candidate.id === target.id) return false;
  if (target.category === 'perfumes') {
    return candidate.category === 'perfumes' && !isSprayOrNonPerfumeProduct(candidate);
  }
  return candidate.category === target.category;
}

export function findAlternativeProductsWithReasons(
  target: Product,
  allProducts: Product[],
  limit = 3
): AlternativeMatchResult[] {
  const explicitKeys = extractLinkedAlternativesFromNotes(target.internalNotes);
  const selected: AlternativeMatchResult[] = [];
  const usedIds = new Set<string>([target.id]);

  for (const key of explicitKeys) {
    const keyLower = key.toLowerCase();
    const match = allProducts.find(
      (p) =>
        !usedIds.has(p.id) &&
        isCompatibleAlternative(target, p) &&
        (p.id === key || (p.sku && p.sku.toLowerCase() === keyLower))
    );
    if (match) {
      selected.push({
        product: match,
        score: 100,
        isExplicit: true,
        reasons: ['بديل مرتبط ومعتمد يدوياً'],
      });
      usedIds.add(match.id);
      if (selected.length >= limit) return selected;
    }
  }

  const targetTokens = new Set(
    tokenizeArabicWithSynonyms(
      `${target.fragranceFamily || ''} ${target.fragranceCharacter || ''} ${target.notesAndIngredients || ''} ${target.topNotes || ''} ${target.heartNotes || ''} ${target.baseNotes || ''} ${target.occasionUsage || ''}`
    )
  );
  const targetNoteItems = new Set(
    [
      ...splitOlfactoryNotes(target.topNotes),
      ...splitOlfactoryNotes(target.heartNotes),
      ...splitOlfactoryNotes(target.baseNotes),
    ].map((n) => normalizeArabicSearch(n))
  );

  const scored = allProducts
    .filter((p) => !usedIds.has(p.id) && isCompatibleAlternative(target, p))
    .map((p): AlternativeMatchResult => {
      let score = 0;
      const reasons: string[] = [];

      if (p.category === target.category) score += 2;
      if (
        target.fragranceFamily &&
        p.fragranceFamily &&
        normalizeArabicSearch(p.fragranceFamily) === normalizeArabicSearch(target.fragranceFamily)
      ) {
        score += 7;
        reasons.push(`نفس العائلة: ${p.fragranceFamily}`);
      }

      if (target.fragranceCharacter && p.fragranceCharacter) {
        const cTokens = tokenizeArabicWithSynonyms(target.fragranceCharacter);
        const pCharNorm = normalizeArabicSearch(p.fragranceCharacter);
        if (cTokens.some((tok) => tok.length > 2 && pCharNorm.includes(tok))) {
          score += 3;
          reasons.push('طابع عطري متقارب');
        }
      }

      const pNoteItems = [
        ...splitOlfactoryNotes(p.topNotes),
        ...splitOlfactoryNotes(p.heartNotes),
        ...splitOlfactoryNotes(p.baseNotes),
      ];
      const sharedNotes = pNoteItems.filter((n) => targetNoteItems.has(normalizeArabicSearch(n)));
      if (sharedNotes.length > 0) {
        score += sharedNotes.length * 3;
        reasons.push(`نوتات مشتركة: ${Array.from(new Set(sharedNotes)).slice(0, 3).join('، ')}`);
      }

      const pTokens = tokenizeArabicWithSynonyms(
        `${p.fragranceFamily || ''} ${p.fragranceCharacter || ''} ${p.notesAndIngredients || ''} ${p.topNotes || ''} ${p.heartNotes || ''} ${p.baseNotes || ''} ${p.occasionUsage || ''}`
      );
      for (const tok of pTokens) {
        if (targetTokens.has(tok)) score += 2;
      }

      if (reasons.length === 0 && score > 2) {
        reasons.push('تقارب في التكوين العطري العام');
      }

      return { product: p, score, isExplicit: false, reasons };
    })
    .filter((x) => x.score > 2)
    .sort((a, b) => b.score - a.score);

  for (const entry of scored) {
    selected.push(entry);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function findAlternativeProducts(
  target: Product,
  allProducts: Product[],
  limit = 3
): Product[] {
  return findAlternativeProductsWithReasons(target, allProducts, limit).map((item) => item.product);
}

// ---------------------------------------------------------------------------
// Completeness Index Calculator
// ---------------------------------------------------------------------------
const COMPLETENESS_CRITERIA: Array<{
  key: string;
  label: string;
  check: (p: Product, ext: ExtendedFragranceGuidance) => boolean;
}> = [
  { key: 'officialDescription', label: 'الوصف الرسمي', check: (p) => Boolean(p.officialDescription?.trim()) },
  { key: 'fragranceFamily', label: 'العائلة العطرية', check: (p) => isFilledFragranceValue(p.fragranceFamily) },
  { key: 'fragranceCharacter', label: 'الطابع العطري', check: (p) => isFilledFragranceValue(p.fragranceCharacter) },
  { key: 'perfumeType', label: 'النوع والتركيز', check: (p) => isFilledFragranceValue(p.perfumeType) },
  { key: 'topNotes', label: 'المقدمة العطرية', check: (p) => isFilledFragranceValue(p.topNotes) || isFilledFragranceValue(p.notesAndIngredients) },
  { key: 'heartNotes', label: 'قلب العطر', check: (p) => isFilledFragranceValue(p.heartNotes) || isFilledFragranceValue(p.notesAndIngredients) },
  { key: 'baseNotes', label: 'قاعدة العطر', check: (p) => isFilledFragranceValue(p.baseNotes) || isFilledFragranceValue(p.notesAndIngredients) },
  { key: 'longevity', label: 'الثبات', check: (p) => isFilledFragranceValue(p.longevity) },
  { key: 'sillage', label: 'الفوحان والانتشار', check: (p) => isFilledFragranceValue(p.sillage) },
  { key: 'usageType', label: 'الاستخدام', check: (_p, ext) => isFilledFragranceValue(ext.usageType) },
  { key: 'occasionUsage', label: 'المناسبات', check: (p) => isFilledFragranceValue(p.occasionUsage) },
  { key: 'seasons', label: 'الفصول', check: (p) => isFilledFragranceValue(p.seasons) },
  { key: 'timeOfDay', label: 'الأوقات المناسبة', check: (_p, ext) => isFilledFragranceValue(ext.timeOfDay) },
  {
    key: 'usageInstructions',
    label: 'إرشادات الاستخدام والتنسيق',
    check: (_p, ext) => isFilledFragranceValue(ext.cleanUsageInstructions) || isFilledFragranceValue(ext.layeringSuggestions),
  },
];

export function calculateProductCompleteness(product: Product): ProductCompletenessSummary {
  const missingFields: Array<{ key: string; label: string }> = [];
  let filledCount = 0;
  const ext = extractExtendedGuidance(product);

  for (const criterion of COMPLETENESS_CRITERIA) {
    if (criterion.check(product, ext)) {
      filledCount += 1;
    } else {
      missingFields.push({ key: criterion.key, label: criterion.label });
    }
  }

  const totalCount = COMPLETENESS_CRITERIA.length;
  const percent = Math.round((filledCount / totalCount) * 100);
  const provenance = extractProductProvenance(product);
  const provValues = Object.values(provenance);

  const estimatedFieldCount = provValues.filter((e) => e.sourceType === 'estimated').length;
  const officialFieldCount = provValues.filter((e) => e.sourceType === 'official').length;
  const hasExternalData = provValues.some((e) => e.sourceType === 'external');
  const hasManualEdits =
    (product.manuallyEditedFields?.length || 0) > 0 || provValues.some((e) => e.sourceType === 'manual');

  return {
    percent,
    filledCount,
    totalCount,
    missingFields,
    isComplete: missingFields.length === 0,
    hasEstimatedFields: estimatedFieldCount > 0,
    hasOfficialData: officialFieldCount > 0,
    hasExternalData,
    hasManualEdits,
    estimatedFieldCount,
    officialFieldCount,
  };
}

// ---------------------------------------------------------------------------
// Catalog Duplicate & Data Conflict Detection
// ---------------------------------------------------------------------------
export function detectCatalogAnomalies(products: Product[]): CatalogAnomaliesReport {
  const duplicates: CatalogDuplicateGroup[] = [];
  const conflicts: CatalogConflictIssue[] = [];
  const affectedProductIds = new Set<string>();

  const bySku = new Map<string, Product[]>();
  const byNameAr = new Map<string, Product[]>();
  const bySlug = new Map<string, Product[]>();

  for (const p of products) {
    if (p.sku?.trim()) {
      const k = p.sku.trim().toLowerCase();
      bySku.set(k, [...(bySku.get(k) || []), p]);
    }
    const nameNorm = normalizeArabicSearch(p.nameAr);
    if (nameNorm.length >= 3) {
      byNameAr.set(nameNorm, [...(byNameAr.get(nameNorm) || []), p]);
    }
    const urlSlug = p.sourceUrl?.match(/\/products\/([^/?#]+)/i)?.[1]?.toLowerCase();
    if (urlSlug) {
      bySlug.set(urlSlug, [...(bySlug.get(urlSlug) || []), p]);
    }

    if (p.syncConflictNote?.trim()) {
      affectedProductIds.add(p.id);
      conflicts.push({
        product: p,
        severity: 'warning',
        code: 'sync_conflict',
        message: p.syncConflictNote,
      });
    }

    if (p.reviewStatus === 'needs_review') {
      affectedProductIds.add(p.id);
      conflicts.push({
        product: p,
        severity: 'warning',
        code: 'needs_review',
        message: 'المنتج معلم كـ «قيد المراجعة» ويتطلب اعتماداً إدارياً.',
      });
    }

    const availLower = (p.availability || '').toLowerCase();
    const countryEntries = Object.values(p.countryPrices || {}).filter(Boolean);
    if (countryEntries.length > 0) {
      const anyCountryInStock = countryEntries.some((e) => e?.availability === 'in stock');
      const allOutOfStock = countryEntries.every((e) => e?.availability !== 'in stock');
      if (availLower === 'متوفر' && allOutOfStock) {
        affectedProductIds.add(p.id);
        conflicts.push({
          product: p,
          severity: 'warning',
          code: 'availability_mismatch',
          message: 'الحالة العامة «متوفر» بينما جميع أسعار الدول غير متوفرة أو غير مدرجة.',
        });
      } else if (availLower.includes('غير متوفر') && anyCountryInStock) {
        affectedProductIds.add(p.id);
        conflicts.push({
          product: p,
          severity: 'warning',
          code: 'availability_mismatch',
          message: 'الحالة العامة «غير متوفر» بينما يتوفر المنتج في دولة خليجية أو أكثر.',
        });
      }

      for (const entry of countryEntries) {
        if (entry && entry.price !== null && entry.oldPrice != null && entry.oldPrice <= entry.price) {
          affectedProductIds.add(p.id);
          conflicts.push({
            product: p,
            severity: 'error',
            code: 'invalid_discount',
            message: `تعارض خصم في ${entry.countryNameAr}: السعر قبل الخصم (${entry.oldPrice}) أقل من أو يساوي السعر الحالي (${entry.price}).`,
          });
          break;
        }
      }
    }
  }

  const seenPairSignatures = new Set<string>();
  const registerDupMap = (map: Map<string, Product[]>, reason: string) => {
    for (const [matchKey, group] of map.entries()) {
      if (group.length <= 1) continue;
      const sig = group
        .map((x) => x.id)
        .sort()
        .join('|');
      if (seenPairSignatures.has(sig)) continue;
      seenPairSignatures.add(sig);
      group.forEach((x) => affectedProductIds.add(x.id));
      duplicates.push({ reason, matchKey, products: group });
    }
  };

  registerDupMap(bySku, 'تطابق رمز SKU');
  registerDupMap(byNameAr, 'تطابق الاسم العربي');
  registerDupMap(bySlug, 'تطابق رابط المتجر الرسمي');

  return { duplicates, conflicts, affectedProductIds };
}

// ---------------------------------------------------------------------------
// Note-to-Note Comparison Summary (for Compare Modal)
// ---------------------------------------------------------------------------
export function compareOlfactoryNotesAcrossProducts(products: Product[]): {
  sharedNotes: string[];
  perProductUnique: Record<string, string[]>;
} {
  const noteSets = new Map<string, Map<string, string>>();

  const perProduct = products.map((p) => {
    const rawList = [
      ...splitOlfactoryNotes(p.topNotes),
      ...splitOlfactoryNotes(p.heartNotes),
      ...splitOlfactoryNotes(p.baseNotes),
      ...(p.topNotes || p.heartNotes || p.baseNotes ? [] : splitOlfactoryNotes(p.notesAndIngredients)),
    ];
    const uniqueMap = new Map<string, string>();
    for (const note of rawList) {
      const norm = normalizeArabicSearch(note);
      if (norm && !uniqueMap.has(norm)) {
        uniqueMap.set(norm, note);
      }
    }
    noteSets.set(p.id, uniqueMap);
    return { id: p.id, map: uniqueMap };
  });

  const freq = new Map<string, { display: string; count: number }>();
  for (const item of perProduct) {
    for (const [norm, display] of item.map.entries()) {
      const existing = freq.get(norm);
      if (existing) existing.count += 1;
      else freq.set(norm, { display, count: 1 });
    }
  }

  const sharedNotes = Array.from(freq.entries())
    .filter(([, info]) => info.count >= 2)
    .map(([, info]) => info.display);

  const sharedSet = new Set(
    Array.from(freq.entries())
      .filter(([, info]) => info.count >= 2)
      .map(([norm]) => norm)
  );

  const perProductUnique: Record<string, string[]> = {};
  for (const item of perProduct) {
    perProductUnique[item.id] = Array.from(item.map.entries())
      .filter(([norm]) => !sharedSet.has(norm))
      .map(([, display]) => display);
  }

  return { sharedNotes, perProductUnique };
}

function toTimestampMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts === 'object') {
    if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis();
    }
    if ('seconds' in ts && typeof (ts as { seconds: unknown }).seconds === 'number') {
      return (ts as { seconds: number }).seconds * 1000;
    }
  }
  return 0;
}

export function sortProductsList(
  items: Product[],
  sortBy: ProductSortOption,
  countryCode: CountryCode
): Product[] {
  const copy = [...items];
  switch (sortBy) {
    case 'price_asc':
      return copy.sort((a, b) => {
        const pa = a.countryPrices?.[countryCode]?.price;
        const pb = b.countryPrices?.[countryCode]?.price;
        if (pa === null || pa === undefined) return pb === null || pb === undefined ? 0 : 1;
        if (pb === null || pb === undefined) return -1;
        return pa - pb;
      });
    case 'price_desc':
      return copy.sort((a, b) => {
        const pa = a.countryPrices?.[countryCode]?.price;
        const pb = b.countryPrices?.[countryCode]?.price;
        if (pa === null || pa === undefined) return pb === null || pb === undefined ? 0 : 1;
        if (pb === null || pb === undefined) return -1;
        return pb - pa;
      });
    case 'name_asc':
      return copy.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    case 'updated_desc':
      return copy.sort((a, b) => toTimestampMs(b.updatedAt) - toTimestampMs(a.updatedAt));
    case 'completeness_desc':
      return copy.sort(
        (a, b) => calculateProductCompleteness(b).percent - calculateProductCompleteness(a).percent
      );
    case 'completeness_asc':
      return copy.sort(
        (a, b) => calculateProductCompleteness(a).percent - calculateProductCompleteness(b).percent
      );
    case 'default':
    default:
      return copy.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  }
}

export function buildProductSearchHaystack(product: Product): string {
  const ext = extractExtendedGuidance(product);
  const countryParts: string[] = [];
  for (const c of GCC_COUNTRIES) {
    const entry = product.countryPrices?.[c.code];
    if (entry && entry.price !== null) {
      countryParts.push(`${c.nameAr} ${entry.currency} ${entry.price}`);
    }
  }
  return [
    product.nameAr,
    product.sku,
    CATEGORY_LABELS[product.category],
    product.officialDescription,
    product.fragranceFamily,
    product.fragranceCharacter,
    ext.cleanPerfumeType,
    ext.concentration,
    product.topNotes,
    product.heartNotes,
    product.baseNotes,
    product.notesAndIngredients,
    product.longevity,
    product.sillage,
    ext.sillageReach,
    ext.sillageDuration,
    ext.usageType,
    product.occasionUsage,
    product.seasons,
    ext.timeOfDay,
    ext.targetAudience,
    ext.layeringSuggestions,
    ext.cleanUsageInstructions,
    ext.cleanExtraInfo,
    product.size,
    product.availability,
    stripSystemMarkers(product.internalNotes),
    product.companionGift?.title,
    product.companionGift?.compositionNote,
    ...countryParts,
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildProductNameCopy(product: Product): string {
  const parts = [product.nameAr];
  if (product.size) parts.push(`— ${product.size}`);
  if (product.sku) parts.push(`[${product.sku}]`);
  return parts.join(' ');
}

export function buildProductNotesCopy(product: Product): string {
  const lines: string[] = [`${product.nameAr} — الهرم العطري والمكونات:`];
  if (product.topNotes) lines.push(`• المقدمة: ${product.topNotes}`);
  if (product.heartNotes) lines.push(`• القلب: ${product.heartNotes}`);
  if (product.baseNotes) lines.push(`• القاعدة: ${product.baseNotes}`);
  if (product.notesAndIngredients) lines.push(`• المكونات الكاملة: ${product.notesAndIngredients}`);
  if (lines.length === 1) lines.push('غير محدد.');
  return lines.join('\n');
}

export function buildCustomerPitchCopy(
  product: Product,
  countryCode: CountryCode,
  countryNameAr: string
): string {
  const entry = product.countryPrices?.[countryCode];
  const ext = extractExtendedGuidance(product);
  const displayPrice =
    entry && entry.price !== null
      ? `${entry.price} ${entry.currency}`
      : 'السعر غير متاح حاليًا لهذه الدولة';
  const gift = product.companionGift?.title ? product.companionGift : null;
  const lines: string[] = [
    `${product.nameAr}${product.size ? ` · ${product.size}` : ''}`,
    product.officialDescription,
  ];
  if (product.topNotes || product.heartNotes || product.baseNotes) {
    const pyr: string[] = [];
    if (product.topNotes) pyr.push(`المقدمة: ${product.topNotes}`);
    if (product.heartNotes) pyr.push(`القلب: ${product.heartNotes}`);
    if (product.baseNotes) pyr.push(`القاعدة: ${product.baseNotes}`);
    lines.push(`الهرم العطري: ${pyr.join(' | ')}`);
  } else if (product.notesAndIngredients) {
    lines.push(`النوتات والمكونات: ${product.notesAndIngredients}`);
  }
  const attrParts: string[] = [];
  if (isFilledFragranceValue(product.longevity)) attrParts.push(`الثبات: ${product.longevity} (تقديري)`);
  if (isFilledFragranceValue(product.sillage)) attrParts.push(`الفوحان: ${product.sillage}`);
  if (isFilledFragranceValue(ext.usageType)) attrParts.push(`الاستخدام: ${ext.usageType}`);
  if (isFilledFragranceValue(product.occasionUsage)) attrParts.push(`المناسبات: ${product.occasionUsage}`);
  if (isFilledFragranceValue(product.seasons)) attrParts.push(`الفصول: ${product.seasons}`);
  if (isFilledFragranceValue(ext.timeOfDay)) attrParts.push(`الأوقات: ${ext.timeOfDay}`);
  if (attrParts.length > 0) {
    lines.push(`الأداء والاستخدام: ${attrParts.join(' | ')}`);
  }
  if (gift) {
    lines.push(
      `الهدية المصاحبة: ${gift.title}${gift.compositionNote ? ` — ${gift.compositionNote}` : ''}`
    );
  }
  lines.push(
    `السعر الرسمي في ${countryNameAr}: ${displayPrice}${
      countryCode === 'SA' && entry?.price ? ' (شامل 15% ضريبة القيمة المضافة)' : ''
    }`
  );
  const storeUrl = entry?.storeUrl || product.sourceUrl;
  if (storeUrl) {
    lines.push(`رابط المنتج: ${storeUrl}`);
  }
  return lines.join('\n');
}

export function buildFullProductCopy(
  product: Product,
  countryCode: CountryCode,
  countryNameAr: string,
  alternatives: Product[] = []
): string {
  const status = resolveProductStatusDisplay(product, countryCode);
  const ext = extractExtendedGuidance(product);
  const gift = product.companionGift?.title ? product.companionGift : null;
  const safeAlts = alternatives.filter((a) => isCompatibleAlternative(product, a));
  const lines: string[] = [
    `════════════════════`,
    `${product.nameAr}`,
    `التصنيف: ${CATEGORY_LABELS[product.category]}${product.size ? ` | الحجم: ${product.size}` : ''}${product.sku ? ` | رمز المنتج: ${product.sku}` : ''}`,
    `الحالة في ${countryNameAr}: ${status.label}`,
    ``,
    `الوصف الرسمي:`,
    product.officialDescription,
  ];

  if (product.perfumeType || product.fragranceFamily || product.fragranceCharacter) {
    lines.push(``);
    if (ext.cleanPerfumeType || ext.concentration) {
      lines.push(`النوع / التركيز: ${[ext.cleanPerfumeType, ext.concentration].filter(Boolean).join(' · ')}`);
    }
    if (product.fragranceFamily) lines.push(`العائلة العطرية: ${product.fragranceFamily}`);
    if (product.fragranceCharacter) lines.push(`الطابع العطري: ${product.fragranceCharacter}`);
  }

  if (product.topNotes || product.heartNotes || product.baseNotes || product.notesAndIngredients) {
    lines.push(``);
    lines.push(`الهرم العطري والمكونات:`);
    if (product.topNotes) lines.push(`• المقدمة: ${product.topNotes}`);
    if (product.heartNotes) lines.push(`• القلب: ${product.heartNotes}`);
    if (product.baseNotes) lines.push(`• القاعدة: ${product.baseNotes}`);
    if (product.notesAndIngredients) lines.push(`• الملخص: ${product.notesAndIngredients}`);
  }

  lines.push(``);
  lines.push(`الثبات والفوحان والانتشار:`);
  lines.push(
    `• الثبات: ${isFilledFragranceValue(product.longevity) ? product.longevity : 'غير محدد'} (${LONGEVITY_ESTIMATE_DISCLAIMER})`
  );
  lines.push(`• مستوى الفوحان: ${isFilledFragranceValue(product.sillage) ? product.sillage : 'غير محدد'}`);
  if (isFilledFragranceValue(ext.sillageReach)) lines.push(`• مدى انتشار الرائحة: ${ext.sillageReach}`);
  if (isFilledFragranceValue(ext.sillageDuration)) lines.push(`• مدة بقاء الفوحان: ${ext.sillageDuration}`);

  lines.push(``);
  lines.push(`الاستخدام والمناسبات والفصول والأوقات:`);
  lines.push(`• الاستخدام: ${isFilledFragranceValue(ext.usageType) ? ext.usageType : 'غير محدد'}`);
  lines.push(`• المناسبات: ${isFilledFragranceValue(product.occasionUsage) ? product.occasionUsage : 'غير محدد'}`);
  lines.push(`• الفصول: ${isFilledFragranceValue(product.seasons) ? product.seasons : 'غير محدد'}`);
  lines.push(`• الأوقات: ${isFilledFragranceValue(ext.timeOfDay) ? ext.timeOfDay : 'غير محدد'}`);
  if (ext.cleanUsageInstructions) lines.push(`• طريقة الاستخدام: ${ext.cleanUsageInstructions}`);
  if (ext.layeringSuggestions) lines.push(`• تنسيق العطر: ${ext.layeringSuggestions}`);
  if (ext.cleanExtraInfo) lines.push(`• معلومات إضافية: ${ext.cleanExtraInfo}`);

  if (gift) {
    lines.push(``);
    lines.push(`الهدية المصاحبة: ${gift.title} (${GIFT_KIND_LABELS[gift.kind]})`);
    if (gift.compositionNote) lines.push(gift.compositionNote);
  }

  lines.push(``);
  lines.push(`الأسعار الرسمية في دول الخليج:`);
  for (const c of GCC_COUNTRIES) {
    const entry = product.countryPrices?.[c.code];
    const priceTxt = entry && entry.price !== null ? `${entry.price} ${entry.currency}` : 'غير متاح';
    const availTxt = entry?.availability === 'in stock' ? 'متوفر' : 'غير متوفر';
    lines.push(`• ${c.nameAr}: ${priceTxt} (${availTxt})`);
  }

  if (safeAlts.length > 0) {
    lines.push(``);
    lines.push(`عطور مشابهة مقترحة: ${safeAlts.map((a) => a.nameAr).join('، ')}`);
  }

  const storeUrl = product.countryPrices?.[countryCode]?.storeUrl || product.sourceUrl;
  if (storeUrl) {
    lines.push(``);
    lines.push(`رابط المتجر الرسمي: ${storeUrl}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Filtered Catalog CSV Export (Arabic-safe UTF-8 BOM + All 6 Fragrance Attributes)
// ---------------------------------------------------------------------------
function csvEscape(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildProductsCsvExport(products: Product[], countryCode: CountryCode): string {
  const countryMeta = GCC_COUNTRIES.find((c) => c.code === countryCode) || GCC_COUNTRIES[0];
  const headers = [
    'رمز المنتج',
    'اسم المنتج',
    'التصنيف',
    'الحجم',
    `السعر (${countryMeta.nameAr})`,
    'العملة',
    'العائلة العطرية',
    'الثبات (تقديري)',
    'مستوى الفوحان',
    'مدى انتشار الرائحة',
    'مدة بقاء الفوحان',
    'الاستخدام',
    'المناسبات',
    'الفصول',
    'الأوقات',
    'الاكتمال %',
    'الحقول المحمية يدوياً',
    'رابط المصدر',
  ];

  const rows = products.map((p) => {
    const ext = extractExtendedGuidance(p);
    const comp = calculateProductCompleteness(p);
    const priceEntry = p.countryPrices?.[countryCode];
    return [
      p.sku || '',
      p.nameAr,
      CATEGORY_LABELS[p.category],
      p.size || '',
      priceEntry?.price ?? '',
      priceEntry?.currency || countryMeta.currency,
      p.fragranceFamily || 'غير محدد',
      isFilledFragranceValue(p.longevity) ? p.longevity : 'غير محدد',
      isFilledFragranceValue(p.sillage) ? p.sillage : 'غير محدد',
      isFilledFragranceValue(ext.sillageReach) ? ext.sillageReach : 'غير محدد',
      isFilledFragranceValue(ext.sillageDuration) ? ext.sillageDuration : 'غير محدد',
      isFilledFragranceValue(ext.usageType) ? ext.usageType : 'غير محدد',
      isFilledFragranceValue(p.occasionUsage) ? p.occasionUsage : 'غير محدد',
      isFilledFragranceValue(p.seasons) ? p.seasons : 'غير محدد',
      isFilledFragranceValue(ext.timeOfDay) ? ext.timeOfDay : 'غير محدد',
      `${comp.percent}%`,
      (p.manuallyEditedFields || []).join(' | '),
      p.sourceUrl || '',
    ].map(csvEscape).join(',');
  });

  return '\uFEFF' + [headers.map(csvEscape).join(','), ...rows].join('\r\n');
}
