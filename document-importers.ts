import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { tryLogAuditEventNonBlocking } from './audit';
import { isSensitiveAdminEmail, WORD_INQUIRY_CATEGORIES } from './auth-constants';
import { clampString, FIELD_LIMITS, hashString, makeSafeDocId } from './validation';
import type {
  CustomerInquiry,
  EmployeeAlert,
  QuickPhrase,
  ReturnWorkflowStage,
  Situation,
} from '../types/hub';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ParsedWordInquiry {
  question: string;
  answer: string;
  category: string;
  notes?: string;
  needsAdminReview: boolean;
  sourceOrder: number;
  isDuplicate: boolean;
}

export interface ParsedFourSheetsResult {
  situations: Array<Omit<Situation, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> & { isDuplicate: boolean }>;
  returnStages: Array<Omit<ReturnWorkflowStage, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> & { isDuplicate: boolean }>;
  quickPhrases: Array<Omit<QuickPhrase, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> & { isDuplicate: boolean }>;
  employeeAlerts: Array<Omit<EmployeeAlert, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> & { isDuplicate: boolean }>;
  rawNotes: string[];
}

function matchWordCategory(headingText: string): string | null {
  const clean = headingText.replace(/[:\-–—•\d.()]/g, ' ').trim();
  if (!clean) return null;
  for (const cat of WORD_INQUIRY_CATEGORIES) {
    if (clean.includes(cat) || cat.includes(clean)) {
      return cat;
    }
  }
  if (clean.includes('عامة') || clean.includes('أسئلة عامة')) return 'أسئلة عامة عن العطور';
  if (clean.includes('مكونات') || clean.includes('نوتات')) return 'مكونات العطور';
  if (clean.includes('ترشيح') && clean.includes('جدول')) return 'جدول الترشيح السريع';
  if (clean.includes('ترشيح') || clean.includes('ذوق')) return 'ترشيحات حسب الذوق والاستخدام';
  if (clean.includes('مقارن')) return 'مقارنة العطور';
  if (clean.includes('ثبات') || clean.includes('فوحان')) return 'الثبات والفوحان';
  if (clean.includes('حساسية') || clean.includes('جيوب')) return 'أسئلة الحساسية والجيوب الأنفية';
  if (clean.includes('تخزين') || clean.includes('حرارة')) return 'التخزين والحرارة';
  if (clean.includes('ضمان') || clean.includes('استبدال') || clean.includes('استرجاع')) return 'الضمان والاستبدال والاسترجاع';
  if (clean.includes('أخرى') || clean.includes('متكررة')) return 'أسئلة أخرى متكررة';
  return null;
}

function detectNeedsReview(text: string): boolean {
  const indicators = ['مراجعة', 'غير مؤكد', 'تحديث', 'رسوم', 'سعر', 'كود', 'ضمان', 'تعويض', 'مدة'];
  return indicators.some((word) => text.includes(word));
}

export async function parseWordDocxFile(
  file: File,
  existingInquiries: CustomerInquiry[]
): Promise<ParsedWordInquiry[]> {
  const arrayBuffer = await file.arrayBuffer();
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(htmlResult.value, 'text/html');

  const existingNormalized = new Set(
    existingInquiries.map((i) => i.question.trim().toLowerCase())
  );

  const parsed: ParsedWordInquiry[] = [];
  let currentCategory = WORD_INQUIRY_CATEGORIES[0];
  let currentQuestion: string | null = null;
  let answerLines: string[] = [];
  let orderCounter = 1;

  const flushCurrent = () => {
    if (currentQuestion && answerLines.length > 0) {
      const q = currentQuestion.trim();
      const a = answerLines.join('\n').trim();
      if (q && a) {
        parsed.push({
          question: q,
          answer: a,
          category: currentCategory,
          needsAdminReview: detectNeedsReview(q + ' ' + a),
          sourceOrder: orderCounter++,
          isDuplicate: existingNormalized.has(q.toLowerCase()),
        });
      }
    }
    currentQuestion = null;
    answerLines = [];
  };

  const nodes = Array.from(htmlDoc.body.children);
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim();
    if (!text) continue;

    if (tag === 'table') {
      flushCurrent();
      const rows = Array.from(el.querySelectorAll('tr'));
      const tableHeader = rows[0]?.textContent || '';
      if (tableHeader.includes('ترشيح') || currentCategory === 'جدول الترشيح السريع') {
        currentCategory = 'جدول الترشيح السريع';
      }
      for (let r = 0; r < rows.length; r++) {
        const cells = Array.from(rows[r].querySelectorAll('td,th')).map((c) => (c.textContent || '').trim());
        if (cells.length >= 2 && cells[0] && cells[1]) {
          // Skip obvious table header row
          if (r === 0 && (cells[0].includes('السؤال') || cells[0].includes('الذوق') || cells[0].includes('الحالة'))) {
            continue;
          }
          const qText = cells[0];
          const aText = cells.slice(1).join(' | ');
          parsed.push({
            question: qText,
            answer: aText,
            category: currentCategory,
            needsAdminReview: detectNeedsReview(qText + ' ' + aText),
            sourceOrder: orderCounter++,
            isDuplicate: existingNormalized.has(qText.toLowerCase()),
          });
        }
      }
      continue;
    }

    const matchedCat = matchWordCategory(text);
    if ((tag.startsWith('h') || text.length < 70) && matchedCat) {
      flushCurrent();
      currentCategory = matchedCat;
      continue;
    }

    const isQuestionLine =
      /^(س\s*\d*\s*[:：\-]?|سؤال\s*\d*\s*[:：\-]?|\d+[\.\-\)]\s*)/.test(text) ||
      text.endsWith('؟') ||
      text.endsWith('?');

    if (isQuestionLine) {
      flushCurrent();
      currentQuestion = text.replace(/^(س\s*\d*\s*[:：\-]|سؤال\s*\d*\s*[:：\-])\s*/i, '').trim();
      continue;
    }

    const cleanedAnswer = text.replace(/^(ج\s*\d*\s*[:：\-]|الإجابة\s*[:：\-]|الجواب\s*[:：\-])\s*/i, '').trim();
    if (currentQuestion) {
      answerLines.push(cleanedAnswer);
    } else if (cleanedAnswer.length > 0) {
      // If a paragraph appears without explicit question marker under a section, store it intact
      parsed.push({
        question: `${currentCategory} — فقرة ${orderCounter}`,
        answer: cleanedAnswer,
        category: currentCategory,
        needsAdminReview: true,
        sourceOrder: orderCounter++,
        isDuplicate: false,
      });
    }
  }
  flushCurrent();

  // Fallback raw text line-by-line if HTML had flat paragraphs
  if (parsed.length === 0) {
    const raw = await mammoth.extractRawText({ arrayBuffer });
    const lines = raw.value.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cat = matchWordCategory(line);
      if (cat && line.length < 70) {
        flushCurrent();
        currentCategory = cat;
        continue;
      }
      if (line.endsWith('؟') || line.endsWith('?') || /^(س|سؤال)\s*[:：\-]/.test(line)) {
        flushCurrent();
        currentQuestion = line;
      } else if (currentQuestion) {
        answerLines.push(line);
      }
    }
    flushCurrent();
  }

  return parsed;
}

export async function commitWordInquiriesToFirestore(
  items: ParsedWordInquiry[],
  skipDuplicates: boolean
): Promise<{ imported: number; flaggedDuplicates: number }> {
  const actorEmail = auth.currentUser?.email?.toLowerCase() || 'admin@mashaer.store';
  const batch = writeBatch(db);
  let imported = 0;
  let flaggedDuplicates = 0;

  for (const item of items) {
    if (item.isDuplicate && skipDuplicates) continue;
    if (item.isDuplicate) flaggedDuplicates += 1;

    const id = makeSafeDocId('word');
    batch.set(doc(db, 'customer_inquiries', id), {
      question: clampString(item.question, FIELD_LIMITS.inquiryQuestionMax),
      answer: clampString(item.answer, FIELD_LIMITS.inquiryAnswerMax),
      category: clampString(item.category, FIELD_LIMITS.categoryMax),
      notes: item.isDuplicate ? 'تم رصد تشابه مع استفسار موجود — يُرجى مراجعة الإدارة' : (item.notes || ''),
      needsAdminReview: item.needsAdminReview || item.isDuplicate,
      source: 'word_import',
      sourceOrder: item.sourceOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorEmail,
    });
    imported += 1;
  }

  if (imported > 0) {
    if (isSensitiveAdminEmail(actorEmail)) {
      batch.set(
        doc(db, 'site_settings', 'branding'),
        {
          wordImportedAt: new Date().toISOString(),
          wordImportCount: imported,
          updatedAt: serverTimestamp(),
          updatedBy: actorEmail,
        },
        { merge: true }
      );
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'customer_inquiries/word_import');
    }
    await tryLogAuditEventNonBlocking({
      section: 'استفسارات العملاء',
      itemName: 'استيراد ملف Word (.docx)',
      actionType: 'import',
      summary: `استيراد ${imported} استفساراً من ملف Word (مع رصد ${flaggedDuplicates} تكرار للمراجعة)`,
    });
  }

  return { imported, flaggedDuplicates };
}

// ---------------------------------------------------------------------------
// 4-Sheet Importer (Excel .xlsx/.xls/.csv OR PDF)
// ---------------------------------------------------------------------------
function normalizeHeader(h: unknown): string {
  return String(h ?? '').trim().replace(/\s+/g, ' ');
}

function pickCol(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const exact = keys.find((k) => normalizeHeader(k) === cand);
    if (exact && row[exact] !== undefined && String(row[exact]).trim() !== '') {
      return String(row[exact]).trim();
    }
  }
  for (const cand of candidates) {
    const partial = keys.find((k) => normalizeHeader(k).includes(cand));
    if (partial && row[partial] !== undefined && String(row[partial]).trim() !== '') {
      return String(row[partial]).trim();
    }
  }
  return '';
}

export async function parseFourSheetsFile(
  file: File,
  existing: {
    situations: Situation[];
    returnStages: ReturnWorkflowStage[];
    quickPhrases: QuickPhrase[];
    employeeAlerts: EmployeeAlert[];
  }
): Promise<ParsedFourSheetsResult> {
  const existingHashes = new Set<string>([
    ...existing.situations.map((s) => s.importHash || hashString(s.situationNumber + s.customerInquiry)),
    ...existing.returnStages.map((r) => r.importHash || hashString(r.stage + r.condition)),
    ...existing.quickPhrases.map((p) => p.importHash || hashString(p.purpose + p.phrase)),
    ...existing.employeeAlerts.map((a) => a.importHash || hashString(a.title + a.ruleText)),
  ]);

  const result: ParsedFourSheetsResult = {
    situations: [],
    returnStages: [],
    quickPhrases: [],
    employeeAlerts: [],
    rawNotes: [],
  };

  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });

    workbook.SheetNames.forEach((sheetName, sheetIndex) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const lowerName = sheetName.trim();

      const isSituations = lowerName.includes('موقف') || lowerName.includes('مواقف') || sheetIndex === 0;
      const isReturns = lowerName.includes('مرتجع') || lowerName.includes('استرجاع') || lowerName.includes('مسار') || sheetIndex === 1;
      const isPhrases = lowerName.includes('عبار') || lowerName.includes('سريع') || sheetIndex === 2;
      const isAlerts = lowerName.includes('تنبيه') || lowerName.includes('موظف') || sheetIndex === 3;

      rows.forEach((row, idx) => {
        if (isSituations && !isReturns && !isPhrases && !isAlerts) {
          const situationNumber = pickCol(row, ['رقم الموقف', 'الرقم', 'رقم', '#']) || String(idx + 1);
          const category = pickCol(row, ['التصنيف', 'القسم', 'الفئة']) || 'عام';
          const customerInquiry = pickCol(row, ['الحالة أو استفسار العميل', 'استفسار العميل', 'الحالة', 'الموقف', 'السؤال']);
          const requiredData = pickCol(row, ['البيانات المطلوبة', 'المطلوب', 'البيانات']);
          const internalProcedure = pickCol(row, ['الإجراء الداخلي', 'الإجراء', 'الخطوات']);
          const cannedReply = pickCol(row, ['الرد الجاهز للعميل', 'الرد الجاهز', 'الرد']);
          const responsibleDept = pickCol(row, ['القسم المسؤول', 'المسؤول', 'الجهة']) || 'خدمة العملاء';

          if (customerInquiry || internalProcedure || cannedReply) {
            const importHash = hashString(situationNumber + '|' + customerInquiry + '|' + cannedReply);
            result.situations.push({
              situationNumber,
              category,
              customerInquiry: customerInquiry || situationNumber,
              requiredData,
              internalProcedure: internalProcedure || 'يُرجى المراجعة مع الإدارة',
              cannedReply: cannedReply || 'تحتاج مراجعة الإدارة',
              responsibleDept,
              needsAdminReview: !cannedReply || !internalProcedure,
              duplicateFlag: existingHashes.has(importHash),
              isDuplicate: existingHashes.has(importHash),
              importHash,
              sortOrder: idx + 1,
            });
          }
        } else if (isReturns) {
          const stage = pickCol(row, ['المرحلة', 'اسم المرحلة', 'الخطوة']) || `المرحلة ${idx + 1}`;
          const condition = pickCol(row, ['الحالة', 'الشرط', 'الوصف']);
          const procedure = pickCol(row, ['الإجراء', 'الإجراء الداخلي']);
          const cannedReply = pickCol(row, ['الرد الجاهز للعميل', 'الرد الجاهز', 'الرد']);
          const employeeNote = pickCol(row, ['ملاحظة الموظف', 'ملاحظات', 'ملاحظة']);

          if (condition || procedure || cannedReply) {
            const importHash = hashString(stage + '|' + condition + '|' + procedure);
            result.returnStages.push({
              stageOrder: idx + 1,
              stage,
              condition: condition || stage,
              procedure: procedure || 'يُرجى المتابعة وفق المرحلة',
              cannedReply: cannedReply || 'تحتاج مراجعة الإدارة',
              employeeNote,
              needsAdminReview: !cannedReply,
              duplicateFlag: existingHashes.has(importHash),
              isDuplicate: existingHashes.has(importHash),
              importHash,
            });
          }
        } else if (isPhrases) {
          const purpose = pickCol(row, ['الغرض', 'الاستخدام', 'العنوان', 'المناسبة']) || `عبارة ${idx + 1}`;
          const phrase = pickCol(row, ['العبارة', 'النص', 'الرد', 'العبارة السريعة']);
          const category = pickCol(row, ['التصنيف', 'الفئة']) || 'عبارات سريعة';

          if (phrase) {
            const importHash = hashString(purpose + '|' + phrase);
            result.quickPhrases.push({
              purpose,
              phrase,
              category,
              duplicateFlag: existingHashes.has(importHash),
              isDuplicate: existingHashes.has(importHash),
              importHash,
              sortOrder: idx + 1,
            });
          }
        } else if (isAlerts) {
          const title = pickCol(row, ['العنوان', 'التنبيه', 'القاعدة', 'البند']) || `تنبيه ${idx + 1}`;
          const ruleText = pickCol(row, ['النص', 'القاعدة', 'التنبيه', 'التفاصيل', 'التوضيح']);
          const clarification = pickCol(row, ['التوضيح', 'ملاحظات', 'الشرح']);
          if (title || ruleText) {
            const importHash = hashString(title + '|' + ruleText);
            result.employeeAlerts.push({
              title,
              ruleText: ruleText || title,
              clarification,
              severity: (title + ruleText).includes('ممنوع') || (title + ruleText).includes('تحذير') ? 'warning' : 'important',
              duplicateFlag: existingHashes.has(importHash),
              isDuplicate: existingHashes.has(importHash),
              importHash,
              sortOrder: idx + 1,
            });
          }
        }
      });
    });

    return result;
  }

  // PDF Parsing via pdfjs-dist
  if (ext === 'pdf') {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const allLines: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      // Group text items by Y coordinate to reconstruct rows cleanly
      const rowsByY = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          const yKey = Math.round(item.transform[5] / 4) * 4;
          const list = rowsByY.get(yKey) || [];
          list.push({ x: item.transform[4], str: item.str.trim() });
          rowsByY.set(yKey, list);
        }
      }
      const sortedYs = Array.from(rowsByY.keys()).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const lineItems = (rowsByY.get(y) || []).sort((a, b) => b.x - a.x); // RTL order
        const line = lineItems.map((i) => i.str).join('  ').trim();
        if (line) allLines.push(line);
      }
    }

    // Partition lines into the 4 sheets based on section headers
    type SheetKey = 'situations' | 'returns' | 'phrases' | 'alerts';
    let currentSheet: SheetKey = 'situations';
    let sitCount = 1;
    let retCount = 1;
    let phrCount = 1;
    let altCount = 1;

    for (const line of allLines) {
      if (line.includes('دليل المواقف') && line.length < 60) {
        currentSheet = 'situations';
        continue;
      }
      if ((line.includes('مسار المرتجع') || line.includes('الاسترداد')) && line.length < 60) {
        currentSheet = 'returns';
        continue;
      }
      if (line.includes('عبارات سريعة') && line.length < 60) {
        currentSheet = 'phrases';
        continue;
      }
      if (line.includes('تنبيهات للموظف') && line.length < 60) {
        currentSheet = 'alerts';
        continue;
      }

      const parts = line.split(/\s{2,}|\|/).map((p) => p.trim()).filter(Boolean);
      if (currentSheet === 'situations') {
        const importHash = hashString(line);
        result.situations.push({
          situationNumber: parts.length >= 4 ? parts[0] : String(sitCount++),
          category: parts.length >= 4 ? parts[1] : 'مستورد من PDF',
          customerInquiry: parts.length >= 3 ? parts[2] : line,
          requiredData: parts.length >= 5 ? parts[3] : '',
          internalProcedure: parts.length >= 5 ? parts[4] : 'يُرجى مراجعة الصف المستورد',
          cannedReply: parts.length >= 6 ? parts[5] : line,
          responsibleDept: parts.length >= 7 ? parts[6] : 'خدمة العملاء',
          needsAdminReview: parts.length < 5,
          duplicateFlag: existingHashes.has(importHash),
          isDuplicate: existingHashes.has(importHash),
          importHash,
          sortOrder: sitCount,
        });
      } else if (currentSheet === 'returns') {
        const importHash = hashString(line);
        result.returnStages.push({
          stageOrder: retCount++,
          stage: parts[0] || `مرحلة ${retCount - 1}`,
          condition: parts[1] || line,
          procedure: parts[2] || line,
          cannedReply: parts[3] || line,
          employeeNote: parts[4] || '',
          needsAdminReview: parts.length < 3,
          duplicateFlag: existingHashes.has(importHash),
          isDuplicate: existingHashes.has(importHash),
          importHash,
        });
      } else if (currentSheet === 'phrases') {
        const importHash = hashString(line);
        result.quickPhrases.push({
          purpose: parts.length >= 2 ? parts[0] : `عبارة ${phrCount++}`,
          phrase: parts.length >= 2 ? parts.slice(1).join(' — ') : line,
          category: 'عبارات سريعة',
          duplicateFlag: existingHashes.has(importHash),
          isDuplicate: existingHashes.has(importHash),
          importHash,
          sortOrder: phrCount,
        });
      } else {
        const importHash = hashString(line);
        result.employeeAlerts.push({
          title: parts.length >= 2 ? parts[0] : `تنبيه ${altCount++}`,
          ruleText: parts.length >= 2 ? parts.slice(1).join(' — ') : line,
          clarification: '',
          severity: line.includes('ممنوع') ? 'warning' : 'important',
          duplicateFlag: existingHashes.has(importHash),
          isDuplicate: existingHashes.has(importHash),
          importHash,
          sortOrder: altCount,
        });
      }
    }

    if (allLines.length === 0) {
      result.rawNotes.push('لم يتم العثور على نص قابل للاستخراج داخل ملف PDF (قد يكون الملف ممسوحاً ضوئياً كصور). يُنصح برفع نسخة Excel (.xlsx) لنفس الأوراق الأربع.');
    }

    return result;
  }

  throw new Error('صيغة الملف غير مدعومة. يُرجى رفع ملف .pdf أو .xlsx أو .xls.');
}

export async function commitFourSheetsToFirestore(
  parsed: ParsedFourSheetsResult,
  skipExactDuplicates: boolean
): Promise<{ totalImported: number; duplicateFlagged: number }> {
  const actorEmail = auth.currentUser?.email?.toLowerCase() || 'admin@mashaer.store';
  const batch = writeBatch(db);
  let totalImported = 0;
  let duplicateFlagged = 0;

  for (const s of parsed.situations) {
    if (s.isDuplicate && skipExactDuplicates) continue;
    if (s.isDuplicate) duplicateFlagged += 1;
    const id = makeSafeDocId('sit');
    const { isDuplicate: _omit, ...rest } = s;
    batch.set(doc(db, 'situations', id), {
      ...rest,
      situationNumber: clampString(rest.situationNumber, 60),
      category: clampString(rest.category, 150),
      customerInquiry: clampString(rest.customerInquiry, 3000),
      requiredData: clampString(rest.requiredData || '', 2000),
      internalProcedure: clampString(rest.internalProcedure, FIELD_LIMITS.situationFieldMax),
      cannedReply: clampString(rest.cannedReply, FIELD_LIMITS.situationFieldMax),
      responsibleDept: clampString(rest.responsibleDept, 150),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorEmail,
    });
    totalImported += 1;
  }

  for (const r of parsed.returnStages) {
    if (r.isDuplicate && skipExactDuplicates) continue;
    if (r.isDuplicate) duplicateFlagged += 1;
    const id = makeSafeDocId('ret');
    const { isDuplicate: _omit, ...rest } = r;
    batch.set(doc(db, 'return_workflow', id), {
      ...rest,
      stage: clampString(rest.stage, 200),
      condition: clampString(rest.condition, 2000),
      procedure: clampString(rest.procedure, FIELD_LIMITS.situationFieldMax),
      cannedReply: clampString(rest.cannedReply, FIELD_LIMITS.situationFieldMax),
      employeeNote: clampString(rest.employeeNote || '', 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorEmail,
    });
    totalImported += 1;
  }

  for (const p of parsed.quickPhrases) {
    if (p.isDuplicate && skipExactDuplicates) continue;
    if (p.isDuplicate) duplicateFlagged += 1;
    const id = makeSafeDocId('phr');
    const { isDuplicate: _omit, ...rest } = p;
    batch.set(doc(db, 'quick_phrases', id), {
      ...rest,
      purpose: clampString(rest.purpose, 300),
      phrase: clampString(rest.phrase, 3000),
      category: clampString(rest.category || 'عبارات سريعة', 120),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorEmail,
    });
    totalImported += 1;
  }

  for (const a of parsed.employeeAlerts) {
    if (a.isDuplicate && skipExactDuplicates) continue;
    if (a.isDuplicate) duplicateFlagged += 1;
    const id = makeSafeDocId('alt');
    const { isDuplicate: _omit, ...rest } = a;
    batch.set(doc(db, 'employee_alerts', id), {
      ...rest,
      title: clampString(rest.title, 300),
      ruleText: clampString(rest.ruleText, 4000),
      clarification: clampString(rest.clarification || '', 3000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorEmail,
    });
    totalImported += 1;
  }

  if (totalImported > 0) {
    if (isSensitiveAdminEmail(actorEmail)) {
      batch.set(
        doc(db, 'site_settings', 'branding'),
        {
          pdfImportedAt: new Date().toISOString(),
          pdfImportCount: totalImported,
          updatedAt: serverTimestamp(),
          updatedBy: actorEmail,
        },
        { merge: true }
      );
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'four_sheets_import');
    }
    await tryLogAuditEventNonBlocking({
      section: 'دليل المواقف ومسار المرتجع',
      itemName: 'استيراد الأوراق الأربع (PDF / Excel)',
      actionType: 'import',
      summary: `استيراد ${totalImported} سجل عبر الأوراق الأربع (مع رصد ${duplicateFlagged} تكرار للمراجعة)`,
    });
  }

  return { totalImported, duplicateFlagged };
}
