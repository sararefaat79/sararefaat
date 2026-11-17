import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function parseFriendlyFirestoreError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('Quota exceeded')) {
    return 'تم تجاوز الحصة اليومية المجانية لقاعدة البيانات (Quota exceeded). سيتم إعادة التعيين تلقائياً في اليوم التالي.';
  }
  if (raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    return 'ليس لديك صلاحية تنفيذ هذه العملية أو أن الحساب غير مصرح له.';
  }
  if (raw.includes('the client is offline') || raw.includes('unavailable')) {
    return 'تعذر الاتصال بقاعدة البيانات. يُرجى التحقق من اتصال الإنترنت وإعادة المحاولة.';
  }
  try {
    const parsed = JSON.parse(raw) as FirestoreErrorInfo;
    if (parsed?.error) {
      if (parsed.error.includes('permission-denied') || parsed.error.includes('Missing or insufficient permissions')) {
        return 'تم رفض العملية من قواعد الأمان (صلاحيات غير كافية أو حقول غير مكتملة).';
      }
      return parsed.error;
    }
  } catch {
    // not JSON
  }
  return raw;
}

export function parseFriendlyAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/unauthorized-domain':
      return `النطاق الحالي (${host || 'unknown'}) غير مضاف إلى النطاقات المصرح بها (Authorized Domains) في Firebase Authentication للمشروع. يُرجى إضافته من لوحة Firebase أو ربط المشروع لإتمام تسجيل الدخول.`;
    case 'auth/popup-blocked':
      return 'تم حظر نافذة تسجيل الدخول المنبثقة من المتصفح. يُرجى السماح بالنوافذ المنبثقة (Popups) لهذا الموقع والمحاولة مرة أخرى.';
    case 'auth/popup-closed-by-user':
      return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام المصادقة. يُرجى المحاولة مرة أخرى وإكمال اختيار حساب Google.';
    case 'auth/cancelled-popup-request':
      return 'تم إلغاء طلب تسجيل الدخول السابق بسبب محاولة جديدة. يُرجى الانتظار والمحاولة مرة واحدة.';
    case 'auth/network-request-failed':
      return 'تعذر الاتصال بخوادم المصادقة. يُرجى التحقق من اتصال الإنترنت وإعادة المحاولة.';
    case 'auth/operation-not-allowed':
      return 'تسجيل الدخول عبر Google غير مفعّل في إعدادات Firebase Authentication لهذا المشروع.';
    case 'auth/user-disabled':
      return 'تم تعطيل هذا الحساب في نظام المصادقة.';
    case 'auth/too-many-requests':
      return 'تم إرسال عدد كبير من محاولات تسجيل الدخول. يُرجى الانتظار قليلاً ثم المحاولة مرة أخرى.';
    default: {
      const friendly = parseFriendlyFirestoreError(err);
      if (code) {
        return `تعذر إتمام تسجيل الدخول عبر Google (${code}): ${friendly}`;
      }
      return friendly || 'تعذر إتمام تسجيل الدخول عبر Google. يُرجى المحاولة مرة أخرى.';
    }
  }
}

export async function testFirestoreConnection(): Promise<{ ok: boolean; offline: boolean }> {
  try {
    await getDocFromServer(doc(db, 'site_settings', 'branding'));
    return { ok: true, offline: false };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { ok: false, offline: true };
    }
    return { ok: true, offline: false };
  }
}
