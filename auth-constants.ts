import type { CountryCode, RoleTier, SectionId, StaffSectionId } from '../types/hub';

/**
 * The 3 Sensitive System Administrators (Tier 1):
 * Authorized for ALL operational tools + sensitive tools (Audit Logs, Backup & Restore,
 * Users Management, System Settings & Security/Maintenance).
 * Note: 'mayadamashaer@gmail.com' was verified via the active authenticated session metadata
 * and existing project configuration (completing the truncated 'mayadamashaer@gmail' reference).
 */
export const SENSITIVE_ADMIN_EMAILS: readonly string[] = [
  'sararefaat79@gmail.com',
  's.refaat@mashaer.store',
  'mayadamashaer@gmail.com',
];

/**
 * The 4 Operational Administrators (Tier 2):
 * Full CRUD over operational sections (products, perfumes, situations, inquiries,
 * canned responses, policies, return workflow, quick phrases, alerts, systems, categories).
 * Strictly blocked from sensitive tools (audit, backup, users, settings).
 */
export const OPERATIONAL_ADMIN_EMAILS: readonly string[] = [
  'rawi@mashaer.store',
  'a.ayman@mashaer.store',
  'abdoun@mashaer.store',
  'a.ashry@mashaer.store',
];

/**
 * All 7 core administrators of Mashaer Customer Care Hub.
 */
export const CORE_ADMIN_EMAILS: readonly string[] = [
  ...SENSITIVE_ADMIN_EMAILS,
  ...OPERATIONAL_ADMIN_EMAILS,
];

export const SENSITIVE_SECTIONS: SectionId[] = ['audit', 'backup', 'users', 'settings'];

export const ALL_STAFF_SECTIONS: StaffSectionId[] = [
  'home',
  'responses',
  'inquiries',
  'policies',
  'situations',
  'returns',
  'products',
  'systems',
];

export const SECTION_LABELS: Record<string, string> = {
  home: 'الصفحة الرئيسية',
  responses: 'مكتبة الردود الجاهزة',
  inquiries: 'استفسارات العملاء',
  policies: 'السياسات والإجراءات',
  situations: 'دليل المواقف',
  returns: 'مسار المرتجع والاسترداد',
  products: 'دليل المنتجات والأسعار الخليجية',
  systems: 'روابط الأنظمة والتشغيل',
  audit: 'سجل التعديلات',
  backup: 'النسخ الاحتياطي والاستعادة',
  users: 'إدارة المستخدمين',
  settings: 'إعدادات النظام',
};

export const ROLE_LABELS: Record<RoleTier, string> = {
  sensitive_admin: 'مدير نظام حساس (Tier 1)',
  operational_admin: 'مدير تشغيلي (Tier 2)',
  employee: 'موظف خدمة عملاء',
};

export const GCC_COUNTRIES: ReadonlyArray<{
  code: CountryCode;
  nameAr: string;
  currency: string;
  currencyAr: string;
  storePrefix: string;
}> = [
  { code: 'KW', nameAr: 'الكويت', currency: 'KWD', currencyAr: 'د.ك', storePrefix: 'ar-kw' },
  { code: 'SA', nameAr: 'السعودية', currency: 'SAR', currencyAr: 'ر.س', storePrefix: 'ar-sa' },
  { code: 'AE', nameAr: 'الإمارات', currency: 'AED', currencyAr: 'د.إ', storePrefix: 'ar-ae' },
  { code: 'QA', nameAr: 'قطر', currency: 'QAR', currencyAr: 'ر.ق', storePrefix: 'ar-qa' },
  { code: 'BH', nameAr: 'البحرين', currency: 'BHD', currencyAr: 'د.ب', storePrefix: 'ar-bh' },
  { code: 'OM', nameAr: 'عمان', currency: 'OMR', currencyAr: 'ر.ع', storePrefix: 'ar-om' },
];

export const RESPONSE_CATEGORIES: string[] = [
  'الترحيب',
  'الطلبات',
  'الدفع',
  'الشحن والتوصيل',
  'الاسترجاع والاستبدال',
  'الاسترداد المالي',
  'المنتجات',
  'العروض',
  'المحافظ',
  'الضمان',
  'الشكاوى',
  'إنهاء المحادثة',
];

export const WORD_INQUIRY_CATEGORIES: string[] = [
  'أسئلة عامة عن العطور',
  'أسعار العطور وضريبة السعودية',
  'مكونات العطور',
  'ترشيحات حسب الذوق والاستخدام',
  'مقارنة العطور',
  'الثبات والفوحان',
  'أسئلة الحساسية والجيوب الأنفية',
  'التخزين والحرارة',
  'الضمان والاستبدال والاسترجاع',
  'أسئلة أخرى متكررة',
  'جدول الترشيح السريع',
];

export const POLICY_CATEGORIES: string[] = [
  'الضمان الذهبي',
  'الاسترجاع والاستبدال',
  'الاسترداد المالي',
  'الشحن والتوصيل',
  'الدفع عند الاستلام',
  'طرق الدفع',
  'تابي وتمارا وApple Pay',
  'الضرائب وضريبة القيمة المضافة',
  'الطلبات والتجهيز',
  'الإلغاء والتعديل',
  'المنتجات التالفة والناقصة',
  'الشكاوى والتعويض',
  'الحساسية والجودة',
  'سياسة الخصوصية والأمان',
  'العروض والأكواد',
  'المحفظة',
  'ضمان Sovereign',
  'بوتيكات والبيع الإلكتروني',
  'أخرى',
];

export const SYSTEM_CATEGORIES: string[] = [
  'المتجر والمنصات',
  'أنظمة الطلبات',
  'بوابات الدفع الإلكتروني',
  'بوابات الدفع والتقسيط',
  'شركات الشحن والتوصيل',
  'خدمة العملاء والواتساب',
  'منصات التواصل',
  'أدوات العمل',
  'مواقع الشركة',
  'أنظمة داخلية',
];

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function emailToKey(email: string | null | undefined): string {
  return normalizeEmail(email).replace(/[^a-z0-9_-]/g, '_');
}

export function isSensitiveAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return SENSITIVE_ADMIN_EMAILS.includes(normalized);
}

export function isCoreAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return CORE_ADMIN_EMAILS.includes(normalized);
}

export function resolveRoleTier(email: string | null | undefined): RoleTier {
  const normalized = normalizeEmail(email);
  if (SENSITIVE_ADMIN_EMAILS.includes(normalized)) return 'sensitive_admin';
  if (OPERATIONAL_ADMIN_EMAILS.includes(normalized)) return 'operational_admin';
  return 'employee';
}
