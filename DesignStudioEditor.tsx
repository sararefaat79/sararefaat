import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ImagePlus,
  LayoutGrid,
  Link2,
  Lock,
  MousePointerClick,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { ALL_STAFF_SECTIONS, SECTION_LABELS } from '../lib/auth-constants';
import {
  buildDefaultLogoSlot,
  DEFAULT_LOGO_PLACEMENTS,
  DEFAULT_UI_CONFIG,
  LOGO_SIZE_DEFAULT_PX,
  LOGO_SLOT_DIMENSION_BOUNDS,
  LOGO_SLOT_IDS,
  LOGO_SLOT_META,
  resolveUiConfig,
} from '../lib/ui-defaults';
import { resetSiteDesignToDefaults, saveSiteBranding } from '../lib/firestore-service';
import { parseFriendlyFirestoreError } from '../lib/firebase';
import { compressImageToDataUrl, FIELD_LIMITS, isValidHttpUrl, makeSafeDocId } from '../lib/validation';
import { ConfirmModal } from './ConfirmModal';
import { LogoPlacementBadge } from './LogoPlacementBadge';
import type {
  HeroCoverStyle,
  HomeCustomLink,
  LogoSlotAlign,
  LogoSlotConfig,
  LogoSlotDisplayStyle,
  LogoSlotFitMode,
  LogoSlotId,
  LogoSlotSize,
  SiteUiConfig,
  StaffSectionId,
} from '../types/hub';

type StudioTab = 'hero' | 'logos' | 'header_nav' | 'cards_sections' | 'custom_links';

const HERO_STYLE_OPTIONS: Array<{
  id: HeroCoverStyle;
  label: string;
  desc: string;
}> = [
  {
    id: 'royal_gradient',
    label: 'تدرج ملكي فاخر',
    desc: 'خلفية متدرجة بلون الهوية مع تباين ذهبي',
  },
  {
    id: 'split_editorial',
    label: 'واجهة منقسمة مع إحصائيات',
    desc: 'تدرج فاخر مع بطاقة مؤشرات فورية على الكمبيوتر',
  },
  {
    id: 'deep_velvet',
    label: 'مخملي داكن عميق',
    desc: 'سطح عميق داكن بإطار ذهبي خفيف',
  },
  {
    id: 'minimal_surface',
    label: 'سطح نهاري ناعم',
    desc: 'خلفية بطاقة هادئة متناغمة مع ألوان السطح',
  },
  {
    id: 'custom_image',
    label: 'صورة غلاف مخصصة',
    desc: 'صورة خلفية مخصصة مع طبقة تعتيم قابلة للضبط',
  },
];

export function DesignStudioEditor() {
  const {
    branding,
    uiConfig: activeUiConfig,
    previewUiConfig,
    setPreviewUiConfig,
    themeMode,
    notify,
    runTrackedMutation,
  } = useHub();

  const getSlotMeta = (slotId: LogoSlotId) => LOGO_SLOT_META[slotId];

  const [activeTab, setActiveTab] = useState<StudioTab>('hero');
  const [draft, setDraft] = useState<SiteUiConfig>(() => resolveUiConfig(branding));
  const [textPosition, setTextPosition] = useState<'right' | 'center' | 'left'>(branding?.textPosition || 'right');
  const [desktopTextSize, setDesktopTextSize] = useState<'sm' | 'md' | 'lg'>(branding?.desktopTextSize || 'lg');
  const [mobileTextSize, setMobileTextSize] = useState<'sm' | 'md' | 'lg'>(branding?.mobileTextSize || 'md');
  const [accentTone, setAccentTone] = useState<'gold' | 'burgundy'>(branding?.accentTone || 'gold');
  const [enabledSections, setEnabledSections] = useState<string[]>(
    Array.isArray(branding?.enabledSections) && branding.enabledSections.length > 0
      ? branding.enabledSections
      : [...ALL_STAFF_SECTIONS]
  );

  // Custom dashboard link form state
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkNote, setNewLinkNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [selectedLogoSlot, setSelectedLogoSlot] = useState<LogoSlotId>('header');
  const [uploadingLogoSlot, setUploadingLogoSlot] = useState(false);
  const [slotNaturalRatios, setSlotNaturalRatios] = useState<Partial<Record<LogoSlotId, number>>>({});

  // Sync draft when branding updates from Firestore (unless currently in live preview)
  useEffect(() => {
    if (previewUiConfig) return;
    setDraft(resolveUiConfig(branding));
    if (branding?.textPosition) setTextPosition(branding.textPosition);
    if (branding?.desktopTextSize) setDesktopTextSize(branding.desktopTextSize);
    if (branding?.mobileTextSize) setMobileTextSize(branding.mobileTextSize);
    if (branding?.accentTone) setAccentTone(branding.accentTone);
    if (Array.isArray(branding?.enabledSections) && branding.enabledSections.length > 0) {
      setEnabledSections(branding.enabledSections);
    }
  }, [branding, previewUiConfig]);

  const updateDraft = (patch: Partial<SiteUiConfig>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (previewUiConfig) {
        setPreviewUiConfig(next);
      }
      return next;
    });
  };

  const updateNavLabel = (sec: StaffSectionId, val: string) => {
    setDraft((prev) => {
      const next = {
        ...prev,
        navLabels: {
          ...prev.navLabels,
          [sec]: val,
        },
      };
      if (previewUiConfig) {
        setPreviewUiConfig(next);
      }
      return next;
    });
  };

  const toggleLivePreview = () => {
    if (previewUiConfig) {
      setPreviewUiConfig(null);
      notify('info', 'تم إيقاف المعاينة المباشرة والعودة للإعدادات المحفوظة.');
    } else {
      setPreviewUiConfig(draft);
      notify('info', 'تم تفعيل المعاينة المباشرة — يمكنك التنقل بين الصفحات لمشاهدة تعديلاتك قبل الحفظ.');
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 1400, FIELD_LIMITS.coverDataUrlMax);
      updateDraft({ heroCoverUrl: dataUrl, heroStyle: 'custom_image' });
      notify('success', 'تم تجهيز صورة الغلاف بنجاح — اضغط «حفظ التغييرات» لتعميمها سحابياً.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'تعذر معالجة صورة الغلاف.');
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const updateLogoSlot = (slotId: LogoSlotId, patch: Partial<LogoSlotConfig>) => {
    setDraft((prev) => {
      const nextPlacements = {
        ...prev.logoPlacements,
        [slotId]: {
          ...prev.logoPlacements[slotId],
          ...patch,
        },
      };
      const next = { ...prev, logoPlacements: nextPlacements };
      if (previewUiConfig) {
        setPreviewUiConfig(next);
      }
      return next;
    });
  };

  const handleSlotDimensionChange = (slotId: LogoSlotId, axis: 'width' | 'height', rawVal: number) => {
    const slot = draft.logoPlacements[slotId];
    const bounds = LOGO_SLOT_DIMENSION_BOUNDS[slotId];
    const currentW = slot.widthPx ?? LOGO_SIZE_DEFAULT_PX[slot.size || 'md'];
    const currentH = slot.heightPx ?? LOGO_SIZE_DEFAULT_PX[slot.size || 'md'];
    const lock = slot.lockAspectRatio ?? true;
    const ratio = slotNaturalRatios[slotId] || (currentH > 0 ? currentW / currentH : 1);

    if (axis === 'width') {
      let nextW = Math.max(bounds.min, Math.min(bounds.maxWidth, Math.round(rawVal)));
      if (lock) {
        let nextH = Math.round(nextW / ratio);
        if (nextH > bounds.maxHeight) {
          nextH = bounds.maxHeight;
          nextW = Math.max(bounds.min, Math.min(bounds.maxWidth, Math.round(nextH * ratio)));
        } else if (nextH < bounds.min) {
          nextH = bounds.min;
          nextW = Math.max(bounds.min, Math.min(bounds.maxWidth, Math.round(nextH * ratio)));
        }
        updateLogoSlot(slotId, { widthPx: nextW, heightPx: nextH });
      } else {
        updateLogoSlot(slotId, { widthPx: nextW });
      }
    } else {
      let nextH = Math.max(bounds.min, Math.min(bounds.maxHeight, Math.round(rawVal)));
      if (lock) {
        let nextW = Math.round(nextH * ratio);
        if (nextW > bounds.maxWidth) {
          nextW = bounds.maxWidth;
          nextH = Math.max(bounds.min, Math.min(bounds.maxHeight, Math.round(nextW / ratio)));
        } else if (nextW < bounds.min) {
          nextW = bounds.min;
          nextH = Math.max(bounds.min, Math.min(bounds.maxHeight, Math.round(nextW / ratio)));
        }
        updateLogoSlot(slotId, { widthPx: nextW, heightPx: nextH });
      } else {
        updateLogoSlot(slotId, { heightPx: nextH });
      }
    }
  };

  const handleSlotPresetSize = (slotId: LogoSlotId, nextSize: LogoSlotSize) => {
    const slot = draft.logoPlacements[slotId];
    const bounds = LOGO_SLOT_DIMENSION_BOUNDS[slotId];
    const targetH = Math.min(bounds.maxHeight, Math.max(bounds.min, LOGO_SIZE_DEFAULT_PX[nextSize]));
    const ratio = slotNaturalRatios[slotId] || 1;
    let nextH = targetH;
    let nextW = Math.round(targetH * ratio);
    if (nextW > bounds.maxWidth) {
      nextW = bounds.maxWidth;
      nextH = Math.max(bounds.min, Math.round(nextW / ratio));
    }
    updateLogoSlot(slotId, {
      size: nextSize,
      widthPx: nextW,
      heightPx: nextH,
    });
  };

  const handleRestoreSlotDimensions = (slotId: LogoSlotId) => {
    const def = DEFAULT_LOGO_PLACEMENTS[slotId];
    updateLogoSlot(slotId, {
      size: def.size,
      widthPx: def.widthPx ?? LOGO_SIZE_DEFAULT_PX[def.size],
      heightPx: def.heightPx ?? LOGO_SIZE_DEFAULT_PX[def.size],
      lockAspectRatio: def.lockAspectRatio ?? true,
      fitMode: def.fitMode ?? 'contain',
    });
    notify('info', `تمت استعادة الحجم والأبعاد الافتراضية لموضع «${LOGO_SLOT_META[slotId].title}» فقط.`);
  };

  const handleSlotLogoUpload = async (slotId: LogoSlotId, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogoSlot(true);
    try {
      const dataUrl = await compressImageToDataUrl(file, 380, 95000);
      updateLogoSlot(slotId, { enabled: true, imageUrl: dataUrl });
      notify('success', `تم رفع وتجهيز الشعار لموضع «${LOGO_SLOT_META[slotId].title}» — اضغط «حفظ التغييرات» لتعميمه.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'تعذر معالجة ملف الشعار.');
    } finally {
      setUploadingLogoSlot(false);
      e.target.value = '';
    }
  };

  const handleDeleteSlotLogo = (slotId: LogoSlotId) => {
    updateLogoSlot(slotId, { enabled: false, imageUrl: '' });
    notify('info', `تم حذف الشعار من «${LOGO_SLOT_META[slotId].title}» فقط دون التأثير على بقية المواضع.`);
  };

  const handleRestoreSlotDefault = (slotId: LogoSlotId) => {
    const restored = buildDefaultLogoSlot(slotId);
    updateLogoSlot(slotId, restored);
    notify('info', `تمت استعادة الشعار الافتراضي لموضع «${LOGO_SLOT_META[slotId].title}» فقط.`);
  };

  const handleAddCustomLink = () => {
    const label = newLinkLabel.trim();
    const url = newLinkUrl.trim();
    if (!label || !url) {
      notify('error', 'يُرجى إدخال اسم الرابط والرابط الكامل.');
      return;
    }
    if (!isValidHttpUrl(url)) {
      notify('error', 'يُرجى إدخال رابط صحيح يبدأ بـ https:// أو http://');
      return;
    }
    const item: HomeCustomLink = {
      id: makeSafeDocId('hlink'),
      label,
      url,
      ...(newLinkNote.trim() ? { note: newLinkNote.trim() } : {}),
    };
    updateDraft({
      showCustomLinksSection: true,
      homeCustomLinks: [...(draft.homeCustomLinks || []), item].slice(0, 10),
    });
    setNewLinkLabel('');
    setNewLinkUrl('');
    setNewLinkNote('');
  };

  const handleRemoveCustomLink = (id: string) => {
    updateDraft({
      homeCustomLinks: (draft.homeCustomLinks || []).filter((l) => l.id !== id),
    });
  };

  const toggleSection = (sec: StaffSectionId) => {
    setEnabledSections((prev) =>
      prev.includes(sec) ? prev.filter((s) => s !== sec) : [...prev, sec]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await runTrackedMutation(() =>
        saveSiteBranding(
          {
            systemName: 'مشاعر | Mashaer Customer Care Hub',
            coverDataUrl: draft.heroCoverUrl || '',
            heroTitle: draft.heroTitle,
            heroSubtitle: draft.heroKicker,
            heroDescription: draft.heroDescription,
            textPosition,
            showHeroText: draft.heroVisible,
            desktopTextSize,
            mobileTextSize,
            themeMode,
            accentTone,
            enabledSections,
            uiConfig: draft,
          },
          branding
        )
      );
      setPreviewUiConfig(null);
      notify('success', 'تم حفظ جميع تعديلات التصميم والمحتوى في Cloud Firestore وتعميمها لجميع المستخدمين.');
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRestoreDefaults = async () => {
    setRestoring(true);
    try {
      await runTrackedMutation(() => resetSiteDesignToDefaults(branding));
      setDraft(DEFAULT_UI_CONFIG);
      setTextPosition('right');
      setDesktopTextSize('lg');
      setMobileTextSize('md');
      setEnabledSections([...ALL_STAFF_SECTIONS]);
      setPreviewUiConfig(null);
      setConfirmRestoreOpen(false);
      notify('success', 'تمت استعادة الإعدادات الافتراضية لجميع عناصر التصميم وحفظها في Firestore.');
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setRestoring(false);
    }
  };

  const isPreviewOn = Boolean(previewUiConfig);
  const effectivePreviewLabel = isPreviewOn
    ? 'معاينة المنصة نشطة (التغييرات تظهر الآن في الواجهة)'
    : 'تعديل التصميم مع معاينة فورية وحفظ سحابي';

  return (
    <form
      onSubmit={handleSave}
      dir="rtl"
      className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-6 space-y-6"
    >
      {/* Studio Header & Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--hub-border)]">
        <div className="flex items-start gap-2.5">
          <Sparkles className="w-5 h-5 text-[var(--hub-accent)] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-[var(--hub-heading)]">
              استوديو تخصيص التصميم وعناصر الواجهة (للمديرين فقط)
            </h2>
            <p className="text-xs text-[var(--hub-muted)] mt-0.5">{effectivePreviewLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleLivePreview}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold cursor-pointer transition-colors ${
              isPreviewOn
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200'
                : 'border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)]'
            }`}
          >
            {isPreviewOn ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{isPreviewOn ? 'إيقاف المعاينة' : 'معاينة التعديلات مباشرة'}</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmRestoreOpen(true)}
            disabled={saving || restoring}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 px-3.5 py-2 text-xs font-semibold text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الإعدادات الافتراضية</span>
          </button>

          <button
            type="submit"
            disabled={saving || restoring}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hub-button)] px-4 py-2 text-xs font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] disabled:opacity-60 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ التغييرات وتعميمها'}</span>
          </button>
        </div>
      </div>

      {/* Inline Instant Hero & KPI Preview Card */}
      <div className="rounded-xl border border-dashed border-[var(--hub-accent-soft)]/70 bg-[var(--hub-bg)] p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--hub-accent)]">
          <span>معاينة مصغرة للغلاف والبطاقات بالصفحة الرئيسية (محدثة فورياً أثناء الكتابة):</span>
          {activeUiConfig.heroVisible !== draft.heroVisible && (
            <span className="text-amber-700 dark:text-amber-300">حالة الغلاف معدّلة</span>
          )}
        </div>

        {draft.heroVisible ? (
          <div
            className={`relative overflow-hidden rounded-xl border border-[var(--hub-border)] p-4 sm:p-5 ${
              draft.heroStyle === 'minimal_surface'
                ? 'bg-[var(--hub-surface)] text-[var(--hub-heading)]'
                : draft.heroStyle === 'deep_velvet'
                  ? 'bg-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)]'
                  : 'bg-gradient-to-l from-[var(--hub-sidebar-alt)] via-[var(--hub-sidebar)] to-[var(--hub-sidebar-alt)] text-[var(--hub-sidebar-text)]'
            }`}
          >
            {draft.heroStyle === 'custom_image' && draft.heroCoverUrl && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${draft.heroCoverUrl})` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    backgroundColor: `rgba(18, 8, 12, ${Math.min(95, Math.max(15, draft.heroOverlayOpacity || 72)) / 100})`,
                  }}
                />
              </>
            )}
            <div
              className={`relative z-10 space-y-1.5 ${
                textPosition === 'center' ? 'text-center' : textPosition === 'left' ? 'text-left' : 'text-right'
              }`}
            >
              {draft.heroKicker && (
                <div
                  className={`text-[11px] font-medium ${
                    draft.heroStyle === 'minimal_surface' ? 'text-[var(--hub-accent)]' : 'text-[var(--hub-sidebar-accent)]'
                  }`}
                >
                  {draft.heroKicker}
                </div>
              )}
              <div className="text-base sm:text-lg font-bold">{draft.heroTitle || 'عنوان الواجهة'}</div>
              <div className="text-xs opacity-85 line-clamp-2">{draft.heroDescription}</div>
              <div className="pt-1 flex flex-wrap gap-2 justify-start">
                {draft.heroPrimaryBtnLabel && (
                  <span className="inline-block rounded-md bg-[var(--hub-sidebar-accent)] text-[#191214] px-3 py-1 text-[11px] font-semibold">
                    {draft.heroPrimaryBtnLabel}
                  </span>
                )}
                {draft.heroSecondaryBtnLabel && (
                  <span className="inline-block rounded-md border border-current/25 px-3 py-1 text-[11px] font-semibold">
                    {draft.heroSecondaryBtnLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-3 text-center text-xs text-[var(--hub-muted)]">
            بطاقة الغلاف الرئيسية مخفية حالياً حسب الإعدادات المحددة
          </div>
        )}

        {draft.showKpiCards && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { title: draft.kpi1Title, cta: draft.kpi1Cta },
              { title: draft.kpi2Title, cta: draft.kpi2Cta },
              { title: draft.kpi3Title, cta: draft.kpi3Cta },
              { title: draft.kpi4Title, cta: draft.kpi4Cta },
            ].map((k, idx) => (
              <div key={idx} className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] p-2.5">
                <div className="text-[11px] text-[var(--hub-muted)] truncate">{k.title}</div>
                <div className="text-[11px] font-semibold text-[var(--hub-accent)] truncate mt-1">{k.cta}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--hub-border)] pb-3">
        {(
          [
            { id: 'logos', label: 'إدارة الشعارات والمواضع', icon: ImageIcon },
            { id: 'hero', label: 'الغلاف والنصوص الرئيسية', icon: Type },
            { id: 'header_nav', label: 'الهيدر والأزرار والقائمة', icon: MousePointerClick },
            { id: 'cards_sections', label: 'البطاقات وعناصر الرئيسية', icon: LayoutGrid },
            { id: 'custom_links', label: 'الروابط المخصصة والأقسام', icon: Link2 },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold cursor-pointer border transition-colors ${
                active
                  ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-heading)] border-[var(--hub-border)] hover:border-[var(--hub-accent-soft)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: Independent Multi-Placement Logo Manager */}
      {activeTab === 'logos' && (() => {
        const currentSlot = draft.logoPlacements[selectedLogoSlot];
        const slotMeta = getSlotMeta(selectedLogoSlot);
        const bounds = LOGO_SLOT_DIMENSION_BOUNDS[selectedLogoSlot];
        const currentW = currentSlot.widthPx ?? LOGO_SIZE_DEFAULT_PX[currentSlot.size || 'md'];
        const currentH = currentSlot.heightPx ?? LOGO_SIZE_DEFAULT_PX[currentSlot.size || 'md'];
        const lockRatio = currentSlot.lockAspectRatio ?? true;
        const fitMode = currentSlot.fitMode ?? 'contain';
        const hasLogo = currentSlot.enabled && Boolean(currentSlot.imageUrl?.trim());
        const isDarkPreview = selectedLogoSlot === 'sidebar' || selectedLogoSlot === 'hero_cover' || selectedLogoSlot === 'auth_gate';

        return (
          <div className="space-y-5">
            {hasLogo && (
              <img
                src={currentSlot.imageUrl}
                alt=""
                aria-hidden="true"
                className="hidden"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const ratio = img.naturalWidth / img.naturalHeight;
                    setSlotNaturalRatios((prev) =>
                      prev[selectedLogoSlot] === ratio ? prev : { ...prev, [selectedLogoSlot]: ratio }
                    );
                  }
                }}
              />
            )}

            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3.5 text-xs text-[var(--hub-muted)] leading-relaxed">
              تحكم مرن ومستقل بالكامل لكل موضع يظهر فيه الشعار (الرفع، الأبعاد الدقيقة بالبكسل، التناسب، والمحاذاة): تعديل أو تكبير أو تصغير الشعار في أحد المواضع{' '}
              <strong className="text-[var(--hub-heading)]">لا يؤثر مطلقاً على بقية المواضع</strong>، وتُحفظ التعديلات في السحابة لجميع المستخدمين.
            </div>

            {/* Placement Switcher Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {LOGO_SLOT_IDS.map((slotId) => {
                const slotCfg = draft.logoPlacements[slotId];
                const meta = getSlotMeta(slotId);
                const isSelected = selectedLogoSlot === slotId;
                const activeLogo = slotCfg.enabled && Boolean(slotCfg.imageUrl?.trim());
                const w = slotCfg.widthPx ?? LOGO_SIZE_DEFAULT_PX[slotCfg.size || 'md'];
                const h = slotCfg.heightPx ?? LOGO_SIZE_DEFAULT_PX[slotCfg.size || 'md'];
                return (
                  <button
                    key={slotId}
                    type="button"
                    onClick={() => setSelectedLogoSlot(slotId)}
                    className={`rounded-xl border p-3 text-right transition-colors cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'border-[var(--hub-accent)] bg-[var(--hub-surface-alt)] ring-1 ring-[var(--hub-accent-soft)]'
                        : 'border-[var(--hub-border)] bg-[var(--hub-bg)] hover:border-[var(--hub-accent-soft)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--hub-heading)] truncate">{meta.title}</span>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          activeLogo ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--hub-muted)]'
                        }`}
                      >
                        {activeLogo ? 'مفعّل' : 'مخفي'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--hub-muted)] line-clamp-1">{meta.subtitle}</div>
                    <div className="text-[10px] font-mono-tabular text-[var(--hub-accent)]" dir="ltr">
                      {w} × {h} px
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Slot Control Panel + Live Preview */}
            <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--hub-border)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--hub-heading)]">{slotMeta.title}</h3>
                  <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                    {slotMeta.subtitle} · {slotMeta.locationHint}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hub-button)] px-3.5 py-2 text-xs font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>
                      {uploadingLogoSlot ? 'جاري الضغط...' : hasLogo ? 'استبدال الشعار' : 'رفع شعار جديد'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingLogoSlot}
                      onChange={(e) => handleSlotLogoUpload(selectedLogoSlot, e)}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRestoreSlotDimensions(selectedLogoSlot)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                    <span>استعادة الحجم الافتراضي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRestoreSlotDefault(selectedLogoSlot)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[var(--hub-muted)]" />
                    <span>استعادة الموضع بالكامل</span>
                  </button>

                  {hasLogo && (
                    <button
                      type="button"
                      onClick={() => handleDeleteSlotLogo(selectedLogoSlot)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/80 dark:bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف من هذا الموضع فقط</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Visual Preview Box BEFORE Saving */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-[var(--hub-accent)]">
                  <span>
                    معاينة الشعار بالأبعاد الفعلية ({currentW}×{currentH} px) في «{slotMeta.title}» قبل الحفظ:
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--hub-heading)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentSlot.enabled}
                      onChange={(e) => updateLogoSlot(selectedLogoSlot, { enabled: e.target.checked })}
                      className="accent-[var(--hub-button)]"
                    />
                    <span>إظهار الشعار في هذا الموضع</span>
                  </label>
                </div>

                <div
                  className={`rounded-xl border border-dashed p-5 min-h-[120px] flex items-center transition-colors overflow-x-auto ${
                    isDarkPreview
                      ? 'bg-[var(--hub-sidebar)] border-[var(--hub-sidebar-accent)]/40 text-[var(--hub-sidebar-text)]'
                      : 'bg-[var(--hub-surface)] border-[var(--hub-border)] text-[var(--hub-heading)]'
                  }`}
                >
                  {hasLogo ? (
                    <div className="w-full">
                      <LogoPlacementBadge
                        slot={currentSlot}
                        alt={slotMeta.title}
                        tone={isDarkPreview ? 'on-dark' : 'surface'}
                      />
                    </div>
                  ) : (
                    <div className="w-full text-center text-xs opacity-80">
                      لا يوجد شعار معروض في «{slotMeta.title}» حالياً (محذوف أو مخفي لهذا الموضع فقط)
                    </div>
                  )}
                </div>
              </div>

              {/* Dedicated Per-Slot Exact Dimension Controls */}
              <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[var(--hub-heading)]">
                      ضبط حجم وأبعاد الشعار لـ «{slotMeta.title}»
                    </div>
                    <div className="text-[11px] text-[var(--hub-muted)]">
                      الحدود المتاحة لهذا الموضع: العرض {bounds.min}–{bounds.maxWidth}px · الارتفاع {bounds.min}–{bounds.maxHeight}px
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateLogoSlot(selectedLogoSlot, { lockAspectRatio: !lockRatio })}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                      lockRatio
                        ? 'border-[var(--hub-accent-soft)] bg-[var(--hub-surface-alt)] text-[var(--hub-heading)]'
                        : 'border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-muted)]'
                    }`}
                  >
                    {lockRatio ? <Lock className="w-3.5 h-3.5 text-[var(--hub-accent)]" /> : <Unlock className="w-3.5 h-3.5" />}
                    <span>
                      {lockRatio ? 'الحفاظ على تناسب الأبعاد: مفعّل' : 'تحكم مستقل بالعرض والارتفاع'}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-[var(--hub-heading)]">العرض</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={bounds.min}
                          max={bounds.maxWidth}
                          value={currentW}
                          onChange={(e) => handleSlotDimensionChange(selectedLogoSlot, 'width', Number(e.target.value))}
                          className="w-16 rounded-md border border-[var(--hub-border)] bg-[var(--hub-bg)] px-2 py-1 text-center font-mono-tabular text-xs text-[var(--hub-text)]"
                          dir="ltr"
                        />
                        <span className="text-[11px] text-[var(--hub-muted)]">px</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={bounds.min}
                      max={bounds.maxWidth}
                      value={currentW}
                      onChange={(e) => handleSlotDimensionChange(selectedLogoSlot, 'width', Number(e.target.value))}
                      className="w-full accent-[var(--hub-button)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-[var(--hub-heading)]">الارتفاع</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={bounds.min}
                          max={bounds.maxHeight}
                          value={currentH}
                          onChange={(e) => handleSlotDimensionChange(selectedLogoSlot, 'height', Number(e.target.value))}
                          className="w-16 rounded-md border border-[var(--hub-border)] bg-[var(--hub-bg)] px-2 py-1 text-center font-mono-tabular text-xs text-[var(--hub-text)]"
                          dir="ltr"
                        />
                        <span className="text-[11px] text-[var(--hub-muted)]">px</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={bounds.min}
                      max={bounds.maxHeight}
                      value={currentH}
                      onChange={(e) => handleSlotDimensionChange(selectedLogoSlot, 'height', Number(e.target.value))}
                      className="w-full accent-[var(--hub-button)]"
                    />
                  </div>
                </div>

                {/* Quick Size Presets + Fit Mode */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--hub-border)]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-[var(--hub-muted)] ml-1">مقاسات سريعة:</span>
                    {(
                      [
                        { id: 'sm', label: 'صغير' },
                        { id: 'md', label: 'متوسط' },
                        { id: 'lg', label: 'كبير' },
                        { id: 'xl', label: 'بارز' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSlotPresetSize(selectedLogoSlot, preset.id)}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold cursor-pointer transition-colors ${
                          currentSlot.size === preset.id
                            ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                            : 'bg-[var(--hub-bg)] text-[var(--hub-heading)] border-[var(--hub-border)] hover:border-[var(--hub-accent-soft)]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] font-semibold text-[var(--hub-muted)]">احتواء الصورة:</span>
                    <select
                      value={fitMode}
                      onChange={(e) => updateLogoSlot(selectedLogoSlot, { fitMode: e.target.value as LogoSlotFitMode })}
                      className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-2.5 py-1 text-xs text-[var(--hub-text)]"
                    >
                      <option value="contain">كامل الشعار بدون قص (تناسب مثالي)</option>
                      <option value="cover">ملء الإطار بالكامل</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Per-Slot Fine Controls: URL, Alignment, Display Style, Label */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                    أو رابط صورة شعار (HTTPS) لهذا الموضع فقط
                  </label>
                  <input
                    dir="ltr"
                    value={
                      currentSlot.imageUrl.startsWith('data:')
                        ? '[شعار مرفوع ومضغوط جاهز للحفظ لهذا الموضع]'
                        : currentSlot.imageUrl
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val.startsWith('[')) {
                        updateLogoSlot(selectedLogoSlot, {
                          imageUrl: val,
                          enabled: val.trim() ? true : currentSlot.enabled,
                        });
                      }
                    }}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">المحاذاة</label>
                  <select
                    value={currentSlot.align}
                    onChange={(e) => updateLogoSlot(selectedLogoSlot, { align: e.target.value as LogoSlotAlign })}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                  >
                    <option value="right">يمين</option>
                    <option value="center">وسط</option>
                    <option value="left">يسار</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">طريقة العرض والإطار</label>
                  <select
                    value={currentSlot.displayStyle}
                    onChange={(e) =>
                      updateLogoSlot(selectedLogoSlot, { displayStyle: e.target.value as LogoSlotDisplayStyle })
                    }
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                  >
                    <option value="rounded">زوايا ناعمة وإطار خفيف</option>
                    <option value="framed">إطار ذهبي فاخر</option>
                    <option value="circle">دائري</option>
                    <option value="square">مربع هندسي حاد</option>
                    <option value="clean">شفاف بدون خلفية أو إطار</option>
                  </select>
                </div>

                <div className="lg:col-span-4 flex flex-wrap items-end gap-3">
                  <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs font-semibold text-[var(--hub-heading)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(currentSlot.showLabel)}
                      onChange={(e) => updateLogoSlot(selectedLogoSlot, { showLabel: e.target.checked })}
                      className="accent-[var(--hub-button)]"
                    />
                    <span>إظهار نص بجانب الشعار في هذا الموضع</span>
                  </label>

                  {currentSlot.showLabel && (
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                        النص المرافق للشعار
                      </label>
                      <input
                        value={currentSlot.labelText || ''}
                        onChange={(e) => updateLogoSlot(selectedLogoSlot, { labelText: e.target.value })}
                        placeholder="شركة مشاعر للعطور"
                        className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TAB 1: Hero Cover & Typography */}
      {activeTab === 'hero' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3.5">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--hub-heading)] cursor-pointer">
              <input
                type="checkbox"
                checked={draft.heroVisible}
                onChange={(e) => updateDraft({ heroVisible: e.target.checked })}
                className="accent-[var(--hub-button)]"
              />
              <span>إظهار الغلاف الرئيسي في الصفحة الرئيسية</span>
            </label>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-[var(--hub-muted)]">محاذاة النص:</span>
                <select
                  value={textPosition}
                  onChange={(e) => setTextPosition(e.target.value as 'right' | 'center' | 'left')}
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                >
                  <option value="right">يمين</option>
                  <option value="center">وسط</option>
                  <option value="left">يسار</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5">
                <span className="text-[var(--hub-muted)]">حجم الكمبيوتر:</span>
                <select
                  value={desktopTextSize}
                  onChange={(e) => setDesktopTextSize(e.target.value as 'sm' | 'md' | 'lg')}
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                >
                  <option value="sm">صغير</option>
                  <option value="md">متوسط</option>
                  <option value="lg">كبير</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5">
                <span className="text-[var(--hub-muted)]">حجم الجوال:</span>
                <select
                  value={mobileTextSize}
                  onChange={(e) => setMobileTextSize(e.target.value as 'sm' | 'md' | 'lg')}
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                >
                  <option value="sm">صغير</option>
                  <option value="md">متوسط</option>
                  <option value="lg">كبير</option>
                </select>
              </label>
            </div>
          </div>

          {/* Hero Style Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--hub-heading)]">نمط تصميم الغلاف:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {HERO_STYLE_OPTIONS.map((opt) => {
                const selected = draft.heroStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateDraft({ heroStyle: opt.id })}
                    className={`rounded-lg border p-3 text-right cursor-pointer transition-colors ${
                      selected
                        ? 'border-[var(--hub-accent)] bg-[var(--hub-surface-alt)] ring-1 ring-[var(--hub-accent-soft)]'
                        : 'border-[var(--hub-border)] bg-[var(--hub-bg)] hover:border-[var(--hub-accent-soft)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-bold text-[var(--hub-heading)]">
                      <span>{opt.label}</span>
                      {selected && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--hub-accent)] shrink-0" />}
                    </div>
                    <div className="text-[11px] text-[var(--hub-muted)] mt-1">{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Cover Image Upload / URL & Overlay */}
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[var(--hub-heading)]">
                  صورة الغلاف (اختياري — عند اختيار نمط صورة مخصصة)
                </div>
                <div className="text-[11px] text-[var(--hub-muted)]">
                  تُضغط الصورة تلقائياً لتُحفظ في قاعدة البيانات السحابية دون خدمات تخزين خارجية.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--hub-heading)] hover:border-[var(--hub-accent-soft)] cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                  <span>{uploadingCover ? 'جاري الضغط...' : 'رفع صورة غلاف'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverUpload}
                    disabled={uploadingCover}
                    className="hidden"
                  />
                </label>
                {draft.heroCoverUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft({
                        heroCoverUrl: '',
                        heroStyle: draft.heroStyle === 'custom_image' ? 'royal_gradient' : draft.heroStyle,
                      })
                    }
                    className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 cursor-pointer"
                  >
                    إزالة الصورة
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  أو رابط صورة خارجية (HTTPS)
                </label>
                <input
                  dir="ltr"
                  value={
                    draft.heroCoverUrl.startsWith('data:')
                      ? '[صورة مرفوعة ومضغوطة جاهزة للحفظ]'
                      : draft.heroCoverUrl
                  }
                  onChange={(e) => {
                    if (!e.target.value.startsWith('[')) {
                      updateDraft({ heroCoverUrl: e.target.value });
                    }
                  }}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1 tabular-nums">
                  درجة تعتيم خلفية الغلاف ({draft.heroOverlayOpacity}%)
                </label>
                <input
                  type="range"
                  min={20}
                  max={90}
                  value={draft.heroOverlayOpacity}
                  onChange={(e) => updateDraft({ heroOverlayOpacity: Number(e.target.value) })}
                  className="w-full accent-[var(--hub-button)]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                الشريط التمهيدي (أعلى العنوان)
              </label>
              <input
                value={draft.heroKicker}
                onChange={(e) => updateDraft({ heroKicker: e.target.value })}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                العنوان الرئيسي بالغلاف
              </label>
              <input
                value={draft.heroTitle}
                onChange={(e) => updateDraft({ heroTitle: e.target.value })}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
              الوصف الترحيبي بالغلاف
            </label>
            <textarea
              rows={2}
              value={draft.heroDescription}
              onChange={(e) => updateDraft({ heroDescription: e.target.value })}
              className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                نص الزر الأساسي بالغلاف
              </label>
              <input
                value={draft.heroPrimaryBtnLabel}
                onChange={(e) => updateDraft({ heroPrimaryBtnLabel: e.target.value })}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                وجهة الزر الأساسي
              </label>
              <select
                value={draft.heroPrimaryBtnTarget}
                onChange={(e) => updateDraft({ heroPrimaryBtnTarget: e.target.value as StaffSectionId })}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
              >
                {ALL_STAFF_SECTIONS.map((sec) => (
                  <option key={sec} value={sec}>
                    {SECTION_LABELS[sec]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--hub-heading)] mb-1">
                نص زر الإعدادات للمدير
              </label>
              <input
                value={draft.heroSecondaryBtnLabel}
                onChange={(e) => updateDraft({ heroSecondaryBtnLabel: e.target.value })}
                className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] text-[var(--hub-text)] px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Header, Nav Labels & Common Action Buttons */}
      {activeTab === 'header_nav' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--hub-heading)]">عناصر الهيدر والشريط العلوي:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  اسم العلامة في الهيدر
                </label>
                <input
                  value={draft.headerTitle}
                  onChange={(e) => updateDraft({ headerTitle: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  وصف إضافي بجانب اسم القسم بالهيدر
                </label>
                <input
                  value={draft.headerSubtitle}
                  onChange={(e) => updateDraft({ headerSubtitle: e.target.value })}
                  placeholder="اختياري (مثال: بوابة الفريق)"
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  نص مربع البحث الشامل
                </label>
                <input
                  value={draft.searchPlaceholder}
                  onChange={(e) => updateDraft({ searchPlaceholder: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  تسمية زر الثيم
                </label>
                <input
                  value={draft.themeBtnLabel}
                  onChange={(e) => updateDraft({ themeBtnLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  تسمية الوضع النهاري
                </label>
                <input
                  value={draft.lightModeLabel}
                  onChange={(e) => updateDraft({ lightModeLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">
                  تسمية الوضع الداكن
                </label>
                <input
                  value={draft.darkModeLabel}
                  onChange={(e) => updateDraft({ darkModeLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--hub-border)]">
            <h3 className="text-xs font-bold text-[var(--hub-heading)]">تسميات الأزرار المشتركة:</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">زر التفاصيل</label>
                <input
                  value={draft.btnDetailsLabel}
                  onChange={(e) => updateDraft({ btnDetailsLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">زر النسخ</label>
                <input
                  value={draft.btnCopyLabel}
                  onChange={(e) => updateDraft({ btnCopyLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">زر المقارنة</label>
                <input
                  value={draft.btnCompareLabel}
                  onChange={(e) => updateDraft({ btnCompareLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--hub-heading)] mb-1">زر رابط المتجر</label>
                <input
                  value={draft.btnStoreLinkLabel}
                  onChange={(e) => updateDraft({ btnStoreLinkLabel: e.target.value })}
                  className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-[var(--hub-border)]">
            <h3 className="text-xs font-bold text-[var(--hub-heading)]">تسميات الأقسام في القائمة الجانبية والهيدر:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ALL_STAFF_SECTIONS.map((sec) => (
                <div key={sec}>
                  <label className="block text-[11px] text-[var(--hub-muted)] mb-1">
                    {SECTION_LABELS[sec]}
                  </label>
                  <input
                    value={draft.navLabels[sec] || ''}
                    onChange={(e) => updateNavLabel(sec, e.target.value)}
                    className="w-full rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-2 text-xs text-[var(--hub-text)]"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: KPI Cards & Dashboard Sections */}
      {activeTab === 'cards_sections' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[var(--hub-heading)]">البطاقات الأربع الإحصائية بالصفحة الرئيسية:</h3>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showKpiCards}
                  onChange={(e) => updateDraft({ showKpiCards: e.target.checked })}
                  className="accent-[var(--hub-button)]"
                />
                <span>إظهار البطاقات الأربع</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3 space-y-2">
                <div className="text-[11px] font-bold text-[var(--hub-accent)]">البطاقة 1 (المنتجات)</div>
                <input
                  value={draft.kpi1Title}
                  onChange={(e) => updateDraft({ kpi1Title: e.target.value })}
                  placeholder="عنوان البطاقة"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.kpi1Cta}
                  onChange={(e) => updateDraft({ kpi1Cta: e.target.value })}
                  placeholder="نص الرابط"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>

              <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3 space-y-2">
                <div className="text-[11px] font-bold text-[var(--hub-accent)]">البطاقة 2 (المواقف)</div>
                <input
                  value={draft.kpi2Title}
                  onChange={(e) => updateDraft({ kpi2Title: e.target.value })}
                  placeholder="عنوان البطاقة"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.kpi2Cta}
                  onChange={(e) => updateDraft({ kpi2Cta: e.target.value })}
                  placeholder="نص الرابط"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>

              <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3 space-y-2">
                <div className="text-[11px] font-bold text-[var(--hub-accent)]">البطاقة 3 (الاستفسارات)</div>
                <input
                  value={draft.kpi3Title}
                  onChange={(e) => updateDraft({ kpi3Title: e.target.value })}
                  placeholder="عنوان البطاقة"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.kpi3Cta}
                  onChange={(e) => updateDraft({ kpi3Cta: e.target.value })}
                  placeholder="نص الرابط"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>

              <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-3 space-y-2">
                <div className="text-[11px] font-bold text-[var(--hub-accent)]">البطاقة 4 (السياسات)</div>
                <input
                  value={draft.kpi4Title}
                  onChange={(e) => updateDraft({ kpi4Title: e.target.value })}
                  placeholder="عنوان البطاقة"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.kpi4Cta}
                  onChange={(e) => updateDraft({ kpi4Cta: e.target.value })}
                  placeholder="نص الرابط"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>
            </div>
          </div>

          {/* Dashboard Sections Titles, Descriptions, Placeholders, Buttons & Toggles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-[var(--hub-border)]">
            <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-3">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showShortcutsSection}
                  onChange={(e) => updateDraft({ showShortcutsSection: e.target.checked })}
                  className="accent-[var(--hub-button)]"
                />
                <span>بطاقة الاختصارات السريعة</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={draft.shortcutsTitle}
                  onChange={(e) => updateDraft({ shortcutsTitle: e.target.value })}
                  placeholder="عنوان البطاقة"
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.shortcutsEditBtnLabel}
                  onChange={(e) => updateDraft({ shortcutsEditBtnLabel: e.target.value })}
                  placeholder="زر التخصيص"
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>

              <div className="pt-2 border-t border-[var(--hub-border)] space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.showFavoritesSection}
                    onChange={(e) => updateDraft({ showFavoritesSection: e.target.checked })}
                    className="accent-[var(--hub-button)]"
                  />
                  <span>بطاقة المفضلة السحابية</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={draft.favoritesTitle}
                    onChange={(e) => updateDraft({ favoritesTitle: e.target.value })}
                    placeholder="عنوان المفضلة"
                    className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                  />
                  <input
                    value={draft.favoritesSubtitle}
                    onChange={(e) => updateDraft({ favoritesSubtitle: e.target.value })}
                    placeholder="الوصف الفرعي"
                    className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                  />
                </div>
                <input
                  value={draft.favoritesEmptyText}
                  onChange={(e) => updateDraft({ favoritesEmptyText: e.target.value })}
                  placeholder="رسالة عند خلو المفضلة"
                  className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>
            </div>

            <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.showQuickSystemsSection}
                    onChange={(e) => updateDraft({ showQuickSystemsSection: e.target.checked })}
                    className="accent-[var(--hub-button)]"
                  />
                  <span>شريط الأنظمة التشغيلية</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={draft.quickSystemsTitle}
                  onChange={(e) => updateDraft({ quickSystemsTitle: e.target.value })}
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.quickSystemsAllBtnLabel}
                  onChange={(e) => updateDraft({ quickSystemsAllBtnLabel: e.target.value })}
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--hub-border)]">
                <div className="space-y-1.5">
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.showAlertsSection}
                      onChange={(e) => updateDraft({ showAlertsSection: e.target.checked })}
                      className="accent-[var(--hub-button)]"
                    />
                    <span>قسم التنبيهات والمواقف</span>
                  </label>
                  <input
                    value={draft.alertsTitle}
                    onChange={(e) => updateDraft({ alertsTitle: e.target.value })}
                    className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.showUpdatesSection}
                      onChange={(e) => updateDraft({ showUpdatesSection: e.target.checked })}
                      className="accent-[var(--hub-button)]"
                    />
                    <span>قسم أحدث التعديلات</span>
                  </label>
                  <input
                    value={draft.updatesTitle}
                    onChange={(e) => updateDraft({ updatesTitle: e.target.value })}
                    className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--hub-border)] space-y-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.showPhrasesSection}
                    onChange={(e) => updateDraft({ showPhrasesSection: e.target.checked })}
                    className="accent-[var(--hub-button)]"
                  />
                  <span>قسم العبارات السريعة المعتمدة</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={draft.phrasesTitle}
                    onChange={(e) => updateDraft({ phrasesTitle: e.target.value })}
                    className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                  />
                  <input
                    value={draft.phrasesAllBtnLabel}
                    onChange={(e) => updateDraft({ phrasesAllBtnLabel: e.target.value })}
                    className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                  />
                </div>
              </div>
            </div>

            {/* Smart Assistant */}
            <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showAssistantSection}
                  onChange={(e) => updateDraft({ showAssistantSection: e.target.checked })}
                  className="accent-[var(--hub-button)]"
                />
                <span>بطاقة مساعد خدمة العملاء</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={draft.assistantTitle}
                  onChange={(e) => updateDraft({ assistantTitle: e.target.value })}
                  placeholder="العنوان"
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.assistantBtnLabel}
                  onChange={(e) => updateDraft({ assistantBtnLabel: e.target.value })}
                  placeholder="نص الزر"
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>
              <input
                value={draft.assistantSubtitle}
                onChange={(e) => updateDraft({ assistantSubtitle: e.target.value })}
                placeholder="الوصف الفرعي"
                className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
              />
              <input
                value={draft.assistantPlaceholder}
                onChange={(e) => updateDraft({ assistantPlaceholder: e.target.value })}
                placeholder="النص التوضيحي داخل مربع الإدخال"
                className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
              />
            </div>

            {/* Reply Checker */}
            <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showReplyCheckerSection}
                  onChange={(e) => updateDraft({ showReplyCheckerSection: e.target.checked })}
                  className="accent-[var(--hub-button)]"
                />
                <span>بطاقة مدقق الردود</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={draft.replyCheckerTitle}
                  onChange={(e) => updateDraft({ replyCheckerTitle: e.target.value })}
                  placeholder="العنوان"
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={draft.replyCheckerBtnLabel}
                  onChange={(e) => updateDraft({ replyCheckerBtnLabel: e.target.value })}
                  placeholder="نص الزر"
                  className="rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
                />
              </div>
              <input
                value={draft.replyCheckerSubtitle}
                onChange={(e) => updateDraft({ replyCheckerSubtitle: e.target.value })}
                placeholder="الوصف الفرعي"
                className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
              />
              <input
                value={draft.replyCheckerPlaceholder}
                onChange={(e) => updateDraft({ replyCheckerPlaceholder: e.target.value })}
                placeholder="النص التوضيحي داخل مربع الإدخال"
                className="w-full rounded-md border border-[var(--hub-border)] bg-[var(--hub-surface)] px-2.5 py-1.5 text-xs text-[var(--hub-text)]"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Custom Links on Dashboard & Enabled Sections */}
      {activeTab === 'custom_links' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showCustomLinksSection}
                  onChange={(e) => updateDraft({ showCustomLinksSection: e.target.checked })}
                  className="accent-[var(--hub-button)]"
                />
                <span>تفعيل قسم الروابط المخصصة في الصفحة الرئيسية</span>
              </label>

              <input
                value={draft.customLinksTitle}
                onChange={(e) => updateDraft({ customLinksTitle: e.target.value })}
                placeholder="عنوان قسم الروابط المخصصة"
                className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] px-3 py-1.5 text-xs text-[var(--hub-text)] w-64"
              />
            </div>

            <div className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 space-y-3">
              <div className="text-xs font-semibold text-[var(--hub-heading)]">
                إضافة رابط سريع جديد للصفحة الرئيسية:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <input
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  placeholder="اسم الرابط (مثال: لوحة الطلبات)"
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
                <input
                  dir="ltr"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
                <input
                  value={newLinkNote}
                  onChange={(e) => setNewLinkNote(e.target.value)}
                  placeholder="ملاحظة قصيرة (اختياري)"
                  className="rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs text-[var(--hub-text)]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomLink}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--hub-button)] px-3 py-2 text-xs font-semibold text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة رابط</span>
                </button>
              </div>

              {(draft.homeCustomLinks || []).length > 0 && (
                <div className="space-y-2 pt-2">
                  {draft.homeCustomLinks.map((lnk) => (
                    <div
                      key={lnk.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-[var(--hub-heading)]">{lnk.label}</span>
                        {lnk.note && <span className="text-[var(--hub-muted)] mx-1.5">· {lnk.note}</span>}
                        <span className="font-mono-tabular text-[11px] text-[var(--hub-accent)] block sm:inline" dir="ltr">
                          {lnk.url}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomLink(lnk.id)}
                        className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        title="حذف الرابط"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Enabled Platform Sections */}
          <div className="space-y-2 pt-4 border-t border-[var(--hub-border)]">
            <div className="text-xs font-bold text-[var(--hub-heading)]">الأقسام التشغيلية المفعّلة في المنصة:</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {ALL_STAFF_SECTIONS.map((sec) => (
                <label key={sec} className="inline-flex items-center gap-2 text-xs text-[var(--hub-text)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledSections.includes(sec)}
                    onChange={() => toggleSection(sec)}
                    className="accent-[var(--hub-button)]"
                  />
                  <span>{SECTION_LABELS[sec]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRestoreOpen}
        title="استعادة الإعدادات الافتراضية للتصميم"
        description="سيتم إعادة جميع النصوص والعناوين والأزرار وإعدادات الغلاف والروابط المخصصة إلى الوضع الافتراضي وحفظها في Firestore لجميع المستخدمين. لن تتأثر المنتجات أو السياسات أو بيانات قاعدة المعرفة. هل تريد المتابعة؟"
        confirmLabel="نعم، استعادة الافتراضي"
        loading={restoring}
        onConfirm={handleConfirmRestoreDefaults}
        onCancel={() => setConfirmRestoreOpen(false)}
      />
    </form>
  );
}
