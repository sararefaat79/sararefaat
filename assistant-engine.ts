import { GCC_COUNTRIES } from './auth-constants';
import type {
  CannedResponse,
  CountryCode,
  CustomerInquiry,
  Policy,
  Product,
  QuickPhrase,
  ReturnWorkflowStage,
  Situation,
  SystemLink,
} from '../types/hub';

export type AssistantFormality = 'kuwaiti_natural' | 'formal' | 'concise';

export interface AssistantSuggestion {
  detectedTopic: string;
  needsAdminReview: boolean;
  matchedSourceLabel: string;
  suggestedKuwaitiReply: string;
  internalProcedure?: string;
  escalationDept?: string;
  clarifyingQuestions: string[];
  warnings: string[];
}

export interface ReplyAuditResult {
  scoreLabel: 'ممتاز' | 'يحتاج تحسين بسيط' | 'يحتاج مراجعة';
  toneFindings: string[];
  policyWarnings: string[];
  improvedKuwaitiReply: string;
}

const TOPIC_RULES: Array<{ topic: string; keywords: string[] }> = [
  {
    topic: 'الضمان الذهبي والاسترجاع',
    keywords: [
      'ضمان', 'ذهبي', 'استرجاع', 'ارجاع', 'مرتجع', 'استبدال', 'ابدل', 'ارجع',
      'مفتوح', 'تالف', 'مكسور', 'خطأ', 'أرامكس', 'return', 'exchange', 'refund', 'بدي ارجع', 'ابي ارجع',
    ],
  },
  {
    topic: 'الأسعار وضريبة السعودية',
    keywords: ['سعر', 'اسعار', 'بكم', 'جم', 'كم سعر', 'ضريبة', 'السعودية', '503', '437', '35 دينار', 'كم ريال', 'كم درهم', 'price', 'vat'],
  },
  {
    topic: 'الشحن والتوصيل',
    keywords: ['شحن', 'توصيل', 'تأخر', 'تاخر', 'مندوب', 'وين طلبي', 'شركة الشحن', 'تتبع', 'shipping', 'delivery', 'track', 'ما وصل'],
  },
  {
    topic: 'الدفع والتقسيط',
    keywords: ['دفع', 'تابي', 'تمارا', 'كي نت', 'ابل باي', 'فيزا', 'ماستر', 'عند الاستلام', 'رابط دفع', 'tabby', 'tamara', 'apple pay', 'knet', 'payment'],
  },
  {
    topic: 'المنتجات والترشيحات والمكونات',
    keywords: [
      'عطر', 'معمول', 'سبراي', 'نوتات', 'مكونات', 'ثبات', 'فوحان', 'رشح', 'نسائي', 'رجالي', 'صيفي', 'شتوي',
      'أيكونك', 'ذا ون', 'الرئيس', 'تيفاني', 'فيرو', 'كلاود', 'مختلف', 'هيستوريك', 'فايا',
      'ليدي', 'السيادة', 'إمباير', 'شيرمان', 'نوفا', 'سيلفر', 'جولد', 'بلاك', 'داندي', 'perfume', 'sovereign', 'iconic',
    ],
  },
  { topic: 'العروض والأكواد', keywords: ['كود', 'خصم', 'عرض', 'عروض', 'تخفيض', 'كوبون', 'discount', 'code'] },
  { topic: 'الشكاوى', keywords: ['شكوى', 'سيء', 'زعلان', 'مشكلة', 'ما يرد', 'تاخير', 'complaint'] },
];

const COUNTRY_MENTIONS: Array<{ code: CountryCode; keywords: string[] }> = [
  { code: 'SA', keywords: ['سعودي', 'سعودية', 'الرياض', 'جدة', 'الدمام', 'ريال', 'ضريبة'] },
  { code: 'KW', keywords: ['كويت', 'كويتي', 'دينار'] },
  { code: 'AE', keywords: ['إمارات', 'امارات', 'دبي', 'أبوظبي', 'ابوظبي', 'درهم'] },
  { code: 'QA', keywords: ['قطر', 'الدوحة', 'قطري'] },
  { code: 'BH', keywords: ['بحرين', 'المنامة', 'بحريني'] },
  { code: 'OM', keywords: ['عمان', 'مسقط', 'عماني'] },
];

const SYNONYM_MAP: Record<string, string[]> = {
  سعر: ['جم', 'بكم', 'تكلفة', 'فلوس', 'مبلغ'],
  استرجاع: ['ارجع', 'رد', 'مرتجع', 'ترجيع'],
  استبدال: ['ابدل', 'تبديل', 'تغيير'],
  توصيل: ['شحن', 'مندوب', 'طرد', 'شحنه'],
  تاخير: ['تأخر', 'بطء', 'متى يوصل', 'ما وصل', 'وين طلبي'],
  تالف: ['مكسور', 'خربان', 'تسريب', 'ناقص'],
  ترشيح: ['رشح', 'اقترح', 'ذوق', 'مناسب'],
};

export function normalizeArabicSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

const GENERIC_TOKENS = new Set(['عطر', 'سعر', 'كم', 'بكم', 'في', 'من', 'على', 'الي', 'عن', 'شنو', 'السعوديه', 'الكويت', 'الامارات', 'قطر', 'البحرين', 'عمان']);

export function tokenizeArabicWithSynonyms(text: string): string[] {
  const base = normalizeArabicSearch(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const expanded = new Set<string>(base);
  for (const tok of base) {
    const candidates = [tok];
    if (tok.startsWith('وال') && tok.length > 4) candidates.push(tok.slice(3));
    else if (tok.startsWith('ال') && tok.length > 3) candidates.push(tok.slice(2));
    else if (tok.startsWith('و') && tok.length > 3) candidates.push(tok.slice(1));

    for (const c of candidates) {
      expanded.add(c);
      for (const [canon, alts] of Object.entries(SYNONYM_MAP)) {
        if (c === canon || alts.some((a) => normalizeArabicSearch(a) === c)) {
          expanded.add(canon);
          alts.forEach((a) => expanded.add(normalizeArabicSearch(a)));
        }
      }
    }
  }
  return Array.from(expanded);
}

function overlapScore(queryTokens: string[], targetText: string): number {
  const targetNorm = normalizeArabicSearch(targetText);
  let score = 0;
  for (const token of queryTokens) {
    if (targetNorm.includes(token)) {
      score += GENERIC_TOKENS.has(token) ? 0.5 : 1.5;
    }
  }
  return score;
}

function formatProductPricesSummary(p: Product, preferredCountry?: CountryCode): string {
  if (!p.countryPrices) return '';
  if (preferredCountry && p.countryPrices[preferredCountry]) {
    const entry = p.countryPrices[preferredCountry]!;
    if (entry.price !== null) {
      return `سعره في ${entry.countryNameAr}: ${entry.price} ${entry.currency}`;
    }
    return `السعر غير متاح حاليًا لـ ${entry.countryNameAr}`;
  }
  const parts = GCC_COUNTRIES.map((c) => {
    const e = p.countryPrices?.[c.code];
    if (!e || e.price === null) return null;
    return `${c.nameAr}: ${e.price} ${e.currency}`;
  }).filter(Boolean);
  return parts.length > 0 ? `الأسعار الخليجية المعتمدة (${parts.join(' | ')})` : '';
}

/**
 * Refines tone/formality without changing ANY numbers, prices, days, or policy meaning.
 */
export function refineReplyFormality(rawReply: string, formality: AssistantFormality): string {
  const clean = rawReply.trim();
  if (!clean || clean === 'تحتاج مراجعة الإدارة') return clean;

  if (formality === 'formal') {
    return clean
      .replace(/يا هلا وغلا أستاذي\/أختي،?/g, 'أهلاً بك عميلنا العزيز،')
      .replace(/يا هلا أستاذي\/أختي،?/g, 'أهلاً بك عميلنا العزيز،')
      .replace(/حاضرين أستاذي\/أختي،?/g, 'بكل سرور،')
      .replace(/أبشر أستاذي\/أختي،?/g, 'نؤكد لك بكل سرور،')
      .replace(/العذر والسموحة منك أستاذي\/أختي/g, 'نعتذر لك عن هذا الموقف')
      .replace(/حاضرين لك بأي وقت\.?/g, 'يسعدنا خدمتك في أي وقت.')
      .replace(/حاضرين لأي استفسار ثاني\.?/g, 'ويسعدنا الرد على أي استفسار آخر.');
  }

  if (formality === 'concise') {
    const lines = clean
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const body = lines
      .map((l) =>
        l
          .replace(/^(يا هلا وغلا أستاذي\/أختي،?\s*|يا هلا أستاذي\/أختي،?\s*|حياك الله أستاذي\/أختي،?\s*)/, '')
          .replace(/\s*وحاضرين لأي استفسار ثاني\.?$/, '')
          .replace(/\s*وبإمكانك الطلب مباشرة عبر موقعنا mashaer\.store،?/, '')
      )
      .filter(Boolean);
    return `حاضرين أستاذي/أختي:\n${body.join('\n')}`;
  }

  return clean;
}

function buildClarifyingQuestions(cleanMsg: string, detectedTopic: string, mentionedCountry?: CountryCode): string[] {
  const questions: string[] = [];
  const lower = cleanMsg.toLowerCase();
  const hasOrderNum = /\d{4,}/.test(cleanMsg) || lower.includes('رقم الطلب');

  if (detectedTopic.includes('الأسعار') && !mentionedCountry) {
    questions.push('أي دولة خليجية يقيم فيها العميل لتحديد السعر الرسمي بعملة الدولة؟');
  }
  if (
    (detectedTopic.includes('الشحن') || detectedTopic.includes('الاسترجاع') || detectedTopic.includes('الشكاوى')) &&
    !hasOrderNum
  ) {
    questions.push('ما هو رقم الطلب أو رقم الجوال المسجل للتحقق في نظام الطلبات؟');
  }
  if (detectedTopic.includes('الاسترجاع') && !lower.includes('مفتوح') && !lower.includes('بوكس')) {
    questions.push('هل العبوة غير مفتوحة (خلال ١٤ يوماً) أم مفتوحة للتجربة الخفيفة ضمن الضمان الذهبي (شهر)؟');
  }
  if (detectedTopic.includes('المنتجات') && (lower.includes('رشح') || lower.includes('اقترح'))) {
    questions.push('هل يفضل العميل عطور ناعمة يومية أم رسمية وفواحة للمناسبات؟');
  }
  return questions;
}

export function generateGroundedReplySuggestion(
  customerMessage: string,
  kb: {
    inquiries: CustomerInquiry[];
    responses: CannedResponse[];
    policies: Policy[];
    situations: Situation[];
    returns: ReturnWorkflowStage[];
    products: Product[];
    phrases: QuickPhrase[];
    systemLinks?: SystemLink[];
  },
  formality: AssistantFormality = 'kuwaiti_natural'
): AssistantSuggestion {
  const cleanMsg = customerMessage.trim();
  const lowerMsg = cleanMsg.toLowerCase();
  const tokens = tokenizeArabicWithSynonyms(cleanMsg);
  const specificTokens = tokens.filter((t) => !GENERIC_TOKENS.has(t));

  let detectedTopic = 'استفسار عام';
  for (const rule of TOPIC_RULES) {
    if (rule.keywords.some((kw) => lowerMsg.includes(kw))) {
      detectedTopic = rule.topic;
      break;
    }
  }

  const mentionedCountry = COUNTRY_MENTIONS.find((cm) => cm.keywords.some((kw) => lowerMsg.includes(kw)))?.code;
  const asksAboutPrice = ['سعر', 'كم', 'بكم', 'جم', 'ضريبة', 'ريال', 'دينار', 'درهم', 'price'].some((k) =>
    lowerMsg.includes(k)
  );
  const clarifyingQuestions = buildClarifyingQuestions(cleanMsg, detectedTopic, mentionedCountry);

  let bestSituation: { item: Situation; score: number } | null = null;
  for (const s of kb.situations) {
    const score = overlapScore(tokens, `${s.category} ${s.subCategory || ''} ${s.customerInquiry} ${s.cannedReply}`);
    if (!bestSituation || score > bestSituation.score) bestSituation = { item: s, score };
  }

  let bestInquiry: { item: CustomerInquiry; score: number } | null = null;
  for (const inq of kb.inquiries) {
    const score = overlapScore(tokens, `${inq.category} ${inq.question} ${inq.answer}`);
    if (!bestInquiry || score > bestInquiry.score) bestInquiry = { item: inq, score };
  }

  let bestProduct: { item: Product; score: number } | null = null;
  for (const p of kb.products) {
    const nameBoost = overlapScore(specificTokens, `${p.nameAr} ${p.nameEn || ''} ${p.sku || ''}`) * 4;
    const score =
      nameBoost +
      overlapScore(
        tokens,
        `${p.nameAr} ${p.nameEn || ''} ${p.sku || ''} ${p.officialDescription} ${p.fragranceCharacter || ''} ${p.occasionUsage || ''} ${p.notesAndIngredients || ''} ${p.topNotes || ''} ${p.heartNotes || ''} ${p.baseNotes || ''}`
      );
    if (!bestProduct || score > bestProduct.score) bestProduct = { item: p, score };
  }

  let bestPolicy: { item: Policy; score: number } | null = null;
  for (const pol of kb.policies) {
    const score = overlapScore(
      tokens,
      `${pol.category} ${pol.title} ${pol.applicableCases || ''} ${pol.content} ${pol.suggestedReply || ''}`
    );
    if (!bestPolicy || score > bestPolicy.score) bestPolicy = { item: pol, score };
  }

  let bestResponse: { item: CannedResponse; score: number } | null = null;
  for (const r of kb.responses) {
    const score = overlapScore(tokens, `${r.category} ${r.title} ${r.content}`);
    if (!bestResponse || score > bestResponse.score) bestResponse = { item: r, score };
  }

  const warnings: string[] = [];

  if (bestProduct && bestProduct.score >= 2 && (asksAboutPrice || lowerMsg.includes('نوتات') || lowerMsg.includes('مكونات'))) {
    const p = bestProduct.item;
    const notesText = p.notesAndIngredients ? ` ومكوناته: (${p.notesAndIngredients}).` : '.';
    const priceSummary = formatProductPricesSummary(p, mentionedCountry);
    const vatNote = mentionedCountry === 'SA' ? ' (السعر شامل ضريبة القيمة المضافة 15% في السعودية).' : '';
    const rawReply = `يا هلا أستاذي/أختي، بخصوص ${p.nameAr}: ${p.officialDescription}${notesText}${priceSummary ? `\n${priceSummary}${vatNote}` : ''}\nالحجم: ${p.size || '200 مل'} | التوفر: ${p.availability || 'متوفر'}. وحاضرين لأي استفسار ثاني.`;
    return {
      detectedTopic: 'دليل المنتجات والأسعار الخليجية',
      needsAdminReview: p.reviewStatus === 'needs_review',
      matchedSourceLabel: `دليل المنتجات — ${p.nameAr}${p.sku ? ` (${p.sku})` : ''}`,
      suggestedKuwaitiReply: refineReplyFormality(rawReply, formality),
      internalProcedure: p.internalNotes,
      clarifyingQuestions,
      warnings,
    };
  }

  if (bestSituation && bestSituation.score >= 2) {
    if (bestSituation.item.needsAdminReview) {
      warnings.push('تحتاج مراجعة الإدارة قبل اعتماد هذا الموقف.');
    }
    return {
      detectedTopic,
      needsAdminReview: Boolean(bestSituation.item.needsAdminReview),
      matchedSourceLabel: `دليل المواقف — موقف #${bestSituation.item.situationNumber}`,
      suggestedKuwaitiReply: refineReplyFormality(bestSituation.item.cannedReply, formality),
      internalProcedure: bestSituation.item.internalProcedure,
      escalationDept: bestSituation.item.responsibleDept,
      clarifyingQuestions,
      warnings,
    };
  }

  if (bestInquiry && bestInquiry.score >= 2) {
    if (bestInquiry.item.needsAdminReview) {
      warnings.push('تحتاج مراجعة الإدارة: الإجابة المرجعية تحمل علامة مراجعة.');
    }
    const base =
      bestInquiry.item.answer.startsWith('يا هلا') ||
      bestInquiry.item.answer.startsWith('حاضرين') ||
      bestInquiry.item.answer.startsWith('أبشر')
        ? bestInquiry.item.answer
        : `يا هلا أستاذي/أختي، ${bestInquiry.item.answer}`;
    return {
      detectedTopic,
      needsAdminReview: bestInquiry.item.needsAdminReview,
      matchedSourceLabel: `استفسارات العملاء — ${bestInquiry.item.category}`,
      suggestedKuwaitiReply: refineReplyFormality(base, formality),
      clarifyingQuestions,
      warnings,
    };
  }

  if (bestProduct && bestProduct.score >= 2) {
    const p = bestProduct.item;
    const notesText = p.notesAndIngredients ? ` ومكوناته: (${p.notesAndIngredients}).` : '.';
    const priceSummary = formatProductPricesSummary(p, mentionedCountry);
    const base = `يا هلا أستاذي/أختي، بخصوص ${p.nameAr}: ${p.officialDescription}${notesText}${priceSummary ? `\n${priceSummary}` : ''} وبإمكانك الطلب مباشرة عبر موقعنا mashaer.store، وحاضرين لأي استفسار ثاني.`;
    return {
      detectedTopic: 'المنتجات والترشيحات',
      needsAdminReview: p.reviewStatus === 'needs_review',
      matchedSourceLabel: `دليل المنتجات — ${p.nameAr}`,
      suggestedKuwaitiReply: refineReplyFormality(base, formality),
      internalProcedure: p.internalNotes,
      clarifyingQuestions,
      warnings,
    };
  }

  if (bestPolicy && bestPolicy.score >= 2) {
    if (bestPolicy.item.needsAdminReview && !bestPolicy.item.suggestedReply) {
      return {
        detectedTopic,
        needsAdminReview: true,
        matchedSourceLabel: `السياسات — ${bestPolicy.item.title}`,
        suggestedKuwaitiReply: 'تحتاج مراجعة الإدارة',
        internalProcedure: bestPolicy.item.requiredAction,
        escalationDept: bestPolicy.item.escalationDept,
        clarifyingQuestions,
        warnings: ['السياسة المطابقة تحمل علامة «تحتاج مراجعة الإدارة».'],
      };
    }
    const base = bestPolicy.item.suggestedReply || `حاضرين أستاذي/أختي، ${bestPolicy.item.content}`;
    return {
      detectedTopic,
      needsAdminReview: bestPolicy.item.needsAdminReview,
      matchedSourceLabel: `السياسات — ${bestPolicy.item.title}`,
      suggestedKuwaitiReply: refineReplyFormality(base, formality),
      internalProcedure: bestPolicy.item.requiredAction,
      escalationDept: bestPolicy.item.escalationDept,
      clarifyingQuestions,
      warnings: bestPolicy.item.conflictNote ? [bestPolicy.item.conflictNote] : warnings,
    };
  }

  if (bestResponse && bestResponse.score >= 2) {
    return {
      detectedTopic,
      needsAdminReview: false,
      matchedSourceLabel: `مكتبة الردود الجاهزة — ${bestResponse.item.title}`,
      suggestedKuwaitiReply: refineReplyFormality(bestResponse.item.content, formality),
      clarifyingQuestions,
      warnings,
    };
  }

  return {
    detectedTopic,
    needsAdminReview: true,
    matchedSourceLabel: 'لا توجد إجابة معتمدة مطابقة',
    suggestedKuwaitiReply: 'تحتاج مراجعة الإدارة',
    clarifyingQuestions,
    warnings: ['لم يُعثر على نص معتمد يطابق استفسار العميل بدقة. يُرجى مراجعة الإدارة وعدم إرسال وعود أو معلومات غير موثقة.'],
  };
}

export function auditEmployeeDraftReply(draft: string): ReplyAuditResult {
  const clean = draft.trim();
  const toneFindings: string[] = [];
  const policyWarnings: string[] = [];

  const blamePhrases = [
    'غلطتك',
    'أنت السبب',
    'تأخرت أنت',
    'شركة الشحن هي السبب',
    'شركة الشحن أخطأت',
    'الخطأ من شركة الشحن',
    'ما لنا شغل',
    'مشكلتك',
    'غير ممكن نهائياً',
  ];
  for (const bp of blamePhrases) {
    if (clean.includes(bp)) {
      toneFindings.push(`يحتوي الرد على عبارة لوم أو أسلوب حاد ("${bp}"). يُمنع لوم العميل أو شركة الشحن.`);
    }
  }

  const promisePhrases = [
    'تعويض',
    'هدية مجانية',
    'خصم خاص',
    'نرجع لك فلوسك اليوم',
    'أضمن لك خلال ساعة',
    'مجاني بدون شروط',
    'كود خصم',
  ];
  for (const pp of promisePhrases) {
    if (clean.includes(pp)) {
      policyWarnings.push(`تم رصد وعد أو تعويض قد يكون غير معتمد ("${pp}"). تأكد من موافقة الإدارة والسياسة المعتمدة.`);
    }
  }

  if (/\d+\s*(دينار|د\.ك|ريال|درهم|%)/.test(clean)) {
    policyWarnings.push('يتضمن الرد مبالغ أو نسب مئوية؛ تأكد من مطابقتها تماماً للأسعار الخليجية أو ضريبة الـ 15% بالسعودية على mashaer.store.');
  }

  const hasKuwaitiGreeting = ['أستاذي', 'أختي', 'حاضرين', 'أبشر', 'يا هلا', 'العذر والسموحة'].some((k) => clean.includes(k));
  if (!hasKuwaitiGreeting) {
    toneFindings.push('يُفضل استخدام تحية ولطافة اللهجة الكويتية الطبيعية مثل: «أستاذي/أختي»، «حاضرين»، أو «العذر والسموحة».');
  }

  let improved = clean;
  improved = improved
    .replace(/شركة الشحن هي السبب|شركة الشحن أخطأت|الخطأ من شركة الشحن/g, 'العذر والسموحة منك على التأخير وقاعدين نتابع الشحنة مباشرة')
    .replace(/غلطتك|مشكلتك|ما لنا شغل/g, 'ولا يهمك، بنشيك لك الموضوع الحين');

  if (!hasKuwaitiGreeting && improved.length > 0) {
    improved = `يا هلا أستاذي/أختي، ${improved} وحاضرين لك بأي وقت.`;
  }

  let scoreLabel: ReplyAuditResult['scoreLabel'] = 'ممتاز';
  if (policyWarnings.length > 0 || toneFindings.some((f) => f.includes('لوم'))) {
    scoreLabel = 'يحتاج مراجعة';
  } else if (toneFindings.length > 0) {
    scoreLabel = 'يحتاج تحسين بسيط';
  }

  return {
    scoreLabel,
    toneFindings,
    policyWarnings,
    improvedKuwaitiReply: improved,
  };
}
