import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { tryLogAuditEventNonBlocking } from './audit';
import { trackDelete, trackRead, trackWrite } from './quota-monitor';
import { clampString, FIELD_LIMITS, makeSafeDocId } from './validation';
import { emailToKey, GCC_COUNTRIES, isSensitiveAdminEmail, normalizeEmail } from './auth-constants';
import { MASHAER_STORE_CATALOG } from './attached-pdfs-data';
import { DEFAULT_UI_CONFIG, LOGO_SLOT_DIMENSION_BOUNDS, LOGO_SLOT_IDS } from './ui-defaults';
import { clampNumber, sanitizeTypographyConfig } from './fonts';
import {
  ALLOWED_PRODUCT_DOC_KEYS as INTEGRITY_ALLOWED_PRODUCT_DOC_KEYS,
  auditCatalogDryRun,
  auditProductDocument,
  prepareUnifiedProductCreatePayload,
  prepareUnifiedProductUpdatePayload,
  stripUndefinedDeep as integrityStripUndefinedDeep,
  type CatalogIntegrityDryRunReport,
} from './product-integrity';
import type {
  AuthorizedUser,
  CannedResponse,
  CountryCode,
  CountryPriceEntry,
  CustomCategory,
  CustomerInquiry,
  EmployeeAlert,
  LogoPlacementsMap,
  LogoSlotId,
  Policy,
  PriceHistoryEntry,
  Product,
  QuickPhrase,
  ReturnWorkflowStage,
  SiteBrandingSettings,
  SiteUiConfig,
  Situation,
  StaffSectionId,
  SyncHistoryEntry,
  SystemLink,
  UserPreferences,
} from '../types/hub';

function currentActorEmail(): string {
  return clampString(auth.currentUser?.email?.toLowerCase() || 'unknown@mashaer.store', FIELD_LIMITS.emailMax);
}

function assertVerifiedMutationAuth(): string {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('انتهت جلسة الدخول أو لم يتم التحقق من الحساب. يُرجى تسجيل الدخول بحساب مدير مصرح له.');
  }
  if (!user.emailVerified) {
    throw new Error('البريد الإلكتروني غير موثق. يجب تسجيل الدخول بحساب Google موثق لحفظ التعديلات.');
  }
  return clampString(user.email.toLowerCase(), FIELD_LIMITS.emailMax);
}

export function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = 'message' in err ? String((err as { message: unknown }).message) : '';
  const code = 'code' in err ? String((err as { code: unknown }).code) : '';
  return code === 'permission-denied' || msg.includes('Missing or insufficient permissions') || msg.includes('PERMISSION_DENIED');
}

export interface ConcurrencyOptions {
  expectedUpdatedAtMs?: number | null;
  forceOverwrite?: boolean;
}

export class ConcurrentEditConflictError extends Error {
  public readonly latestUpdatedBy?: string;
  public readonly latestUpdatedAtMs?: number | null;
  public readonly latestData?: Record<string, unknown>;

  constructor(message: string, details?: { latestUpdatedBy?: string; latestUpdatedAtMs?: number | null; latestData?: Record<string, unknown> }) {
    super(message);
    this.name = 'ConcurrentEditConflictError';
    this.latestUpdatedBy = details?.latestUpdatedBy;
    this.latestUpdatedAtMs = details?.latestUpdatedAtMs;
    this.latestData = details?.latestData;
  }
}

export function getUpdatedAtMs(ts: unknown): number | null {
  if (!ts) return null;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof ts === 'object') {
    if ('toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis();
    }
    if ('toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().getTime();
    }
    if ('seconds' in ts && typeof (ts as { seconds: unknown }).seconds === 'number') {
      return (ts as { seconds: number }).seconds * 1000;
    }
  }
  return null;
}

export function formatFirestoreDate(ts: unknown): string {
  const ms = getUpdatedAtMs(ts);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('ar-KW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const stripUndefinedDeep = integrityStripUndefinedDeep;

// ---------------------------------------------------------------------------
// Generic Save / Update / Delete with Audit Trail & Optimistic Concurrency
// ---------------------------------------------------------------------------
async function createDocWithAudit(
  collectionName: string,
  prefix: string,
  sectionLabel: string,
  itemName: string,
  data: Record<string, unknown>,
  customId?: string
): Promise<{ id: string; schemaUpgradePending: boolean }> {
  const actorEmail = assertVerifiedMutationAuth();
  const id = customId || makeSafeDocId(prefix);
  const cleanData = stripUndefinedDeep(data);
  const payload: Record<string, unknown> =
    collectionName === 'products'
      ? prepareUnifiedProductCreatePayload(
          cleanData as Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
          actorEmail
        )
      : {
          ...cleanData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: actorEmail,
        };

  try {
    await setDoc(doc(db, collectionName, id), payload);
    trackWrite(1);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${collectionName}/${id}`);
  }

  await tryLogAuditEventNonBlocking({
    section: sectionLabel,
    itemName,
    itemId: id,
    actionType: 'create',
    summary: `إضافة عنصر جديد في ${sectionLabel}: ${itemName}`,
    newValue: cleanData,
  });
  return { id, schemaUpgradePending: false };
}

export const ALLOWED_PRODUCT_DOC_KEYS = INTEGRITY_ALLOWED_PRODUCT_DOC_KEYS;

export const ALLOWED_POLICY_DOC_KEYS = new Set([
  'title',
  'category',
  'content',
  'summary',
  'applicableCases',
  'conditions',
  'exceptions',
  'requiredAction',
  'suggestedReply',
  'escalationDept',
  'source',
  'needsAdminReview',
  'conflictNote',
  'sourceUrl',
  'sortOrder',
  'createdAt',
  'updatedAt',
  'updatedBy',
]);

export function buildLegacyDocCleanupPatch(
  collectionName: string,
  existingData: Record<string, unknown> | undefined | null,
  nextPayload: Record<string, unknown>,
  options?: { preserveSyntheticId?: boolean }
): Record<string, unknown> {
  if (!existingData) return {};
  const allowedKeys =
    collectionName === 'products'
      ? ALLOWED_PRODUCT_DOC_KEYS
      : collectionName === 'policies'
        ? ALLOWED_POLICY_DOC_KEYS
        : null;
  if (!allowedKeys) return {};

  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(existingData)) {
    if (key === 'id' && options?.preserveSyntheticId) continue;
    if (!allowedKeys.has(key) && !(key in nextPayload)) {
      patch[key] = deleteField();
    }
  }

  if (collectionName === 'products') {
    const rawImg = existingData.imageUrl;
    if (
      !('imageUrl' in nextPayload) &&
      (rawImg === null ||
        (rawImg !== undefined && typeof rawImg !== 'string') ||
        (typeof rawImg === 'string' && rawImg.length > 1000))
    ) {
      patch.imageUrl = deleteField();
    }
    if (!('priceHistory' in nextPayload)) {
      if (existingData.priceHistory !== undefined && !Array.isArray(existingData.priceHistory)) {
        patch.priceHistory = deleteField();
      } else if (Array.isArray(existingData.priceHistory) && existingData.priceHistory.length > 40) {
        patch.priceHistory = stripUndefinedDeep(existingData.priceHistory.slice(-40));
      }
    }
    if (!('manuallyEditedFields' in nextPayload)) {
      if (existingData.manuallyEditedFields !== undefined && !Array.isArray(existingData.manuallyEditedFields)) {
        patch.manuallyEditedFields = deleteField();
      } else if (Array.isArray(existingData.manuallyEditedFields) && existingData.manuallyEditedFields.length > 35) {
        patch.manuallyEditedFields = existingData.manuallyEditedFields.slice(0, 35);
      }
    }
    if (
      !('sortOrder' in nextPayload) &&
      existingData.sortOrder !== undefined &&
      existingData.sortOrder !== null &&
      (typeof existingData.sortOrder !== 'number' || !Number.isFinite(existingData.sortOrder))
    ) {
      patch.sortOrder = deleteField();
    }
    const optStrMax: Array<[string, number]> = [
      ['sku', 80],
      ['nameEn', 200],
      ['fragranceFamily', 200],
      ['fragranceCharacter', 200],
      ['perfumeType', 200],
      ['sillage', 120],
      ['longevity', 120],
      ['occasionUsage', 300],
      ['seasons', 200],
      ['notesAndIngredients', 2000],
      ['topNotes', 1000],
      ['heartNotes', 1000],
      ['baseNotes', 1000],
      ['size', 120],
      ['availability', 120],
      ['usageInstructions', 2000],
      ['extraInfo', 2000],
      ['internalNotes', 2000],
      ['syncConflictNote', 1000],
      ['lastSyncedAt', 100],
      ['syncStatus', 120],
      ['sourceUrl', 500],
    ];
    for (const [k, maxLen] of optStrMax) {
      if (k in nextPayload) continue;
      const val = existingData[k];
      if (val === undefined || val === null) continue;
      if (typeof val !== 'string') {
        patch[k] = deleteField();
      } else if (val.length > maxLen) {
        patch[k] = val.slice(0, maxLen);
      }
    }
    if (
      !('companionGift' in nextPayload) &&
      existingData.companionGift !== undefined &&
      existingData.companionGift !== null
    ) {
      const g = existingData.companionGift as Record<string, unknown>;
      const validGiftShape =
        typeof g === 'object' &&
        !Array.isArray(g) &&
        Object.keys(g).every((gk) => gk === 'title' || gk === 'size' || gk === 'kind' || gk === 'compositionNote') &&
        (g.title === undefined || g.title === null || (typeof g.title === 'string' && g.title.length <= 160)) &&
        (g.size === undefined || g.size === null || (typeof g.size === 'string' && g.size.length <= 80)) &&
        (g.kind === undefined || g.kind === null || (typeof g.kind === 'string' && g.kind.length <= 40)) &&
        (g.compositionNote === undefined ||
          g.compositionNote === null ||
          (typeof g.compositionNote === 'string' && g.compositionNote.length <= 800));
      if (!validGiftShape) {
        patch.companionGift = deleteField();
      }
    }
  }
  return patch;
}

async function fetchDocForMutation(
  collectionName: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const docRef = doc(db, collectionName, id);
  let snap;
  try {
    snap = await getDocFromServer(docRef);
    trackRead(1);
  } catch {
    try {
      snap = await getDoc(docRef);
      trackRead(1);
    } catch {
      return null;
    }
  }
  if (!snap?.exists()) return null;
  return snap.data() as Record<string, unknown>;
}

async function checkOptimisticConflict(
  collectionName: string,
  id: string,
  concurrency?: ConcurrencyOptions,
  prefetchedServerData?: Record<string, unknown> | null
): Promise<Record<string, unknown> | null> {
  const shouldFetch =
    Boolean(concurrency?.expectedUpdatedAtMs && !concurrency.forceOverwrite) ||
    collectionName === 'products' ||
    collectionName === 'policies';
  if (!shouldFetch) return prefetchedServerData || null;

  const serverData = prefetchedServerData !== undefined ? prefetchedServerData : await fetchDocForMutation(collectionName, id);
  if (!serverData) return null;

  if (concurrency?.expectedUpdatedAtMs && !concurrency.forceOverwrite) {
    const serverMs = getUpdatedAtMs(serverData.updatedAt);
    if (serverMs && serverMs > concurrency.expectedUpdatedAtMs + 1500) {
      const serverActor = typeof serverData.updatedBy === 'string' ? serverData.updatedBy : 'مدير آخر';
      throw new ConcurrentEditConflictError(
        `تم تعديل هذا السجل في السحابة بواسطة (${serverActor}) بعد فتحك لنموذج التعديل. يُرجى مراجعة التحديث أو اختيار الاعتماد بالقوة.`,
        {
          latestUpdatedBy: serverActor,
          latestUpdatedAtMs: serverMs,
          latestData: serverData,
        }
      );
    }
  }
  return serverData;
}

async function updateDocWithAudit(
  collectionName: string,
  id: string,
  sectionLabel: string,
  itemName: string,
  data: Record<string, unknown>,
  previousValue?: unknown,
  concurrency?: ConcurrencyOptions
): Promise<{ schemaUpgradePending: boolean }> {
  const actorEmail = assertVerifiedMutationAuth();
  const checkedData = await checkOptimisticConflict(collectionName, id, concurrency);
  const serverData = checkedData ?? (await fetchDocForMutation(collectionName, id));

  const cleanData = stripUndefinedDeep(data);

  if (!serverData) {
    // Document may originate from local fallback catalog and not yet exist on Firestore.
    const createPayload: Record<string, unknown> =
      collectionName === 'products'
        ? prepareUnifiedProductCreatePayload(
            cleanData as Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
            actorEmail
          )
        : {
            ...cleanData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: actorEmail,
          };
    try {
      await setDoc(doc(db, collectionName, id), createPayload);
      trackWrite(1);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${collectionName}/${id}`);
    }
  } else {
    let payload: Record<string, unknown>;
    if (collectionName === 'products') {
      const prepared = prepareUnifiedProductUpdatePayload(
        serverData,
        cleanData as Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
        actorEmail
      );
      payload = prepared.payload;
    } else {
      const cleanupPatch = buildLegacyDocCleanupPatch(collectionName, serverData, cleanData);
      payload = {
        ...cleanData,
        ...cleanupPatch,
        updatedAt: serverTimestamp(),
        updatedBy: actorEmail,
      };
    }

    try {
      await updateDoc(doc(db, collectionName, id), payload);
      trackWrite(1);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${collectionName}/${id}`);
    }
  }

  await tryLogAuditEventNonBlocking({
    section: sectionLabel,
    itemName,
    itemId: id,
    actionType: serverData ? 'update' : 'create',
    summary: serverData
      ? `تعديل عنصر في ${sectionLabel}: ${itemName}`
      : `حفظ وإنشاء سجل في ${sectionLabel}: ${itemName}`,
    previousValue,
    newValue: cleanData,
  });

  return { schemaUpgradePending: false };
}

async function deleteDocWithAudit(
  collectionName: string,
  id: string,
  sectionLabel: string,
  itemName: string,
  previousValue?: unknown
): Promise<void> {
  assertVerifiedMutationAuth();
  try {
    await deleteDoc(doc(db, collectionName, id));
    trackDelete(1);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
  }
  await tryLogAuditEventNonBlocking({
    section: sectionLabel,
    itemName,
    itemId: id,
    actionType: 'delete',
    summary: `حذف عنصر من ${sectionLabel}: ${itemName}`,
    previousValue,
  });
}

// ---------------------------------------------------------------------------
// Canned Responses
// ---------------------------------------------------------------------------
export async function saveCannedResponse(
  input: Omit<CannedResponse, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: CannedResponse,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    title: clampString(input.title, FIELD_LIMITS.titleMax),
    category: clampString(input.category, FIELD_LIMITS.categoryMax),
    content: clampString(input.content, FIELD_LIMITS.contentMax),
  };
  if (input.internalNotes?.trim() || existing) {
    clean.internalNotes = clampString(input.internalNotes || '', FIELD_LIMITS.notesMax);
  }
  if (existing) {
    await updateDocWithAudit(
      'canned_responses',
      existing.id,
      'مكتبة الردود الجاهزة',
      input.title,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit('canned_responses', 'resp', 'مكتبة الردود الجاهزة', input.title, clean);
  return res.id;
}

export async function deleteCannedResponse(item: CannedResponse): Promise<void> {
  await deleteDocWithAudit('canned_responses', item.id, 'مكتبة الردود الجاهزة', item.title, item);
}

// ---------------------------------------------------------------------------
// Customer Inquiries
// ---------------------------------------------------------------------------
export async function saveCustomerInquiry(
  input: Omit<CustomerInquiry, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: CustomerInquiry,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    question: clampString(input.question, FIELD_LIMITS.inquiryQuestionMax),
    answer: clampString(input.answer, FIELD_LIMITS.inquiryAnswerMax),
    category: clampString(input.category, FIELD_LIMITS.categoryMax),
    needsAdminReview: Boolean(input.needsAdminReview),
    source: input.source,
  };
  if (input.notes?.trim() || existing) clean.notes = clampString(input.notes || '', FIELD_LIMITS.notesMax);
  if (typeof input.sourceOrder === 'number') clean.sourceOrder = input.sourceOrder;

  if (existing) {
    await updateDocWithAudit(
      'customer_inquiries',
      existing.id,
      'استفسارات العملاء',
      input.question,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit('customer_inquiries', 'inq', 'استفسارات العملاء', input.question, clean);
  return res.id;
}

export async function deleteCustomerInquiry(item: CustomerInquiry): Promise<void> {
  await deleteDocWithAudit('customer_inquiries', item.id, 'استفسارات العملاء', item.question, item);
}

// ---------------------------------------------------------------------------
// Policies (Structured 19-category support + escalationDept)
// ---------------------------------------------------------------------------
export async function savePolicy(
  input: Omit<Policy, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: Policy,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    title: clampString(input.title, FIELD_LIMITS.titleMax),
    category: clampString(input.category, FIELD_LIMITS.categoryMax),
    content: clampString(input.content, FIELD_LIMITS.policyContentMax),
    needsAdminReview: Boolean(input.needsAdminReview),
  };
  if (input.summary?.trim() || existing) clean.summary = clampString(input.summary || '', 1000);
  if (input.applicableCases?.trim() || existing) clean.applicableCases = clampString(input.applicableCases || '', 3000);
  if (input.conditions?.trim() || existing) clean.conditions = clampString(input.conditions || '', 3000);
  if (input.exceptions?.trim() || existing) clean.exceptions = clampString(input.exceptions || '', 3000);
  if (input.requiredAction?.trim() || existing) clean.requiredAction = clampString(input.requiredAction || '', 3000);
  if (input.suggestedReply?.trim() || existing) clean.suggestedReply = clampString(input.suggestedReply || '', 4000);
  if (input.escalationDept?.trim() || existing) clean.escalationDept = clampString(input.escalationDept || '', 150);
  if (input.source?.trim() || existing) clean.source = clampString(input.source || '', 300);
  if (input.conflictNote?.trim() || existing) clean.conflictNote = clampString(input.conflictNote || '', FIELD_LIMITS.notesMax);
  if (input.sourceUrl?.trim() || existing) clean.sourceUrl = clampString(input.sourceUrl || '', FIELD_LIMITS.urlMax);
  if (typeof input.sortOrder === 'number') clean.sortOrder = input.sortOrder;

  if (existing) {
    await updateDocWithAudit(
      'policies',
      existing.id,
      'السياسات والإجراءات',
      input.title,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit(
    'policies',
    'pol',
    'السياسات والإجراءات',
    input.title,
    clean
  );
  return res.id;
}

export async function deletePolicy(item: Policy): Promise<void> {
  await deleteDocWithAudit('policies', item.id, 'السياسات والإجراءات', item.title, item);
}

// ---------------------------------------------------------------------------
// Situations (Sheet 1 + subCategory, internalNotes, isImportant, linkedPolicyId)
// ---------------------------------------------------------------------------
export async function saveSituation(
  input: Omit<Situation, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: Situation,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    situationNumber: clampString(input.situationNumber, 60),
    category: clampString(input.category, 150),
    customerInquiry: clampString(input.customerInquiry, 3000),
    internalProcedure: clampString(input.internalProcedure, FIELD_LIMITS.situationFieldMax),
    cannedReply: clampString(input.cannedReply, FIELD_LIMITS.situationFieldMax),
    responsibleDept: clampString(input.responsibleDept, 150),
    isImportant: Boolean(input.isImportant),
    needsAdminReview: Boolean(input.needsAdminReview),
    duplicateFlag: Boolean(input.duplicateFlag),
  };
  if (input.subCategory?.trim() || existing) clean.subCategory = clampString(input.subCategory || '', 150);
  if (input.requiredData?.trim() || existing) clean.requiredData = clampString(input.requiredData || '', 2000);
  if (input.internalNotes?.trim() || existing) clean.internalNotes = clampString(input.internalNotes || '', 2000);
  if (input.linkedPolicyId?.trim() || existing) clean.linkedPolicyId = clampString(input.linkedPolicyId || '', 128);
  if (input.importHash?.trim()) clean.importHash = clampString(input.importHash, 128);
  if (typeof input.sortOrder === 'number') clean.sortOrder = input.sortOrder;

  if (existing) {
    await updateDocWithAudit(
      'situations',
      existing.id,
      'دليل المواقف',
      `موقف ${input.situationNumber}`,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit('situations', 'sit', 'دليل المواقف', `موقف ${input.situationNumber}`, clean);
  return res.id;
}

export async function deleteSituation(item: Situation): Promise<void> {
  await deleteDocWithAudit('situations', item.id, 'دليل المواقف', `موقف ${item.situationNumber}`, item);
}

// ---------------------------------------------------------------------------
// Return Workflow Stages (Sheet 2)
// ---------------------------------------------------------------------------
export async function saveReturnStage(
  input: Omit<ReturnWorkflowStage, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: ReturnWorkflowStage,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    stageOrder: Number(input.stageOrder) || 1,
    stage: clampString(input.stage, 200),
    condition: clampString(input.condition, 2000),
    procedure: clampString(input.procedure, FIELD_LIMITS.situationFieldMax),
    cannedReply: clampString(input.cannedReply, FIELD_LIMITS.situationFieldMax),
    needsAdminReview: Boolean(input.needsAdminReview),
    duplicateFlag: Boolean(input.duplicateFlag),
  };
  if (input.employeeNote?.trim() || existing) clean.employeeNote = clampString(input.employeeNote || '', 2000);
  if (input.importHash?.trim()) clean.importHash = clampString(input.importHash, 128);

  if (existing) {
    await updateDocWithAudit(
      'return_workflow',
      existing.id,
      'مسار المرتجع والاسترداد',
      input.stage,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit('return_workflow', 'ret', 'مسار المرتجع والاسترداد', input.stage, clean);
  return res.id;
}

export async function deleteReturnStage(item: ReturnWorkflowStage): Promise<void> {
  await deleteDocWithAudit('return_workflow', item.id, 'مسار المرتجع والاسترداد', item.stage, item);
}

// ---------------------------------------------------------------------------
// Quick Phrases (Sheet 3) & Employee Alerts (Sheet 4)
// ---------------------------------------------------------------------------
export async function saveQuickPhrase(
  input: Omit<QuickPhrase, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: QuickPhrase,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    purpose: clampString(input.purpose, 300),
    phrase: clampString(input.phrase, 3000),
    duplicateFlag: Boolean(input.duplicateFlag),
  };
  if (input.category?.trim() || existing) clean.category = clampString(input.category || '', 120);
  if (input.importHash?.trim()) clean.importHash = clampString(input.importHash, 128);
  if (typeof input.sortOrder === 'number') clean.sortOrder = input.sortOrder;

  if (existing) {
    await updateDocWithAudit(
      'quick_phrases',
      existing.id,
      'العبارات السريعة',
      input.purpose,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit('quick_phrases', 'phr', 'العبارات السريعة', input.purpose, clean);
  return res.id;
}

export async function deleteQuickPhrase(item: QuickPhrase): Promise<void> {
  await deleteDocWithAudit('quick_phrases', item.id, 'العبارات السريعة', item.purpose, item);
}

export async function saveEmployeeAlert(
  input: Omit<EmployeeAlert, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: EmployeeAlert,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const clean: Record<string, unknown> = {
    title: clampString(input.title, 300),
    ruleText: clampString(input.ruleText, 4000),
    severity: input.severity,
    duplicateFlag: Boolean(input.duplicateFlag),
  };
  if (input.clarification?.trim() || existing) clean.clarification = clampString(input.clarification || '', 3000);
  if (input.importHash?.trim()) clean.importHash = clampString(input.importHash, 128);
  if (typeof input.sortOrder === 'number') clean.sortOrder = input.sortOrder;

  if (existing) {
    await updateDocWithAudit(
      'employee_alerts',
      existing.id,
      'تنبيهات للموظف',
      input.title,
      clean,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    return existing.id;
  }
  const res = await createDocWithAudit('employee_alerts', 'alt', 'تنبيهات للموظف', input.title, clean);
  return res.id;
}

export async function deleteEmployeeAlert(item: EmployeeAlert): Promise<void> {
  await deleteDocWithAudit('employee_alerts', item.id, 'تنبيهات للموظف', item.title, item);
}

// ---------------------------------------------------------------------------
// Products Guide & Perfume Intelligence (Zero bottle images + manual edit protection)
// ---------------------------------------------------------------------------
const SYNC_PROTECTABLE_FIELDS = ['nameAr', 'nameEn', 'officialDescription', 'size', 'availability', 'sourceUrl'] as const;

const ALL_MANUAL_PROTECTABLE_FIELDS = [
  'nameAr',
  'nameEn',
  'officialDescription',
  'fragranceFamily',
  'fragranceCharacter',
  'perfumeType',
  'sillage',
  'longevity',
  'occasionUsage',
  'seasons',
  'notesAndIngredients',
  'topNotes',
  'heartNotes',
  'baseNotes',
  'size',
  'availability',
  'usageInstructions',
  'extraInfo',
  'sourceUrl',
] as const;

export interface SaveProductOptions extends ConcurrencyOptions {
  /** When true, honors input.manuallyEditedFields verbatim (used for Undo / lock toggle) */
  preserveExplicitManualFields?: boolean;
}

export async function saveProduct(
  input: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: Product,
  concurrency?: SaveProductOptions
): Promise<string> {
  assertVerifiedMutationAuth();
  const editedSet = new Set<string>(
    concurrency?.preserveExplicitManualFields
      ? input.manuallyEditedFields || []
      : existing?.manuallyEditedFields || []
  );
  if (existing && !concurrency?.preserveExplicitManualFields) {
    for (const key of ALL_MANUAL_PROTECTABLE_FIELDS) {
      const nextVal = (input[key] || '').trim();
      const prevVal = (existing[key] || '').trim();
      if (nextVal !== prevVal) {
        editedSet.add(key);
      }
    }
  }
  const enrichedInput = {
    ...input,
    manuallyEditedFields: concurrency?.preserveExplicitManualFields
      ? Array.from(editedSet)
      : existing
        ? Array.from(editedSet)
        : input.manuallyEditedFields,
  };
  const preparedPreview = prepareUnifiedProductCreatePayload(enrichedInput, currentActorEmail());
  const expectedNameAr = String(preparedPreview.nameAr);
  const expectedCategory = String(preparedPreview.category);
  const expectedReviewStatus = String(preparedPreview.reviewStatus);
  const expectedDesc = String(preparedPreview.officialDescription);

  let savedId: string;
  if (existing) {
    await updateDocWithAudit(
      'products',
      existing.id,
      'دليل المنتجات',
      expectedNameAr,
      enrichedInput as unknown as Record<string, unknown>,
      existing,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existing.updatedAt) }
    );
    savedId = existing.id;
  } else {
    const res = await createDocWithAudit(
      'products',
      'prd',
      'دليل المنتجات',
      expectedNameAr,
      enrichedInput as unknown as Record<string, unknown>
    );
    savedId = res.id;
  }

  const verified = await refreshProductFromServer(savedId);
  if (
    !verified ||
    verified.nameAr !== expectedNameAr ||
    verified.category !== expectedCategory ||
    verified.reviewStatus !== expectedReviewStatus ||
    verified.officialDescription !== expectedDesc
  ) {
    throw new Error('تعذر تأكيد حفظ بيانات المنتج على خادم قاعدة البيانات. يُرجى المحاولة مرة أخرى.');
  }
  return savedId;
}

export async function resolveProductSyncConflict(product: Product): Promise<void> {
  await updateDocWithAudit(
    'products',
    product.id,
    'دليل المنتجات',
    product.nameAr,
    {
      syncConflictNote: '',
      syncStatus: 'synced_live',
    },
    { syncConflictNote: product.syncConflictNote },
    { forceOverwrite: true }
  );
}

export async function deleteProduct(item: Product): Promise<void> {
  await deleteDocWithAudit('products', item.id, 'دليل المنتجات', item.nameAr, item);
}

export async function refreshProductFromServer(productId: string): Promise<Product | null> {
  const ref = doc(db, 'products', productId);
  try {
    const snap = await getDocFromServer(ref);
    trackRead(1);
    if (!snap.exists()) return null;
    return {
      ...(snap.data() as Omit<Product, 'id'>),
      id: snap.id,
      imageUrl: undefined,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `products/${productId}`);
  }
}

// ---------------------------------------------------------------------------
// Live Mashaer.store Sync & Price History Engine (Protects manual edits)
// ---------------------------------------------------------------------------
interface LiveSyncApiProduct {
  slug: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  category: 'perfumes' | 'mamoul' | 'spray';
  officialDescription: string;
  imageUrl: string;
  availability: string;
  size: string;
  sourceUrl: string;
  countryPrices: Partial<Record<CountryCode, CountryPriceEntry>>;
}

export interface LiveSyncResult {
  syncedAt: string;
  updatedCount: number;
  createdCount: number;
  conflictCount: number;
  priceChanges: number;
  products: Product[];
  schemaUpgradePending: boolean;
}

function normalizeMatchKey(val: string | undefined): string {
  return (val || '').trim().toLowerCase().replace(/[\s\-_&]+/g, '');
}

function findMatchingExistingProduct(
  live: LiveSyncApiProduct,
  existingProducts: Product[]
): Product | undefined {
  const liveSku = normalizeMatchKey(live.sku);
  const liveEn = normalizeMatchKey(live.nameEn);
  const liveAr = normalizeMatchKey(live.nameAr);
  const liveSlug = normalizeMatchKey(live.slug);

  return existingProducts.find((p) => {
    if (liveSku && normalizeMatchKey(p.sku) === liveSku) return true;
    if (liveEn && normalizeMatchKey(p.nameEn) === liveEn) return true;
    if (liveAr && normalizeMatchKey(p.nameAr) === liveAr) return true;
    if (liveSlug && p.sourceUrl && p.sourceUrl.toLowerCase().includes(`/products/${live.slug.toLowerCase()}`)) return true;
    return false;
  });
}

export interface ProductBatchWriteOp {
  id: string;
  mode: 'set' | 'update';
  payload: Record<string, unknown>;
}

export interface ProductBatchCommitResult {
  committedIds: string[];
  failedItems: Array<{ id: string; reason: string; isPermissionError: boolean }>;
}

export async function commitProductWriteOpsWithIsolation(
  ops: ProductBatchWriteOp[]
): Promise<ProductBatchCommitResult> {
  const committedIds: string[] = [];
  const failedItems: Array<{ id: string; reason: string; isPermissionError: boolean }> = [];
  const chunkSize = 250;

  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, 'products', op.id);
      if (op.mode === 'update') {
        batch.update(ref, op.payload);
      } else {
        batch.set(ref, op.payload);
      }
    }
    try {
      await batch.commit();
      trackWrite(chunk.length);
      for (const op of chunk) committedIds.push(op.id);
    } catch {
      // Fallback per-item so one failing document never corrupts or aborts valid products
      for (const op of chunk) {
        try {
          const ref = doc(db, 'products', op.id);
          if (op.mode === 'update') {
            await updateDoc(ref, op.payload);
          } else {
            await setDoc(ref, op.payload);
          }
          trackWrite(1);
          committedIds.push(op.id);
        } catch (itemErr) {
          const reason = itemErr instanceof Error ? itemErr.message : String(itemErr);
          failedItems.push({
            id: op.id,
            reason,
            isPermissionError: isPermissionDeniedError(itemErr),
          });
        }
      }
    }
  }

  return { committedIds, failedItems };
}

export async function fetchAllRawProductsFromServer(): Promise<
  Array<{ id: string; data: Record<string, unknown> }>
> {
  const colRef = collection(db, 'products');
  let snap;
  try {
    snap = await getDocsFromServer(colRef);
  } catch {
    snap = await getDocs(colRef);
  }
  trackRead(Math.max(1, snap.docs.length));
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Record<string, unknown>,
  }));
}

export async function runLiveProductsIntegrityDryRun(): Promise<{
  report: CatalogIntegrityDryRunReport;
  rawDocs: Array<{ id: string; data: Record<string, unknown> }>;
}> {
  assertVerifiedMutationAuth();
  const rawDocs = await fetchAllRawProductsFromServer();
  const report = auditCatalogDryRun(rawDocs);
  return { report, rawDocs };
}

export interface ProductMigrationExecutionReport {
  attemptedCount: number;
  updatedCount: number;
  verifiedCount: number;
  failedDocs: Array<{ id: string; reason: string }>;
  executedAt: string;
}

export async function executeSafeProductsMigration(
  targetDocIds?: string[]
): Promise<ProductMigrationExecutionReport> {
  const actorEmail = assertVerifiedMutationAuth();
  const rawDocs = await fetchAllRawProductsFromServer();
  const targetSet = targetDocIds && targetDocIds.length > 0 ? new Set(targetDocIds) : null;

  const ops: ProductBatchWriteOp[] = [];
  for (const docEntry of rawDocs) {
    if (targetSet && !targetSet.has(docEntry.id)) continue;
    const audit = auditProductDocument(docEntry.id, docEntry.data);
    if (!audit.needsCleanupOrMigration) continue;

    const fallbackSeed = MASHAER_STORE_CATALOG.find(
      (c) =>
        c.id === docEntry.id ||
        (typeof docEntry.data.sku === 'string' &&
          c.sku &&
          c.sku.trim().toLowerCase() === docEntry.data.sku.trim().toLowerCase())
    );
    const prepared = prepareUnifiedProductUpdatePayload(docEntry.data, {}, actorEmail, {
      fallbackSeed,
    });
    ops.push({
      id: docEntry.id,
      mode: 'update',
      payload: prepared.payload,
    });
  }

  if (ops.length === 0) {
    return {
      attemptedCount: 0,
      updatedCount: 0,
      verifiedCount: 0,
      failedDocs: [],
      executedAt: new Date().toISOString(),
    };
  }

  const commitRes = await commitProductWriteOpsWithIsolation(ops);
  const failedDocs = commitRes.failedItems.map((f) => ({ id: f.id, reason: f.reason }));

  // Re-verify migrated docs directly from Firestore server
  let verifiedCount = 0;
  const afterDocs = await fetchAllRawProductsFromServer();
  const afterMap = new Map(afterDocs.map((d) => [d.id, d.data]));
  for (const id of commitRes.committedIds) {
    const srvData = afterMap.get(id);
    if (!srvData) {
      failedDocs.push({ id, reason: 'تعذر قراءة المستند بعد الترحيل' });
      continue;
    }
    const postAudit = auditProductDocument(id, srvData);
    if (postAudit.wouldFailFirestoreRules) {
      failedDocs.push({ id, reason: postAudit.blockingReasons.join('؛ ') });
    } else {
      verifiedCount += 1;
    }
  }

  if (commitRes.committedIds.length > 0) {
    await tryLogAuditEventNonBlocking({
      section: 'دليل المنتجات',
      itemName: `ترحيل وتنظيف آمن لـ ${commitRes.committedIds.length} منتج`,
      actionType: 'update',
      summary: `معالجة ${commitRes.committedIds.length} منتجاً (${verifiedCount} موثق على الخادم، فشل ${failedDocs.length}) بعد فحص Dry Run.`,
    });
  }

  return {
    attemptedCount: ops.length,
    updatedCount: commitRes.committedIds.length,
    verifiedCount,
    failedDocs,
    executedAt: new Date().toISOString(),
  };
}

export interface ProductProbeTestCaseResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ProductProbeTestSuiteResult {
  actorEmail: string;
  actorUid: string;
  emailVerified: boolean;
  allPassed: boolean;
  cases: ProductProbeTestCaseResult[];
  ranAt: string;
}

/**
 * Safe isolated live verification suite using temporary probe document `prd_test_integrity_probe`.
 * Never reads/mutates real catalog documents. Always deletes the temporary probe doc on completion.
 */
export async function runIsolatedProductProbeTestSuite(): Promise<ProductProbeTestSuiteResult> {
  const actorEmail = assertVerifiedMutationAuth();
  const uid = auth.currentUser?.uid || '';
  const emailVerified = Boolean(auth.currentUser?.emailVerified);
  const probeId = 'prd_test_integrity_probe';
  const probeRef = doc(db, 'products', probeId);
  const cases: ProductProbeTestCaseResult[] = [];

  try {
    // Cleanup leftover probe if any
    try {
      await deleteDoc(probeRef);
    } catch {
      // ignore if absent
    }

    // 1. Create product
    const createPayload = prepareUnifiedProductCreatePayload(
      {
        sku: 'TEST-PROBE-001',
        nameAr: 'منتج اختبار السلامة المؤقت',
        nameEn: 'Integrity Probe Test',
        category: 'perfumes',
        officialDescription: 'وصف اختباري مؤقت للتحقق من قواعد Firestore ومسار الحفظ الموحد.',
        reviewStatus: 'verified',
      },
      actorEmail
    );
    await setDoc(probeRef, createPayload);
    trackWrite(1);
    const snap1 = await getDocFromServer(probeRef);
    trackRead(1);
    const d1 = snap1.exists() ? (snap1.data() as Record<string, unknown>) : null;
    cases.push({
      id: 'create_and_readback',
      label: '1. إنشاء منتج جديد والتحقق منه من الخادم',
      passed: Boolean(d1 && d1.nameAr === 'منتج اختبار السلامة المؤقت' && d1.createdAt && d1.updatedAt),
      detail: d1 ? 'تم الإنشاء والقراءة من الخادم مع createdAt و updatedAt.' : 'فشل قراءة المستند بعد الإنشاء.',
    });

    // 2. Compatible update + createdAt immutability
    const srv1 = d1 || {};
    const createdAtBefore = getUpdatedAtMs(srv1.createdAt);
    const upd1 = prepareUnifiedProductUpdatePayload(srv1, { longevity: '8-10 ساعات (تقديري)' }, actorEmail);
    await updateDoc(probeRef, upd1.payload);
    trackWrite(1);
    const snap2 = await getDocFromServer(probeRef);
    trackRead(1);
    const d2 = snap2.exists() ? (snap2.data() as Record<string, unknown>) : {};
    const createdAtAfter = getUpdatedAtMs(d2.createdAt);
    cases.push({
      id: 'compatible_update',
      label: '2. تعديل متوافق والحفاظ على ثبات createdAt',
      passed: d2.longevity === '8-10 ساعات (تقديري)' && createdAtBefore === createdAtAfter,
      detail: `createdAt ثابت (${createdAtBefore === createdAtAfter ? 'نعم' : 'لا'}) وتم حفظ الحقل بنجاح.`,
    });

    // 3. Update with companionGift
    const updGift = prepareUnifiedProductUpdatePayload(
      d2,
      {
        companionGift: {
          title: 'سبراي 100 مل اختباري',
          size: '100 مل',
          kind: 'spray',
          compositionNote: 'نفس نوتات العطر الاختباري.',
        },
      },
      actorEmail
    );
    await updateDoc(probeRef, updGift.payload);
    trackWrite(1);
    const snap3 = await getDocFromServer(probeRef);
    trackRead(1);
    const d3 = snap3.exists() ? (snap3.data() as Record<string, unknown>) : {};
    const giftOk =
      Boolean(d3.companionGift) &&
      typeof d3.companionGift === 'object' &&
      (d3.companionGift as Record<string, unknown>).title === 'سبراي 100 مل اختباري';
    cases.push({
      id: 'companion_gift_update',
      label: '3. تحديث منتج يحتوي companionGift صالح',
      passed: giftOk,
      detail: giftOk ? 'تم حفظ companionGift والتحقق من مطابقته للقواعد.' : 'فشل التحقق من companionGift.',
    });

    // 4. Update with countryPrices & priceHistory
    const updPrices = prepareUnifiedProductUpdatePayload(
      d3,
      {
        countryPrices: {
          KW: {
            countryCode: 'KW',
            countryNameAr: 'الكويت',
            currency: 'KWD',
            price: 35,
            oldPrice: null,
            discountPercent: null,
            availability: 'in stock',
            storeUrl: 'https://mashaer.store/ar-kw',
          },
        },
        priceHistory: [
          {
            recordedAt: new Date().toISOString(),
            countryCode: 'KW',
            currency: 'KWD',
            previousPrice: 38,
            newPrice: 35,
            previousAvailability: 'in stock',
            newAvailability: 'in stock',
          },
        ],
      },
      actorEmail
    );
    await updateDoc(probeRef, updPrices.payload);
    trackWrite(1);
    const snap4 = await getDocFromServer(probeRef);
    trackRead(1);
    const d4 = snap4.exists() ? (snap4.data() as Record<string, unknown>) : {};
    const pricesOk = Boolean(d4.countryPrices && typeof d4.countryPrices === 'object' && Array.isArray(d4.priceHistory));
    cases.push({
      id: 'country_prices_update',
      label: '4. تحديث منتج يحتوي countryPrices و priceHistory',
      passed: pricesOk,
      detail: pricesOk ? 'تم حفظ الأسعار الخليجية وسجل السعر بنجاح.' : 'فشل التحقق من countryPrices.',
    });

    // 5. Partial update with optional missing/null fields
    const updOpt = prepareUnifiedProductUpdatePayload(
      d4,
      { companionGift: null, sillage: 'متوسط', seasons: '' },
      actorEmail
    );
    await updateDoc(probeRef, updOpt.payload);
    trackWrite(1);
    const snap5 = await getDocFromServer(probeRef);
    trackRead(1);
    const d5 = snap5.exists() ? (snap5.data() as Record<string, unknown>) : {};
    const optOk = d5.companionGift === null && d5.sillage === 'متوسط';
    cases.push({
      id: 'optional_fields_update',
      label: '5. تحديث حقول اختيارية فارغة أو null (companionGift: null)',
      passed: optOk,
      detail: optOk ? 'قبلت القواعد الحقل الفارغ و companionGift=null بسلاسة.' : 'فشل التحديث بحقول اختيارية.',
    });

    // 6. Legacy cleanup & oversized clamping resilience check
    const hugeStr = 'أ'.repeat(4500);
    const simulatedLegacyDoc: Record<string, unknown> = {
      ...d5,
      id: probeId, // leaked synthetic id
      legacyNotes: 'ملاحظة قديمة غير معتمدة',
      description: 'وصف قديم',
    };
    const updLegacy = prepareUnifiedProductUpdatePayload(
      simulatedLegacyDoc,
      { officialDescription: hugeStr, extraInfo: 'معلومة'.repeat(600) },
      actorEmail
    );
    await updateDoc(probeRef, updLegacy.payload);
    trackWrite(1);
    const snap6 = await getDocFromServer(probeRef);
    trackRead(1);
    const d6 = snap6.exists() ? (snap6.data() as Record<string, unknown>) : {};
    const postAudit = auditProductDocument(probeId, d6);
    cases.push({
      id: 'legacy_and_limits_resilience',
      label: '6. تنظيف الحقول غير المدعومة وتقليص النصوص المتجاوزة للحد',
      passed: !postAudit.wouldFailFirestoreRules && typeof d6.officialDescription === 'string' && d6.officialDescription.length <= 4000,
      detail: `الطول بعد التقليم: ${typeof d6.officialDescription === 'string' ? d6.officialDescription.length : 0}/4000 · مطابق للقواعد: ${!postAudit.wouldFailFirestoreRules ? 'نعم' : 'لا'}`,
    });

    // 7. Delete probe document and confirm deletion
    await deleteDoc(probeRef);
    trackDelete(1);
    const snapAfterDel = await getDocFromServer(probeRef);
    trackRead(1);
    cases.push({
      id: 'cleanup_probe',
      label: '7. حذف المستند الاختباري والتأكد من عدم بقاء أي أثر',
      passed: !snapAfterDel.exists(),
      detail: !snapAfterDel.exists() ? 'تم حذف المستند الاختباري بالكامل.' : 'المستند الاختباري ما زال موجوداً!',
    });
  } catch (err) {
    cases.push({
      id: 'suite_error',
      label: 'خطأ غير متوقع أثناء الاختبار المعزول',
      passed: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    try {
      await deleteDoc(probeRef);
    } catch {
      // ignore cleanup error
    }
  }

  return {
    actorEmail,
    actorUid: uid,
    emailVerified,
    allPassed: cases.length > 0 && cases.every((c) => c.passed),
    cases,
    ranAt: new Date().toISOString(),
  };
}

export async function syncLiveMashaerCatalogToFirestore(
  existingProducts: Product[],
  previousSyncHistory?: SyncHistoryEntry[]
): Promise<LiveSyncResult> {
  const actorEmail = assertVerifiedMutationAuth();
  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  if (!idToken) {
    throw new Error('يجب تسجيل الدخول بحساب مدير مصرح له قبل المزامنة المباشرة.');
  }

  const response = await fetch('/api/mashaer/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  });

  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    syncedAt?: string;
    products?: LiveSyncApiProduct[];
  } | null;

  if (!response.ok || !body?.ok || !Array.isArray(body.products) || body.products.length < 5) {
    throw new Error(
      body?.error || 'البيانات المستلمة من متجر mashaer.store غير مكتملة. تم إلغاء المزامنة لحماية البيانات الحالية.'
    );
  }

  // Always inspect raw server documents (NOT UI-hydrated context state) so rule alignment is exact
  const rawServerDocs = await fetchAllRawProductsFromServer();
  const rawServerMap = new Map(rawServerDocs.map((d) => [d.id, d.data]));
  const rawExistingProducts: Product[] = rawServerDocs.map((d) => ({
    ...(d.data as Omit<Product, 'id'>),
    id: d.id,
  }));
  const matchPool = rawExistingProducts.length > 0 ? rawExistingProducts : existingProducts;

  const syncedAt = body.syncedAt || new Date().toISOString();
  let updatedCount = 0;
  let createdCount = 0;
  let conflictCount = 0;
  let priceChanges = 0;
  const mergedResults: Product[] = [];
  const batchOps: ProductBatchWriteOp[] = [];

  for (let idx = 0; idx < body.products.length; idx += 1) {
    const live = body.products[idx];
    const existing = findMatchingExistingProduct(live, matchPool);
    const serverRaw = existing ? rawServerMap.get(existing.id) : undefined;
    const catalogFallback = MASHAER_STORE_CATALOG.find(
      (c) =>
        (live.sku && normalizeMatchKey(c.sku) === normalizeMatchKey(live.sku)) ||
        (live.nameEn && normalizeMatchKey(c.nameEn) === normalizeMatchKey(live.nameEn)) ||
        normalizeMatchKey(c.nameAr) === normalizeMatchKey(live.nameAr)
    );

    const history: PriceHistoryEntry[] = Array.isArray(existing?.priceHistory)
      ? [...existing.priceHistory]
      : [];

    if (existing?.countryPrices) {
      for (const c of GCC_COUNTRIES) {
        const prevEntry = existing.countryPrices[c.code];
        const nextEntry = live.countryPrices[c.code];
        if (!prevEntry || !nextEntry) continue;
        const priceDiffers = prevEntry.price !== nextEntry.price;
        const availDiffers = prevEntry.availability !== nextEntry.availability;
        if (priceDiffers || availDiffers) {
          priceChanges += 1;
          history.push({
            recordedAt: syncedAt,
            countryCode: c.code,
            currency: nextEntry.currency || c.currency,
            previousPrice: prevEntry.price,
            newPrice: nextEntry.price,
            previousAvailability: prevEntry.availability,
            newAvailability: nextEntry.availability,
          });
        }
      }
    }

    const protectedFields = new Set(existing?.manuallyEditedFields || []);
    const conflictDetails: string[] = [];

    const resolveField = (
      field: typeof SYNC_PROTECTABLE_FIELDS[number],
      liveVal: string | undefined,
      existingVal: string | undefined,
      fallbackVal?: string
    ): string | undefined => {
      if (existing && protectedFields.has(field) && existingVal?.trim()) {
        if (liveVal && liveVal.trim() && liveVal.trim() !== existingVal.trim()) {
          conflictDetails.push(`${field}: المتجر يقترح "${liveVal.slice(0, 80)}" بينما النسخة اليدوية محفوظة`);
        }
        return existingVal;
      }
      return liveVal || existingVal || fallbackVal;
    };

    const resolvedNameAr = resolveField('nameAr', live.nameAr, existing?.nameAr, live.nameAr) || live.nameAr;
    const resolvedNameEn = resolveField('nameEn', live.nameEn, existing?.nameEn, catalogFallback?.nameEn);
    const resolvedDesc =
      resolveField('officialDescription', live.officialDescription, existing?.officialDescription, catalogFallback?.officialDescription) ||
      live.nameAr;
    const resolvedSize = resolveField('size', live.size, existing?.size, catalogFallback?.size);
    const resolvedAvail =
      resolveField('availability', live.availability, existing?.availability, 'يُتحقق عبر mashaer.store') ||
      'يُتحقق عبر mashaer.store';
    const resolvedSourceUrl = resolveField('sourceUrl', live.sourceUrl, existing?.sourceUrl, catalogFallback?.sourceUrl);

    if (conflictDetails.length > 0) {
      conflictCount += 1;
    }

    const mergedProduct: Product = {
      id: existing?.id || catalogFallback?.id || `prd_${live.slug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}`,
      sku: live.sku || existing?.sku || catalogFallback?.sku,
      nameAr: resolvedNameAr,
      nameEn: resolvedNameEn,
      category: live.category || existing?.category || 'perfumes',
      officialDescription: resolvedDesc,
      fragranceFamily: existing?.fragranceFamily || catalogFallback?.fragranceFamily,
      fragranceCharacter: existing?.fragranceCharacter || catalogFallback?.fragranceCharacter,
      perfumeType: existing?.perfumeType || catalogFallback?.perfumeType,
      sillage: existing?.sillage || catalogFallback?.sillage,
      longevity: existing?.longevity || catalogFallback?.longevity,
      occasionUsage: existing?.occasionUsage || catalogFallback?.occasionUsage,
      seasons: existing?.seasons || catalogFallback?.seasons,
      notesAndIngredients: existing?.notesAndIngredients || catalogFallback?.notesAndIngredients,
      topNotes: existing?.topNotes || catalogFallback?.topNotes,
      heartNotes: existing?.heartNotes || catalogFallback?.heartNotes,
      baseNotes: existing?.baseNotes || catalogFallback?.baseNotes,
      size: resolvedSize,
      availability: resolvedAvail,
      usageInstructions: existing?.usageInstructions || catalogFallback?.usageInstructions,
      extraInfo: existing?.extraInfo || catalogFallback?.extraInfo,
      internalNotes: existing?.internalNotes || catalogFallback?.internalNotes || 'متزامن مباشرة مع mashaer.store',
      companionGift: existing?.companionGift !== undefined ? existing.companionGift : catalogFallback?.companionGift,
      countryPrices: live.countryPrices,
      priceHistory: history.slice(-40),
      manuallyEditedFields: existing?.manuallyEditedFields,
      syncConflictNote: conflictDetails.length > 0 ? conflictDetails.join(' | ').slice(0, 950) : existing?.syncConflictNote,
      lastSyncedAt: syncedAt,
      syncStatus: conflictDetails.length > 0 ? 'sync_conflict' : 'synced_live',
      reviewStatus: existing?.reviewStatus || 'verified',
      sourceUrl: resolvedSourceUrl,
      sortOrder: existing?.sortOrder ?? catalogFallback?.sortOrder ?? idx + 1,
      updatedBy: actorEmail,
    };

    mergedResults.push(mergedProduct);

    if (serverRaw) {
      const prepared = prepareUnifiedProductUpdatePayload(serverRaw, mergedProduct, actorEmail, {
        fallbackSeed: catalogFallback,
      });
      batchOps.push({
        id: mergedProduct.id,
        mode: 'update',
        payload: prepared.payload,
      });
      updatedCount += 1;
    } else {
      const createPayload = prepareUnifiedProductCreatePayload(mergedProduct, actorEmail, catalogFallback);
      batchOps.push({
        id: mergedProduct.id,
        mode: 'set',
        payload: createPayload,
      });
      createdCount += 1;
    }
  }

  const commitRes = await commitProductWriteOpsWithIsolation(batchOps);
  const schemaUpgradePending = commitRes.failedItems.length > 0;
  if (commitRes.failedItems.length > 0 && commitRes.committedIds.length === 0) {
    throw new Error(
      `فشلت المزامنة مع Firestore (${commitRes.failedItems.map((f) => `${f.id}: ${f.reason}`).slice(0, 3).join(' | ')})`
    );
  }

  const syncStatusSummary = `تمت المزامنة (${mergedResults.length} منتج · تحديث ${updatedCount} · إضافة ${createdCount} · تعارضات محمية ${conflictCount} · تغيرات أسعار ${priceChanges}${commitRes.failedItems.length > 0 ? ` · تعذر ${commitRes.failedItems.length}` : ''})`;
  const nextSyncEntry: SyncHistoryEntry = {
    syncedAt,
    status: syncStatusSummary,
    productCount: mergedResults.length,
    updatedCount,
    createdCount,
    conflictCount,
    priceChanges,
    actorEmail,
  };
  const updatedSyncHistory = [...(previousSyncHistory || []), nextSyncEntry].slice(-30);

  if (isSensitiveAdminEmail(actorEmail)) {
    try {
      await setDoc(
        doc(db, 'site_settings', 'branding'),
        {
          lastStoreSyncAt: syncedAt,
          lastStoreSyncStatus: syncStatusSummary,
          syncHistory: updatedSyncHistory,
          updatedAt: serverTimestamp(),
          updatedBy: actorEmail,
        },
        { merge: true }
      );
      trackWrite(1);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'site_settings/branding');
    }
  }

  await tryLogAuditEventNonBlocking({
    section: 'دليل المنتجات',
    itemName: 'مزامنة مباشرة من mashaer.store',
    actionType: 'import',
    summary: syncStatusSummary,
  });

  return {
    syncedAt,
    updatedCount,
    createdCount,
    conflictCount,
    priceChanges,
    products: mergedResults,
    schemaUpgradePending,
  };
}

// ---------------------------------------------------------------------------
// Operational Systems + Isolated Credentials (Atomic writeBatch)
// ---------------------------------------------------------------------------
export async function saveSystemWithCredentials(
  linkInput: Omit<SystemLink, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  credInput: { usernameOrEmail: string; password: string },
  existingLink?: SystemLink,
  concurrency?: ConcurrencyOptions
): Promise<string> {
  const linkId = existingLink?.id || makeSafeDocId('sys');
  if (existingLink) {
    await checkOptimisticConflict(
      'system_links',
      linkId,
      concurrency || { expectedUpdatedAtMs: getUpdatedAtMs(existingLink.updatedAt) }
    );
  }

  const actorEmail = currentActorEmail();

  const linkData: Record<string, unknown> = {
    systemName: clampString(linkInput.systemName, FIELD_LIMITS.titleMax),
    url: clampString(linkInput.url, FIELD_LIMITS.urlMax),
    visibility: linkInput.visibility,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };
  if (linkInput.mainCategory?.trim() || existingLink) linkData.mainCategory = clampString(linkInput.mainCategory || '', 120);
  if (linkInput.subCategory?.trim() || existingLink) linkData.subCategory = clampString(linkInput.subCategory || '', 120);
  if (linkInput.loginMethod) linkData.loginMethod = linkInput.loginMethod;
  if (linkInput.systemStatus) linkData.systemStatus = linkInput.systemStatus;
  if (linkInput.otpNote?.trim() || existingLink) linkData.otpNote = clampString(linkInput.otpNote || '', 500);
  if (linkInput.publicUsername?.trim() || existingLink) linkData.publicUsername = clampString(linkInput.publicUsername || '', 300);
  if (linkInput.description?.trim() || existingLink) linkData.description = clampString(linkInput.description || '', 2000);
  if (linkInput.usageInstructions?.trim() || existingLink) linkData.usageInstructions = clampString(linkInput.usageInstructions || '', 3000);
  if (linkInput.notes?.trim() || existingLink) linkData.notes = clampString(linkInput.notes || '', 2000);
  if (typeof linkInput.sortOrder === 'number') linkData.sortOrder = linkInput.sortOrder;

  const credData: Record<string, unknown> = {
    linkId,
    usernameOrEmail: (credInput.usernameOrEmail ?? '').slice(0, FIELD_LIMITS.shortTextMax),
    password: (credInput.password ?? '').slice(0, FIELD_LIMITS.shortTextMax),
    visibility: linkInput.visibility,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };

  try {
    const batch = writeBatch(db);
    if (existingLink) {
      batch.update(doc(db, 'system_links', linkId), linkData);
      batch.set(doc(db, 'system_credentials', linkId), credData, { merge: false });
    } else {
      batch.set(doc(db, 'system_links', linkId), {
        ...linkData,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'system_credentials', linkId), credData);
    }
    await batch.commit();
    trackWrite(2);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `system_links/${linkId}`);
  }

  await tryLogAuditEventNonBlocking({
    section: 'روابط الأنظمة والتشغيل',
    itemName: linkInput.systemName,
    itemId: linkId,
    actionType: existingLink ? 'update' : 'create',
    summary: `${existingLink ? 'تحديث' : 'إضافة'} نظام تشغيل وبيانات الدخول المحمية: ${linkInput.systemName}`,
    previousValue: existingLink
      ? { systemName: existingLink.systemName, url: existingLink.url, visibility: existingLink.visibility }
      : undefined,
    newValue: {
      systemName: linkData.systemName,
      url: linkData.url,
      visibility: linkData.visibility,
      credentialsUpdated: true,
    },
  });
  return linkId;
}

export async function deleteSystemWithCredentials(link: SystemLink): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'system_credentials', link.id));
  batch.delete(doc(db, 'system_links', link.id));
  try {
    await batch.commit();
    trackDelete(2);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `system_links/${link.id}`);
  }
  await tryLogAuditEventNonBlocking({
    section: 'روابط الأنظمة والتشغيل',
    itemName: link.systemName,
    itemId: link.id,
    actionType: 'delete',
    summary: `حذف نظام التشغيل وبيانات الدخول الخاصة به: ${link.systemName}`,
    previousValue: { systemName: link.systemName, url: link.url },
  });
}

// ---------------------------------------------------------------------------
// Authorized Users (Sensitive Admins manage; 7 core admins protected)
// ---------------------------------------------------------------------------
export async function saveAuthorizedUser(
  input: Omit<AuthorizedUser, 'id' | 'emailKey' | 'createdAt' | 'updatedAt' | 'updatedBy'>,
  existing?: AuthorizedUser
): Promise<string> {
  const normalizedEmail = normalizeEmail(input.email);
  const emailKey = emailToKey(normalizedEmail);
  const actorEmail = currentActorEmail();

  const data: Record<string, unknown> = {
    email: clampString(normalizedEmail, FIELD_LIMITS.emailMax),
    emailKey,
    displayName: clampString(input.displayName, FIELD_LIMITS.displayNameMax),
    role: input.role,
    status: input.status,
    allowedSections: input.allowedSections.slice(0, 12),
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };
  if (input.notes?.trim() || existing) data.notes = clampString(input.notes || '', 500);

  try {
    if (existing) {
      await updateDoc(doc(db, 'authorized_users', emailKey), {
        displayName: data.displayName,
        role: data.role,
        status: data.status,
        allowedSections: data.allowedSections,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedAt: serverTimestamp(),
        updatedBy: actorEmail,
      });
      trackWrite(1);
    } else {
      await setDoc(doc(db, 'authorized_users', emailKey), {
        ...data,
        createdAt: serverTimestamp(),
      });
      trackWrite(1);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `authorized_users/${emailKey}`);
  }

  await tryLogAuditEventNonBlocking({
    section: 'إدارة المستخدمين',
    itemName: normalizedEmail,
    itemId: emailKey,
    actionType: existing ? 'update' : 'create',
    summary: existing
      ? `تحديث صلاحيات أو حالة المستخدم: ${normalizedEmail}`
      : `إضافة مستخدم مصرح له: ${normalizedEmail} (${input.role})`,
    ...(existing ? { previousValue: existing } : {}),
    newValue: data,
  });
  return emailKey;
}

export async function deleteAuthorizedEmployee(user: AuthorizedUser): Promise<void> {
  await deleteDocWithAudit('authorized_users', user.emailKey, 'إدارة المستخدمين', user.email, user);
}

// ---------------------------------------------------------------------------
// Per-User Personal Preferences (Theme, Dark/Light, Favorites, Shortcuts)
// ---------------------------------------------------------------------------
export async function saveUserPreferences(
  prefs: {
    themeId: string;
    themeMode: 'light' | 'dark';
    favoriteProducts: string[];
    favoriteSituations: string[];
    favoritePolicies: string[];
    dashboardShortcuts: StaffSectionId[];
  }
): Promise<void> {
  const email = currentActorEmail();
  const key = emailToKey(email);
  if (!key || !auth.currentUser?.email) return;

  const payload = {
    emailKey: key,
    themeId: clampString(prefs.themeId, 120) || 'mashaer_classic',
    themeMode: prefs.themeMode === 'dark' ? 'dark' : 'light',
    favoriteProducts: prefs.favoriteProducts.slice(0, 100),
    favoriteSituations: prefs.favoriteSituations.slice(0, 100),
    favoritePolicies: prefs.favoritePolicies.slice(0, 100),
    dashboardShortcuts: prefs.dashboardShortcuts.slice(0, 12),
    updatedAt: serverTimestamp(),
    updatedBy: email,
  };

  try {
    await setDoc(doc(db, 'user_preferences', key), payload);
    trackWrite(1);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `user_preferences/${key}`);
  }
}

// ---------------------------------------------------------------------------
// Site Settings (Sensitive Admins Only — Branding, UI Config, Defaults, Enabled Sections)
// ---------------------------------------------------------------------------
function sanitizeLogoPlacements(raw?: Partial<LogoPlacementsMap>): LogoPlacementsMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {} as LogoPlacementsMap;
  for (const slotId of LOGO_SLOT_IDS) {
    const def = DEFAULT_UI_CONFIG.logoPlacements[slotId];
    const src = raw[slotId];
    const bounds = LOGO_SLOT_DIMENSION_BOUNDS[slotId];
    const rawW = typeof src?.widthPx === 'number' ? src.widthPx : def.widthPx ?? 44;
    const rawH = typeof src?.heightPx === 'number' ? src.heightPx : def.heightPx ?? 44;
    out[slotId] = {
      enabled: typeof src?.enabled === 'boolean' ? src.enabled : def.enabled,
      imageUrl: typeof src?.imageUrl === 'string' ? clampString(src.imageUrl, 125000) : def.imageUrl,
      size: src?.size || def.size,
      widthPx: Math.round(clampNumber(rawW, bounds.min, bounds.maxWidth, def.widthPx ?? 44)),
      heightPx: Math.round(clampNumber(rawH, bounds.min, bounds.maxHeight, def.heightPx ?? 44)),
      lockAspectRatio:
        typeof src?.lockAspectRatio === 'boolean' ? src.lockAspectRatio : (def.lockAspectRatio ?? true),
      fitMode: src?.fitMode === 'cover' || src?.fitMode === 'contain' ? src.fitMode : (def.fitMode ?? 'contain'),
      align: src?.align || def.align,
      displayStyle: src?.displayStyle || def.displayStyle,
      showLabel: typeof src?.showLabel === 'boolean' ? src.showLabel : def.showLabel,
      labelText: clampString(src?.labelText ?? def.labelText ?? '', 80),
    };
  }
  return out;
}

function redactUiConfigForAudit(cfg?: Partial<SiteUiConfig> | null) {
  if (!cfg) return undefined;
  const redactedLogos: Partial<Record<LogoSlotId, Record<string, unknown>>> = {};
  if (cfg.logoPlacements) {
    for (const slotId of LOGO_SLOT_IDS) {
      const slot = cfg.logoPlacements[slotId];
      if (slot) {
        redactedLogos[slotId] = {
          ...slot,
          imageUrl: slot.imageUrl ? '[image]' : '',
        };
      }
    }
  }
  return {
    ...cfg,
    heroCoverUrl: cfg.heroCoverUrl ? '[image]' : '',
    logoPlacements: Object.keys(redactedLogos).length > 0 ? redactedLogos : undefined,
  };
}

function sanitizeUiConfig(raw?: Partial<SiteUiConfig> | null): Partial<SiteUiConfig> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const sanitized = stripUndefinedDeep({
    ...raw,
    heroTitle: raw.heroTitle !== undefined ? clampString(raw.heroTitle, 200) : undefined,
    heroKicker: raw.heroKicker !== undefined ? clampString(raw.heroKicker, 300) : undefined,
    heroDescription: raw.heroDescription !== undefined ? clampString(raw.heroDescription, 1000) : undefined,
    heroCoverUrl: raw.heroCoverUrl !== undefined ? clampString(raw.heroCoverUrl, FIELD_LIMITS.coverDataUrlMax) : undefined,
    logoPlacements: raw.logoPlacements ? sanitizeLogoPlacements(raw.logoPlacements) : undefined,
    typography: raw.typography ? sanitizeTypographyConfig(raw.typography) : undefined,
    homeCustomLinks: Array.isArray(raw.homeCustomLinks)
      ? raw.homeCustomLinks.slice(0, 10).map((item) => ({
          id: clampString(item.id || makeSafeDocId('link'), 80),
          label: clampString(item.label, 120),
          url: clampString(item.url, 500),
          ...(item.note ? { note: clampString(item.note, 200) } : {}),
        }))
      : undefined,
  });
  return sanitized as Partial<SiteUiConfig>;
}

export async function saveSiteBranding(
  settings: Partial<SiteBrandingSettings>,
  previous?: SiteBrandingSettings | null
): Promise<{ schemaUpgradePending: boolean }> {
  const actorEmail = currentActorEmail();
  const merged = { ...(previous || {}), ...settings };
  const payload: Record<string, unknown> = {
    systemName: clampString(merged.systemName || 'مشاعر | Mashaer Customer Care Hub', 200),
    heroTitle: clampString(merged.heroTitle || DEFAULT_UI_CONFIG.heroTitle, 200),
    heroSubtitle: clampString(merged.heroSubtitle || DEFAULT_UI_CONFIG.heroKicker, 300),
    heroDescription: clampString(merged.heroDescription || DEFAULT_UI_CONFIG.heroDescription, 1000),
    textPosition: merged.textPosition || 'right',
    showHeroText: merged.showHeroText ?? true,
    desktopTextSize: merged.desktopTextSize || 'lg',
    mobileTextSize: merged.mobileTextSize || 'md',
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };
  if (merged.logoDataUrl !== undefined) payload.logoDataUrl = clampString(merged.logoDataUrl, FIELD_LIMITS.logoDataUrlMax);
  if (merged.coverDataUrl !== undefined) payload.coverDataUrl = clampString(merged.coverDataUrl, FIELD_LIMITS.coverDataUrlMax);
  if (merged.themeMode) payload.themeMode = merged.themeMode;
  if (merged.accentTone) payload.accentTone = merged.accentTone;
  if (merged.activeThemeId) payload.activeThemeId = clampString(merged.activeThemeId, 120);
  if (merged.previousThemeId) payload.previousThemeId = clampString(merged.previousThemeId, 120);
  if (Array.isArray(merged.customThemes)) {
    payload.customThemes = stripUndefinedDeep(merged.customThemes.slice(0, 15));
  }
  const cleanUiConfig = sanitizeUiConfig(
    settings.uiConfig !== undefined
      ? settings.uiConfig
      : merged.uiConfig
  );
  if (cleanUiConfig) {
    payload.uiConfig = cleanUiConfig;
  }
  if (Array.isArray(merged.syncHistory)) {
    payload.syncHistory = stripUndefinedDeep(merged.syncHistory.slice(-30));
  }
  if (typeof merged.knowledgeSeedVersion === 'number') {
    payload.knowledgeSeedVersion = merged.knowledgeSeedVersion;
  }
  if (merged.lastStoreSyncAt) payload.lastStoreSyncAt = merged.lastStoreSyncAt;
  if (merged.lastStoreSyncStatus) payload.lastStoreSyncStatus = merged.lastStoreSyncStatus;
  if (Array.isArray(merged.enabledSections)) payload.enabledSections = merged.enabledSections.slice(0, 20);
  if (merged.wordImportedAt) payload.wordImportedAt = merged.wordImportedAt;
  if (typeof merged.wordImportCount === 'number') payload.wordImportCount = merged.wordImportCount;
  if (merged.pdfImportedAt) payload.pdfImportedAt = merged.pdfImportedAt;
  if (typeof merged.pdfImportCount === 'number') payload.pdfImportCount = merged.pdfImportCount;

  try {
    await setDoc(doc(db, 'site_settings', 'branding'), payload, { merge: true });
    trackWrite(1);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'site_settings/branding');
  }

  await tryLogAuditEventNonBlocking({
    section: 'إعدادات النظام',
    itemName: 'التصميم والواجهة والثيمات العامة',
    itemId: 'branding',
    actionType: 'update',
    summary: settings.activeThemeId
      ? `تحديث ثيم أو إعدادات الهوية العامة (${settings.activeThemeId})`
      : 'تحديث تصميم الواجهة والشعارات وعناصر الصفحة الرئيسية',
    previousValue: previous
      ? {
          ...previous,
          logoDataUrl: previous.logoDataUrl ? '[image]' : '',
          coverDataUrl: previous.coverDataUrl ? '[image]' : '',
          uiConfig: redactUiConfigForAudit(previous.uiConfig),
        }
      : undefined,
    newValue: {
      ...payload,
      logoDataUrl: payload.logoDataUrl ? '[image]' : '',
      coverDataUrl: payload.coverDataUrl ? '[image]' : '',
      uiConfig: redactUiConfigForAudit(cleanUiConfig),
    },
  });
  return { schemaUpgradePending: false };
}

export async function resetSiteDesignToDefaults(previous?: SiteBrandingSettings | null): Promise<void> {
  const actorEmail = currentActorEmail();
  const cleanDefaultUi = sanitizeUiConfig(DEFAULT_UI_CONFIG) || DEFAULT_UI_CONFIG;
  const payload: Record<string, unknown> = {
    systemName: 'مشاعر | Mashaer Customer Care Hub',
    coverDataUrl: '',
    heroTitle: DEFAULT_UI_CONFIG.heroTitle,
    heroSubtitle: DEFAULT_UI_CONFIG.heroKicker,
    heroDescription: DEFAULT_UI_CONFIG.heroDescription,
    textPosition: 'right',
    showHeroText: true,
    desktopTextSize: 'lg',
    mobileTextSize: 'md',
    uiConfig: cleanDefaultUi,
    updatedAt: serverTimestamp(),
    updatedBy: actorEmail,
  };

  try {
    await setDoc(doc(db, 'site_settings', 'branding'), payload, { merge: true });
    trackWrite(1);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'site_settings/branding');
  }

  await tryLogAuditEventNonBlocking({
    section: 'إعدادات النظام',
    itemName: 'استعادة الإعدادات الافتراضية للتصميم',
    itemId: 'branding',
    actionType: 'restore',
    summary: 'استعادة جميع عناصر التصميم والنصوص والأزرار والروابط إلى الإعدادات الافتراضية',
    previousValue: previous?.uiConfig,
    newValue: cleanDefaultUi,
  });
}

export async function saveCustomCategory(section: string, name: string): Promise<string> {
  const res = await createDocWithAudit('categories', 'cat', 'التصنيفات', name, {
    section: clampString(section, 100),
    name: clampString(name, 120),
  });
  return res.id;
}

export async function deleteCustomCategory(cat: CustomCategory): Promise<void> {
  await deleteDocWithAudit('categories', cat.id, 'التصنيفات', cat.name, cat);
}
