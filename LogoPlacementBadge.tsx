import type { LogoSlotAlign, LogoSlotConfig, LogoSlotDisplayStyle, LogoSlotSize } from '../types/hub';

interface LogoPlacementBadgeProps {
  slot: LogoSlotConfig;
  alt?: string;
  compact?: boolean;
  tone?: 'surface' | 'on-dark';
  className?: string;
}

const FALLBACK_SIZE_PX: Record<LogoSlotSize, number> = {
  sm: 36,
  md: 44,
  lg: 60,
  xl: 88,
};

const STYLE_CLASSES: Record<LogoSlotDisplayStyle, { surface: string; dark: string }> = {
  rounded: {
    surface: 'rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)]',
    dark: 'rounded-xl border border-[var(--hub-sidebar-accent)]/40 bg-white/10',
  },
  square: {
    surface: 'rounded-none border border-[var(--hub-border)] bg-[var(--hub-surface)]',
    dark: 'rounded-none border border-[var(--hub-sidebar-accent)]/40 bg-white/10',
  },
  circle: {
    surface: 'rounded-full border border-[var(--hub-border)] bg-[var(--hub-surface)]',
    dark: 'rounded-full border border-[var(--hub-sidebar-accent)]/40 bg-white/10',
  },
  framed: {
    surface:
      'rounded-xl border-2 border-[var(--hub-accent-soft)] bg-[var(--hub-surface)] p-1 shadow-sm',
    dark: 'rounded-xl border-2 border-[var(--hub-sidebar-accent)]/70 bg-white/10 p-1 shadow-sm',
  },
  clean: {
    surface: 'rounded-md bg-transparent',
    dark: 'rounded-md bg-transparent',
  },
};

const ALIGN_WRAPPER: Record<LogoSlotAlign, string> = {
  right: 'justify-start',
  center: 'justify-center',
  left: 'justify-end',
};

export function LogoPlacementBadge({
  slot,
  alt = 'شعار مشاعر',
  compact = false,
  tone = 'surface',
  className = '',
}: LogoPlacementBadgeProps) {
  if (!slot.enabled || !slot.imageUrl?.trim()) {
    return null;
  }

  const fallbackPx = FALLBACK_SIZE_PX[slot.size || 'md'] || 44;
  let width = typeof slot.widthPx === 'number' && slot.widthPx > 0 ? slot.widthPx : fallbackPx;
  let height = typeof slot.heightPx === 'number' && slot.heightPx > 0 ? slot.heightPx : fallbackPx;

  // In compact header/sidebar contexts, prevent excessive overflow while preserving exact aspect ratio
  if (compact) {
    const maxCompactH = 64;
    const maxCompactW = 190;
    const ratio = Math.min(1, maxCompactH / height, maxCompactW / width);
    width = Math.max(20, Math.round(width * ratio));
    height = Math.max(20, Math.round(height * ratio));
  }

  const fitClass =
    slot.fitMode === 'cover'
      ? 'object-cover'
      : slot.fitMode === 'contain' || slot.displayStyle === 'clean'
        ? 'object-contain'
        : 'object-contain';

  const styleCls =
    tone === 'on-dark'
      ? STYLE_CLASSES[slot.displayStyle || 'rounded'].dark
      : STYLE_CLASSES[slot.displayStyle || 'rounded'].surface;
  const alignCls = ALIGN_WRAPPER[slot.align || 'right'];

  return (
    <div className={`flex items-center gap-3 min-w-0 ${alignCls} ${className}`}>
      <img
        src={slot.imageUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: '100%',
        }}
        className={`${styleCls} ${fitClass} shrink-0 transition-[transform,opacity,width,height] duration-200`}
      />
      {slot.showLabel && slot.labelText?.trim() && (
        <span
          className={`text-sm font-bold leading-snug truncate ${
            tone === 'on-dark' ? 'text-[var(--hub-sidebar-text)]' : 'text-[var(--hub-heading)]'
          }`}
        >
          {slot.labelText}
        </span>
      )}
    </div>
  );
}
