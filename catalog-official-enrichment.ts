import { collection, getDocsFromServer } from 'firebase/firestore';
import { auth, db } from './firebase';
import { tryLogAuditEventNonBlocking } from './audit';
import { MASHAER_STORE_CATALOG } from './attached-pdfs-data';
import {
  commitProductWriteOpsWithIsolation,
  fetchAllRawProductsFromServer,
  type ProductBatchWriteOp,
} from './firestore-service';
import { prepareUnifiedProductUpdatePayload } from './product-integrity';
import { trackRead } from './quota-monitor';
import { clampString } from './validation';
import {
  composeExtendedGuidance,
  extractExtendedGuidance,
  extractLinkedAlternativesFromNotes,
  mergeInternalNotesWithMetadata,
  stripSystemMarkers,
  type FieldProvenanceEntry,
} from './product-utils';
import type { Product } from '../types/hub';

export interface OfficialSkuEnrichmentSpec {
  sku: string;
  preferredId: string;
  nameAr: string;
  fragranceFamily: string;
  fragranceCharacter: string;
  perfumeType: string;
  concentration: string;
  topNotes: string;
  heartNotes: string;
  baseNotes: string;
  notesAndIngredients: string;
  longevity: string;
  sillage: string;
  sillageReach: string;
  sillageDuration: string;
  usageType: string;
  occasionUsage: string;
  seasons: string;
  timeOfDay: string;
  targetAudience: string;
  layeringSuggestions: string;
  /** Extra non-destructively appended note if missing (e.g., Sovereign 12ml musk gift) */
  appendExtraNoteIfMissing?: string;
  /** Fields whose values are explicitly marked as estimation vs official spec */
  estimatedFields: Array<
    | 'longevity'
    | 'sillage'
    | 'sillageReach'
    | 'seasons'
    | 'timeOfDay'
    | 'occasionUsage'
  >;
}

const STAMP_DATE = '2026-11-15';

export const OFFICIAL_CATALOG_ENRICHMENT_SPECS: OfficialSkuEnrichmentSpec[] = [
  {
    sku: 'PRD-002',
    preferredId: 'prd_president',
    nameAr: 'عطر الرئيس',
    fragranceFamily: 'خشبية زهرية',
    fragranceCharacter: 'دافئ، زهري، خشبي، أنيق',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'التين، الورد الإيطالي',
    heartNotes: 'مسك الروم',
    baseNotes: 'خشب الصندل، الفانيليا',
    notesAndIngredients: 'خشب الصندل، مسك الروم، الورد الإيطالي، التين، الفانيليا',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'رسمي، مناسبات، اجتماعات',
    occasionUsage: 'المناسبات الراقية والاجتماعات والزيارات الرسمية',
    seasons: 'ترشيح تقديري للربيع والخريف',
    timeOfDay: 'نهاري ومسائي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الزهرية الدافئة والخشبية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-044',
    preferredId: 'prd_sovereign',
    nameAr: 'عطر السيادة',
    fragranceFamily: 'شرقية جلدية خشبية',
    fragranceCharacter: 'فاخر، دافئ، زعفراني، مدخن',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الزعفران، الشاي المعتّق',
    heartNotes: 'شمع العسل، خشب فيرجينيا',
    baseNotes: 'الجلد المدخن',
    notesAndIngredients: 'الزعفران، الشاي المعتّق، شمع العسل، خشب فيرجينيا، الجلد المدخن',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'رسمي ومناسبات خاصة وسهرات',
    occasionUsage: 'المناسبات الراقية والاجتماعات والسهرات',
    seasons: 'الخريف والشتاء (ترشيح تقديري)',
    timeOfDay: 'مسائي وليلي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الشرقية الجلدية العميقة',
    layeringSuggestions: 'غير محدد',
    appendExtraNoteIfMissing: 'يتضمن هدية مسك 12ml عند توفر العرض.',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-042',
    preferredId: 'prd_historic',
    nameAr: 'عطر هيستوريك',
    fragranceFamily: 'جلدية خشبية عنبرية',
    fragranceCharacter: 'راقٍ، جلدي، دافئ، عميق',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'زيت اللوز',
    heartNotes: 'الجلد، أخشاب أكيجالا',
    baseNotes: 'العنبر الرمادي',
    notesAndIngredients: 'العنبر الرمادي، الجلد، زيت اللوز، أخشاب أكيجالا',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'رسمي ومناسبات',
    occasionUsage: 'المناسبات الراقية والاجتماعات',
    seasons: 'الخريف والشتاء (ترشيح تقديري)',
    timeOfDay: 'مسائي وليلي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الجلدية والعنبرية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-036',
    preferredId: 'prd_nova',
    nameAr: 'عطر نوفا',
    fragranceFamily: 'خشبية توابلية',
    fragranceCharacter: 'دافئ، عصري، متوازن، مائل للحلاوة',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الهيل، التين',
    heartNotes: 'الكستناء، الأرز',
    baseNotes: 'التونكا، خشب الصندل',
    notesAndIngredients: 'الهيل، التين، الكستناء، الأرز، التونكا، خشب الصندل',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وعملي ومتعدد',
    occasionUsage: 'الخروجات والزيارات والاستخدام اليومي',
    seasons: 'الخريف والشتاء والربيع (ترشيح تقديري)',
    timeOfDay: 'نهاري ومسائي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح العصرية الدافئة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-057',
    preferredId: 'prd_iconic',
    nameAr: 'عطر أيكونك',
    fragranceFamily: 'أروماتيك توابلية دخانية',
    fragranceCharacter: 'نيش، عصري، دخاني، بوزي',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الماندرين الذهبي، بذور النجوم',
    heartNotes: 'السوسن، النفحة الكحولية',
    baseNotes: 'التونكا المحمصة، النفحة الدخانية',
    notesAndIngredients: 'الماندرين الذهبي، بذور النجوم، السوسن، النفحة الكحولية، التونكا المحمصة، النفحة الدخانية',
    longevity: 'غير محدد',
    sillage: 'متوسط إلى واضح (تقدير وصفي حسب وصف المنتج)',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي مميز، سهرات، مناسبات',
    occasionUsage: 'الخروجات والسهرات والمناسبات الخاصة',
    seasons: 'الخريف والشتاء (ترشيح تقديري)',
    timeOfDay: 'مسائي وليلي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح المختلفة والدخانية والعطور النيش، وخاصة الشباب',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['sillage', 'seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-001',
    preferredId: 'prd_vero',
    nameAr: 'عطر فيرو',
    fragranceFamily: 'زهرية عنبرية مسكية',
    fragranceCharacter: 'حلو، دافئ، غني، واضح الحضور',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'العسل، الورد',
    heartNotes: 'الباتشولي، العنبر',
    baseNotes: 'خشب الصندل، الفانيليا، المسك',
    notesAndIngredients: 'العسل، الورد، الباتشولي، العنبر، خشب الصندل، الفانيليا، المسك',
    longevity: 'غير محدد',
    sillage: 'قوي جداً (وفق وصف المنتج بأنه الأقوى فوحاناً)',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'متعدد، يومي ومناسبات',
    occasionUsage: 'الزيارات والخروجات والمناسبات',
    seasons: 'الخريف والشتاء والربيع (ترشيح تقديري)',
    timeOfDay: 'نهاري ومسائي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الزهرية الحلوة والعنبرية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-058',
    preferredId: 'prd_lady',
    nameAr: 'ليدي',
    fragranceFamily: 'زهرية بودرية مسكية',
    fragranceCharacter: 'ناعم، أنثوي، منعش، بودري',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الماندرين، أطراف الورد',
    heartNotes: 'البنفسج، اللوز',
    baseNotes: 'المسك، خشب الصندل',
    notesAndIngredients: 'الماندرين، أطراف الورد، البنفسج، اللوز، المسك، خشب الصندل',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وعملي وخروجات',
    occasionUsage: 'العمل والزيارات والخروجات',
    seasons: 'الربيع والصيف (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري (ترشيح تقديري)',
    targetAudience: 'نسائي، لمحبات الروائح الناعمة والمنعشة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-043',
    preferredId: 'prd_the_one',
    nameAr: 'عطر ذا ون',
    fragranceFamily: 'بحرية فاكهية زهرية',
    fragranceCharacter: 'منعش، حلو، ناعم، دافئ',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'نسيم البحر',
    heartNotes: 'الفواكه الدافئة، الزهور البيضاء',
    baseNotes: 'السكر المطبوخ',
    notesAndIngredients: 'نسيم البحر، الفواكه الدافئة، الزهور البيضاء، السكر المطبوخ',
    longevity: 'غير محدد',
    sillage: 'أهدى من الرئيس وفق المقارنة الواردة (دون مستوى رقمي مطلق)',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وعملي وخروجات',
    occasionUsage: 'العمل والزيارات والخروجات',
    seasons: 'الربيع والصيف (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري (ترشيح تقديري)',
    targetAudience: 'لمحبي العطور المنعشة مع لمسة حلاوة دافئة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-025',
    preferredId: 'prd_empire',
    nameAr: 'عطر إمباير',
    fragranceFamily: 'شرقية خشبية جلدية',
    fragranceCharacter: 'فاخر، جاف، دافئ، قوي الشخصية',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'البرغموت، الفلفل الوردي',
    heartNotes: 'الأرز، الباتشولي',
    baseNotes: 'العود، الجلد، العنبر الجاف',
    notesAndIngredients: 'البرغموت، الفلفل الوردي، الأرز، الباتشولي، العود، الجلد، العنبر الجاف',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'رسمي، مناسبات، سهرات',
    occasionUsage: 'الاجتماعات الرسمية والسهرات والمناسبات الراقية',
    seasons: 'الخريف والشتاء (ترشيح تقديري)',
    timeOfDay: 'مسائي وليلي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الشرقية الخشبية والجلدية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-040',
    preferredId: 'prd_different',
    nameAr: 'عطر مختلف',
    fragranceFamily: 'فاكهية زهرية خشبية عنبرية',
    fragranceCharacter: 'فواح، مميز، متوازن، واضح الشخصية',
    perfumeType: 'عطر بخاخ للجنسين',
    concentration: 'EDP',
    topNotes: 'البرغموت، التوت',
    heartNotes: 'الورد',
    baseNotes: 'خشب الصندل، العنبر',
    notesAndIngredients: 'البرغموت، التوت، الورد، خشب الصندل، العنبر',
    longevity: 'غير محدد',
    sillage: 'فواح وأوضح من العطور الصيفية الخفيفة (وصفي بدون مستوى قطعي)',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي ومناسبات وخروجات',
    occasionUsage: 'الزيارات والخروجات والمناسبات',
    seasons: 'الربيع والخريف (ترشيح تقديري)',
    timeOfDay: 'نهاري ومسائي (ترشيح تقديري)',
    targetAudience: 'للجنسين ولمحبي الروائح الفاكهية الزهرية ذات الحضور الواضح',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-037',
    preferredId: 'prd_chairman',
    nameAr: 'عطر شيرمان',
    fragranceFamily: 'خشبية زعفرانية',
    fragranceCharacter: 'دافئ، فاخر، ناعم، كشميري',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الزعفران بالكراميل',
    heartNotes: 'الكشمير',
    baseNotes: 'الأخشاب النادرة',
    notesAndIngredients: 'الزعفران بالكراميل، الكشمير، الأخشاب النادرة',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'رسمي، اجتماعات، مناسبات خاصة',
    occasionUsage: 'الاجتماعات والإطلالات الرسمية والمناسبات الراقية',
    seasons: 'الخريف والشتاء (ترشيح تقديري)',
    timeOfDay: 'مسائي وليلي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الخشبية الدافئة والزعفران',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-009',
    preferredId: 'prd_cloud',
    nameAr: 'عطر كلاود',
    fragranceFamily: 'أروماتيك خشبية توابلية',
    fragranceCharacter: 'منعش، نظيف، شبابي، متوازن',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الهيل، أوراق البنفسج',
    heartNotes: 'العنبر',
    baseNotes: 'خشب الأرز',
    notesAndIngredients: 'الهيل، أوراق البنفسج، العنبر، خشب الأرز',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وعملي ومتعدد',
    occasionUsage: 'العمل والنادي والخروجات والزيارات',
    seasons: 'الصيف والربيع (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري وطوال اليوم (ترشيح تقديري)',
    targetAudience: 'الرجال والشباب ومحبو الروائح المنعشة النظيفة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-004',
    preferredId: 'prd_vaya',
    nameAr: 'عطر فايا',
    fragranceFamily: 'زهرية فاكهية مسكية',
    fragranceCharacter: 'أنثوي، ناعم، منعش، متوازن',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'البرغموت، اللافندر',
    heartNotes: 'الياسمين، زهر البرتقال',
    baseNotes: 'المسك، التين، الفانيليا',
    notesAndIngredients: 'البرغموت، اللافندر، الياسمين، زهر البرتقال، المسك، التين، الفانيليا',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وعملي وخروجات',
    occasionUsage: 'العمل والزيارات والخروجات',
    seasons: 'الربيع والصيف (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري (ترشيح تقديري)',
    targetAudience: 'نسائي، لمحبات الروائح الزهرية الفاكهية الناعمة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-003',
    preferredId: 'prd_tiffany',
    nameAr: 'عطر تيفاني',
    fragranceFamily: 'زهرية حمضية منعشة',
    fragranceCharacter: 'هادئ، منعش، ناعم، نظيف',
    perfumeType: 'عطر بخاخ',
    concentration: 'EDP',
    topNotes: 'الماندرين، اللافندر، الليمون',
    heartNotes: 'الياسمين، زنبق الوادي',
    baseNotes: 'المسك، العنبر الجاف، التونكا',
    notesAndIngredients: 'الماندرين، اللافندر، الليمون، الياسمين، زنبق الوادي، المسك، العنبر الجاف، التونكا',
    longevity: 'غير محدد',
    sillage: 'أهدى مقارنة بالعطور الثقيلة حسب الوصف (دون تحديد مستوى مطلق)',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وعملي',
    occasionUsage: 'العمل والزيارات والخروجات اليومية',
    seasons: 'الصيف والربيع (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري (ترشيح تقديري)',
    targetAudience: 'لمحبي العطور المنعشة الهادئة والروائح غير الحارة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-041',
    preferredId: 'prd_empire_chairman',
    nameAr: 'امباير & شيرمان',
    fragranceFamily: 'شرقية خشبية جلدية',
    fragranceCharacter: 'فاخر، دافئ، جلدي، خشبي، زعفراني',
    perfumeType: 'مجموعة عطور',
    concentration: 'EDP للعطور البخاخة داخل المجموعة',
    topNotes: 'البرغموت، الزعفران، الفلفل الوردي',
    heartNotes: 'الكشمير، الأرز، الباتشولي',
    baseNotes: 'العود، الجلد، العنبر، الأخشاب النادرة',
    notesAndIngredients: 'البرغموت، الزعفران، الفلفل الوردي، الكشمير، الأرز، الباتشولي، العود، الجلد، العنبر، الأخشاب النادرة',
    longevity: 'تقديري: 8 إلى 10 ساعات حسب البيانات المسجلة',
    sillage: 'قوي (حسب البيانات المسجلة للمنتج)',
    sillageReach: 'معتدل إلى واسع حسب البيانات المتاحة',
    sillageDuration: 'غير محدد',
    usageType: 'رسمي، مناسبات، سهرات',
    occasionUsage: 'الاجتماعات والسهرات والمناسبات الراقية',
    seasons: 'الخريف والشتاء (ترشيح تقديري)',
    timeOfDay: 'مسائي وليلي (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الشرقية الخشبية والجلدية الفاخرة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['longevity', 'sillageReach', 'seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-034',
    preferredId: 'prd_spray_white_dandy',
    nameAr: 'ALL OVER SPRAY WHITE DANDY',
    fragranceFamily: 'زهرية فاكهية مسكية',
    fragranceCharacter: 'منعش، ناعم، حلو',
    perfumeType: 'بخاخ جسم وشعر',
    concentration: 'غير منطبق – بخاخ جسم وشعر',
    topNotes: 'الماندرين، الكشمش الأسود، زهر البرتقال',
    heartNotes: 'الورد، زنبق الوادي',
    baseNotes: 'خشب الصندل، الفانيليا، المسك',
    notesAndIngredients: 'الماندرين، الكشمش الأسود، زهر البرتقال، الورد، زنبق الوادي، خشب الصندل، الفانيليا، المسك',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي وانتعاش الجسم والشعر',
    occasionUsage: 'الاستخدام اليومي والخروجات',
    seasons: 'الربيع والصيف (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح الزهرية الفاكهية الناعمة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-033',
    preferredId: 'prd_spray_black_dandy',
    nameAr: 'ALL OVER SPRAY BLACK DANDY',
    fragranceFamily: 'خشبية مسكية عنبرية',
    fragranceCharacter: 'دافئ، نظيف، مسكي',
    perfumeType: 'بخاخ جسم وشعر',
    concentration: 'غير منطبق – بخاخ جسم وشعر',
    topNotes: 'أوراق الآس (الميرتل)',
    heartNotes: 'الباتشولي',
    baseNotes: 'المسك، العنبر',
    notesAndIngredients: 'أوراق الآس (الميرتل)، الباتشولي، المسك، العنبر',
    longevity: 'غير محدد',
    sillage: 'غير محدد',
    sillageReach: 'غير محدد',
    sillageDuration: 'غير محدد',
    usageType: 'يومي، بعد الاستحمام، والانتعاش',
    occasionUsage: 'الاستخدام اليومي والخروجات',
    seasons: 'الخريف والربيع (ترشيح تقديري)',
    timeOfDay: 'صباحي ونهاري وطوال اليوم (ترشيح تقديري)',
    targetAudience: 'لمحبي الروائح المسكية والخشبية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['seasons', 'timeOfDay', 'occasionUsage'],
  },
  {
    sku: 'PRD-038',
    preferredId: 'prd_mamoul_silver',
    nameAr: 'MAMOUL SILVER',
    fragranceFamily: 'شرقية خشبية',
    fragranceCharacter: 'دافئ، خشبي، فاخر',
    perfumeType: 'معمول/بخور',
    concentration: 'غير منطبق – معمول/بخور',
    topNotes: 'الزعفران',
    heartNotes: 'الباتشولي، خشب الصندل',
    baseNotes: 'العود',
    notesAndIngredients: 'زيوت عطرية نيش: الزعفران، الباتشولي، خشب الصندل، العود',
    longevity: 'غير منطبق كقياسات عطر بخاخ',
    sillage: 'غير منطبق كقياسات عطر بخاخ',
    sillageReach: 'غير منطبق كقياسات عطر بخاخ',
    sillageDuration: 'غير محدد',
    usageType: 'تبخير المنزل والملابس',
    occasionUsage: 'المجالس والزيارات والمناسبات',
    seasons: 'غير محدد',
    timeOfDay: 'غير محدد',
    targetAudience: 'لمحبي البخور والروائح الشرقية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['occasionUsage'],
  },
  {
    sku: 'PRD-056',
    preferredId: 'prd_mamoul_black',
    nameAr: 'MAMOUL BLACK',
    fragranceFamily: 'شرقية زهرية خشبية',
    fragranceCharacter: 'دافئ، غني، شرقي',
    perfumeType: 'معمول/بخور',
    concentration: 'غير منطبق – معمول/بخور',
    topNotes: 'الورد',
    heartNotes: 'العنبر',
    baseNotes: 'العود',
    notesAndIngredients: 'زيوت عطرية نيش: الورد، العنبر، العود',
    longevity: 'غير منطبق كقياسات عطر بخاخ',
    sillage: 'غير منطبق كقياسات عطر بخاخ',
    sillageReach: 'غير منطبق كقياسات عطر بخاخ',
    sillageDuration: 'غير محدد',
    usageType: 'تبخير المنزل والمجالس',
    occasionUsage: 'المجالس والزيارات والمناسبات الخاصة',
    seasons: 'غير محدد',
    timeOfDay: 'غير محدد',
    targetAudience: 'لمحبي البخور والروائح الشرقية',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['occasionUsage'],
  },
  {
    sku: 'PRD-039',
    preferredId: 'prd_mamoul_gold',
    nameAr: 'MAMOUL GOLD',
    fragranceFamily: 'شرقية زهرية خشبية عنبرية',
    fragranceCharacter: 'فاخر، دافئ، شرقي',
    perfumeType: 'معمول/بخور',
    concentration: 'غير منطبق – معمول/بخور',
    topNotes: 'الورد',
    heartNotes: 'خشب الأرز',
    baseNotes: 'العود، العنبر',
    notesAndIngredients: 'زيوت عطرية نيش: الورد، خشب الأرز، العود، العنبر',
    longevity: 'غير منطبق كقياسات عطر بخاخ',
    sillage: 'غير منطبق كقياسات عطر بخاخ',
    sillageReach: 'غير منطبق كقياسات عطر بخاخ',
    sillageDuration: 'غير محدد',
    usageType: 'تبخير المنزل والمجالس',
    occasionUsage: 'المجالس والزيارات والمناسبات',
    seasons: 'غير محدد',
    timeOfDay: 'غير محدد',
    targetAudience: 'لمحبي البخور والروائح الشرقية الدافئة',
    layeringSuggestions: 'غير محدد',
    estimatedFields: ['occasionUsage'],
  },
];

export const OFFICIAL_CATALOG_ENRICHMENT_BY_SKU = new Map<string, OfficialSkuEnrichmentSpec>(
  OFFICIAL_CATALOG_ENRICHMENT_SPECS.map((spec) => [spec.sku.trim().toUpperCase(), spec])
);

export function normalizeSkuKey(sku?: string | null): string {
  return (sku || '').trim().toUpperCase();
}

export function findOfficialEnrichmentSpecForProduct(
  product: Pick<Product, 'sku' | 'id'>
): OfficialSkuEnrichmentSpec | undefined {
  const skuKey = normalizeSkuKey(product.sku);
  if (skuKey && OFFICIAL_CATALOG_ENRICHMENT_BY_SKU.has(skuKey)) {
    return OFFICIAL_CATALOG_ENRICHMENT_BY_SKU.get(skuKey);
  }
  return OFFICIAL_CATALOG_ENRICHMENT_SPECS.find((s) => s.preferredId === product.id);
}

/**
 * Applies the canonical zero-AI enrichment spec onto a static seed product record
 * while preserving its existing prices, stock, companion gifts, images, and store URLs.
 */
export function enrichCatalogSeedProduct<T extends Omit<Product, 'createdAt' | 'updatedAt' | 'updatedBy'>>(
  seed: T
): T {
  const spec = findOfficialEnrichmentSpecForProduct({ sku: seed.sku, id: seed.id });
  if (!spec) return seed;

  const extraBase =
    spec.appendExtraNoteIfMissing && seed.extraInfo && !seed.extraInfo.includes('12ml') && !seed.extraInfo.includes('12 مل')
      ? `${seed.extraInfo}\n${spec.appendExtraNoteIfMissing}`
      : seed.extraInfo || spec.appendExtraNoteIfMissing || '';

  const composed = composeExtendedGuidance(
    {
      perfumeType: spec.perfumeType,
      usageInstructions: seed.usageInstructions || '',
      extraInfo: extraBase,
    },
    {
      concentration: spec.concentration,
      timeOfDay: spec.timeOfDay,
      usageType: spec.usageType,
      sillageReach: spec.sillageReach,
      sillageDuration: spec.sillageDuration,
      targetAudience: spec.targetAudience,
      layeringSuggestions: spec.layeringSuggestions,
    }
  );

  const provenanceMap = buildSpecProvenanceMap(spec, new Set());
  const internalNotes = mergeInternalNotesWithMetadata(
    seed.internalNotes || 'متزامن مع متجر mashaer.store ودليل الاستفسارات الرسمي.',
    extractLinkedAlternativesFromNotes(seed.internalNotes),
    provenanceMap
  );

  return {
    ...seed,
    fragranceFamily: spec.fragranceFamily.slice(0, 200),
    fragranceCharacter: spec.fragranceCharacter.slice(0, 200),
    perfumeType: composed.perfumeType,
    topNotes: spec.topNotes.slice(0, 1000),
    heartNotes: spec.heartNotes.slice(0, 1000),
    baseNotes: spec.baseNotes.slice(0, 1000),
    notesAndIngredients: spec.notesAndIngredients.slice(0, 2000),
    longevity: spec.longevity.slice(0, 120),
    sillage: spec.sillage.slice(0, 120),
    occasionUsage: spec.occasionUsage.slice(0, 300),
    seasons: spec.seasons.slice(0, 200),
    usageInstructions: composed.usageInstructions,
    extraInfo: composed.extraInfo,
    internalNotes,
  };
}

function buildSpecProvenanceMap(
  spec: OfficialSkuEnrichmentSpec,
  manualSet: Set<string>,
  existingProvenance: Record<string, FieldProvenanceEntry> = {}
): Record<string, FieldProvenanceEntry> {
  const estSet = new Set<string>(spec.estimatedFields);
  const next: Record<string, FieldProvenanceEntry> = { ...existingProvenance };

  const specFields: Array<[string, string]> = [
    ['fragranceFamily', spec.fragranceFamily],
    ['fragranceCharacter', spec.fragranceCharacter],
    ['perfumeType', spec.perfumeType],
    ['concentration', spec.concentration],
    ['topNotes', spec.topNotes],
    ['heartNotes', spec.heartNotes],
    ['baseNotes', spec.baseNotes],
    ['notesAndIngredients', spec.notesAndIngredients],
    ['longevity', spec.longevity],
    ['sillage', spec.sillage],
    ['sillageReach', spec.sillageReach],
    ['sillageDuration', spec.sillageDuration],
    ['usageType', spec.usageType],
    ['occasionUsage', spec.occasionUsage],
    ['seasons', spec.seasons],
    ['timeOfDay', spec.timeOfDay],
    ['targetAudience', spec.targetAudience],
    ['layeringSuggestions', spec.layeringSuggestions],
  ];

  for (const [key, value] of specFields) {
    if (manualSet.has(key)) {
      next[key] = {
        ...(next[key] || {}),
        sourceType: 'manual',
        confidence: 'high',
        sourceLabel: 'تعديل يدوي محمي',
      };
      continue;
    }

    if (!value || value === 'غير محدد') continue;

    if (estSet.has(key)) {
      next[key] = {
        sourceType: 'estimated',
        confidence: 'medium',
        sourceLabel: 'ترشيح تقديري مبني على النوتات والطابع',
        updatedAt: STAMP_DATE,
      };
    } else {
      next[key] = {
        sourceType: 'official',
        confidence: 'high',
        sourceLabel: 'مواصفات الدليل الرسمي لشركة مشاعر',
        updatedAt: STAMP_DATE,
      };
    }
  }

  return next;
}

export interface EnrichedFieldComputation {
  updatePayload: Record<string, unknown>;
  changedFields: string[];
  skippedManualFields: string[];
  hasChanges: boolean;
}

/**
 * Pure deterministic diff builder that computes only the non-manual fields that need updating
 * for an existing Firestore product document, strictly preserving prices, stock, gifts, images,
 * links, and any field listed in `manuallyEditedFields`.
 */
export function buildEnrichedProductFields(
  existing: Partial<Product>,
  spec: OfficialSkuEnrichmentSpec
): EnrichedFieldComputation {
  const manualSet = new Set<string>(existing.manuallyEditedFields || []);
  const existingExt = extractExtendedGuidance({
    perfumeType: existing.perfumeType,
    usageInstructions: existing.usageInstructions,
    extraInfo: existing.extraInfo,
  });

  const skippedManualFields: string[] = [];
  const changedFields: string[] = [];

  const nextDirect = <K extends keyof OfficialSkuEnrichmentSpec>(
    fieldKey: string,
    existingVal: string | undefined,
    specVal: string,
    maxLen: number
  ): string => {
    if (manualSet.has(fieldKey)) {
      skippedManualFields.push(fieldKey);
      return (existingVal || '').slice(0, maxLen);
    }
    const target = specVal.trim().slice(0, maxLen);
    if ((existingVal || '').trim() !== target) {
      changedFields.push(fieldKey);
    }
    return target;
  };

  const fragranceFamily = nextDirect('fragranceFamily', existing.fragranceFamily, spec.fragranceFamily, 200);
  const fragranceCharacter = nextDirect('fragranceCharacter', existing.fragranceCharacter, spec.fragranceCharacter, 200);
  const topNotes = nextDirect('topNotes', existing.topNotes, spec.topNotes, 1000);
  const heartNotes = nextDirect('heartNotes', existing.heartNotes, spec.heartNotes, 1000);
  const baseNotes = nextDirect('baseNotes', existing.baseNotes, spec.baseNotes, 1000);
  const notesAndIngredients = nextDirect(
    'notesAndIngredients',
    existing.notesAndIngredients,
    spec.notesAndIngredients,
    2000
  );
  const longevity = nextDirect('longevity', existing.longevity, spec.longevity, 120);
  const sillage = nextDirect('sillage', existing.sillage, spec.sillage, 120);
  const occasionUsage = nextDirect('occasionUsage', existing.occasionUsage, spec.occasionUsage, 300);
  const seasons = nextDirect('seasons', existing.seasons, spec.seasons, 200);

  // Compound perfumeType (type + concentration)
  const resolvedCleanPerfumeType = manualSet.has('perfumeType')
    ? (skippedManualFields.push('perfumeType'), existingExt.cleanPerfumeType)
    : spec.perfumeType;
  const resolvedConc = manualSet.has('concentration')
    ? (skippedManualFields.push('concentration'), existingExt.concentration)
    : spec.concentration;

  // Compound usageInstructions (clean notes + timeOfDay + layeringSuggestions)
  const resolvedTimeOfDay = manualSet.has('timeOfDay')
    ? (skippedManualFields.push('timeOfDay'), existingExt.timeOfDay)
    : spec.timeOfDay;
  const resolvedLayering = manualSet.has('layeringSuggestions')
    ? (skippedManualFields.push('layeringSuggestions'), existingExt.layeringSuggestions)
    : spec.layeringSuggestions;

  // Compound extraInfo (clean info + usageType + sillageReach + sillageDuration + targetAudience)
  let baseCleanExtra = existingExt.cleanExtraInfo;
  if (
    !manualSet.has('extraInfo') &&
    spec.appendExtraNoteIfMissing &&
    !baseCleanExtra.includes('12ml') &&
    !baseCleanExtra.includes('12 مل')
  ) {
    baseCleanExtra = baseCleanExtra ? `${baseCleanExtra}\n${spec.appendExtraNoteIfMissing}` : spec.appendExtraNoteIfMissing;
  }

  const resolvedUsageType = manualSet.has('usageType')
    ? (skippedManualFields.push('usageType'), existingExt.usageType)
    : spec.usageType;
  const resolvedReach = manualSet.has('sillageReach')
    ? (skippedManualFields.push('sillageReach'), existingExt.sillageReach)
    : spec.sillageReach;
  const resolvedSillageDuration = manualSet.has('sillageDuration')
    ? (skippedManualFields.push('sillageDuration'), existingExt.sillageDuration)
    : spec.sillageDuration;
  const resolvedAudience = manualSet.has('targetAudience')
    ? (skippedManualFields.push('targetAudience'), existingExt.targetAudience)
    : spec.targetAudience;

  const composed = composeExtendedGuidance(
    {
      perfumeType: resolvedCleanPerfumeType,
      usageInstructions: existingExt.cleanUsageInstructions,
      extraInfo: baseCleanExtra,
    },
    {
      concentration: resolvedConc,
      timeOfDay: resolvedTimeOfDay,
      usageType: resolvedUsageType,
      sillageReach: resolvedReach,
      sillageDuration: resolvedSillageDuration,
      targetAudience: resolvedAudience,
      layeringSuggestions: resolvedLayering,
    }
  );

  if ((existing.perfumeType || '').trim() !== composed.perfumeType.trim()) {
    changedFields.push('perfumeType');
  }
  if ((existing.usageInstructions || '').trim() !== composed.usageInstructions.trim()) {
    changedFields.push('usageInstructions');
  }
  if ((existing.extraInfo || '').trim() !== composed.extraInfo.trim()) {
    changedFields.push('extraInfo');
  }

  const provenanceMap = buildSpecProvenanceMap(spec, manualSet);
  const nextInternalNotes = mergeInternalNotesWithMetadata(
    stripSystemMarkers(existing.internalNotes) || 'متزامن مع متجر mashaer.store ودليل الاستفسارات الرسمي.',
    extractLinkedAlternativesFromNotes(existing.internalNotes),
    provenanceMap
  );
  if ((existing.internalNotes || '').trim() !== nextInternalNotes.trim()) {
    changedFields.push('internalNotes');
  }

  const updatePayload: Record<string, unknown> = {
    sku: clampString(existing.sku?.trim() || spec.sku, 80),
    fragranceFamily: clampString(fragranceFamily, 200),
    fragranceCharacter: clampString(fragranceCharacter, 200),
    perfumeType: clampString(composed.perfumeType, 200),
    topNotes: clampString(topNotes, 1000),
    heartNotes: clampString(heartNotes, 1000),
    baseNotes: clampString(baseNotes, 1000),
    notesAndIngredients: clampString(notesAndIngredients, 2000),
    longevity: clampString(longevity, 120),
    sillage: clampString(sillage, 120),
    occasionUsage: clampString(occasionUsage, 300),
    seasons: clampString(seasons, 200),
    usageInstructions: clampString(composed.usageInstructions, 2000),
    extraInfo: clampString(composed.extraInfo, 2000),
    internalNotes: clampString(nextInternalNotes, 2000),
  };

  return {
    updatePayload,
    changedFields: Array.from(new Set(changedFields)),
    skippedManualFields: Array.from(new Set(skippedManualFields)),
    hasChanges: changedFields.length > 0,
  };
}

export interface OfficialEnrichmentBatchReport {
  totalSpecCount: number;
  matchedCount: number;
  updatedCount: number;
  unchangedCount: number;
  notFoundSkus: string[];
  protectedFieldsSkipped: Array<{ sku: string; nameAr: string; fields: string[] }>;
  verifiedServerCount: number;
  failedDocs: Array<{ sku: string; id: string; reason: string }>;
  committedAt: string;
}

/**
 * Matches all 20 target SKUs against existing Firestore product documents (SKU-first),
 * updates non-manual fields in a single writeBatch with zero AI API calls,
 * logs one audit event, and verifies persisted documents directly from Firestore server.
 */
export async function applyOfficialCatalogEnrichmentBatch(): Promise<OfficialEnrichmentBatchReport> {
  const actorEmail = (auth.currentUser?.email || '').trim().toLowerCase();
  if (!actorEmail || !auth.currentUser?.emailVerified) {
    throw new Error('يجب تسجيل الدخول بحساب مدير مصرح له قبل تنفيذ التحديث السحابي.');
  }

  const rawServerDocs = await fetchAllRawProductsFromServer();
  const rawServerMap = new Map(rawServerDocs.map((d) => [d.id, d.data]));
  const sourceProducts: Product[] = rawServerDocs.map((d) => ({
    id: d.id,
    ...(d.data as Omit<Product, 'id'>),
  }));

  const bySku = new Map<string, Product>();
  const byId = new Map<string, Product>();
  for (const p of sourceProducts) {
    const skuKey = normalizeSkuKey(p.sku);
    if (skuKey && !bySku.has(skuKey)) {
      bySku.set(skuKey, p);
    }
    byId.set(p.id, p);
  }

  const ops: ProductBatchWriteOp[] = [];
  const pendingUpdates: Array<{ spec: OfficialSkuEnrichmentSpec; docId: string; payload: Record<string, unknown> }> = [];
  const notFoundSkus: string[] = [];
  const protectedFieldsSkipped: Array<{ sku: string; nameAr: string; fields: string[] }> = [];
  let matchedCount = 0;
  let unchangedCount = 0;

  for (const spec of OFFICIAL_CATALOG_ENRICHMENT_SPECS) {
    const matched = bySku.get(normalizeSkuKey(spec.sku)) || byId.get(spec.preferredId);
    if (!matched) {
      notFoundSkus.push(spec.sku);
      continue;
    }
    matchedCount += 1;

    const comp = buildEnrichedProductFields(matched, spec);
    if (comp.skippedManualFields.length > 0) {
      protectedFieldsSkipped.push({
        sku: spec.sku,
        nameAr: matched.nameAr || spec.nameAr,
        fields: comp.skippedManualFields,
      });
    }

    if (!comp.hasChanges) {
      unchangedCount += 1;
      continue;
    }

    const catalogSeed = MASHAER_STORE_CATALOG.find(
      (c) => normalizeSkuKey(c.sku) === normalizeSkuKey(spec.sku) || c.id === matched.id
    );
    const serverRaw = rawServerMap.get(matched.id) || (matched as unknown as Record<string, unknown>);
    const prepared = prepareUnifiedProductUpdatePayload(
      serverRaw,
      comp.updatePayload as Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>>,
      actorEmail,
      { fallbackSeed: catalogSeed }
    );

    ops.push({
      id: matched.id,
      mode: 'update',
      payload: prepared.payload,
    });
    pendingUpdates.push({ spec, docId: matched.id, payload: comp.updatePayload });
  }

  const failedDocs: Array<{ sku: string; id: string; reason: string }> = [];
  let committedIds = new Set<string>();

  if (ops.length > 0) {
    const commitRes = await commitProductWriteOpsWithIsolation(ops);
    committedIds = new Set(commitRes.committedIds);
    for (const f of commitRes.failedItems) {
      const matchedSpec = pendingUpdates.find((u) => u.docId === f.id)?.spec;
      failedDocs.push({
        sku: matchedSpec?.sku || f.id,
        id: f.id,
        reason: f.reason,
      });
    }

    if (commitRes.committedIds.length > 0) {
      await tryLogAuditEventNonBlocking({
        section: 'دليل المنتجات',
        itemName: `استكمال مواصفات ${commitRes.committedIds.length} منتج (دفعة معتمدة)`,
        actionType: 'import',
        summary: `تحديث ${commitRes.committedIds.length} منتج مطابقة بـ SKU في Cloud Firestore مع حماية ${protectedFieldsSkipped.length} سجل ذي حقول يدوية${failedDocs.length > 0 ? ` (تخطي ${failedDocs.length})` : ''}.`,
      });
    }
  }

  // Server read-back verification (1 server query read)
  let verifiedServerCount = 0;

  if (committedIds.size > 0) {
    try {
      const serverSnap = await getDocsFromServer(collection(db, 'products'));
      trackRead(serverSnap.docs.length || 1);
      const serverMap = new Map(serverSnap.docs.map((d) => [d.id, d.data() as Partial<Product>]));

      for (const upd of pendingUpdates) {
        if (!committedIds.has(upd.docId)) continue;
        const srv = serverMap.get(upd.docId);
        if (!srv) {
          failedDocs.push({ sku: upd.spec.sku, id: upd.docId, reason: 'المستند غير موجود على الخادم بعد الحفظ' });
          continue;
        }
        const mismatches: string[] = [];
        const checkKeys = ['fragranceFamily', 'fragranceCharacter', 'perfumeType', 'longevity', 'sillage', 'seasons', 'occasionUsage'] as const;
        for (const k of checkKeys) {
          const expected = String(upd.payload[k] || '').trim();
          const actual = String(srv[k] || '').trim();
          if (expected !== actual) {
            mismatches.push(k);
          }
        }
        if (mismatches.length > 0) {
          failedDocs.push({
            sku: upd.spec.sku,
            id: upd.docId,
            reason: `عدم تطابق بعد الحفظ في: ${mismatches.join('، ')}`,
          });
        } else {
          verifiedServerCount += 1;
        }
      }
    } catch (err) {
      failedDocs.push({
        sku: 'SERVER_VERIFY',
        id: 'products',
        reason: err instanceof Error ? err.message : 'تعذر التحقق من الخادم بعد الحفظ',
      });
    }
  }

  return {
    totalSpecCount: OFFICIAL_CATALOG_ENRICHMENT_SPECS.length,
    matchedCount,
    updatedCount: committedIds.size,
    unchangedCount,
    notFoundSkus,
    protectedFieldsSkipped,
    verifiedServerCount,
    failedDocs,
    committedAt: new Date().toISOString(),
  };
}
