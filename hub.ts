export type SectionId =
  | 'home'
  | 'responses'
  | 'inquiries'
  | 'policies'
  | 'situations'
  | 'returns'
  | 'products'
  | 'systems'
  | 'audit'
  | 'backup'
  | 'users'
  | 'settings';

export type StaffSectionId =
  | 'home'
  | 'responses'
  | 'inquiries'
  | 'policies'
  | 'situations'
  | 'returns'
  | 'products'
  | 'systems';

export type UserRole = 'admin' | 'employee';
export type RoleTier = 'sensitive_admin' | 'operational_admin' | 'employee';
export type UserStatus = 'active' | 'suspended';

export interface AuthorizedUser {
  id: string;
  email: string;
  emailKey: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  allowedSections: StaffSectionId[];
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface CannedResponse {
  id: string;
  title: string;
  category: string;
  content: string;
  internalNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface CustomerInquiry {
  id: string;
  question: string;
  answer: string;
  category: string;
  notes?: string;
  needsAdminReview: boolean;
  source: 'word_import' | 'manual';
  sourceOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface Policy {
  id: string;
  title: string;
  category: string;
  content: string;
  summary?: string;
  applicableCases?: string;
  conditions?: string;
  exceptions?: string;
  requiredAction?: string;
  suggestedReply?: string;
  escalationDept?: string;
  source?: string;
  needsAdminReview: boolean;
  conflictNote?: string;
  sourceUrl?: string;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface Situation {
  id: string;
  situationNumber: string;
  category: string;
  subCategory?: string;
  customerInquiry: string;
  requiredData?: string;
  internalProcedure: string;
  cannedReply: string;
  responsibleDept: string;
  internalNotes?: string;
  isImportant?: boolean;
  linkedPolicyId?: string;
  needsAdminReview?: boolean;
  duplicateFlag?: boolean;
  importHash?: string;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface ReturnWorkflowStage {
  id: string;
  stageOrder: number;
  stage: string;
  condition: string;
  procedure: string;
  cannedReply: string;
  employeeNote?: string;
  needsAdminReview?: boolean;
  duplicateFlag?: boolean;
  importHash?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface QuickPhrase {
  id: string;
  purpose: string;
  phrase: string;
  category?: string;
  duplicateFlag?: boolean;
  importHash?: string;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface EmployeeAlert {
  id: string;
  title: string;
  ruleText: string;
  clarification?: string;
  severity: 'important' | 'warning' | 'info';
  duplicateFlag?: boolean;
  importHash?: string;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export type ProductCategory = 'perfumes' | 'mamoul' | 'spray';
export type ProductReviewStatus = 'verified' | 'needs_review';
export type CountryCode = 'KW' | 'SA' | 'AE' | 'QA' | 'BH' | 'OM';

export interface CountryPriceEntry {
  countryCode: CountryCode;
  countryNameAr: string;
  currency: string;
  price: number | null;
  oldPrice?: number | null;
  discountPercent?: number | null;
  availability: string;
  storeUrl?: string;
}

export interface PriceHistoryEntry {
  recordedAt: string;
  countryCode: CountryCode;
  currency: string;
  previousPrice?: number | null;
  newPrice: number | null;
  previousAvailability?: string;
  newAvailability?: string;
}

export interface CompanionGift {
  title: string;
  size: string;
  kind: 'spray' | 'musk' | 'other';
  compositionNote: string;
}

export interface Product {
  id: string;
  sku?: string;
  nameAr: string;
  nameEn?: string;
  category: ProductCategory;
  officialDescription: string;
  imageUrl?: string;
  fragranceFamily?: string;
  fragranceCharacter?: string;
  perfumeType?: string;
  sillage?: string;
  longevity?: string;
  occasionUsage?: string;
  seasons?: string;
  notesAndIngredients?: string;
  topNotes?: string;
  heartNotes?: string;
  baseNotes?: string;
  size?: string;
  availability?: string;
  usageInstructions?: string;
  extraInfo?: string;
  internalNotes?: string;
  companionGift?: CompanionGift | null;
  countryPrices?: Partial<Record<CountryCode, CountryPriceEntry>>;
  priceHistory?: PriceHistoryEntry[];
  manuallyEditedFields?: string[];
  syncConflictNote?: string;
  lastSyncedAt?: string;
  syncStatus?: string;
  reviewStatus: ProductReviewStatus;
  sourceUrl?: string;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export type SystemVisibility = 'all_staff' | 'admins_only';
export type SystemLoginMethod = 'password' | 'otp' | 'sso' | 'unknown';
export type SystemOperationalStatus = 'active' | 'legacy' | 'needs_review';

export interface SystemLink {
  id: string;
  systemName: string;
  url: string;
  mainCategory?: string;
  subCategory?: string;
  loginMethod?: SystemLoginMethod;
  systemStatus?: SystemOperationalStatus;
  otpNote?: string;
  publicUsername?: string;
  description?: string;
  usageInstructions?: string;
  notes?: string;
  visibility: SystemVisibility;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface SystemCredential {
  id: string;
  linkId: string;
  usernameOrEmail: string;
  password: string;
  visibility: SystemVisibility;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface ThemeColorSet {
  primary: string;
  heading: string;
  secondary: string;
  accent: string;
  accentSoft: string;
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  sidebar: string;
  sidebarAlt: string;
  sidebarText: string;
  sidebarAccent: string;
  button: string;
  buttonHover: string;
  buttonText: string;
}

export interface MashaerTheme {
  id: string;
  nameAr: string;
  nameEn: string;
  perfumeSource: string;
  description: string;
  swatchHexes: string[];
  isCustom?: boolean;
  light: ThemeColorSet;
  dark: ThemeColorSet;
}

export interface SyncHistoryEntry {
  syncedAt: string;
  status: string;
  productCount: number;
  updatedCount?: number;
  createdCount?: number;
  conflictCount?: number;
  priceChanges: number;
  actorEmail: string;
}

export interface HomeCustomLink {
  id: string;
  label: string;
  url: string;
  note?: string;
}

export type HeroCoverStyle =
  | 'royal_gradient'
  | 'split_editorial'
  | 'minimal_surface'
  | 'deep_velvet'
  | 'custom_image';

export type LogoSlotId = 'header' | 'sidebar' | 'home' | 'hero_cover' | 'auth_gate';
export type LogoSlotSize = 'sm' | 'md' | 'lg' | 'xl';
export type LogoSlotAlign = 'right' | 'center' | 'left';
export type LogoSlotDisplayStyle = 'rounded' | 'square' | 'circle' | 'framed' | 'clean';
export type LogoSlotFitMode = 'contain' | 'cover';

export type ArabicFontId =
  | 'ibm_plex'
  | 'tajawal'
  | 'cairo'
  | 'almarai'
  | 'readex_pro'
  | 'noto_kufi'
  | 'changa';

export interface TypographyConfig {
  fontId: ArabicFontId;
  baseSizePx: number;
  headingScale: number;
  bodyScale: number;
}

export interface LogoSlotConfig {
  enabled: boolean;
  imageUrl: string;
  size: LogoSlotSize;
  widthPx?: number;
  heightPx?: number;
  lockAspectRatio?: boolean;
  fitMode?: LogoSlotFitMode;
  align: LogoSlotAlign;
  displayStyle: LogoSlotDisplayStyle;
  showLabel?: boolean;
  labelText?: string;
}

export type LogoPlacementsMap = Record<LogoSlotId, LogoSlotConfig>;

export interface SiteUiConfig {
  heroVisible: boolean;
  heroStyle: HeroCoverStyle;
  heroCoverUrl: string;
  heroOverlayOpacity: number;
  logoPlacements: LogoPlacementsMap;
  typography: TypographyConfig;
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroPrimaryBtnLabel: string;
  heroPrimaryBtnTarget: StaffSectionId;
  heroSecondaryBtnLabel: string;

  headerTitle: string;
  headerSubtitle: string;
  searchPlaceholder: string;
  themeBtnLabel: string;
  lightModeLabel: string;
  darkModeLabel: string;

  showKpiCards: boolean;
  kpi1Title: string;
  kpi1Cta: string;
  kpi2Title: string;
  kpi2Cta: string;
  kpi3Title: string;
  kpi3Cta: string;
  kpi4Title: string;
  kpi4Cta: string;

  showShortcutsSection: boolean;
  shortcutsTitle: string;
  shortcutsEditBtnLabel: string;

  showFavoritesSection: boolean;
  favoritesTitle: string;
  favoritesSubtitle: string;
  favoritesEmptyText: string;

  showQuickSystemsSection: boolean;
  quickSystemsTitle: string;
  quickSystemsAllBtnLabel: string;

  showAssistantSection: boolean;
  assistantTitle: string;
  assistantSubtitle: string;
  assistantPlaceholder: string;
  assistantBtnLabel: string;

  showReplyCheckerSection: boolean;
  replyCheckerTitle: string;
  replyCheckerSubtitle: string;
  replyCheckerPlaceholder: string;
  replyCheckerBtnLabel: string;

  showAlertsSection: boolean;
  alertsTitle: string;
  alertsAllBtnLabel: string;

  showUpdatesSection: boolean;
  updatesTitle: string;
  updatesEmptyText: string;

  showPhrasesSection: boolean;
  phrasesTitle: string;
  phrasesAllBtnLabel: string;

  showCustomLinksSection: boolean;
  customLinksTitle: string;
  homeCustomLinks: HomeCustomLink[];

  btnDetailsLabel: string;
  btnCopyLabel: string;
  btnCompareLabel: string;
  btnStoreLinkLabel: string;

  navLabels: Partial<Record<StaffSectionId, string>>;
}

export interface SiteBrandingSettings {
  id?: string;
  systemName?: string;
  logoDataUrl?: string;
  coverDataUrl?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroDescription?: string;
  textPosition?: 'right' | 'center' | 'left';
  showHeroText?: boolean;
  desktopTextSize?: 'sm' | 'md' | 'lg';
  mobileTextSize?: 'sm' | 'md' | 'lg';
  themeMode?: 'light' | 'dark';
  accentTone?: 'gold' | 'burgundy';
  activeThemeId?: string;
  previousThemeId?: string;
  customThemes?: MashaerTheme[];
  uiConfig?: Partial<SiteUiConfig>;
  syncHistory?: SyncHistoryEntry[];
  knowledgeSeedVersion?: number;
  lastStoreSyncAt?: string;
  lastStoreSyncStatus?: string;
  enabledSections?: string[];
  wordImportedAt?: string;
  wordImportCount?: number;
  pdfImportedAt?: string;
  pdfImportCount?: number;
  updatedAt?: unknown;
  updatedBy: string;
}

export interface UserPreferences {
  id: string;
  emailKey: string;
  themeId: string;
  themeMode: 'light' | 'dark';
  favoriteProducts: string[];
  favoriteSituations: string[];
  favoritePolicies: string[];
  dashboardShortcuts: StaffSectionId[];
  updatedAt?: unknown;
  updatedBy: string;
}

export interface CustomCategory {
  id: string;
  section: string;
  name: string;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy: string;
}

export type AuditActionType = 'create' | 'update' | 'delete' | 'import' | 'restore';

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  actorEmail: string;
  actorRole?: string;
  section: string;
  itemName: string;
  itemId?: string;
  actionType: AuditActionType;
  result?: 'success' | 'blocked' | 'failed';
  summary: string;
  previousValue?: string;
  newValue?: string;
  createdAt?: unknown;
}

export interface BackupRecord {
  id: string;
  name: string;
  action: 'export' | 'restore';
  createdByEmail: string;
  createdByName: string;
  totalRecords: number;
  payloadSizeBytes?: number;
  createdAt?: unknown;
}

export type SaveSyncStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'offline';

export interface QuotaStats {
  sessionReads: number;
  sessionWrites: number;
  sessionDeletes: number;
  estimatedTotalDocs: number;
  lastUpdatedAt: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface GlobalSearchResult {
  id: string;
  sectionId: StaffSectionId;
  sectionLabel: string;
  title: string;
  answer: string;
  internalProcedure?: string;
  responsibleDept?: string;
  needsAdminReview?: boolean;
  score: number;
}
