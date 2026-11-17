import { AlertCircle, ArrowUpLeft, Search } from 'lucide-react';
import { useHub } from '../context/HubContext';
import { CopyButton } from './CopyButton';
import type { SectionId } from '../types/hub';

interface GlobalSearchResultsProps {
  query: string;
  onClear: () => void;
  onNavigate: (section: SectionId) => void;
}

export function GlobalSearchResults({ query, onClear, onNavigate }: GlobalSearchResultsProps) {
  const { globalSearch } = useHub();
  const results = globalSearch(query);

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--hub-border)]">
        <div className="flex items-center gap-2.5">
          <Search className="w-5 h-5 text-[var(--hub-accent)]" />
          <div>
            <h2 className="text-lg font-bold text-[var(--hub-heading)]">
              نتائج البحث الشامل عن: «{query}»
            </h2>
            <p className="text-xs text-[var(--hub-muted)] tabular-nums">
              تم العثور على {results.length} نتيجة عبر المنتجات والأسعار الخليجية والمواقف والسياسات والأنظمة
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--hub-border)] bg-[var(--hub-surface)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer"
        >
          العودة للقسم الحالي
        </button>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-10 text-center space-y-2">
          <p className="text-base font-semibold text-[var(--hub-heading)]">لا توجد نتائج مطابقة</p>
          <p className="text-sm text-[var(--hub-muted)]">
            جرب البحث باسم العطر أو الدولة (السعودية، الكويت) أو رقم الموقف أو كلمة مفتاحية أخرى، أو استعن بمساعد خدمة العملاء.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {results.map((item) => (
            <article
              key={`${item.sectionId}_${item.id}`}
              className="rounded-xl border border-[var(--hub-border)] bg-[var(--hub-surface)] p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[var(--hub-muted)]">
                  <span className="font-semibold text-[var(--hub-accent)]">{item.sectionLabel}</span>
                  {item.responsibleDept && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>القسم المسؤول: {item.responsibleDept}</span>
                    </>
                  )}
                  {item.needsAdminReview && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        تحتاج مراجعة الإدارة
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <CopyButton text={item.answer} label="نسخ المحتوى" />
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(item.sectionId);
                      onClear();
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-border)] text-[var(--hub-heading)] hover:bg-[var(--hub-surface-alt)] cursor-pointer whitespace-nowrap"
                  >
                    <span>فتح القسم</span>
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="text-base font-semibold text-[var(--hub-heading)]">{item.title}</h3>

              <div className="rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)] p-3.5 text-sm text-[var(--hub-text)] whitespace-pre-line leading-relaxed">
                {item.answer}
              </div>

              {item.internalProcedure && (
                <div className="text-xs text-[var(--hub-text)] pt-1">
                  <span className="font-semibold text-[var(--hub-heading)]">الإجراء الداخلي: </span>
                  <span>{item.internalProcedure}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
