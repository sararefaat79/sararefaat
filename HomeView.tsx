import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  HelpCircle,
  History,
  Link2,
  MessageSquareText,
  Pin,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import { useHub } from '../../context/HubContext';
import { getNavSectionLabel } from '../../lib/ui-defaults';
import { formatFirestoreDate, getUpdatedAtMs } from '../../lib/firestore-service';
import {
  auditEmployeeDraftReply,
  generateGroundedReplySuggestion,
  refineReplyFormality,
  type AssistantFormality,
  type AssistantSuggestion,
  type ReplyAuditResult,
} from '../../lib/assistant-engine';
import { CopyButton } from '../CopyButton';
import { LogoPlacementBadge } from '../LogoPlacementBadge';
import type { SectionId, StaffSectionId } from '../../types/hub';

interface HomeViewProps {
  onNavigate: (section: SectionId) => void;
}

const ALL_SHORTCUT_CANDIDATES: StaffSectionId[] = [
  'products',
  'situations',
  'inquiries',
  'responses',
  'policies',
  'returns',
  'systems',
];

export function HomeView({ onNavigate }: HomeViewProps) {
  const {
    firebaseUser,
    roleTier,
    isSensitiveAdmin,
    isAdmin,
    userPreferences,
    toggleFavorite,
    toggleShortcut,
    branding,
    uiConfig,
    cannedResponses,
    inquiries,
    policies,
    situations,
    returnStages,
    quickPhrases,
    employeeAlerts,
    products,
    systemLinks,
    auditLogs,
    dataLoading,
  } = useHub();

  const [customerInput, setCustomerInput] = useState('');
  const [formality, setFormality] = useState<AssistantFormality>('kuwaiti_natural');
  const [suggestion, setSuggestion] = useState<AssistantSuggestion | null>(null);
  const [draftReply, setDraftReply] = useState('');
  const [auditResult, setAuditResult] = useState<ReplyAuditResult | null>(null);
  const [editingShortcuts, setEditingShortcuts] = useState(false);

  const visibleSystems = useMemo(
    () => systemLinks.filter((s) => (isAdmin || s.visibility === 'all_staff') && s.systemStatus !== 'legacy'),
    [systemLinks, isAdmin]
  );

  const pinnedSituations = useMemo(() => situations.filter((s) => s.isImportant), [situations]);

  const favoriteProductItems = useMemo(() => {
    const ids = new Set(userPreferences?.favoriteProducts || []);
    return products.filter((p) => ids.has(p.id));
  }, [products, userPreferences?.favoriteProducts]);

  const favoriteSituationItems = useMemo(() => {
    const ids = new Set(userPreferences?.favoriteSituations || []);
    return situations.filter((s) => ids.has(s.id));
  }, [situations, userPreferences?.favoriteSituations]);

  const favoritePolicyItems = useMemo(() => {
    const ids = new Set(userPreferences?.favoritePolicies || []);
    return policies.filter((p) => ids.has(p.id));
  }, [policies, userPreferences?.favoritePolicies]);

  const recentUpdates = useMemo(() => {
    const items: Array<{
      id: string;
      sectionId: SectionId;
      sectionLabel: string;
      title: string;
      updatedBy: string;
      updatedAtMs: number;
      updatedAtRaw: unknown;
    }> = [];

    for (const p of products) {
      const ms = getUpdatedAtMs(p.updatedAt);
      if (ms) {
        items.push({
          id: `prd_${p.id}`,
          sectionId: 'products',
          sectionLabel: 'المنتجات',
          title: p.nameAr,
          updatedBy: p.updatedBy,
          updatedAtMs: ms,
          updatedAtRaw: p.updatedAt,
        });
      }
    }
    for (const s of situations) {
      const ms = getUpdatedAtMs(s.updatedAt);
      if (ms) {
        items.push({
          id: `sit_${s.id}`,
          sectionId: 'situations',
          sectionLabel: `موقف #${s.situationNumber}`,
          title: s.customerInquiry,
          updatedBy: s.updatedBy,
          updatedAtMs: ms,
          updatedAtRaw: s.updatedAt,
        });
      }
    }
    for (const pol of policies) {
      const ms = getUpdatedAtMs(pol.updatedAt);
      if (ms) {
        items.push({
          id: `pol_${pol.id}`,
          sectionId: 'policies',
          sectionLabel: 'السياسات',
          title: pol.title,
          updatedBy: pol.updatedBy,
          updatedAtMs: ms,
          updatedAtRaw: pol.updatedAt,
        });
      }
    }
    for (const resp of cannedResponses) {
      const ms = getUpdatedAtMs(resp.updatedAt);
      if (ms) {
        items.push({
          id: `resp_${resp.id}`,
          sectionId: 'responses',
          sectionLabel: 'الردود الجاهزة',
          title: resp.title,
          updatedBy: resp.updatedBy,
          updatedAtMs: ms,
          updatedAtRaw: resp.updatedAt,
        });
      }
    }
    return items.sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 6);
  }, [products, situations, policies, cannedResponses]);

  const activeShortcuts = userPreferences?.dashboardShortcuts?.length
    ? userPreferences.dashboardShortcuts
    : (['products', 'situations', 'responses', 'policies'] as StaffSectionId[]);

  const roleTitle =
    roleTier === 'sensitive_admin'
      ? 'مدير النظام الرئيسي'
      : roleTier === 'operational_admin'
        ? 'مدير تشغيلي'
        : 'موظف خدمة عملاء';

  const handleGenerateSuggestion = () => {
    if (!customerInput.trim()) return;
    const res = generateGroundedReplySuggestion(
      customerInput,
      {
        inquiries,
        responses: cannedResponses,
        policies,
        situations,
        returns: returnStages,
        products,
        phrases: quickPhrases,
        systemLinks,
      },
      formality
    );
    setSuggestion(res);
  };

  const handleSwitchFormality = (nextFormality: AssistantFormality) => {
    setFormality(nextFormality);
    if (customerInput.trim()) {
      const res = generateGroundedReplySuggestion(
        customerInput,
        {
          inquiries,
          responses: cannedResponses,
          policies,
          situations,
          returns: returnStages,
          products,
          phrases: quickPhrases,
          systemLinks,
        },
        nextFormality
      );
      setSuggestion(res);
    } else if (suggestion) {
      setSuggestion({
        ...suggestion,
        suggestedKuwaitiReply: refineReplyFormality(suggestion.suggestedKuwaitiReply, nextFormality),
      });
    }
  };

  const handleAuditReply = () => {
    if (!draftReply.trim()) return;
    setAuditResult(auditEmployeeDraftReply(draftReply));
  };

  const totalFavoritesCount =
    favoriteProductItems.length + favoriteSituationItems.length + favoritePolicyItems.length;

  const textPos = branding?.textPosition || 'right';
  const desktopSizeClass =
    branding?.desktopTextSize === 'sm'
      ? 'lg:text-xl'
      : branding?.desktopTextSize === 'md'
        ? 'lg:text-2xl'
        : 'lg:text-3xl';
  const mobileSizeClass =
    branding?.mobileTextSize === 'sm'
      ? 'text-lg'
      : branding?.mobileTextSize === 'lg'
        ? 'text-2xl'
        : 'text-xl';

  const alignClass =
    textPos === 'center'
      ? 'text-center items-center mx-auto'
      : textPos === 'left'
        ? 'text-left items-end mr-auto'
        : 'text-right items-start';

  const isMinimalSurfaceHero = uiConfig.heroStyle === 'minimal_surface';
  const isDeepVelvetHero = uiConfig.heroStyle === 'deep_velvet';
  const isSplitEditorialHero = uiConfig.heroStyle === 'split_editorial';
  const isCustomImageHero = uiConfig.heroStyle === 'custom_image' && Boolean(uiConfig.heroCoverUrl);

  const heroContainerClass = isMinimalSurfaceHero
    ? 'bg-[var(--hub-surface)] text-[var(--hub-heading)] border-[var(--hub-border)]'
    : isDeepVelvetHero
      ? 'bg-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)] border-[var(--hub-accent-soft)]/30'
      : 'bg-gradient-to-l from-[var(--hub-sidebar-alt)] via-[var(--hub-sidebar)] to-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)] border-[var(--hub-border)]';

  const heroOverlayAlpha = Math.min(95, Math.max(15, uiConfig.heroOverlayOpacity || 72)) / 100;

  return (
    <div className="space-y-8" dir="rtl" lang="ar">
      {/* Section Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-semibold text-[var(--hub-muted)]">لوحة التحكم التشغيلية وقاعدة المعرفة</div>
      </div>

      {/* Optional Independent Home Placement Logo */}
      {uiConfig.logoPlacements.home.enabled && Boolean(uiConfig.logoPlacements.home.imageUrl?.trim()) && (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] px-5 py-3.5">
          <LogoPlacementBadge slot={uiConfig.logoPlacements.home} alt="شعار الصفحة الرئيسية" tone="surface" />
        </div>
      )}

      {/* Editable Cover / Hero Banner */}
      {uiConfig.heroVisible && (
        <section
          className={`relative overflow-hidden rounded-2xl border p-6 sm:p-8 transition-colors hub-card-elevated ${heroContainerClass}`}
        >
          {!isCustomImageHero && !isMinimalSurfaceHero && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background:
                  'radial-gradient(640px circle at 10% 15%, color-mix(in srgb, var(--hub-sidebar-accent) 26%, transparent), transparent 60%)',
              }}
            />
          )}
          {isCustomImageHero && (
            <>
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${uiConfig.heroCoverUrl})` }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  backgroundColor: `rgba(18, 8, 12, ${heroOverlayAlpha})`,
                }}
              />
            </>
          )}

          <div
            className={`relative z-10 flex flex-wrap gap-6 justify-between ${
              textPos === 'center' ? 'flex-col items-center' : 'items-center'
            }`}
          >
            <div className={`space-y-3 max-w-3xl flex flex-col ${alignClass}`}>
              {uiConfig.logoPlacements.hero_cover.enabled &&
                Boolean(uiConfig.logoPlacements.hero_cover.imageUrl?.trim()) && (
                  <div className="w-full">
                    <LogoPlacementBadge
                      slot={uiConfig.logoPlacements.hero_cover}
                      alt="شعار الغلاف"
                      tone={isMinimalSurfaceHero && !isCustomImageHero ? 'surface' : 'on-dark'}
                    />
                  </div>
                )}
              <div
                className={`text-xs sm:text-sm flex flex-wrap items-center gap-2 ${
                  isMinimalSurfaceHero && !isCustomImageHero
                    ? 'text-[var(--hub-accent)]'
                    : 'text-[var(--hub-sidebar-accent)]'
                }`}
              >
                <span className="font-semibold">
                  مرحباً، {firebaseUser?.displayName || firebaseUser?.email?.split('@')[0]}
                </span>
                <span aria-hidden="true">·</span>
                <span>{roleTitle}</span>
                {uiConfig.heroKicker && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{uiConfig.heroKicker}</span>
                  </>
                )}
              </div>

              <h1
                className={`font-display ${mobileSizeClass} sm:text-2xl ${desktopSizeClass} font-bold leading-snug ${
                  isMinimalSurfaceHero && !isCustomImageHero
                    ? 'text-[var(--hub-heading)]'
                    : 'text-[var(--hub-sidebar-text)]'
                }`}
              >
                {uiConfig.heroTitle}
              </h1>

              {uiConfig.heroDescription && (
                <p
                  className={`text-xs sm:text-sm leading-relaxed ${
                    isMinimalSurfaceHero && !isCustomImageHero
                      ? 'text-[var(--hub-text)]/85'
                      : 'text-[var(--hub-sidebar-text)]/85'
                  }`}
                >
                  {uiConfig.heroDescription}
                </p>
              )}

              <div className="pt-1 flex flex-wrap items-center gap-2.5">
                {uiConfig.heroPrimaryBtnLabel && (
                  <button
                    type="button"
                    onClick={() => onNavigate(uiConfig.heroPrimaryBtnTarget || 'products')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                      isMinimalSurfaceHero && !isCustomImageHero
                        ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)]'
                        : 'bg-[var(--hub-sidebar-accent)] text-[#191214] hover:opacity-90'
                    }`}
                  >
                    <span>{uiConfig.heroPrimaryBtnLabel}</span>
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                )}

                {isSensitiveAdmin && uiConfig.heroSecondaryBtnLabel && (
                  <button
                    type="button"
                    onClick={() => onNavigate('settings')}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                      isMinimalSurfaceHero && !isCustomImageHero
                        ? 'border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)]'
                        : 'border-white/25 bg-white/10 hover:bg-white/20 text-[var(--hub-sidebar-text)]'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>{uiConfig.heroSecondaryBtnLabel}</span>
                  </button>
                )}
              </div>
            </div>

            {isSplitEditorialHero && !isCustomImageHero && (
              <div className="hidden md:grid grid-cols-2 gap-3 min-w-[240px] rounded-xl border border-white/15 bg-white/5 p-4 text-xs">
                <div>
                  <div className="text-[var(--hub-sidebar-accent)] text-[11px]">الكتالوج المعتمد</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">{products.length}</div>
                </div>
                <div>
                  <div className="text-[var(--hub-sidebar-accent)] text-[11px]">المواقف</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">{situations.length}</div>
                </div>
                <div>
                  <div className="text-[var(--hub-sidebar-accent)] text-[11px]">الاستفسارات</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">{inquiries.length}</div>
                </div>
                <div>
                  <div className="text-[var(--hub-sidebar-accent)] text-[11px]">السياسات</div>
                  <div className="text-lg font-bold tabular-nums mt-0.5">{policies.length}</div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* KPI Shortcuts Grid */}
      {uiConfig.showKpiCards && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 sm:p-5 hover:border-[var(--hub-accent-soft)] hover:-translate-y-0.5 transition-[transform,border-color,box-shadow] cursor-pointer hub-card-elevated text-right"
          >
            <div className="text-xs font-medium text-[var(--hub-muted)]">{uiConfig.kpi1Title}</div>
            <div className="mt-1.5 text-2xl font-bold text-[var(--hub-heading)] tabular-nums">
              {dataLoading ? '...' : products.length}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold text-[var(--hub-accent)] flex items-center gap-1">
              <span>{uiConfig.kpi1Cta}</span>
              <ArrowUpLeft className="w-3 h-3" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('situations')}
            className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 sm:p-5 hover:border-[var(--hub-accent-soft)] hover:-translate-y-0.5 transition-[transform,border-color,box-shadow] cursor-pointer hub-card-elevated text-right"
          >
            <div className="text-xs font-medium text-[var(--hub-muted)]">{uiConfig.kpi2Title}</div>
            <div className="mt-1.5 text-2xl font-bold text-[var(--hub-heading)] tabular-nums">
              {dataLoading ? '...' : situations.length + returnStages.length}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold text-[var(--hub-accent)] flex items-center gap-1">
              <span>{uiConfig.kpi2Cta}</span>
              <ArrowUpLeft className="w-3 h-3" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('inquiries')}
            className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 sm:p-5 hover:border-[var(--hub-accent-soft)] hover:-translate-y-0.5 transition-[transform,border-color,box-shadow] cursor-pointer hub-card-elevated text-right"
          >
            <div className="text-xs font-medium text-[var(--hub-muted)]">{uiConfig.kpi3Title}</div>
            <div className="mt-1.5 text-2xl font-bold text-[var(--hub-heading)] tabular-nums">
              {dataLoading ? '...' : inquiries.length + cannedResponses.length}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold text-[var(--hub-accent)] flex items-center gap-1">
              <span>{uiConfig.kpi3Cta}</span>
              <ArrowUpLeft className="w-3 h-3" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('policies')}
            className="rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 sm:p-5 hover:border-[var(--hub-accent-soft)] hover:-translate-y-0.5 transition-[transform,border-color,box-shadow] cursor-pointer hub-card-elevated text-right"
          >
            <div className="text-xs font-medium text-[var(--hub-muted)]">{uiConfig.kpi4Title}</div>
            <div className="mt-1.5 text-2xl font-bold text-[var(--hub-heading)] tabular-nums">
              {dataLoading ? '...' : policies.length + visibleSystems.length}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold text-[var(--hub-accent)] flex items-center gap-1">
              <span>{uiConfig.kpi4Cta}</span>
              <ArrowUpLeft className="w-3 h-3" />
            </div>
          </button>
        </section>
      )}

      {/* Admin-Editable Custom Quick Links Strip */}
      {uiConfig.showCustomLinksSection && uiConfig.homeCustomLinks.length > 0 && (
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-[var(--hub-border)] pb-2.5">
            <Link2 className="w-4 h-4 text-[var(--hub-accent)]" />
            <h2 className="text-sm font-bold text-[var(--hub-heading)]">{uiConfig.customLinksTitle}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {uiConfig.homeCustomLinks.map((lnk) => (
              <a
                key={lnk.id}
                href={lnk.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3.5 py-2.5 hover:border-[var(--hub-accent-soft)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--hub-heading)] truncate">{lnk.label}</div>
                  {lnk.note && <div className="text-[11px] text-[var(--hub-muted)] truncate mt-0.5">{lnk.note}</div>}
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-[var(--hub-accent)] shrink-0" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Personal Shortcuts & Favorites */}
      {(uiConfig.showShortcutsSection || uiConfig.showFavoritesSection) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Customizable Quick Shortcuts */}
          {uiConfig.showShortcutsSection && (
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--hub-border)] pb-2.5">
                <h2 className="text-sm font-bold text-[var(--hub-heading)]">{uiConfig.shortcutsTitle}</h2>
                <button
                  type="button"
                  onClick={() => setEditingShortcuts((v) => !v)}
                  className="text-xs font-medium text-[var(--hub-accent)] hover:underline cursor-pointer"
                >
                  {editingShortcuts ? 'إنهاء التخصيص' : uiConfig.shortcutsEditBtnLabel}
                </button>
              </div>
              {editingShortcuts ? (
                <div className="flex flex-wrap gap-2">
                  {ALL_SHORTCUT_CANDIDATES.map((sec) => {
                    const selected = activeShortcuts.includes(sec);
                    return (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => toggleShortcut(sec)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          selected
                            ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                            : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border-[var(--hub-border)]'
                        }`}
                      >
                        {selected ? '✓ ' : '+ '}
                        {getNavSectionLabel(uiConfig, sec)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {activeShortcuts.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => onNavigate(sec)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3.5 py-2.5 text-xs font-semibold text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] cursor-pointer"
                    >
                      <span className="truncate">{getNavSectionLabel(uiConfig, sec)}</span>
                      <ArrowUpLeft className="w-3.5 h-3.5 text-[var(--hub-accent)] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Per-User Cloud Favorites */}
          {uiConfig.showFavoritesSection && (
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--hub-border)] pb-2.5">
                <div className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-[var(--hub-accent)]" />
                  <h2 className="text-sm font-bold text-[var(--hub-heading)]">
                    {uiConfig.favoritesTitle} ({totalFavoritesCount})
                  </h2>
                </div>
                <span className="text-[11px] text-[var(--hub-muted)]">{uiConfig.favoritesSubtitle}</span>
              </div>

              {totalFavoritesCount === 0 ? (
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">{uiConfig.favoritesEmptyText}</p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {favoriteProductItems.map((p) => (
                    <div
                      key={`fp_${p.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate('products')}
                        className="font-semibold text-[var(--hub-heading)] hover:underline truncate cursor-pointer text-right"
                      >
                        عطر: {p.nameAr}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavorite('products', p.id)}
                        className="text-amber-600 dark:text-amber-400 shrink-0 cursor-pointer"
                        title="إزالة من المفضلة"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  ))}
                  {favoriteSituationItems.map((s) => (
                    <div
                      key={`fs_${s.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate('situations')}
                        className="font-semibold text-[var(--hub-heading)] hover:underline truncate cursor-pointer text-right"
                      >
                        موقف #{s.situationNumber}: {s.customerInquiry}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavorite('situations', s.id)}
                        className="text-amber-600 dark:text-amber-400 shrink-0 cursor-pointer"
                        title="إزالة من المفضلة"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  ))}
                  {favoritePolicyItems.map((pol) => (
                    <div
                      key={`fpol_${pol.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate('policies')}
                        className="font-semibold text-[var(--hub-heading)] hover:underline truncate cursor-pointer text-right"
                      >
                        سياسة: {pol.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavorite('policies', pol.id)}
                        className="text-amber-600 dark:text-amber-400 shrink-0 cursor-pointer"
                        title="إزالة من المفضلة"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Quick Operational Systems Launch Strip */}
      {uiConfig.showQuickSystemsSection && visibleSystems.length > 0 && (
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[var(--hub-heading)]">{uiConfig.quickSystemsTitle}</h2>
            <button
              type="button"
              onClick={() => onNavigate('systems')}
              className="text-xs font-medium text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              {uiConfig.quickSystemsAllBtnLabel} ({systemLinks.filter((s) => isAdmin || s.visibility === 'all_staff').length})
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {visibleSystems.slice(0, 6).map((sys) => (
              <a
                key={sys.id}
                href={sys.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2.5 text-xs font-semibold text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] transition-colors"
              >
                <span className="truncate">{sys.systemName}</span>
                <ExternalLink className="w-3.5 h-3.5 text-[var(--hub-accent)] shrink-0" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Smart Local Assistant + Reply Checker */}
      {(uiConfig.showAssistantSection || uiConfig.showReplyCheckerSection) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {uiConfig.showAssistantSection && (
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--hub-border)]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[var(--hub-accent)]" />
                  <div>
                    <h2 className="text-base font-bold text-[var(--hub-heading)]">{uiConfig.assistantTitle}</h2>
                    <p className="text-xs text-[var(--hub-muted)]">{uiConfig.assistantSubtitle}</p>
                  </div>
                </div>
              </div>

              {/* Formality Tone Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--hub-muted)]">نبرة الرد:</span>
                {(
                  [
                    { id: 'kuwaiti_natural', ar: 'طبيعي كويتي' },
                    { id: 'formal', ar: 'رسمي ومهذب' },
                    { id: 'concise', ar: 'مختصر ومباشر' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSwitchFormality(opt.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                      formality === opt.id
                        ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                        : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border-[var(--hub-border)]'
                    }`}
                  >
                    {opt.ar}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                value={customerInput}
                onChange={(e) => setCustomerInput(e.target.value)}
                placeholder={uiConfig.assistantPlaceholder}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3 text-sm text-[var(--hub-text)] focus:outline-none focus:border-[var(--hub-accent-soft)] focus:bg-[var(--hub-surface)]"
              />

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-[var(--hub-muted)]">
                  محرك محلي مجاني 100% — لا يخترع أي أسعار أو سياسات
                </span>
                <button
                  type="button"
                  onClick={handleGenerateSuggestion}
                  disabled={!customerInput.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] disabled:opacity-50 cursor-pointer"
                >
                  {uiConfig.assistantBtnLabel}
                </button>
              </div>

              {suggestion && (
                <div className="rounded-lg border border-[var(--hub-accent-soft)]/50 bg-[var(--hub-bg)] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--hub-muted)]">
                    <span>
                      الموضوع: <strong className="text-[var(--hub-heading)]">{suggestion.detectedTopic}</strong>
                    </span>
                    <span>المصدر: {suggestion.matchedSourceLabel}</span>
                  </div>

                  {suggestion.warnings.map((w, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-md p-2.5"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                      <span>{w}</span>
                    </div>
                  ))}

                  <div className="text-[11px] font-semibold text-[var(--hub-muted)]">الرد المقترح للعميل:</div>

                  <div
                    dir="rtl"
                    className="text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed bg-[var(--hub-surface)] rounded-md p-3 border border-[var(--hub-border)]"
                  >
                    {suggestion.suggestedKuwaitiReply}
                  </div>

                  {suggestion.internalProcedure && (
                    <div className="text-xs text-[var(--hub-text)]">
                      <strong className="text-[var(--hub-heading)]">الإجراء الداخلي: </strong>
                      {suggestion.internalProcedure}
                    </div>
                  )}

                  {suggestion.escalationDept && (
                    <div className="text-xs text-[var(--hub-accent)] font-semibold">
                      قسم التصعيد / المتابعة: {suggestion.escalationDept}
                    </div>
                  )}

                  {suggestion.clarifyingQuestions.length > 0 && (
                    <div className="rounded-md bg-[var(--hub-surface)] border border-[var(--hub-border)] p-3 space-y-1.5">
                      <div className="text-[11px] font-bold text-[var(--hub-heading)] flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                        <span>أسئلة توضيحية يُستحسن التأكد منها قبل الإرسال:</span>
                      </div>
                      <ul className="list-disc list-inside text-xs text-[var(--hub-muted)] space-y-1">
                        {suggestion.clarifyingQuestions.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <CopyButton
                      text={suggestion.suggestedKuwaitiReply}
                      label={`${uiConfig.btnCopyLabel} الرد المقترح`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reply Checker */}
          {uiConfig.showReplyCheckerSection && (
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--hub-border)]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[var(--hub-accent)]" />
                  <div>
                    <h2 className="text-base font-bold text-[var(--hub-heading)]">{uiConfig.replyCheckerTitle}</h2>
                    <p className="text-xs text-[var(--hub-muted)]">{uiConfig.replyCheckerSubtitle}</p>
                  </div>
                </div>
              </div>

              <textarea
                rows={3}
                value={draftReply}
                onChange={(e) => setDraftReply(e.target.value)}
                placeholder={uiConfig.replyCheckerPlaceholder}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3 text-sm text-[var(--hub-text)] focus:outline-none focus:border-[var(--hub-accent-soft)] focus:bg-[var(--hub-surface)]"
              />

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-[var(--hub-muted)]">لا يرسل أي رد تلقائياً للعميل</span>
                <button
                  type="button"
                  onClick={handleAuditReply}
                  disabled={!draftReply.trim()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] disabled:opacity-50 cursor-pointer"
                >
                  {uiConfig.replyCheckerBtnLabel}
                </button>
              </div>

              {auditResult && (
                <div className="rounded-lg border border-[var(--hub-accent-soft)]/50 bg-[var(--hub-bg)] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--hub-heading)]">التقييم: {auditResult.scoreLabel}</span>
                  </div>

                  {auditResult.policyWarnings.map((w, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-xs text-red-900 dark:text-red-200 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-md p-2.5"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-700 dark:text-red-400" />
                      <span>{w}</span>
                    </div>
                  ))}

                  {auditResult.toneFindings.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-md p-2.5"
                    >
                      <MessageSquareText className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                      <span>{t}</span>
                    </div>
                  ))}

                  {auditResult.policyWarnings.length === 0 && auditResult.toneFindings.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-md p-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <span>الصياغة ممتازة ومتوافقة مع اللهجة الكويتية والضوابط المعتمدة.</span>
                    </div>
                  )}

                  <div
                    dir="rtl"
                    className="text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed bg-[var(--hub-surface)] rounded-md p-3 border border-[var(--hub-border)]"
                  >
                    {auditResult.improvedKuwaitiReply}
                  </div>

                  <div className="flex justify-end">
                    <CopyButton
                      text={auditResult.improvedKuwaitiReply}
                      label={`${uiConfig.btnCopyLabel} الصياغة المحسنة`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Pinned Important Situations + Recent Updates */}
      {(uiConfig.showAlertsSection || uiConfig.showUpdatesSection) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {uiConfig.showAlertsSection && (
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--hub-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Pin className="w-4 h-4 text-[var(--hub-accent)]" />
                  <h2 className="text-base font-bold text-[var(--hub-heading)]">
                    {uiConfig.alertsTitle} ({pinnedSituations.length + employeeAlerts.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('situations')}
                  className="text-xs font-medium text-[var(--hub-accent)] hover:underline cursor-pointer"
                >
                  {uiConfig.alertsAllBtnLabel}
                </button>
              </div>
              <div className="space-y-2.5">
                {pinnedSituations.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1"
                  >
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      موقف مثبت #{s.situationNumber} · {s.category}
                    </div>
                    <div className="text-xs text-[var(--hub-text)]">{s.customerInquiry}</div>
                  </div>
                ))}
                {employeeAlerts.slice(0, 3).map((a) => (
                  <div key={a.id} className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] space-y-1">
                    <div className="text-xs font-semibold text-[var(--hub-heading)]">{a.title}</div>
                    <div className="text-xs text-[var(--hub-muted)]">{a.ruleText}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Updates Feed */}
          {uiConfig.showUpdatesSection && (
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--hub-border)] pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--hub-accent)]" />
                  <h2 className="text-base font-bold text-[var(--hub-heading)]">{uiConfig.updatesTitle}</h2>
                </div>
              </div>
              {recentUpdates.length === 0 ? (
                <p className="text-sm text-[var(--hub-muted)]">{uiConfig.updatesEmptyText}</p>
              ) : (
                <div className="space-y-2">
                  {recentUpdates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.sectionId)}
                      className="w-full flex flex-wrap items-center justify-between gap-2 text-xs p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] hover:border-[var(--hub-accent-soft)] cursor-pointer text-right"
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-bold text-[var(--hub-accent)]">{item.sectionLabel}</span>
                        <span className="mx-1.5 text-[var(--hub-muted)]">·</span>
                        <span className="text-[var(--hub-heading)] font-medium">{item.title}</span>
                      </div>
                      <span className="text-[11px] text-[var(--hub-muted)] tabular-nums shrink-0">
                        {formatFirestoreDate(item.updatedAtRaw)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Quick Phrases Strip */}
      {uiConfig.showPhrasesSection && quickPhrases.length > 0 && (
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--hub-border)] pb-3">
            <h2 className="text-base font-bold text-[var(--hub-heading)]">{uiConfig.phrasesTitle}</h2>
            <button
              type="button"
              onClick={() => onNavigate('situations')}
              className="text-xs font-medium text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              {uiConfig.phrasesAllBtnLabel} ({quickPhrases.length})
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {quickPhrases.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)]"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--hub-accent)]">{p.purpose}</div>
                  <div className="text-sm text-[var(--hub-text)] mt-0.5">{p.phrase}</div>
                </div>
                <CopyButton text={p.phrase} label={uiConfig.btnCopyLabel} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Latest Audit Logs Timeline (Tier 1 Sensitive Admins ONLY) */}
      {isSensitiveAdmin && auditLogs.length > 0 && (
        <section className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--hub-border)] pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--hub-accent)]" />
              <h2 className="text-base font-bold text-[var(--hub-heading)]">أحدث السجلات الرقابية</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('audit')}
              className="text-xs font-medium text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              فتح السجل الكامل
            </button>
          </div>
          <div className="space-y-2">
            {auditLogs.slice(0, 5).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 text-xs p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)]"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-[var(--hub-heading)]">{log.section}</span>
                  <span className="mx-1.5 text-[var(--hub-muted)]">·</span>
                  <span className="text-[var(--hub-text)]">{log.summary}</span>
                </div>
                <span className="font-mono-tabular text-[var(--hub-muted)]" dir="ltr">
                  {log.actorEmail}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
