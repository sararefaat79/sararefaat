import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  Gift,
  GitCompare,
  Globe,
  Layers,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  Wind,
} from 'lucide-react';
import { GCC_COUNTRIES } from '../../../lib/auth-constants';
import { formatFirestoreDate } from '../../../lib/firestore-service';
import {
  buildCustomerPitchCopy,
  buildProductNameCopy,
  buildProductNotesCopy,
  calculateProductCompleteness,
  CATEGORY_LABELS,
  extractExtendedGuidance,
  extractProductProvenance,
  findAlternativeProductsWithReasons,
  formatPriceNumber,
  GIFT_KIND_LABELS,
  isFilledFragranceValue,
  LONGEVITY_ESTIMATE_DISCLAIMER,
  parseFragranceMetricLevel,
  resolveProductStatusDisplay,
  SOURCE_TYPE_META,
  splitOlfactoryNotes,
  type FieldProvenanceEntry,
} from '../../../lib/product-utils';
import { CopyButton } from '../../CopyButton';
import type { CountryCode, Product, SiteUiConfig } from '../../../types/hub';

export type PyramidLayerFocus = 'all' | 'top' | 'heart' | 'base';

interface ProductCardProps {
  product: Product;
  allProducts: Product[];
  selectedCountry: CountryCode;
  onSelectCountry: (country: CountryCode) => void;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  isCompared: boolean;
  onToggleCompare: (productId: string) => void;
  isBatchSelectable?: boolean;
  isBatchSelected?: boolean;
  onToggleBatchSelect?: (productId: string) => void;
  isAdmin: boolean;
  uiConfig: SiteUiConfig;
  isRefreshing: boolean;
  onRefreshProduct: (product: Product) => void;
  onOpenDetails: (product: Product) => void;
  onSelectAlternative: (alt: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onQuickNotifyCopy: (label: string, text: string) => void;
}

function QuickFieldCopyChip({
  label,
  text,
  onCopy,
}: {
  label: string;
  text: string;
  onCopy: (label: string, text: string) => void;
}) {
  const [done, setDone] = useState(false);

  const handleClick = async () => {
    if (!text) return;
    onCopy(label, text);
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!text}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] hover:bg-[var(--hub-surface-alt)] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
      title={`نسخ ${label}`}
    >
      {done ? (
        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 text-[var(--hub-accent)] shrink-0" />
      )}
      <span>{done ? 'تم' : label}</span>
    </button>
  );
}

function MetricIndicatorBar({
  label,
  rawValue,
  provenance,
  caption,
  subRows,
}: {
  label: string;
  rawValue?: string | null;
  provenance?: FieldProvenanceEntry;
  caption?: string;
  subRows?: Array<{ label: string; value: string }>;
}) {
  const metric = parseFragranceMetricLevel(rawValue);
  const provMeta = provenance ? SOURCE_TYPE_META[provenance.sourceType] : null;
  const provShortLabel = provMeta ? provMeta.shortLabel : null;

  return (
    <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)]/80 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold text-[var(--hub-heading)] truncate">{label}</span>
          {provMeta && provShortLabel && metric.recorded && (
            <span className={`rounded border px-1.5 py-0.2 text-[9px] font-semibold shrink-0 ${provMeta.badgeClass}`}>
              {provShortLabel}
            </span>
          )}
        </div>
        <span
          className={`text-[11px] font-medium truncate max-w-[60%] ${
            metric.isEstimated
              ? 'text-amber-700 dark:text-amber-300'
              : metric.recorded
                ? 'text-[var(--hub-accent)]'
                : 'text-[var(--hub-muted)]'
          }`}
          title={metric.text}
        >
          {metric.text}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1" aria-label={`${label}: ${metric.text}`}>
        {[1, 2, 3, 4, 5].map((step) => {
          const active = metric.recorded && step <= metric.level;
          return (
            <span
              key={step}
              className={`h-1.5 rounded-full transition-colors ${
                active
                  ? step >= 4
                    ? 'bg-[var(--hub-accent)]'
                    : 'bg-[var(--hub-sidebar)] dark:bg-[var(--hub-accent-soft)]'
                  : 'bg-[var(--hub-border)]/70'
              }`}
            />
          );
        })}
      </div>
      {subRows && subRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-0.5 text-[10.5px] text-[var(--hub-muted)]">
          {subRows.map((row) => (
            <span key={row.label}>
              {row.label}: <strong className="text-[var(--hub-heading)] font-medium">{row.value}</strong>
            </span>
          ))}
        </div>
      )}
      {caption && <div className="text-[10px] text-[var(--hub-muted)] leading-snug pt-0.5">{caption}</div>}
    </div>
  );
}

export function ProductCard({
  product,
  allProducts,
  selectedCountry,
  onSelectCountry,
  isFavorite,
  onToggleFavorite,
  isCompared,
  onToggleCompare,
  isBatchSelectable = false,
  isBatchSelected = false,
  onToggleBatchSelect,
  isAdmin,
  uiConfig,
  isRefreshing,
  onRefreshProduct,
  onOpenDetails,
  onSelectAlternative,
  onEdit,
  onDelete,
  onQuickNotifyCopy,
}: ProductCardProps) {
  const [pyramidFocus, setPyramidFocus] = useState<PyramidLayerFocus>('all');
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [showMoreAlts, setShowMoreAlts] = useState(false);

  const ext = extractExtendedGuidance(product);
  const activeCountryMeta = GCC_COUNTRIES.find((c) => c.code === selectedCountry) || GCC_COUNTRIES[0];
  const countryEntry = product.countryPrices?.[selectedCountry];
  const status = resolveProductStatusDisplay(product, selectedCountry);
  const completeness = calculateProductCompleteness(product);
  const provenanceMap = extractProductProvenance(product);

  const displayPrice = formatPriceNumber(countryEntry?.price, countryEntry?.currency || activeCountryMeta.currency);
  const monogramChar = (product.nameAr.trim().charAt(0) || 'م').toUpperCase();
  const hasStructuredPyramid = Boolean(product.topNotes || product.heartNotes || product.baseNotes);
  const hasGift = Boolean(product.companionGift?.title);

  const allAlternatives = findAlternativeProductsWithReasons(product, allProducts, 6);
  const displayedAlts = showMoreAlts ? allAlternatives : allAlternatives.slice(0, 3);
  const storeUrl = countryEntry?.storeUrl || product.sourceUrl;
  const copyPitch = buildCustomerPitchCopy(product, selectedCountry, activeCountryMeta.nameAr);

  const CategoryIcon =
    product.category === 'mamoul' ? Flame : product.category === 'spray' ? Wind : Sparkles;

  const statusBadgeClass =
    status.tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
      : status.tone === 'red'
        ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';

  const topList = splitOlfactoryNotes(product.topNotes);
  const heartList = splitOlfactoryNotes(product.heartNotes);
  const baseList = splitOlfactoryNotes(product.baseNotes);

  const usageTypeDisplay = isFilledFragranceValue(ext.usageType) ? ext.usageType : 'غير محدد';
  const occasionDisplay = isFilledFragranceValue(product.occasionUsage) ? product.occasionUsage! : 'غير محدد';
  const seasonsDisplay = isFilledFragranceValue(product.seasons) ? product.seasons! : 'غير محدد';
  const timeOfDayDisplay = isFilledFragranceValue(ext.timeOfDay) ? ext.timeOfDay : 'غير محدد';
  const sillageReachDisplay = isFilledFragranceValue(ext.sillageReach) ? ext.sillageReach : 'غير محدد';
  const sillageDurationDisplay = isFilledFragranceValue(ext.sillageDuration) ? ext.sillageDuration : 'غير محدد';
  const layeringDisplay = isFilledFragranceValue(ext.layeringSuggestions) ? ext.layeringSuggestions : '';

  return (
    <article
      dir="rtl"
      lang="ar"
      className={`group relative rounded-2xl border bg-[var(--hub-surface)] overflow-hidden flex flex-col justify-between shadow-xs transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:hover:translate-y-0 ${
        isBatchSelected
          ? 'border-[var(--hub-accent)] ring-2 ring-[var(--hub-accent-soft)]/60'
          : 'border-[var(--hub-border)] hover:border-[var(--hub-accent-soft)]'
      }`}
    >
      {/* Dark Burgundy Luxury Card Header */}
      <header className="relative bg-gradient-to-l from-[var(--hub-sidebar-alt)] via-[var(--hub-sidebar)] to-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)] px-5 py-4 border-b-2 border-[var(--hub-sidebar-accent)]/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {isBatchSelectable && onToggleBatchSelect ? (
              <label
                className="mt-1.5 flex items-center justify-center w-9 h-9 rounded-xl border border-white/25 bg-black/25 cursor-pointer shrink-0"
                title="تحديد المنتج"
              >
                <input
                  type="checkbox"
                  checked={isBatchSelected}
                  onChange={() => onToggleBatchSelect(product.id)}
                  className="accent-[var(--hub-sidebar-accent)] w-4 h-4 cursor-pointer"
                />
              </label>
            ) : (
              <div
                aria-hidden="true"
                className="relative w-12 h-12 rounded-xl border border-[var(--hub-sidebar-accent)]/55 bg-black/20 flex items-center justify-center shrink-0 mt-0.5"
              >
                <span className="font-display text-base font-bold text-[var(--hub-sidebar-accent)]">
                  {monogramChar}
                </span>
                <CategoryIcon className="w-4 h-4 text-[var(--hub-sidebar-accent)]/90 absolute -bottom-1 -left-1 bg-[var(--hub-sidebar)] rounded-full p-0.5 border border-[var(--hub-sidebar-accent)]/40" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--hub-sidebar-text)]/80">
                <span className="font-bold text-[var(--hub-sidebar-accent)]">{CATEGORY_LABELS[product.category]}</span>
                {product.sku && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular tracking-tight">{product.sku}</span>
                  </>
                )}
                {product.size && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums font-semibold text-[var(--hub-sidebar-text)]">
                      {product.size}
                    </span>
                  </>
                )}
              </div>

              <h3 className="font-display text-base sm:text-lg font-bold text-[var(--hub-sidebar-text)] leading-snug break-words">
                {product.nameAr}
              </h3>
            </div>
          </div>

          {/* Header Functional Controls */}
          <div className="flex items-center gap-1 shrink-0 bg-black/15 rounded-xl p-1 border border-white/10">
            <button
              type="button"
              onClick={() => onToggleFavorite(product.id)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isFavorite
                  ? 'text-[var(--hub-sidebar-accent)] bg-white/15'
                  : 'text-[var(--hub-sidebar-text)]/75 hover:text-[var(--hub-sidebar-text)] hover:bg-white/10'
              }`}
              title={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
              aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => onToggleCompare(product.id)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isCompared
                  ? 'text-[var(--hub-sidebar-accent)] bg-white/15'
                  : 'text-[var(--hub-sidebar-text)]/75 hover:text-[var(--hub-sidebar-text)] hover:bg-white/10'
              }`}
              title={isCompared ? 'إزالة من المقارنة' : `إضافة لـ${uiConfig.btnCompareLabel}`}
              aria-label="مقارنة المنتج"
            >
              <GitCompare className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onRefreshProduct(product)}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-[var(--hub-sidebar-text)]/75 hover:text-[var(--hub-sidebar-text)] hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
              title="تحديث وإعادة تحميل بيانات المنتج من السحابة"
              aria-label="تحديث وإعادة تحميل بيانات المنتج"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(product)}
                  className="p-1.5 rounded-lg text-[var(--hub-sidebar-text)]/80 hover:text-[var(--hub-sidebar-accent)] hover:bg-white/10 transition-colors cursor-pointer"
                  title="تعديل بيانات المنتج"
                  aria-label="تعديل بيانات المنتج"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(product)}
                  className="p-1.5 rounded-lg text-[var(--hub-sidebar-text)]/80 hover:text-red-300 hover:bg-red-950/50 transition-colors cursor-pointer"
                  title="حذف المنتج"
                  aria-label="حذف المنتج"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Card Body */}
      <div className="p-5 space-y-4 flex-1 flex flex-col">
        {/* Status Indicator + Completeness % + Provenance Hint */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass}`}>
              {status.needsReview ? (
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              ) : status.isOutOfStock ? (
                <Clock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{status.label}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={`font-bold tabular-nums ${
                  completeness.percent >= 85
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : completeness.percent >= 55
                      ? 'text-[var(--hub-accent)]'
                      : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                اكتمال البيانات {completeness.percent}%
              </span>
              {completeness.hasEstimatedFields && (
                <span className="text-amber-700 dark:text-amber-300 font-medium">يتضمن قيماً إرشادية</span>
              )}
              {completeness.hasManualEdits && (
                <span className="text-purple-700 dark:text-purple-300 font-medium">محمي يدوياً</span>
              )}
            </div>
          </div>

          {(ext.cleanPerfumeType || ext.concentration || product.fragranceFamily) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--hub-muted)]">
              {ext.cleanPerfumeType && (
                <span className="font-semibold text-[var(--hub-accent)]">{ext.cleanPerfumeType}</span>
              )}
              {ext.concentration && (
                <>
                  {ext.cleanPerfumeType && <span aria-hidden="true">·</span>}
                  <span className="font-semibold text-[var(--hub-heading)]">
                    التركيز: {ext.concentration}
                  </span>
                </>
              )}
              {product.fragranceFamily && (
                <>
                  {(ext.cleanPerfumeType || ext.concentration) && <span aria-hidden="true">·</span>}
                  <span>{product.fragranceFamily}</span>
                </>
              )}
            </div>
          )}
        </div>

        {product.syncConflictNote && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">تعارض مزامنة محفوظ للمراجعة</span>
          </div>
        )}

        {/* Description + Quick Copy Buttons */}
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)]/65 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[var(--hub-heading)]">الوصف والنسخ السريع</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <QuickFieldCopyChip
                label="الاسم"
                text={buildProductNameCopy(product)}
                onCopy={onQuickNotifyCopy}
              />
              <QuickFieldCopyChip
                label="الوصف"
                text={product.officialDescription}
                onCopy={onQuickNotifyCopy}
              />
              <QuickFieldCopyChip
                label="النوتات"
                text={buildProductNotesCopy(product)}
                onCopy={onQuickNotifyCopy}
              />
            </div>
          </div>

          <p
            className={`text-xs sm:text-[13px] text-[var(--hub-text)] leading-relaxed ${
              expandedDesc ? '' : 'line-clamp-3'
            }`}
          >
            {product.officialDescription}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {product.fragranceCharacter ? (
              <span className="text-[var(--hub-accent)] font-medium">
                الطابع العطري:{' '}
                <strong className="text-[var(--hub-heading)]">{product.fragranceCharacter}</strong>
              </span>
            ) : (
              <span />
            )}
            {product.officialDescription.length > 140 && (
              <button
                type="button"
                onClick={() => setExpandedDesc((prev) => !prev)}
                className="text-[var(--hub-accent)] font-semibold hover:underline cursor-pointer"
              >
                {expandedDesc ? 'عرض أقل' : 'قراءة المزيد'}
              </button>
            )}
          </div>
        </div>

        {/* Olfactory Pyramid: 3 Separate Cards */}
        {(hasStructuredPyramid || product.notesAndIngredients) && (
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-alt)]/45 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--hub-heading)]">
                <Layers className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                <span>الهرم العطري والمكونات</span>
              </div>

              {hasStructuredPyramid && (
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'all', label: 'الكل' },
                      { id: 'top', label: 'المقدمة' },
                      { id: 'heart', label: 'القلب' },
                      { id: 'base', label: 'القاعدة' },
                    ] as const
                  ).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => setPyramidFocus(layer.id)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                        pyramidFocus === layer.id
                          ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)]'
                          : 'text-[var(--hub-muted)] hover:bg-[var(--hub-surface)] hover:text-[var(--hub-heading)]'
                      }`}
                    >
                      {layer.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {hasStructuredPyramid ? (
              <div
                className={`grid gap-2.5 ${
                  pyramidFocus === 'all' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'
                }`}
              >
                {(pyramidFocus === 'all' || pyramidFocus === 'top') && (
                  <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-[var(--hub-accent)]">مقدمة العطر</div>
                    {topList.length > 0 ? (
                      <div className="text-xs text-[var(--hub-text)] leading-relaxed">{topList.join(' · ')}</div>
                    ) : (
                      <div className="text-[11px] text-[var(--hub-muted)]">غير مفصلة منفردة</div>
                    )}
                  </div>
                )}

                {(pyramidFocus === 'all' || pyramidFocus === 'heart') && (
                  <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-[var(--hub-accent)]">قلب العطر</div>
                    {heartList.length > 0 ? (
                      <div className="text-xs text-[var(--hub-text)] leading-relaxed">{heartList.join(' · ')}</div>
                    ) : (
                      <div className="text-[11px] text-[var(--hub-muted)]">غير مفصلة منفردة</div>
                    )}
                  </div>
                )}

                {(pyramidFocus === 'all' || pyramidFocus === 'base') && (
                  <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-[var(--hub-accent)]">قاعدة العطر</div>
                    {baseList.length > 0 ? (
                      <div className="text-xs text-[var(--hub-text)] leading-relaxed">{baseList.join(' · ')}</div>
                    ) : (
                      <div className="text-[11px] text-[var(--hub-muted)]">غير مفصلة منفردة</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 text-xs text-[var(--hub-text)] leading-relaxed">
                <strong className="text-[var(--hub-accent)]">المكونات: </strong>
                {product.notesAndIngredients}
              </div>
            )}

            {hasStructuredPyramid && product.notesAndIngredients && (
              <div className="text-[11px] text-[var(--hub-muted)] leading-relaxed line-clamp-2 pt-0.5">
                <strong className="text-[var(--hub-heading)]">الملخص الكامل: </strong>
                {product.notesAndIngredients}
              </div>
            )}
          </div>
        )}

        {/* Performance Bars: Longevity & Sillage + Projection Details */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-[var(--hub-heading)]">الأداء: الثبات والفوحان والانتشار</span>
            {product.size && (
              <span className="text-[var(--hub-muted)] tabular-nums">
                حجم العبوة: {product.size}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <MetricIndicatorBar
              label="الثبات (تقديري)"
              rawValue={product.longevity}
              provenance={provenanceMap.longevity}
              caption={LONGEVITY_ESTIMATE_DISCLAIMER}
            />
            <MetricIndicatorBar
              label="الفوحان والانتشار"
              rawValue={product.sillage}
              provenance={provenanceMap.sillage}
              subRows={[
                { label: 'الانتشار', value: sillageReachDisplay },
                { label: 'بقاء الفوحان', value: sillageDurationDisplay },
              ]}
            />
          </div>
        </div>

        {/* 6 Fragrance Attributes Summary */}
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)]/55 p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-[var(--hub-heading)]">الاستخدام والمناسبات والفصول والأوقات</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 leading-relaxed">
            <div className="text-[var(--hub-text)]">
              <span className="text-[var(--hub-muted)]">الاستخدام: </span>
              <strong
                className={`font-semibold ${
                  usageTypeDisplay === 'غير محدد' ? 'text-[var(--hub-muted)] font-normal' : 'text-[var(--hub-heading)]'
                }`}
              >
                {usageTypeDisplay}
              </strong>
            </div>
            <div className="text-[var(--hub-text)]">
              <span className="text-[var(--hub-muted)]">المناسبات: </span>
              <strong
                className={`font-semibold ${
                  occasionDisplay === 'غير محدد' ? 'text-[var(--hub-muted)] font-normal' : 'text-[var(--hub-heading)]'
                }`}
              >
                {occasionDisplay}
              </strong>
            </div>
            <div className="text-[var(--hub-text)]">
              <span className="text-[var(--hub-muted)]">الفصول: </span>
              <strong
                className={`font-semibold ${
                  seasonsDisplay === 'غير محدد' ? 'text-[var(--hub-muted)] font-normal' : 'text-[var(--hub-heading)]'
                }`}
              >
                {seasonsDisplay}
              </strong>
            </div>
            <div className="text-[var(--hub-text)]">
              <span className="text-[var(--hub-muted)]">الأوقات: </span>
              <strong
                className={`font-semibold ${
                  timeOfDayDisplay === 'غير محدد' ? 'text-[var(--hub-muted)] font-normal' : 'text-[var(--hub-heading)]'
                }`}
              >
                {timeOfDayDisplay}
              </strong>
            </div>
            {ext.targetAudience && (
              <div className="text-[var(--hub-text)] sm:col-span-2">
                <span className="text-[var(--hub-muted)]">الفئة المناسبة: </span>
                <strong className="text-[var(--hub-heading)] font-semibold">{ext.targetAudience}</strong>
              </div>
            )}
          </div>
          {ext.cleanUsageInstructions && (
            <div className="text-[var(--hub-text)] leading-relaxed">
              <span className="text-[var(--hub-muted)]">طريقة الاستخدام: </span>
              {ext.cleanUsageInstructions}
            </div>
          )}
          {layeringDisplay && (
            <div className="text-[11px] text-[var(--hub-accent)] leading-relaxed">
              <strong className="text-[var(--hub-heading)]">تنسيق العطر: </strong>
              {layeringDisplay}
            </div>
          )}
          {ext.cleanExtraInfo && (
            <div className="text-[11px] text-[var(--hub-muted)] leading-relaxed">
              <strong className="text-[var(--hub-heading)]">معلومات إضافية: </strong>
              {ext.cleanExtraInfo}
            </div>
          )}
        </div>

        {/* Companion Gift Inlay */}
        {hasGift && product.companionGift && (
          <div className="rounded-xl border border-[var(--hub-accent-soft)]/70 bg-gradient-to-l from-[var(--hub-surface-alt)] via-[var(--hub-surface-alt)]/65 to-[var(--hub-bg)] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--hub-accent)]">
                <Gift className="w-3.5 h-3.5 shrink-0" />
                <span>هدية مصاحبة مشمولة</span>
              </span>
              <span className="text-[11px] font-semibold text-[var(--hub-muted)]">
                {GIFT_KIND_LABELS[product.companionGift.kind]}
              </span>
            </div>
            <div className="text-sm font-bold text-[var(--hub-heading)] leading-snug">
              {product.companionGift.title}
            </div>
            {product.companionGift.compositionNote && (
              <p className="text-xs text-[var(--hub-text)]/90 leading-relaxed">
                {product.companionGift.compositionNote}
              </p>
            )}
          </div>
        )}

        {/* Clickable Similar Alternatives */}
        {displayedAlts.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[var(--hub-heading)]">
                {product.category === 'perfumes' ? 'عطور مشابهة مقترحة' : 'منتجات مشابهة مقترحة'}
              </span>
              {allAlternatives.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowMoreAlts((v) => !v)}
                  className="text-[11px] font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                >
                  {showMoreAlts ? 'عرض أقل' : `+${allAlternatives.length - 3} إضافية`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {displayedAlts.map((item) => (
                <button
                  key={item.product.id}
                  type="button"
                  onClick={() => onSelectAlternative(item.product)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--hub-heading)] hover:border-[var(--hub-accent)] hover:bg-[var(--hub-surface-alt)] transition-colors cursor-pointer"
                  title={item.reasons.join(' · ') || item.product.nameAr}
                >
                  <Sparkles className="w-3 h-3 text-[var(--hub-accent)] shrink-0" />
                  <span>{item.product.nameAr}</span>
                  {item.product.size && (
                    <span className="text-[10px] text-[var(--hub-muted)] tabular-nums">
                      ({item.product.size})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GCC Pricing Pedestal */}
        <div className="rounded-xl bg-[var(--hub-surface-alt)]/75 border border-[var(--hub-border)] p-3.5 space-y-2.5 mt-auto">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[var(--hub-muted)] leading-snug">
                السعر الرسمي ({activeCountryMeta.nameAr})
                {selectedCountry === 'SA' && countryEntry?.price ? ' · شامل الضريبة' : ''}
              </div>
              <div className="text-lg sm:text-xl font-bold text-[var(--hub-heading)] tabular-nums mt-0.5 leading-snug">
                {displayPrice}
              </div>
            </div>

            {countryEntry?.oldPrice && countryEntry.price !== null && (
              <div className="text-left text-xs tabular-nums shrink-0 leading-snug">
                <div className="line-through text-[var(--hub-muted)]">
                  {countryEntry.oldPrice} {countryEntry.currency}
                </div>
                {countryEntry.discountPercent && (
                  <div className="text-emerald-700 dark:text-emerald-400 font-bold">
                    وفّر {countryEntry.discountPercent}%
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-6 gap-1.5 pt-2 border-t border-[var(--hub-border)]/70 text-center">
            {GCC_COUNTRIES.map((c) => {
              const entry = product.countryPrices?.[c.code];
              const isActiveCountry = c.code === selectedCountry;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => onSelectCountry(c.code)}
                  title={`عرض سعر ${c.nameAr}`}
                  className={`rounded-lg py-1.5 px-1 tabular-nums transition-colors cursor-pointer ${
                    isActiveCountry
                      ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] font-bold shadow-xs'
                      : 'bg-[var(--hub-bg)]/85 text-[var(--hub-muted)] hover:text-[var(--hub-heading)] hover:bg-[var(--hub-surface)]'
                  }`}
                >
                  <div className="text-[11px] font-mono-tabular leading-snug opacity-90">{c.code}</div>
                  <div className="text-[11px] leading-snug mt-0.5 truncate">
                    {entry && entry.price !== null ? entry.price : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {(Boolean(product.updatedAt) || Boolean(product.lastSyncedAt)) && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--hub-muted)] tabular-nums">
            {Boolean(product.updatedAt) && (
              <span>آخر تعديل: {formatFirestoreDate(product.updatedAt)}</span>
            )}
            {Boolean(product.lastSyncedAt) && (
              <span>مزامنة المتجر: {new Date(product.lastSyncedAt!).toLocaleDateString('ar-KW')}</span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action & Store Links Footer */}
      <footer className="px-5 py-3.5 bg-[var(--hub-surface-alt)]/55 border-t border-[var(--hub-border)] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetails(product)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer transition-colors whitespace-nowrap"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{uiConfig.btnDetailsLabel}</span>
          </button>

          <CopyButton
            text={copyPitch}
            label={uiConfig.btnCopyLabel}
          />
        </div>

        <div className="flex items-center gap-2">
          {storeUrl && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] text-xs font-medium text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] hover:bg-[var(--hub-surface-alt)] transition-colors whitespace-nowrap"
              title={`${uiConfig.btnStoreLinkLabel} (${activeCountryMeta.nameAr})`}
            >
              <span>{uiConfig.btnStoreLinkLabel}</span>
              <ExternalLink className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
