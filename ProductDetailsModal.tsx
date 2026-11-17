import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Gift,
  Layers,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { GCC_COUNTRIES } from '../../../lib/auth-constants';
import { formatFirestoreDate } from '../../../lib/firestore-service';
import type { ProductUndoSnapshot } from '../../../lib/product-undo';
import {
  buildFullProductCopy,
  buildProductNotesCopy,
  calculateProductCompleteness,
  CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  extractExtendedGuidance,
  extractProductProvenance,
  findAlternativeProductsWithReasons,
  formatPriceNumber,
  GIFT_KIND_LABELS,
  isFilledFragranceValue,
  LONGEVITY_ESTIMATE_DISCLAIMER,
  parseFragranceMetricLevel,
  PRODUCT_FIELD_LABELS,
  resolveProductStatusDisplay,
  SOURCE_TYPE_META,
  splitOlfactoryNotes,
  stripSystemMarkers,
  type FieldProvenanceEntry,
} from '../../../lib/product-utils';
import { CopyButton } from '../../CopyButton';
import type { CountryCode, Product } from '../../../types/hub';

function FieldSourceMicroTag({ entry }: { entry?: FieldProvenanceEntry }) {
  if (!entry) return null;
  const meta = SOURCE_TYPE_META[entry.sourceType];
  const confLabel = CONFIDENCE_LABELS[entry.confidence];
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}
      title={`${meta.label} · ${confLabel}`}
    >
      {meta.shortLabel}
    </span>
  );
}

interface ProductDetailsModalProps {
  product: Product | null;
  allProducts: Product[];
  selectedCountry: CountryCode;
  isFavorite: boolean;
  isAdmin: boolean;
  latestUndoSnapshot?: ProductUndoSnapshot | null;
  onClose: () => void;
  onSelectProduct: (next: Product) => void;
  onToggleFavorite: (productId: string) => void;
  onEdit: (product: Product) => void;
  onUndoLastEdit?: (snapshot: ProductUndoSnapshot) => void;
  onResolveConflict: (product: Product) => void;
}

export function ProductDetailsModal({
  product,
  allProducts,
  selectedCountry,
  isFavorite,
  isAdmin,
  latestUndoSnapshot,
  onClose,
  onSelectProduct,
  onToggleFavorite,
  onEdit,
  onUndoLastEdit,
  onResolveConflict,
}: ProductDetailsModalProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showProvenanceTable, setShowProvenanceTable] = useState(false);
  const [showMoreAlts, setShowMoreAlts] = useState(false);

  useEffect(() => {
    setShowMoreAlts(false);
    if (product && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [product?.id]);

  if (!product) return null;

  const ext = extractExtendedGuidance(product);
  const activeCountryMeta = GCC_COUNTRIES.find((c) => c.code === selectedCountry) || GCC_COUNTRIES[0];
  const allAlternatives = findAlternativeProductsWithReasons(product, allProducts, 6);
  const displayedAlternatives = showMoreAlts ? allAlternatives : allAlternatives.slice(0, 3);
  const status = resolveProductStatusDisplay(product, selectedCountry);
  const fullCopyText = buildFullProductCopy(
    product,
    selectedCountry,
    activeCountryMeta.nameAr,
    allAlternatives.map((a) => a.product)
  );
  const notesCopyText = buildProductNotesCopy(product);

  const longevityMetric = parseFragranceMetricLevel(product.longevity);
  const sillageMetric = parseFragranceMetricLevel(product.sillage);
  const countryUrl = product.countryPrices?.[selectedCountry]?.storeUrl || product.sourceUrl;

  const completeness = calculateProductCompleteness(product);
  const provenanceMap = extractProductProvenance(product);
  const provenanceEntries = Object.entries(provenanceMap);

  const topNotesList = splitOlfactoryNotes(product.topNotes);
  const heartNotesList = splitOlfactoryNotes(product.heartNotes);
  const baseNotesList = splitOlfactoryNotes(product.baseNotes);
  const cleanInternalNotes = stripSystemMarkers(product.internalNotes);

  const sillageReachDisplay = isFilledFragranceValue(ext.sillageReach) ? ext.sillageReach : 'غير محدد';
  const sillageDurationDisplay = isFilledFragranceValue(ext.sillageDuration) ? ext.sillageDuration : 'غير محدد';
  const usageTypeDisplay = isFilledFragranceValue(ext.usageType) ? ext.usageType : 'غير محدد';
  const occasionDisplay = isFilledFragranceValue(product.occasionUsage) ? product.occasionUsage! : 'غير محدد';
  const seasonsDisplay = isFilledFragranceValue(product.seasons) ? product.seasons! : 'غير محدد';
  const timeOfDayDisplay = isFilledFragranceValue(ext.timeOfDay) ? ext.timeOfDay : 'غير محدد';
  const layeringDisplay = isFilledFragranceValue(ext.layeringSuggestions) ? ext.layeringSuggestions : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-modal-title"
    >
      <div
        ref={scrollContainerRef}
        dir="rtl"
        lang="ar"
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] shadow-2xl"
      >
        {/* Sticky Dark Burgundy Modal Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-l from-[var(--hub-sidebar-alt)] via-[var(--hub-sidebar)] to-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)] px-5 sm:px-6 py-4 border-b-2 border-[var(--hub-sidebar-accent)]/50 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="text-xs text-[var(--hub-sidebar-accent)] flex flex-wrap items-center gap-2 font-semibold">
              <span>{CATEGORY_LABELS[product.category]}</span>
              {product.sku && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{product.sku}</span>
                </>
              )}
              {product.size && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums text-[var(--hub-sidebar-text)]">{product.size}</span>
                </>
              )}
              {product.fragranceFamily && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--hub-sidebar-text)]/85">{product.fragranceFamily}</span>
                </>
              )}
            </div>
            <h2
              id="product-detail-modal-title"
              className="font-display text-lg sm:text-xl font-bold text-[var(--hub-sidebar-text)] leading-snug"
            >
              {product.nameAr}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFavorite(product.id)}
              className={`p-2 rounded-xl border border-white/15 bg-black/15 cursor-pointer transition-colors ${
                isFavorite
                  ? 'text-[var(--hub-sidebar-accent)]'
                  : 'text-[var(--hub-sidebar-text)]/80 hover:text-[var(--hub-sidebar-text)]'
              }`}
              title={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
            </button>

            {isAdmin && latestUndoSnapshot && onUndoLastEdit && (
              <button
                type="button"
                onClick={() => onUndoLastEdit(latestUndoSnapshot)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-black/20 text-xs font-semibold text-amber-200 hover:bg-black/35 cursor-pointer transition-colors whitespace-nowrap"
                title={latestUndoSnapshot.summary}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تراجع عن آخر تعديل</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(product);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-black/20 text-xs font-semibold text-[var(--hub-sidebar-text)] hover:border-[var(--hub-sidebar-accent)] cursor-pointer transition-colors whitespace-nowrap"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--hub-sidebar-accent)]" />
                <span>تعديل المنتج</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[var(--hub-sidebar-text)]/80 hover:bg-white/10 hover:text-[var(--hub-sidebar-text)] cursor-pointer transition-colors"
              aria-label="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Quick Status & Copy-All Action Strip + Completeness Meter */}
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface-alt)]/55 p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span
                  className={`inline-flex items-center gap-1.5 font-bold px-2.5 py-1 rounded-lg border ${
                    status.tone === 'emerald'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                      : status.tone === 'red'
                        ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                  }`}
                >
                  {status.needsReview ? (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  ) : status.isOutOfStock ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {status.label} ({activeCountryMeta.nameAr})
                  </span>
                </span>

                {(ext.cleanPerfumeType || ext.concentration) && (
                  <span className="text-[var(--hub-heading)] font-semibold">
                    {[ext.cleanPerfumeType, ext.concentration ? `التركيز: ${ext.concentration}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
                {product.fragranceCharacter && (
                  <span className="text-[var(--hub-muted)]">
                    الطابع: {product.fragranceCharacter}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <CopyButton
                  text={fullCopyText}
                  label="نسخ بطاقة المنتج الكاملة"
                  copiedLabel="تم النسخ"
                  variant="burgundy"
                />
                {countryUrl && (
                  <a
                    href={countryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] transition-colors whitespace-nowrap"
                  >
                    <span>فتح في المتجر ({activeCountryMeta.code})</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                  </a>
                )}
              </div>
            </div>

            {/* Completeness & Provenance Toggle Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[var(--hub-border)]/70 text-xs">
              <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                <span className="font-bold text-[var(--hub-heading)] tabular-nums whitespace-nowrap">
                  مؤشر اكتمال البيانات: {completeness.percent}%
                </span>
                <div className="flex-1 max-w-44 h-2 rounded-full bg-[var(--hub-border)] overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      completeness.percent >= 85
                        ? 'bg-emerald-600'
                        : completeness.percent >= 55
                          ? 'bg-[var(--hub-accent)]'
                          : 'bg-amber-500'
                    }`}
                    style={{ width: `${completeness.percent}%` }}
                  />
                </div>
                {completeness.hasEstimatedFields && (
                  <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                    يتضمن قيماً إرشادية من معطيات العطر
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowProvenanceTable((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[var(--hub-accent)] font-semibold hover:underline cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>المصادر وموثوقية الحقول ({provenanceEntries.length})</span>
                {showProvenanceTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showProvenanceTable && (
              <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 space-y-2 text-xs">
                <div className="font-bold text-[var(--hub-heading)]">سجل توثيق مصادر الحقول المعتمدة:</div>
                {provenanceEntries.length === 0 ? (
                  <div className="text-[var(--hub-muted)]">لا توجد بطاقات توثيق مفصلة مسجلة لهذا المنتج بعد.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {provenanceEntries.map(([fieldKey, prov]) => {
                      const meta = SOURCE_TYPE_META[prov.sourceType];
                      const confLbl = CONFIDENCE_LABELS[prov.confidence];
                      const fieldLabel = PRODUCT_FIELD_LABELS[fieldKey] || fieldKey;
                      return (
                        <div
                          key={fieldKey}
                          className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--hub-heading)] truncate">{fieldLabel}</div>
                            <div className="text-[11px] text-[var(--hub-muted)]">
                              {confLbl}
                              {prov.updatedAt ? ` · ${prov.updatedAt}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                              {meta.shortLabel}
                            </span>
                            {prov.sourceUrl && (
                              <a
                                href={prov.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--hub-accent)] hover:underline"
                                title={prov.sourceUrl}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {product.syncConflictNote && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 p-4 space-y-2.5 text-xs sm:text-sm text-amber-950 dark:text-amber-200">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>تنبيه تعارض بين التعديل اليدوي والمزامنة الحية</span>
              </div>
              <div className="leading-relaxed">{product.syncConflictNote}</div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onResolveConflict(product)}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] font-semibold cursor-pointer text-xs"
                >
                  اعتماد النسخة المحفوظة ومسح التنبيه
                </button>
              )}
            </div>
          )}

          {/* Official Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--hub-heading)]">الوصف الرسمي</h3>
              <CopyButton
                text={product.officialDescription}
                label="نسخ الوصف"
                copiedLabel="تم النسخ"
                variant="ghost"
              />
            </div>
            <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 text-sm text-[var(--hub-text)] leading-relaxed">
              {product.officialDescription}
            </div>
          </div>

          {/* Companion Gift */}
          {product.companionGift?.title && (
            <div className="rounded-xl border border-[var(--hub-accent-soft)] bg-gradient-to-l from-[var(--hub-surface-alt)] to-[var(--hub-bg)] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-accent)]">
                  <Gift className="w-4 h-4 shrink-0" />
                  <span>هدية مصاحبة مشمولة مع العطر</span>
                </div>
                <span className="text-xs font-semibold text-[var(--hub-muted)]">
                  {GIFT_KIND_LABELS[product.companionGift.kind]}
                </span>
              </div>
              <div className="text-base font-bold text-[var(--hub-heading)] leading-snug">
                {product.companionGift.title}
              </div>
              {product.companionGift.compositionNote && (
                <p className="text-xs sm:text-sm text-[var(--hub-text)] leading-relaxed">
                  {product.companionGift.compositionNote}
                </p>
              )}
            </div>
          )}

          {/* Olfactory Pyramid (3 Dedicated Cards) + Full Ingredients */}
          {(product.topNotes || product.heartNotes || product.baseNotes || product.notesAndIngredients) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--hub-heading)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--hub-accent)]" />
                  <span>الهرم العطري والمكونات الكاملة</span>
                </h3>
                <CopyButton
                  text={notesCopyText}
                  label="نسخ النوتات"
                  copiedLabel="تم النسخ"
                  variant="ghost"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
                <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3.5 space-y-1.5">
                  <div className="font-bold text-[var(--hub-accent)]">مقدمة العطر</div>
                  <div className="text-[var(--hub-text)] leading-relaxed">
                    {topNotesList.length > 0 ? topNotesList.join(' · ') : product.notesAndIngredients || '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3.5 space-y-1.5">
                  <div className="font-bold text-[var(--hub-accent)]">قلب العطر</div>
                  <div className="text-[var(--hub-text)] leading-relaxed">
                    {heartNotesList.length > 0 ? heartNotesList.join(' · ') : product.notesAndIngredients || '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3.5 space-y-1.5">
                  <div className="font-bold text-[var(--hub-accent)]">قاعدة العطر</div>
                  <div className="text-[var(--hub-text)] leading-relaxed">
                    {baseNotesList.length > 0 ? baseNotesList.join(' · ') : product.notesAndIngredients || '—'}
                  </div>
                </div>
              </div>

              {product.notesAndIngredients && (
                <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] px-4 py-3 text-xs sm:text-sm text-[var(--hub-text)] leading-relaxed">
                  <strong className="text-[var(--hub-heading)]">ملخص المكونات: </strong>
                  {product.notesAndIngredients}
                </div>
              )}
            </div>
          )}

          {/* Performance & Extended Uses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-3">
              <h3 className="text-sm font-bold text-[var(--hub-heading)]">الأداء: الثبات والفوحان والانتشار</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--hub-heading)]">الثبات (تقديري)</span>
                      <FieldSourceMicroTag entry={provenanceMap.longevity} />
                    </div>
                    <span
                      className={
                        longevityMetric.isEstimated
                          ? 'text-amber-700 dark:text-amber-300 font-semibold'
                          : longevityMetric.recorded
                            ? 'text-[var(--hub-accent)] font-semibold'
                            : 'text-[var(--hub-muted)]'
                      }
                    >
                      {longevityMetric.text}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span
                        key={step}
                        className={`h-2 rounded-full ${
                          longevityMetric.recorded && step <= longevityMetric.level
                            ? 'bg-[var(--hub-accent)]'
                            : 'bg-[var(--hub-border)]/70'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="rounded-lg border border-amber-200/70 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/25 px-2.5 py-1.5 text-[11px] text-amber-950 dark:text-amber-200 leading-snug">
                    {LONGEVITY_ESTIMATE_DISCLAIMER}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--hub-heading)]">مستوى الفوحان</span>
                      <FieldSourceMicroTag entry={provenanceMap.sillage} />
                    </div>
                    <span
                      className={
                        sillageMetric.isEstimated
                          ? 'text-amber-700 dark:text-amber-300 font-semibold'
                          : sillageMetric.recorded
                            ? 'text-[var(--hub-accent)] font-semibold'
                            : 'text-[var(--hub-muted)]'
                      }
                    >
                      {sillageMetric.text}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span
                        key={step}
                        className={`h-2 rounded-full ${
                          sillageMetric.recorded && step <= sillageMetric.level
                            ? 'bg-[var(--hub-sidebar)] dark:bg-[var(--hub-accent-soft)]'
                            : 'bg-[var(--hub-border)]/70'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-1 border-t border-[var(--hub-border)]/70 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--hub-heading)]">مدى انتشار الرائحة</span>
                      <FieldSourceMicroTag entry={provenanceMap.sillageReach} />
                    </div>
                    <span className={sillageReachDisplay !== 'غير محدد' ? 'text-[var(--hub-text)] font-medium' : 'text-[var(--hub-muted)]'}>
                      {sillageReachDisplay}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--hub-heading)]">مدة بقاء الفوحان</span>
                      <FieldSourceMicroTag entry={provenanceMap.sillageDuration} />
                    </div>
                    <span className={sillageDurationDisplay !== 'غير محدد' ? 'text-[var(--hub-text)] font-medium' : 'text-[var(--hub-muted)]'}>
                      {sillageDurationDisplay}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-2.5 text-xs sm:text-sm leading-relaxed">
              <h3 className="text-sm font-bold text-[var(--hub-heading)]">الاستخدام والمناسبات والفصول والأوقات</h3>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[var(--hub-heading)]">الاستخدام: </strong>
                  <span className={usageTypeDisplay !== 'غير محدد' ? 'text-[var(--hub-text)]' : 'text-[var(--hub-muted)]'}>
                    {usageTypeDisplay}
                  </span>
                </div>
                <FieldSourceMicroTag entry={provenanceMap.usageType} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[var(--hub-heading)]">المناسبات: </strong>
                  <span className={occasionDisplay !== 'غير محدد' ? 'text-[var(--hub-text)]' : 'text-[var(--hub-muted)]'}>
                    {occasionDisplay}
                  </span>
                </div>
                <FieldSourceMicroTag entry={provenanceMap.occasionUsage} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[var(--hub-heading)]">الفصول: </strong>
                  <span className={seasonsDisplay !== 'غير محدد' ? 'text-[var(--hub-text)]' : 'text-[var(--hub-muted)]'}>
                    {seasonsDisplay}
                  </span>
                </div>
                <FieldSourceMicroTag entry={provenanceMap.seasons} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-[var(--hub-heading)]">الأوقات: </strong>
                  <span className={timeOfDayDisplay !== 'غير محدد' ? 'text-[var(--hub-text)]' : 'text-[var(--hub-muted)]'}>
                    {timeOfDayDisplay}
                  </span>
                </div>
                <FieldSourceMicroTag entry={provenanceMap.timeOfDay} />
              </div>
              {ext.targetAudience && (
                <div>
                  <strong className="text-[var(--hub-heading)]">الفئة المناسبة: </strong>
                  <span className="text-[var(--hub-text)]">{ext.targetAudience}</span>
                </div>
              )}
              {ext.cleanUsageInstructions && (
                <div>
                  <strong className="text-[var(--hub-heading)]">إرشادات الاستخدام: </strong>
                  <span className="text-[var(--hub-text)]">{ext.cleanUsageInstructions}</span>
                </div>
              )}
              {layeringDisplay && (
                <div>
                  <strong className="text-[var(--hub-heading)]">تنسيق العطر: </strong>
                  <span className="text-[var(--hub-accent)]">{layeringDisplay}</span>
                </div>
              )}
              {ext.cleanExtraInfo && (
                <div>
                  <strong className="text-[var(--hub-heading)]">معلومات إضافية: </strong>
                  <span className="text-[var(--hub-text)]">{ext.cleanExtraInfo}</span>
                </div>
              )}
            </div>
          </div>

          {/* 6-Country Storefront Price Matrix */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--hub-heading)]">جدول الأسعار الرسمي لدول الخليج الست</h3>
              <span className="text-xs text-[var(--hub-muted)]">الأسعار والروابط الرسمية المعتمدة لكل دولة</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--hub-border)]">
              <table className="w-full text-xs sm:text-sm text-right">
                <thead className="bg-[var(--hub-bg)] text-[var(--hub-heading)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">الدولة</th>
                    <th className="px-4 py-3 font-semibold">السعر الرسمي</th>
                    <th className="px-4 py-3 font-semibold">قبل الخصم</th>
                    <th className="px-4 py-3 font-semibold">الحالة</th>
                    <th className="px-4 py-3 font-semibold">رابط المتجر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hub-border)]">
                  {GCC_COUNTRIES.map((c) => {
                    const entry = product.countryPrices?.[c.code];
                    const isAvail = entry?.availability === 'in stock';
                    return (
                      <tr
                        key={c.code}
                        className={
                          c.code === selectedCountry
                            ? 'bg-[var(--hub-surface-alt)]/55'
                            : 'bg-[var(--hub-surface)]'
                        }
                      >
                        <td className="px-4 py-3 font-semibold text-[var(--hub-text)]">{c.nameAr}</td>
                        <td className="px-4 py-3 font-bold text-[var(--hub-heading)] tabular-nums">
                          {formatPriceNumber(entry?.price, entry?.currency || c.currency)}
                        </td>
                        <td className="px-4 py-3 text-[var(--hub-muted)] tabular-nums">
                          {entry?.oldPrice ? `${entry.oldPrice} ${entry.currency}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              isAvail
                                ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                : 'text-red-700 dark:text-red-400 font-medium'
                            }
                          >
                            {isAvail ? 'متوفر' : 'غير متوفر'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {entry?.storeUrl ? (
                            <a
                              href={entry.storeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--hub-accent)] hover:underline"
                            >
                              <span>فتح الرابط</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Clickable Similar Alternatives */}
          {displayedAlternatives.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[var(--hub-heading)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--hub-accent)]" />
                  <span>
                    {product.category === 'perfumes' ? 'عطور مشابهة مقترحة' : 'بدائل مشابهة مقترحة'}
                  </span>
                </h3>
                {allAlternatives.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowMoreAlts((v) => !v)}
                    className="text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                  >
                    {showMoreAlts ? 'عرض أقل' : `عرض +${allAlternatives.length - 3} إضافية`}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {displayedAlternatives.map(({ product: alt, reasons }) => (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => onSelectProduct(alt)}
                    className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3.5 flex flex-col justify-between gap-2 hover:border-[var(--hub-accent)] hover:bg-[var(--hub-surface-alt)]/50 transition-colors cursor-pointer text-right"
                  >
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-[var(--hub-heading)]">{alt.nameAr}</div>
                      <div className="text-xs text-[var(--hub-accent)] mt-0.5">
                        {alt.fragranceFamily || alt.fragranceCharacter || CATEGORY_LABELS[alt.category]}
                      </div>
                      {reasons.length > 0 && (
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 font-medium">
                          سبب التشابه: {reasons[0]}
                        </div>
                      )}
                      <div className="text-xs text-[var(--hub-muted)] line-clamp-2 mt-1 leading-relaxed">
                        {alt.notesAndIngredients || alt.officialDescription}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-[var(--hub-accent)] pt-1">عرض بطاقة البديل</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Price Change History */}
          {Array.isArray(product.priceHistory) && product.priceHistory.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[var(--hub-heading)]">سجل تغييرات الأسعار</h3>
              <div className="space-y-1.5 text-xs">
                {product.priceHistory.slice(-10).reverse().map((h, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] px-3.5 py-2.5 tabular-nums"
                  >
                    <span className="font-semibold text-[var(--hub-heading)]">
                      {h.countryCode} · {h.previousPrice ?? '—'} ← {h.newPrice ?? '—'} {h.currency}
                    </span>
                    <span className="text-[var(--hub-muted)]">
                      {new Date(h.recordedAt).toLocaleString('ar-KW')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cleanInternalNotes && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3.5 text-xs sm:text-sm text-amber-950 dark:text-amber-200 leading-relaxed">
              <strong>ملاحظات الفريق الداخلية: </strong>
              {cleanInternalNotes}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--hub-muted)] pt-2 border-t border-[var(--hub-border)] tabular-nums">
            <span>آخر تحديث: {formatFirestoreDate(product.updatedAt)}</span>
            {product.updatedBy && <span>بواسطة: {product.updatedBy}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
