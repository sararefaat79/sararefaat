import { deleteField, serverTimestamp } from 'firebase/firestore';
import { GCC_COUNTRIES } from './auth-constants';
import { clampString, FIELD_LIMITS } from './validation';
import type {
  CompanionGift,
  CountryCode,
  CountryPriceEntry,
  PriceHistoryEntry,
  Product,
  ProductCategory,
  ProductReviewStatus,
} from '../types/hub';

export const ALLOWED_PRODUCT_DOC_KEYS = new Set<string>([
  'sku',
  'nameAr',
  'nameEn',
  'category',
  'officialDescription',
  'imageUrl',
  'fragranceFamily',
  'fragranceCharacter',
  'perfumeType',
  'sillage',
  'longevity',
  'occasionUsage',
  'seasons',
  'notesAndIngredients',
  'topNotes',
  'heartNotes',
  'baseNotes',
  'size',
  'availability',
  'usageInstructions',
  'extraInfo',
  'internalNotes',
  'companionGift',
  'countryPrices',
  'priceHistory',
  'manuallyEditedFields',
  'syncConflictNote',
  'lastSyncedAt',
  'syncStatus',
  'reviewStatus',
  'sourceUrl',
  'sortOrder',
  'createdAt',
  'updatedAt',
  'updatedBy',
]);

export const PRODUCT_STRING_LIMITS: Readonly<Record<string, number>> = {
  sku: 80,
  nameAr: 200,
  nameEn: 200,
  officialDescription: 4000,
  imageUrl: 1000,
  fragranceFamily: 200,
  fragranceCharacter: 200,
  perfumeType: 200,
  sillage: 120,
  longevity: 120,
  occasionUsage: 300,
  seasons: 200,
  notesAndIngredients: 2000,
  topNotes: 1000,
  heartNotes: 1000,
  baseNotes: 1000,
  size: 120,
  availability: 120,
  usageInstructions: 2000,
  extraInfo: 2000,
  internalNotes: 2000,
  syncConflictNote: 1000,
  lastSyncedAt: 100,
  syncStatus: 120,
  sourceUrl: 500,
  updatedBy: 200,
};

export const COMPANION_GIFT_KEYS = new Set(['title', 'size', 'kind', 'compositionNote']);
export const COMPANION_GIFT_LIMITS = {
  title: 160,
  size: 80,
  kind: 40,
  compositionNote: 800,
} as const;

export const MAX_PRICE_HISTORY_ITEMS = 40;
export const MAX_MANUALLY_EDITED_FIELDS = 35;

export const VALID_PRODUCT_CATEGORIES = new Set<ProductCategory>(['perfumes', 'mamoul', 'spray']);
export const VALID_REVIEW_STATUSES = new Set<ProductReviewStatus>(['verified', 'needs_review']);
export const VALID_COUNTRY_CODES = new Set<CountryCode>(['KW', 'SA', 'AE', 'QA', 'BH', 'OM']);

const LEGACY_STRING_FIELD_ALIASES: ReadonlyArray<{ legacyKey: string; targetKey: string }> = [
  { legacyKey: 'name', targetKey: 'nameAr' },
  { legacyKey: 'title', targetKey: 'nameAr' },
  { legacyKey: 'productName', targetKey: 'nameAr' },
  { legacyKey: 'arabicName', targetKey: 'nameAr' },
  { legacyKey: 'englishName', targetKey: 'nameEn' },
  { legacyKey: 'titleEn', targetKey: 'nameEn' },
  { legacyKey: 'description', targetKey: 'officialDescription' },
  { legacyKey: 'descriptionAr', targetKey: 'officialDescription' },
  { legacyKey: 'desc', targetKey: 'officialDescription' },
  { legacyKey: 'descAr', targetKey: 'officialDescription' },
  { legacyKey: 'notes', targetKey: 'internalNotes' },
  { legacyKey: 'adminNotes', targetKey: 'internalNotes' },
  { legacyKey: 'staffNotes', targetKey: 'internalNotes' },
  { legacyKey: 'ingredients', targetKey: 'notesAndIngredients' },
  { legacyKey: 'fragranceNotes', targetKey: 'notesAndIngredients' },
  { legacyKey: 'url', targetKey: 'sourceUrl' },
  { legacyKey: 'storeUrl', targetKey: 'sourceUrl' },
  { legacyKey: 'productUrl', targetKey: 'sourceUrl' },
  { legacyKey: 'link', targetKey: 'sourceUrl' },
  { legacyKey: 'volume', targetKey: 'size' },
  { legacyKey: 'capacity', targetKey: 'size' },
  { legacyKey: 'bottleSize', targetKey: 'size' },
  { legacyKey: 'stockStatus', targetKey: 'availability' },
  { legacyKey: 'stock', targetKey: 'availability' },
  { legacyKey: 'family', targetKey: 'fragranceFamily' },
  { legacyKey: 'type', targetKey: 'perfumeType' },
  { legacyKey: 'occasions', targetKey: 'occasionUsage' },
  { legacyKey: 'usage', targetKey: 'occasionUsage' },
  { legacyKey: 'season', targetKey: 'seasons' },
];

export function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date);
}

export function isTimestampLike(val: unknown): boolean {
  if (!val) return false;
  if (val instanceof Date) return true;
  if (typeof val === 'object') {
    if ('toDate' in val && typeof (val as { toDate: unknown }).toDate === 'function') return true;
    if ('toMillis' in val && typeof (val as { toMillis: unknown }).toMillis === 'function') return true;
    if ('seconds' in val && typeof (val as { seconds: unknown }).seconds === 'number') return true;
    if ('_methodName' in val) return true;
  }
  return false;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    !('toDate' in value) &&
    !('_methodName' in value)
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export function sanitizeProductCategory(val: unknown, fallback: ProductCategory = 'perfumes'): ProductCategory {
  if (typeof val === 'string') {
    const norm = val.trim().toLowerCase();
    if (norm === 'perfumes' || norm === 'عطور' || norm === 'عطر') return 'perfumes';
    if (norm === 'mamoul' || norm === 'معمول' || norm === 'بخور') return 'mamoul';
    if (norm === 'spray' || norm === 'سبراي' || norm === 'معطر') return 'spray';
  }
  return VALID_PRODUCT_CATEGORIES.has(fallback) ? fallback : 'perfumes';
}

export function sanitizeReviewStatus(
  val: unknown,
  fallback: ProductReviewStatus = 'verified'
): ProductReviewStatus {
  if (val === 'needs_review' || val === 'verified') return val;
  return VALID_REVIEW_STATUSES.has(fallback) ? fallback : 'verified';
}

export function sanitizeCompanionGift(raw: unknown): CompanionGift | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (!isPlainRecord(raw)) return undefined;
  const title = clampString(typeof raw.title === 'string' ? raw.title : String(raw.title || ''), COMPANION_GIFT_LIMITS.title);
  if (!title) return null;
  const kindRaw = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : 'spray';
  const kind: CompanionGift['kind'] =
    kindRaw === 'musk' || kindRaw === 'other' || kindRaw === 'spray' ? kindRaw : 'spray';
  return {
    title,
    size: clampString(typeof raw.size === 'string' ? raw.size : String(raw.size || ''), COMPANION_GIFT_LIMITS.size),
    kind: clampString(kind, COMPANION_GIFT_LIMITS.kind) as CompanionGift['kind'],
    compositionNote: clampString(
      typeof raw.compositionNote === 'string' ? raw.compositionNote : String(raw.compositionNote || ''),
      COMPANION_GIFT_LIMITS.compositionNote
    ),
  };
}

export function sanitizeCountryPrices(
  raw: unknown
): Partial<Record<CountryCode, CountryPriceEntry>> | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const out: Partial<Record<CountryCode, CountryPriceEntry>> = {};
  for (const c of GCC_COUNTRIES) {
    if (!VALID_COUNTRY_CODES.has(c.code)) continue;
    const entry = raw[c.code];
    if (!isPlainRecord(entry)) continue;
    const rawPrice = entry.price;
    const numPrice =
      typeof rawPrice === 'number'
        ? rawPrice
        : typeof rawPrice === 'string' && rawPrice.trim() !== ''
          ? Number(rawPrice)
          : NaN;
    const price = Number.isFinite(numPrice) && numPrice >= 0 ? numPrice : null;

    const rawOldPrice = entry.oldPrice;
    const numOldPrice =
      typeof rawOldPrice === 'number'
        ? rawOldPrice
        : typeof rawOldPrice === 'string' && rawOldPrice.trim() !== ''
          ? Number(rawOldPrice)
          : NaN;
    const oldPrice = Number.isFinite(numOldPrice) && numOldPrice >= 0 ? numOldPrice : null;

    const availStr =
      typeof entry.availability === 'string' && entry.availability.trim()
        ? entry.availability
        : price !== null
          ? 'in stock'
          : 'out of stock';

    const sanitizedEntry: CountryPriceEntry = {
      countryCode: c.code,
      countryNameAr: clampString(
        typeof entry.countryNameAr === 'string' && entry.countryNameAr.trim() ? entry.countryNameAr : c.nameAr,
        60
      ),
      currency: clampString(
        typeof entry.currency === 'string' && entry.currency.trim() ? entry.currency : c.currency,
        20
      ),
      price,
      availability: clampString(availStr, 60),
    };
    if (oldPrice !== null) {
      sanitizedEntry.oldPrice = oldPrice;
    }
    if (typeof entry.discountPercent === 'number' && Number.isFinite(entry.discountPercent)) {
      sanitizedEntry.discountPercent = entry.discountPercent;
    }
    if (typeof entry.storeUrl === 'string' && entry.storeUrl.trim()) {
      sanitizedEntry.storeUrl = clampString(entry.storeUrl.trim(), FIELD_LIMITS.urlMax);
    }
    out[c.code] = sanitizedEntry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizePriceHistory(raw: unknown): PriceHistoryEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length === 0) return [];
  const cleaned: PriceHistoryEntry[] = [];
  for (const item of raw.slice(-MAX_PRICE_HISTORY_ITEMS)) {
    if (!isPlainRecord(item)) continue;
    const code = item.countryCode;
    if (typeof code !== 'string' || !VALID_COUNTRY_CODES.has(code as CountryCode)) continue;
    const prevPrice =
      typeof item.previousPrice === 'number' && Number.isFinite(item.previousPrice)
        ? item.previousPrice
        : null;
    const nextPrice =
      typeof item.newPrice === 'number' && Number.isFinite(item.newPrice) ? item.newPrice : null;
    cleaned.push(
      stripUndefinedDeep({
        recordedAt: clampString(
          typeof item.recordedAt === 'string' && item.recordedAt.trim()
            ? item.recordedAt
            : new Date().toISOString(),
          80
        ),
        countryCode: code as CountryCode,
        currency: clampString(typeof item.currency === 'string' && item.currency.trim() ? item.currency : 'KWD', 20),
        previousPrice: prevPrice,
        newPrice: nextPrice,
        previousAvailability:
          typeof item.previousAvailability === 'string' && item.previousAvailability.trim()
            ? clampString(item.previousAvailability, 60)
            : undefined,
        newAvailability:
          typeof item.newAvailability === 'string' && item.newAvailability.trim()
            ? clampString(item.newAvailability, 60)
            : undefined,
      })
    );
  }
  return cleaned;
}

export function sanitizeManuallyEditedFields(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const unique = Array.from(
    new Set(
      raw
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .map((f) => clampString(f.trim(), 80))
    )
  ).slice(0, MAX_MANUALLY_EDITED_FIELDS);
  return unique;
}

export interface LegacyFieldMappingResult {
  mappedCanonicalFields: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>;
  mappedTransitions: Array<{ from: string; to: string; valuePreview: string }>;
  unmappedLegacyKeys: string[];
  unmappedLegacyData: Record<string, unknown>;
}

/**
 * Non-destructively maps recognizable legacy field names onto canonical Product fields
 * ONLY when the canonical field is missing/blank, and preserves any unmapped legacy keys
 * cleanly so nothing is silently lost.
 */
export function extractLegacyProductMappings(
  rawData: Record<string, unknown> | undefined | null
): LegacyFieldMappingResult {
  const mappedCanonicalFields: Record<string, unknown> = {};
  const mappedTransitions: Array<{ from: string; to: string; valuePreview: string }> = [];
  const unmappedLegacyKeys: string[] = [];
  const unmappedLegacyData: Record<string, unknown> = {};

  if (!rawData) {
    return {
      mappedCanonicalFields: mappedCanonicalFields as LegacyFieldMappingResult['mappedCanonicalFields'],
      mappedTransitions,
      unmappedLegacyKeys,
      unmappedLegacyData,
    };
  }

  const consumedLegacyKeys = new Set<string>();

  for (const { legacyKey, targetKey } of LEGACY_STRING_FIELD_ALIASES) {
    if (!(legacyKey in rawData)) continue;
    const rawVal = rawData[legacyKey];
    if (typeof rawVal !== 'string' || !rawVal.trim()) continue;

    const existingCanonical = rawData[targetKey];
    const alreadyMapped = mappedCanonicalFields[targetKey];
    const targetMissing =
      (typeof existingCanonical !== 'string' || !existingCanonical.trim()) &&
      (typeof alreadyMapped !== 'string' || !alreadyMapped.trim());

    if (targetMissing) {
      const limit = PRODUCT_STRING_LIMITS[targetKey] || 1000;
      mappedCanonicalFields[targetKey] = clampString(rawVal, limit);
      mappedTransitions.push({
        from: legacyKey,
        to: targetKey,
        valuePreview: rawVal.trim().slice(0, 60),
      });
      consumedLegacyKeys.add(legacyKey);
    }
  }

  if ('inStock' in rawData && typeof rawData.inStock === 'boolean') {
    const existingAvail = typeof rawData.availability === 'string' ? rawData.availability.trim() : '';
    if (!existingAvail && !mappedCanonicalFields.availability) {
      mappedCanonicalFields.availability = rawData.inStock ? 'متوفر' : 'غير متوفر حالياً';
      mappedTransitions.push({
        from: 'inStock',
        to: 'availability',
        valuePreview: String(rawData.inStock),
      });
      consumedLegacyKeys.add('inStock');
    }
  }

  for (const orderKey of ['order', 'displayOrder']) {
    if (orderKey in rawData && rawData.sortOrder === undefined) {
      const n = Number(rawData[orderKey]);
      if (Number.isFinite(n)) {
        mappedCanonicalFields.sortOrder = n;
        mappedTransitions.push({
          from: orderKey,
          to: 'sortOrder',
          valuePreview: String(n),
        });
        consumedLegacyKeys.add(orderKey);
      }
    }
  }

  for (const priceKey of ['price', 'priceKw', 'priceKwd']) {
    if (priceKey in rawData && !isPlainRecord(rawData.countryPrices) && !mappedCanonicalFields.countryPrices) {
      const n = Number(rawData[priceKey]);
      if (Number.isFinite(n) && n >= 0) {
        mappedCanonicalFields.countryPrices = {
          KW: {
            countryCode: 'KW',
            countryNameAr: 'الكويت',
            currency: 'KWD',
            price: n,
            availability: 'in stock',
          },
        };
        mappedTransitions.push({
          from: priceKey,
          to: 'countryPrices.KW.price',
          valuePreview: String(n),
        });
        consumedLegacyKeys.add(priceKey);
      }
    }
  }

  for (const giftKey of ['gift', 'companion']) {
    if (giftKey in rawData && rawData.companionGift === undefined) {
      const normalized = sanitizeCompanionGift(rawData[giftKey]);
      if (normalized) {
        mappedCanonicalFields.companionGift = normalized;
        mappedTransitions.push({
          from: giftKey,
          to: 'companionGift',
          valuePreview: normalized.title,
        });
        consumedLegacyKeys.add(giftKey);
      }
    }
  }

  for (const [k, v] of Object.entries(rawData)) {
    if (k === 'id') continue; // synthetic doc ID sometimes leaked into JSON
    if (ALLOWED_PRODUCT_DOC_KEYS.has(k)) continue;
    if (!consumedLegacyKeys.has(k)) {
      unmappedLegacyKeys.push(k);
      unmappedLegacyData[k] = v;
    }
  }

  return {
    mappedCanonicalFields: mappedCanonicalFields as LegacyFieldMappingResult['mappedCanonicalFields'],
    mappedTransitions,
    unmappedLegacyKeys,
    unmappedLegacyData,
  };
}

export interface ProductIntegrityAuditItem {
  id: string;
  nameAr: string;
  sku: string;
  invalidDocId: boolean;
  missingRequired: string[];
  invalidRequiredValues: string[];
  extraUnsupportedKeys: string[];
  hasSyntheticIdField: boolean;
  mappableLegacyKeys: Array<{ from: string; to: string; valuePreview: string }>;
  unmappedLegacyKeys: string[];
  unmappedLegacyData: Record<string, unknown>;
  wrongTypes: string[];
  overLimitFields: Array<{ field: string; length: number; max: number }>;
  companionGiftIssues: string[];
  countryPricesIssues: string[];
  timestampIssues: string[];
  wouldFailFirestoreRules: boolean;
  needsCleanupOrMigration: boolean;
  blockingReasons: string[];
  proposedActions: string[];
}

export interface CatalogIntegrityDryRunReport {
  auditedAt: string;
  totalDocs: number;
  healthyDocs: number;
  failingRulesDocs: number;
  needingCleanupDocs: number;
  items: ProductIntegrityAuditItem[];
}

export function isValidProductDocId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && FIELD_LIMITS.idPattern.test(id);
}

/**
 * Inspects a raw Firestore product document directly against ALL checks inside `firestore.rules`
 * (`isValidProduct`, `isUpdateTimestampValid`, `isValidId`) and TS schema. Zero writes!
 */
export function auditProductDocument(
  docId: string,
  rawData: Record<string, unknown>
): ProductIntegrityAuditItem {
  const invalidDocId = !isValidProductDocId(docId);
  const missingRequired: string[] = [];
  const invalidRequiredValues: string[] = [];
  const wrongTypes: string[] = [];
  const overLimitFields: Array<{ field: string; length: number; max: number }> = [];
  const companionGiftIssues: string[] = [];
  const countryPricesIssues: string[] = [];
  const timestampIssues: string[] = [];
  const blockingReasons: string[] = [];
  const proposedActions: string[] = [];

  const legacyAnalysis = extractLegacyProductMappings(rawData);
  const hasSyntheticIdField = 'id' in rawData;

  const extraUnsupportedKeys = Object.keys(rawData).filter(
    (k) => !ALLOWED_PRODUCT_DOC_KEYS.has(k)
  );

  // 1. Required fields in isValidProduct(data)
  if (typeof rawData.nameAr !== 'string' || rawData.nameAr.trim().length < 1) {
    missingRequired.push('nameAr');
  } else if (rawData.nameAr.length > 200) {
    overLimitFields.push({ field: 'nameAr', length: rawData.nameAr.length, max: 200 });
  }

  if (typeof rawData.category !== 'string') {
    missingRequired.push('category');
  } else if (!VALID_PRODUCT_CATEGORIES.has(rawData.category as ProductCategory)) {
    invalidRequiredValues.push(`category="${rawData.category}"`);
  }

  if (typeof rawData.officialDescription !== 'string' || rawData.officialDescription.trim().length < 1) {
    missingRequired.push('officialDescription');
  } else if (rawData.officialDescription.length > 4000) {
    overLimitFields.push({
      field: 'officialDescription',
      length: rawData.officialDescription.length,
      max: 4000,
    });
  }

  if (typeof rawData.reviewStatus !== 'string') {
    missingRequired.push('reviewStatus');
  } else if (!VALID_REVIEW_STATUSES.has(rawData.reviewStatus as ProductReviewStatus)) {
    invalidRequiredValues.push(`reviewStatus="${rawData.reviewStatus}"`);
  }

  if (typeof rawData.updatedBy !== 'string' || rawData.updatedBy.length < 3) {
    missingRequired.push('updatedBy');
  } else if (rawData.updatedBy.length > 200) {
    overLimitFields.push({ field: 'updatedBy', length: rawData.updatedBy.length, max: 200 });
  }

  if (!('updatedAt' in rawData) || rawData.updatedAt == null) {
    timestampIssues.push('updatedAt مفقود في المستند');
  } else if (!isTimestampLike(rawData.updatedAt) && typeof rawData.updatedAt !== 'string') {
    timestampIssues.push('updatedAt بنوع غير متوافق');
  }

  if ('createdAt' in rawData && rawData.createdAt != null && !isTimestampLike(rawData.createdAt) && typeof rawData.createdAt !== 'string') {
    timestampIssues.push('createdAt بنوع غير قياسي (يجب عدم تعديله عند التحديث)');
  }

  // 2. Optional string fields matching validOptStr
  for (const [key, maxLen] of Object.entries(PRODUCT_STRING_LIMITS)) {
    if (
      key === 'nameAr' ||
      key === 'officialDescription' ||
      key === 'updatedBy'
    ) {
      continue;
    }
    if (!(key in rawData) || rawData[key] === null || rawData[key] === undefined) continue;
    const val = rawData[key];
    if (typeof val !== 'string') {
      wrongTypes.push(`${key} (${Array.isArray(val) ? 'array' : typeof val} بدل string)`);
    } else if (val.length > maxLen) {
      overLimitFields.push({ field: key, length: val.length, max: maxLen });
    }
  }

  // 3. sortOrder
  if ('sortOrder' in rawData && rawData.sortOrder !== null && rawData.sortOrder !== undefined) {
    if (typeof rawData.sortOrder !== 'number' || !Number.isFinite(rawData.sortOrder)) {
      wrongTypes.push(`sortOrder (${typeof rawData.sortOrder} بدل number)`);
    }
  }

  // 4. priceHistory & manuallyEditedFields
  if ('priceHistory' in rawData && rawData.priceHistory !== null && rawData.priceHistory !== undefined) {
    if (!Array.isArray(rawData.priceHistory)) {
      wrongTypes.push('priceHistory (ليس list/array)');
    } else if (rawData.priceHistory.length > MAX_PRICE_HISTORY_ITEMS) {
      overLimitFields.push({
        field: 'priceHistory',
        length: rawData.priceHistory.length,
        max: MAX_PRICE_HISTORY_ITEMS,
      });
    }
  }

  if (
    'manuallyEditedFields' in rawData &&
    rawData.manuallyEditedFields !== null &&
    rawData.manuallyEditedFields !== undefined
  ) {
    if (!Array.isArray(rawData.manuallyEditedFields)) {
      wrongTypes.push('manuallyEditedFields (ليس list/array)');
    } else if (rawData.manuallyEditedFields.length > MAX_MANUALLY_EDITED_FIELDS) {
      overLimitFields.push({
        field: 'manuallyEditedFields',
        length: rawData.manuallyEditedFields.length,
        max: MAX_MANUALLY_EDITED_FIELDS,
      });
    }
  }

  // 5. companionGift exact Firestore rule verification
  if ('companionGift' in rawData && rawData.companionGift !== null && rawData.companionGift !== undefined) {
    const g = rawData.companionGift;
    if (!isPlainRecord(g)) {
      companionGiftIssues.push('companionGift ليس خريطة (map)');
    } else {
      const badKeys = Object.keys(g).filter((k) => !COMPANION_GIFT_KEYS.has(k));
      if (badKeys.length > 0) {
        companionGiftIssues.push(`مفاتيح غير مسموحة داخل companionGift: ${badKeys.join(', ')}`);
      }
      for (const [gk, gMax] of Object.entries(COMPANION_GIFT_LIMITS)) {
        if (!(gk in g) || g[gk] === null || g[gk] === undefined) continue;
        if (typeof g[gk] !== 'string') {
          companionGiftIssues.push(`companionGift.${gk} ليس نصاً`);
        } else if (g[gk].length > gMax) {
          companionGiftIssues.push(`companionGift.${gk} طوله ${g[gk].length} > ${gMax}`);
        }
      }
    }
  }

  // 6. countryPrices verification (rule allows null or map; app expects CountryPriceEntry map)
  if ('countryPrices' in rawData && rawData.countryPrices !== null && rawData.countryPrices !== undefined) {
    if (!isPlainRecord(rawData.countryPrices)) {
      countryPricesIssues.push('countryPrices ليس كائن map (سيُرفض من القواعد)');
    } else {
      for (const [cCode, entry] of Object.entries(rawData.countryPrices)) {
        if (!VALID_COUNTRY_CODES.has(cCode as CountryCode)) {
          countryPricesIssues.push(`رمز دولة غير معتمد داخل countryPrices: ${cCode}`);
        } else if (!isPlainRecord(entry)) {
          countryPricesIssues.push(`إدخال الدولة ${cCode} داخل countryPrices تالف`);
        } else if (
          entry.price !== null &&
          entry.price !== undefined &&
          (typeof entry.price !== 'number' || !Number.isFinite(entry.price))
        ) {
          countryPricesIssues.push(`سعر ${cCode} غير رقمي (${typeof entry.price})`);
        }
      }
    }
  }

  // Aggregate blocking reasons (causes Firestore `isValidProduct(incoming())` to reject writes)
  if (invalidDocId) blockingReasons.push(`معرف المستند "${docId}" غير مطابق للنمط المسموح`);
  if (missingRequired.length > 0) blockingReasons.push(`حقول إلزامية ناقصة: ${missingRequired.join('، ')}`);
  if (invalidRequiredValues.length > 0)
    blockingReasons.push(`قيم إلزامية غير معتمدة: ${invalidRequiredValues.join('، ')}`);
  if (extraUnsupportedKeys.length > 0)
    blockingReasons.push(`حقول إضافية غير معرفة في القواعد: ${extraUnsupportedKeys.join('، ')}`);
  if (wrongTypes.length > 0) blockingReasons.push(`أنواع حقول غير مطابقة: ${wrongTypes.join('، ')}`);
  if (overLimitFields.length > 0)
    blockingReasons.push(
      `تجاوز الحد الأقصى للطول في: ${overLimitFields.map((x) => `${x.field} (${x.length}/${x.max})`).join('، ')}`
    );
  if (companionGiftIssues.length > 0) blockingReasons.push(companionGiftIssues.join('؛ '));
  if (countryPricesIssues.some((c) => c.includes('سيُرفض'))) {
    blockingReasons.push('بنية countryPrices غير صالحة (ليست map)');
  }

  // Proposed safe migration actions (Dry Run preview)
  if (legacyAnalysis.mappedTransitions.length > 0) {
    proposedActions.push(
      `ترحيل حقول قديمة إلى الحقول المعتمدة: ${legacyAnalysis.mappedTransitions
        .map((t) => `${t.from} ← ${t.to}`)
        .join('، ')}`
    );
  }
  if (hasSyntheticIdField) {
    proposedActions.push('إزالة الحقل الدخيل id المخزن داخل المستند (doc.id هو المعرف الرسمي)');
  }
  if (legacyAnalysis.unmappedLegacyKeys.length > 0) {
    proposedActions.push(
      `حفظ ${legacyAnalysis.unmappedLegacyKeys.length} حقل قديم غير مطابق في النسخة الاحتياطية ثم تنظيفه من المستند: ${legacyAnalysis.unmappedLegacyKeys.join('، ')}`
    );
  }
  if (missingRequired.length > 0 || invalidRequiredValues.length > 0) {
    proposedActions.push('استكمال القيم الإلزامية الناقصة من البيانات المرجعية أو القيم الافتراضية الآمنة');
  }
  if (overLimitFields.length > 0) {
    proposedActions.push('قص الحقول المتجاوزة للحد الأقصى طبقاً لحدود Firestore Rules');
  }
  if (wrongTypes.length > 0 || companionGiftIssues.length > 0 || countryPricesIssues.length > 0) {
    proposedActions.push('تطبيع وإصلاح الحقول المركبة (companionGift / countryPrices / types)');
  }

  const wouldFailFirestoreRules =
    invalidDocId ||
    missingRequired.length > 0 ||
    invalidRequiredValues.length > 0 ||
    extraUnsupportedKeys.length > 0 ||
    wrongTypes.length > 0 ||
    overLimitFields.length > 0 ||
    companionGiftIssues.length > 0 ||
    countryPricesIssues.some((c) => c.includes('سيُرفض'));

  const needsCleanupOrMigration = wouldFailFirestoreRules || countryPricesIssues.length > 0;

  return {
    id: docId,
    nameAr:
      typeof rawData.nameAr === 'string' && rawData.nameAr.trim()
        ? rawData.nameAr
        : typeof legacyAnalysis.mappedCanonicalFields.nameAr === 'string'
          ? legacyAnalysis.mappedCanonicalFields.nameAr
          : docId,
    sku: typeof rawData.sku === 'string' ? rawData.sku : '',
    invalidDocId,
    missingRequired,
    invalidRequiredValues,
    extraUnsupportedKeys,
    hasSyntheticIdField,
    mappableLegacyKeys: legacyAnalysis.mappedTransitions,
    unmappedLegacyKeys: legacyAnalysis.unmappedLegacyKeys,
    unmappedLegacyData: legacyAnalysis.unmappedLegacyData,
    wrongTypes,
    overLimitFields,
    companionGiftIssues,
    countryPricesIssues,
    timestampIssues,
    wouldFailFirestoreRules,
    needsCleanupOrMigration,
    blockingReasons,
    proposedActions,
  };
}

export function auditCatalogDryRun(
  docs: Array<{ id: string; data: Record<string, unknown> }>
): CatalogIntegrityDryRunReport {
  const items = docs.map((d) => auditProductDocument(d.id, d.data));
  return {
    auditedAt: new Date().toISOString(),
    totalDocs: items.length,
    healthyDocs: items.filter((i) => !i.needsCleanupOrMigration).length,
    failingRulesDocs: items.filter((i) => i.wouldFailFirestoreRules).length,
    needingCleanupDocs: items.filter((i) => i.needsCleanupOrMigration).length,
    items,
  };
}

function sanitizeProvidedFieldsForMutation(
  input: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
  isUpdate: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (input.nameAr !== undefined) {
    const safeName = clampString(String(input.nameAr || ''), PRODUCT_STRING_LIMITS.nameAr);
    if (!safeName && !isUpdate) {
      throw new Error('اسم المنتج مطلوب ولا يمكن تركه فارغاً.');
    }
    if (safeName) out.nameAr = safeName;
  }

  if (input.category !== undefined) {
    out.category = sanitizeProductCategory(input.category);
  }

  if (input.officialDescription !== undefined) {
    const desc = clampString(String(input.officialDescription || ''), PRODUCT_STRING_LIMITS.officialDescription);
    if (desc) {
      out.officialDescription = desc;
    } else if (!isUpdate) {
      out.officialDescription = clampString(String(input.nameAr || 'منتج مشاعر'), PRODUCT_STRING_LIMITS.officialDescription);
    }
  }

  if (input.reviewStatus !== undefined) {
    out.reviewStatus = sanitizeReviewStatus(input.reviewStatus);
  }

  const optionalStringKeys: Array<keyof Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>> = [
    'sku',
    'nameEn',
    'fragranceFamily',
    'fragranceCharacter',
    'perfumeType',
    'sillage',
    'longevity',
    'occasionUsage',
    'seasons',
    'notesAndIngredients',
    'topNotes',
    'heartNotes',
    'baseNotes',
    'size',
    'availability',
    'usageInstructions',
    'extraInfo',
    'internalNotes',
    'syncConflictNote',
    'lastSyncedAt',
    'syncStatus',
    'sourceUrl',
  ];

  for (const key of optionalStringKeys) {
    const rawVal = input[key];
    if (rawVal === undefined) continue;
    if (rawVal === null) {
      if (isUpdate) out[key] = '';
      continue;
    }
    const maxLen = PRODUCT_STRING_LIMITS[key] || 1000;
    const strVal = clampString(typeof rawVal === 'string' ? rawVal : String(rawVal), maxLen);
    if (strVal || isUpdate) {
      out[key] = strVal;
    }
  }

  if (input.imageUrl !== undefined) {
    if (typeof input.imageUrl === 'string' && input.imageUrl.trim()) {
      out.imageUrl = clampString(input.imageUrl, PRODUCT_STRING_LIMITS.imageUrl);
    } else if (input.imageUrl === null && isUpdate) {
      out.imageUrl = deleteField();
    }
  }

  if (input.companionGift !== undefined) {
    const safeGift = sanitizeCompanionGift(input.companionGift);
    if (safeGift !== undefined) {
      out.companionGift = safeGift;
    }
  }

  if (input.countryPrices !== undefined) {
    const safePrices = sanitizeCountryPrices(input.countryPrices);
    if (safePrices) {
      out.countryPrices = safePrices;
    }
  }

  if (input.priceHistory !== undefined) {
    const safeHistory = sanitizePriceHistory(input.priceHistory);
    if (safeHistory !== undefined) {
      out.priceHistory = safeHistory;
    }
  }

  if (input.manuallyEditedFields !== undefined) {
    const safeManual = sanitizeManuallyEditedFields(input.manuallyEditedFields);
    if (safeManual !== undefined) {
      out.manuallyEditedFields = safeManual;
    }
  }

  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    const n = Number(input.sortOrder);
    if (Number.isFinite(n)) {
      out.sortOrder = n;
    }
  }

  return stripUndefinedDeep(out);
}

/**
 * Single Unified Create Payload Builder:
 * Guarantees all required fields, exact length clamps, nested sanitizers,
 * `createdAt` + `updatedAt` (`serverTimestamp()`), and zero disallowed keys.
 */
export function prepareUnifiedProductCreatePayload(
  input: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
  actorEmail: string,
  fallbackSeed?: Partial<Product>
): Record<string, unknown> {
  const safeActor = clampString((actorEmail || '').trim().toLowerCase() || 'system@mashaer.store', 200);
  if (safeActor.length < 3) {
    throw new Error('بريد المستخدم المحدّث غير صالح (يجب أن لا يقل عن 3 أحرف).');
  }

  const nameAr = clampString(
    String(input.nameAr || fallbackSeed?.nameAr || '').trim(),
    PRODUCT_STRING_LIMITS.nameAr
  );
  if (!nameAr) {
    throw new Error('اسم المنتج العربي مطلوب لإنشاء السجل.');
  }

  const officialDescription = clampString(
    String(input.officialDescription || fallbackSeed?.officialDescription || nameAr).trim(),
    PRODUCT_STRING_LIMITS.officialDescription
  );

  const sanitized = sanitizeProvidedFieldsForMutation(
    {
      ...fallbackSeed,
      ...input,
      nameAr,
      category: sanitizeProductCategory(input.category ?? fallbackSeed?.category, 'perfumes'),
      officialDescription,
      reviewStatus: sanitizeReviewStatus(input.reviewStatus ?? fallbackSeed?.reviewStatus, 'verified'),
      imageUrl: undefined, // Mashaer strict zero-bottle-image persistence policy
    },
    false
  );

  delete sanitized.id;
  delete sanitized.createdAt;
  delete sanitized.updatedAt;
  delete sanitized.updatedBy;

  return {
    ...sanitized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: safeActor,
  };
}

/**
 * Single Unified Update Payload Builder:
 * Used by manual save, conflict resolution, live store sync, official enrichment,
 * knowledge seed, backup restore, and safe migration.
 *
 * Guarantees:
 * - Maps legacy fields if canonical field is missing
 * - Removes unknown/disallowed keys (including leaked `id`) via `deleteField()`
 * - Repairs missing/invalid required fields & malformed `companionGift`/`countryPrices`/`priceHistory`/`manuallyEditedFields`
 * - Clamps oversized strings in existing or incoming fields
 * - NEVER touches `createdAt` (preserving `isUpdateTimestampValid` whether `createdAt` exists or not)
 * - Always stamps `updatedAt: serverTimestamp()` and valid `updatedBy`
 */
export function prepareUnifiedProductUpdatePayload(
  existingServerData: Record<string, unknown> | undefined | null,
  partialOrFullInput: Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
  actorEmail: string,
  options?: {
    fallbackSeed?: Partial<Product>;
    preserveSyntheticId?: boolean;
  }
): {
  payload: Record<string, unknown>;
  mappedLegacyTransitions: Array<{ from: string; to: string; valuePreview: string }>;
  removedUnsupportedKeys: string[];
  repairedFields: string[];
} {
  const safeActor = clampString((actorEmail || '').trim().toLowerCase() || 'system@mashaer.store', 200);
  if (safeActor.length < 3) {
    throw new Error('بريد المستخدم المحدّث غير صالح (يجب أن لا يقل عن 3 أحرف).');
  }

  const existing = existingServerData || {};
  const legacyAnalysis = extractLegacyProductMappings(existing);
  const repairedFields: string[] = [];
  const removedUnsupportedKeys: string[] = [];

  const sanitizedIncoming = sanitizeProvidedFieldsForMutation(partialOrFullInput, true);

  // Merge legacy mapped fields ONLY if neither existing canonical nor incoming provides them
  const payload: Record<string, unknown> = { ...sanitizedIncoming };
  for (const [k, v] of Object.entries(legacyAnalysis.mappedCanonicalFields)) {
    if (k in payload) continue;
    const existingVal = existing[k];
    const existingMissing =
      existingVal === undefined ||
      existingVal === null ||
      (typeof existingVal === 'string' && !existingVal.trim());
    if (existingMissing) {
      payload[k] = v;
      repairedFields.push(k);
    }
  }

  // Ensure ALL required fields exist and are valid post-merge
  const effectiveNameAr =
    typeof payload.nameAr === 'string'
      ? payload.nameAr
      : typeof existing.nameAr === 'string'
        ? existing.nameAr
        : '';
  if (!effectiveNameAr.trim()) {
    const recoveredName = clampString(
      String(options?.fallbackSeed?.nameAr || existing.nameEn || 'منتج مشاعر'),
      PRODUCT_STRING_LIMITS.nameAr
    );
    payload.nameAr = recoveredName;
    repairedFields.push('nameAr');
  } else if (!('nameAr' in payload) && effectiveNameAr.length > PRODUCT_STRING_LIMITS.nameAr) {
    payload.nameAr = clampString(effectiveNameAr, PRODUCT_STRING_LIMITS.nameAr);
    repairedFields.push('nameAr');
  }

  const effectiveCat = 'category' in payload ? payload.category : existing.category;
  if (typeof effectiveCat !== 'string' || !VALID_PRODUCT_CATEGORIES.has(effectiveCat as ProductCategory)) {
    payload.category = sanitizeProductCategory(effectiveCat, options?.fallbackSeed?.category || 'perfumes');
    repairedFields.push('category');
  }

  const effectiveDesc =
    typeof payload.officialDescription === 'string'
      ? payload.officialDescription
      : typeof existing.officialDescription === 'string'
        ? existing.officialDescription
        : '';
  if (!effectiveDesc.trim()) {
    payload.officialDescription = clampString(
      String(options?.fallbackSeed?.officialDescription || payload.nameAr || effectiveNameAr || 'منتج مشاعر الرسمي'),
      PRODUCT_STRING_LIMITS.officialDescription
    );
    repairedFields.push('officialDescription');
  } else if (
    !('officialDescription' in payload) &&
    effectiveDesc.length > PRODUCT_STRING_LIMITS.officialDescription
  ) {
    payload.officialDescription = clampString(effectiveDesc, PRODUCT_STRING_LIMITS.officialDescription);
    repairedFields.push('officialDescription');
  }

  const effectiveReview = 'reviewStatus' in payload ? payload.reviewStatus : existing.reviewStatus;
  if (typeof effectiveReview !== 'string' || !VALID_REVIEW_STATUSES.has(effectiveReview as ProductReviewStatus)) {
    payload.reviewStatus = sanitizeReviewStatus(effectiveReview, options?.fallbackSeed?.reviewStatus || 'verified');
    repairedFields.push('reviewStatus');
  }

  // Audit and repair any OTHER existing fields in `existing` not overwritten by `payload`
  for (const key of Object.keys(existing)) {
    if (key === 'id' && options?.preserveSyntheticId) continue;
    if (!ALLOWED_PRODUCT_DOC_KEYS.has(key)) {
      if (!(key in payload)) {
        payload[key] = deleteField();
        removedUnsupportedKeys.push(key);
      }
      continue;
    }
    if (key in payload || key === 'createdAt' || key === 'updatedAt' || key === 'updatedBy') continue;

    const val = existing[key];
    if (val === undefined || val === null) continue;

    if (key === 'imageUrl') {
      if (typeof val !== 'string' || val.length > PRODUCT_STRING_LIMITS.imageUrl) {
        payload.imageUrl = deleteField();
        repairedFields.push('imageUrl');
      }
      continue;
    }

    if (key === 'sortOrder') {
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        payload.sortOrder = deleteField();
        repairedFields.push('sortOrder');
      }
      continue;
    }

    if (key === 'priceHistory') {
      if (!Array.isArray(val)) {
        payload.priceHistory = deleteField();
        repairedFields.push('priceHistory');
      } else if (val.length > MAX_PRICE_HISTORY_ITEMS) {
        payload.priceHistory = sanitizePriceHistory(val) || [];
        repairedFields.push('priceHistory');
      }
      continue;
    }

    if (key === 'manuallyEditedFields') {
      if (!Array.isArray(val)) {
        payload.manuallyEditedFields = deleteField();
        repairedFields.push('manuallyEditedFields');
      } else if (val.length > MAX_MANUALLY_EDITED_FIELDS) {
        payload.manuallyEditedFields = sanitizeManuallyEditedFields(val) || [];
        repairedFields.push('manuallyEditedFields');
      }
      continue;
    }

    if (key === 'companionGift') {
      if (!isPlainRecord(val)) {
        payload.companionGift = deleteField();
        repairedFields.push('companionGift');
      } else {
        const hasBadKey = Object.keys(val).some((gk) => !COMPANION_GIFT_KEYS.has(gk));
        const hasBadSubField = Object.entries(COMPANION_GIFT_LIMITS).some(([gk, gMax]) => {
          const gv = val[gk];
          return gv !== undefined && gv !== null && (typeof gv !== 'string' || gv.length > gMax);
        });
        if (hasBadKey || hasBadSubField) {
          const repairedGift = sanitizeCompanionGift(val);
          payload.companionGift = repairedGift !== undefined ? repairedGift : deleteField();
          repairedFields.push('companionGift');
        }
      }
      continue;
    }

    if (key === 'countryPrices') {
      if (!isPlainRecord(val)) {
        payload.countryPrices = deleteField();
        repairedFields.push('countryPrices');
      } else {
        const repairedPrices = sanitizeCountryPrices(val);
        const existingBadSub = Object.entries(val).some(
          ([code, entry]) =>
            !VALID_COUNTRY_CODES.has(code as CountryCode) ||
            !isPlainRecord(entry) ||
            (entry.price !== null &&
              entry.price !== undefined &&
              (typeof entry.price !== 'number' || !Number.isFinite(entry.price)))
        );
        if (existingBadSub) {
          payload.countryPrices = repairedPrices ? repairedPrices : deleteField();
          repairedFields.push('countryPrices');
        }
      }
      continue;
    }

    const strLimit = PRODUCT_STRING_LIMITS[key];
    if (strLimit) {
      if (typeof val !== 'string') {
        payload[key] = deleteField();
        repairedFields.push(key);
      } else if (val.length > strLimit) {
        payload[key] = clampString(val, strLimit);
        repairedFields.push(key);
      }
    }
  }

  // Strictly protect `createdAt` immutability on updates (keep any `payload.id = deleteField()` cleanup intact)
  delete payload.createdAt;
  payload.updatedAt = serverTimestamp();
  payload.updatedBy = safeActor;

  return {
    payload,
    mappedLegacyTransitions: legacyAnalysis.mappedTransitions,
    removedUnsupportedKeys,
    repairedFields: Array.from(new Set(repairedFields)),
  };
}

/**
 * Pure simulation helper for testing & pre-flight verification:
 * computes the exact document shape Firestore Rules (`request.resource.data`) will evaluate
 * after merging an update payload onto an existing document.
 */
export function simulatePostMergeProductDoc(
  existingData: Record<string, unknown>,
  updatePayload: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existingData };
  const deleteSentinel = deleteField();

  for (const [k, v] of Object.entries(updatePayload)) {
    const isDelete =
      v === deleteSentinel ||
      (v !== null &&
        typeof v === 'object' &&
        '_methodName' in v &&
        String((v as { _methodName?: unknown })._methodName).includes('deleteField'));
    if (isDelete) {
      delete merged[k];
    } else if (v !== undefined) {
      merged[k] = v;
    }
  }
  return merged;
}
