import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useHub } from '../context/HubContext';

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: 'sm' | 'md';
  variant?: 'gold' | 'burgundy' | 'ghost';
}

export function CopyButton({
  text,
  label = 'نسخ',
  copiedLabel = 'تم النسخ',
  size = 'sm',
  variant = 'gold',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { notify } = useHub();

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify('success', 'تم النسخ إلى الحافظة.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify('error', 'تعذر النسخ تلقائياً. يُرجى النسخ يدوياً.');
    }
  };

  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const styleClass =
    variant === 'burgundy'
      ? 'bg-[var(--hub-button)] text-[var(--hub-button-text)] hover:bg-[var(--hub-button-hover)]'
      : variant === 'ghost'
        ? 'bg-[var(--hub-bg)] text-[var(--hub-heading)] border border-[var(--hub-border)] hover:bg-[var(--hub-surface-alt)]'
        : 'bg-[var(--hub-surface-alt)] text-[var(--hub-heading)] border border-[var(--hub-accent-soft)]/50 hover:border-[var(--hub-accent-soft)]';

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${sizeClass} ${styleClass}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
