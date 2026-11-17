import { useState } from 'react';
import { Check, Eye, Moon, Palette, RotateCcw, Sparkles, Sun, X } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { BUILT_IN_THEMES, findThemeById, getContrastRatio, resolveThemeTokens } from '../lib/themes';
import { parseFriendlyFirestoreError } from '../lib/firebase';

interface PersonalThemeModalProps {
  open: boolean;
  onClose: () => void;
}

export function PersonalThemeModal({ open, onClose }: PersonalThemeModalProps) {
  const {
    activeThemeId,
    themeMode,
    branding,
    previewTheme,
    setPreviewTheme,
    updateUserPreferences,
    notify,
  } = useHub();

  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const allThemes = [...BUILT_IN_THEMES, ...(branding?.customThemes || [])];
  const perfumeThemes = allThemes.slice(0, 8);
  const luxuryThemes = allThemes.slice(8, 18);
  const customThemes = allThemes.slice(18);

  const selectedId = previewTheme?.themeId || activeThemeId;
  const selectedMode = previewTheme?.themeMode || themeMode;
  const { theme: currentTheme, tokens } = resolveThemeTokens(selectedId, selectedMode, branding?.customThemes);
  const textContrast = getContrastRatio(tokens.text, tokens.bg);
  const headingContrast = getContrastRatio(tokens.heading, tokens.surface);

  const handlePreview = (themeId: string, mode: 'light' | 'dark' = selectedMode) => {
    setPreviewTheme({ themeId, themeMode: mode });
  };

  const handleSavePersonalTheme = async () => {
    setSaving(true);
    try {
      await updateUserPreferences({
        themeId: selectedId,
        themeMode: selectedMode,
      });
      setPreviewTheme(null);
      notify(
        'success',
        `تم حفظ ثيم «${currentTheme.nameAr}» (${selectedMode === 'dark' ? 'داكن' : 'نهاري'}) في حسابك السحابي بنجاح.`
      );
      onClose();
    } catch (err) {
      notify('error', parseFriendlyFirestoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPreviewTheme(null);
    onClose();
  };

  const renderThemeGrid = (list: typeof allThemes) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.map((theme) => {
        const isSelected = selectedId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => handlePreview(theme.id)}
            className={`text-right rounded-xl border p-3.5 transition-all cursor-pointer ${
              isSelected
                ? 'border-[var(--hub-heading)] bg-[var(--hub-surface-alt)] ring-2 ring-[var(--hub-accent-soft)]/50'
                : 'border-[var(--hub-border)] bg-[var(--hub-surface)] hover:border-[var(--hub-accent-soft)]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--hub-heading)] truncate">{theme.nameAr}</div>
                <div className="text-[11px] text-[var(--hub-muted)] truncate mt-0.5">{theme.perfumeSource}</div>
              </div>
              {isSelected && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--hub-button)] text-[var(--hub-button-text)] px-2 py-0.5 text-[11px] font-bold shrink-0">
                  <Check className="w-3 h-3" />
                  مختار
                </span>
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              {theme.swatchHexes.slice(0, 6).map((hex, i) => (
                <span
                  key={`${theme.id}_sw_${i}`}
                  className="w-5 h-5 rounded-md border border-black/15 shrink-0"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );

  const savedTheme = findThemeById(activeThemeId, branding?.customThemes);

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--hub-border)] bg-[var(--hub-surface)] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[var(--hub-border)] bg-[var(--hub-surface-alt)]/75 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Palette className="w-5 h-5 text-[var(--hub-accent)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--hub-heading)] truncate">
                المظهر الشخصي والثيمات (18 ثيماً فاخراً)
              </h2>
              <p className="text-xs text-[var(--hub-muted)] truncate">
                معاينة فورية وحفظ خاص بحسابك السحابي — الثيم المحفوظ حالياً: {savedTheme.nameAr}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg border border-[var(--hub-border)] text-[var(--hub-muted)] hover:text-[var(--hub-heading)] cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Live Preview & Mode Switch */}
          <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--hub-heading)]">
                <Eye className="w-4 h-4 text-[var(--hub-accent)]" />
                <span>المعاينة الحالية: {currentTheme.nameAr}</span>
                {previewTheme && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 text-[11px]">
                    معاينة غير محفوظة
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--hub-muted)] font-mono-tabular">
                تباين القراءة: النص الأساسي {textContrast.toFixed(1)}:1 · العناوين {headingContrast.toFixed(1)}:1
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePreview(selectedId, 'light')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                  selectedMode === 'light'
                    ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                    : 'bg-[var(--hub-surface)] text-[var(--hub-heading)] border-[var(--hub-border)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                وضع نهاري
              </button>
              <button
                type="button"
                onClick={() => handlePreview(selectedId, 'dark')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                  selectedMode === 'dark'
                    ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] border-[var(--hub-button)]'
                    : 'bg-[var(--hub-surface)] text-[var(--hub-heading)] border-[var(--hub-border)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                وضع داكن
              </button>
            </div>
          </div>

          {/* Group 1: 8 Perfume Themes */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--hub-heading)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
              ثيمات عطور مشاعر المستوحاة (8)
            </h3>
            {renderThemeGrid(perfumeThemes)}
          </div>

          {/* Group 2: 10 Luxury Signature Themes */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-[var(--hub-heading)]">
              ثيمات الفخامة الكلاسيكية والعصرية (10)
            </h3>
            {renderThemeGrid(luxuryThemes)}
          </div>

          {/* Group 3: Custom Themes (if any) */}
          {customThemes.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-[var(--hub-heading)]">
                الثيمات المخصصة ({customThemes.length})
              </h3>
              {renderThemeGrid(customThemes)}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--hub-border)] bg-[var(--hub-surface-alt)]/60 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPreviewTheme(null)}
            disabled={!previewTheme || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--hub-heading)] disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            تراجع للمحفوظ
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-[var(--hub-border)] px-4 py-2 text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-heading)] cursor-pointer"
            >
              إغلاق
            </button>
            <button
              type="button"
              onClick={handleSavePersonalTheme}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] px-5 py-2 text-xs font-bold disabled:opacity-60 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              {saving ? 'جارٍ الحفظ...' : 'حفظ مظهري الشخصي في السحابة'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
