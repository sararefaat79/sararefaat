export const FIELD_LIMITS = {
  idMax: 128,
  idPattern: /^[a-zA-Z0-9_-]+$/,
  emailMax: 200,
  displayNameMax: 120,
  titleMax: 200,
  categoryMax: 120,
  shortTextMax: 300,
  urlMax: 500,
  notesMax: 2000,
  contentMax: 5000,
  inquiryQuestionMax: 2000,
  inquiryAnswerMax: 8000,
  policyContentMax: 10000,
  situationFieldMax: 4000,
  productDescMax: 4000,
  logoDataUrlMax: 350000,
  coverDataUrlMax: 450000,
  auditTextMax: 8000,
} as const;

export function clampString(val: string | undefined | null, maxLen: number): string {
  const clean = (val ?? '').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen);
}

export function makeSafeDocId(prefix = 'doc'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'doc';
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${cleanPrefix}_${ts}_${rand}`.slice(0, FIELD_LIMITS.idMax);
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h_${(hash >>> 0).toString(16)}`;
}

/**
 * Compresses an uploaded image file onto a canvas so it fits comfortably inside
 * Firestore's 1MB document limit (max ~240KB Data URL) without requiring Firebase Storage.
 */
export async function compressImageToDataUrl(
  file: File,
  maxWidth: number,
  maxBytes: number
): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
      el.src = bitmapUrl;
    });

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذر تهيئة معالج الصور.');
    ctx.drawImage(img, 0, 0, width, height);

    const qualities = [0.82, 0.68, 0.52, 0.38];
    for (const q of qualities) {
      const dataUrl = canvas.toDataURL('image/webp', q);
      if (dataUrl.length <= maxBytes) {
        return dataUrl;
      }
    }
    const fallbackJpg = canvas.toDataURL('image/jpeg', 0.35);
    if (fallbackJpg.length <= maxBytes) {
      return fallbackJpg;
    }
    throw new Error('حجم الصورة كبير حتى بعد الضغط. يُرجى اختيار صورة أصغر أو استخدام رابط HTTPS.');
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}
