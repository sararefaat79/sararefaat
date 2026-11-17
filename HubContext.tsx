import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  parseFriendlyAuthError,
  parseFriendlyFirestoreError,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  ALL_STAFF_SECTIONS,
  emailToKey,
  GCC_COUNTRIES,
  isCoreAdminEmail,
  isSensitiveAdminEmail,
  normalizeEmail,
  resolveRoleTier,
  SECTION_LABELS,
} from '../lib/auth-constants';
import { KNOWLEDGE_SEED_VERSION, seedInitialFirestoreData, seedMissingPhase2Data } from '../lib/seed-data';
import {
  ConcurrentEditConflictError,
  isPermissionDeniedError,
  saveUserPreferences,
  syncLiveMashaerCatalogToFirestore,
} from '../lib/firestore-service';
import { getQuotaStats, setEstimatedTotalDocs, subscribeQuota, trackRead } from '../lib/quota-monitor';
import { tokenizeArabicWithSynonyms, normalizeArabicSearch } from '../lib/assistant-engine';
import { applyThemeToDocument, DEFAULT_THEME_ID } from '../lib/themes';
import { applyTypographyToDocument } from '../lib/fonts';
import { resolveUiConfig } from '../lib/ui-defaults';
import { buildProductSearchHaystack } from '../lib/product-utils';
import {
  MASHAER_STORE_CATALOG,
  PHASE2_POLICIES,
  PHASE2_SYSTEM_LINKS,
} from '../lib/attached-pdfs-data';
import type {
  AuditLog,
  AuthorizedUser,
  BackupRecord,
  CannedResponse,
  CustomCategory,
  CustomerInquiry,
  EmployeeAlert,
  GlobalSearchResult,
  Policy,
  Product,
  QuickPhrase,
  QuotaStats,
  ReturnWorkflowStage,
  RoleTier,
  SaveSyncStatus,
  SectionId,
  SiteBrandingSettings,
  SiteUiConfig,
  Situation,
  StaffSectionId,
  SystemCredential,
  SystemLink,
  ToastMessage,
  UserPreferences,
} from '../types/hub';

export type AccessState =
  | 'loading'
  | 'unauthenticated'
  | 'unverified_email'
  | 'unauthorized'
  | 'suspended'
  | 'authorized';

export interface PreviewThemeState {
  themeId: string;
  themeMode: 'light' | 'dark';
}

interface HubContextValue {
  firebaseUser: User | null;
  accessState: AccessState;
  roleTier: RoleTier;
  isSensitiveAdmin: boolean;
  isOperationalAdmin: boolean;
  isAdmin: boolean;
  isEmployee: boolean;
  allowedSections: StaffSectionId[];
  currentUserProfile: AuthorizedUser | null;
  userPreferences: UserPreferences | null;
  dataLoading: boolean;
  isOffline: boolean;
  saveStatus: SaveSyncStatus;
  lastSyncError: string | null;
  setSaveStatus: (status: SaveSyncStatus, errorMsg?: string | null) => void;
  runTrackedMutation: <T>(fn: () => Promise<T>) => Promise<T>;
  quotaStats: QuotaStats;
  themeMode: 'light' | 'dark';
  activeThemeId: string;
  previewTheme: PreviewThemeState | null;
  setPreviewTheme: (preview: PreviewThemeState | null) => void;
  uiConfig: SiteUiConfig;
  previewUiConfig: Partial<SiteUiConfig> | null;
  setPreviewUiConfig: (preview: Partial<SiteUiConfig> | null) => void;
  toggleTheme: () => void;
  setThemeModeExplicit: (mode: 'light' | 'dark') => void;
  updateUserPreferences: (patch: Partial<Pick<UserPreferences, 'themeId' | 'themeMode' | 'favoriteProducts' | 'favoriteSituations' | 'favoritePolicies' | 'dashboardShortcuts'>>) => Promise<void>;
  toggleFavorite: (kind: 'products' | 'situations' | 'policies', id: string) => Promise<void>;
  toggleShortcut: (sectionId: StaffSectionId) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  logout: () => Promise<void>;
  notify: (type: ToastMessage['type'], text: string) => void;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  // Data collections
  cannedResponses: CannedResponse[];
  inquiries: CustomerInquiry[];
  policies: Policy[];
  situations: Situation[];
  returnStages: ReturnWorkflowStage[];
  quickPhrases: QuickPhrase[];
  employeeAlerts: EmployeeAlert[];
  products: Product[];
  systemLinks: SystemLink[];
  systemCredentials: Record<string, SystemCredential>;
  branding: SiteBrandingSettings | null;
  categories: CustomCategory[];
  authorizedUsers: AuthorizedUser[];
  auditLogs: AuditLog[];
  backups: BackupRecord[];
  // Actions
  syncingCatalog: boolean;
  seedingPhase2: boolean;
  schemaUpgradePending: boolean;
  runInitialSeed: () => Promise<void>;
  runPhase2MissingSeed: () => Promise<void>;
  syncLiveCatalog: () => Promise<void>;
  globalSearch: (queryText: string) => GlobalSearchResult[];
}

const HubContext = createContext<HubContextValue | null>(null);

function normalizeMatch(val: string | undefined): string {
  return (val || '').trim().toLowerCase().replace(/[\s\-_&]+/g, '');
}

const DEFAULT_SHORTCUTS: StaffSectionId[] = ['products', 'situations', 'responses', 'policies'];

export function HubProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<AuthorizedUser | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [dataLoading, setDataLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [previewTheme, setPreviewTheme] = useState<PreviewThemeState | null>(null);
  const [previewUiConfig, setPreviewUiConfig] = useState<Partial<SiteUiConfig> | null>(null);
  const [saveStatusState, setSaveStatusState] = useState<SaveSyncStatus>('idle');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const statusTimerRef = useRef<number | null>(null);
  const [quotaStats, setQuotaStats] = useState<QuotaStats>(() => getQuotaStats());

  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([]);
  const [inquiries, setInquiries] = useState<CustomerInquiry[]>([]);
  const [rawPolicies, setRawPolicies] = useState<Policy[]>([]);
  const [situations, setSituations] = useState<Situation[]>([]);
  const [returnStages, setReturnStages] = useState<ReturnWorkflowStage[]>([]);
  const [quickPhrases, setQuickPhrases] = useState<QuickPhrase[]>([]);
  const [employeeAlerts, setEmployeeAlerts] = useState<EmployeeAlert[]>([]);
  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [liveProductOverlay, setLiveProductOverlay] = useState<Record<string, Partial<Product>>>({});
  const [liveLastSyncAt, setLiveLastSyncAt] = useState<string | null>(null);
  const [rawSystemLinks, setRawSystemLinks] = useState<SystemLink[]>([]);
  const [systemCredentials, setSystemCredentials] = useState<Record<string, SystemCredential>>({});
  const [branding, setBranding] = useState<SiteBrandingSettings | null>(null);
  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);

  const [brandingLoaded, setBrandingLoaded] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [seedingPhase2, setSeedingPhase2] = useState(false);
  const [schemaUpgradePending, setSchemaUpgradePending] = useState(false);
  const autoSeedTriggeredRef = useRef(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
    }
  }, []);

  const effectiveThemeMode: 'light' | 'dark' =
    previewTheme?.themeMode || userPreferences?.themeMode || branding?.themeMode || 'light';

  const effectiveActiveThemeId: string =
    previewTheme?.themeId || userPreferences?.themeId || branding?.activeThemeId || DEFAULT_THEME_ID;

  // Apply Tailwind class-based dark mode and global --hub-* CSS variables cleanly
  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveThemeMode === 'dark');
    applyThemeToDocument(effectiveActiveThemeId, effectiveThemeMode, branding?.customThemes);
  }, [effectiveThemeMode, effectiveActiveThemeId, branding?.customThemes]);

  // Subscribe to session Spark quota monitor (in-memory only, 0 extra Firestore writes)
  useEffect(() => {
    return subscribeQuota((next) => setQuotaStats(next));
  }, []);

  // Keep estimated document count synced
  useEffect(() => {
    const total =
      cannedResponses.length +
      inquiries.length +
      rawPolicies.length +
      situations.length +
      returnStages.length +
      quickPhrases.length +
      employeeAlerts.length +
      rawProducts.length +
      rawSystemLinks.length +
      Object.keys(systemCredentials).length +
      categories.length +
      authorizedUsers.length +
      auditLogs.length +
      backups.length +
      (branding ? 1 : 0);
    setEstimatedTotalDocs(total);
  }, [
    cannedResponses.length,
    inquiries.length,
    rawPolicies.length,
    situations.length,
    returnStages.length,
    quickPhrases.length,
    employeeAlerts.length,
    rawProducts.length,
    rawSystemLinks.length,
    systemCredentials,
    categories.length,
    authorizedUsers.length,
    auditLogs.length,
    backups.length,
    branding,
  ]);

  const setSaveStatus = useCallback((status: SaveSyncStatus, errorMsg: string | null = null) => {
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setSaveStatusState(status);
    setLastSyncError(errorMsg);
    if (status === 'saved' || status === 'synced') {
      statusTimerRef.current = window.setTimeout(() => {
        setSaveStatusState('idle');
      }, 4000);
    }
  }, []);

  const saveStatus: SaveSyncStatus = isOffline ? 'offline' : saveStatusState;

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      setSaveStatus('idle');
    };
    const onOffline = () => {
      setIsOffline(true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    testFirestoreConnection().then((res) => {
      if (res.offline) setIsOffline(true);
    });
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setSaveStatus]);

  const notify = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const runTrackedMutation = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      setSaveStatus('saving');
      try {
        const res = await fn();
        setSaveStatus('saved');
        return res;
      } catch (err) {
        if (err instanceof ConcurrentEditConflictError) {
          setSaveStatus('conflict', err.message);
        } else {
          setSaveStatus('error', parseFriendlyFirestoreError(err));
        }
        throw err;
      }
    },
    [setSaveStatus]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setCurrentUserProfile(null);
        setUserPreferences(null);
        setPreviewTheme(null);
        setPreviewUiConfig(null);
        setProfileLoaded(true);
        setDataLoading(false);
        autoSeedTriggeredRef.current = false;
      } else {
        setAuthError(null);
        setProfileLoaded(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const email = normalizeEmail(firebaseUser.email);
    const emailKey = emailToKey(email);

    if (!firebaseUser.emailVerified || !email) {
      setProfileLoaded(true);
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'authorized_users', emailKey),
      (snap) => {
        trackRead(1);
        if (snap.exists()) {
          setCurrentUserProfile({ id: snap.id, ...(snap.data() as Omit<AuthorizedUser, 'id'>) });
        } else {
          setCurrentUserProfile(null);
        }
        setProfileLoaded(true);
      },
      (err) => {
        console.warn('Auth profile check note:', err.message);
        setCurrentUserProfile(null);
        setProfileLoaded(true);
      }
    );
    return () => unsub();
  }, [authReady, firebaseUser]);

  const roleTier: RoleTier = useMemo(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return 'employee';
    return resolveRoleTier(firebaseUser.email);
  }, [firebaseUser]);

  const isSensitiveAdmin = useMemo(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return false;
    return isSensitiveAdminEmail(firebaseUser.email);
  }, [firebaseUser]);

  const isAdmin = useMemo(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) return false;
    return isCoreAdminEmail(firebaseUser.email);
  }, [firebaseUser]);

  const isOperationalAdmin = isAdmin && !isSensitiveAdmin;

  const accessState: AccessState = useMemo(() => {
    if (!authReady || (firebaseUser && !profileLoaded)) return 'loading';
    if (!firebaseUser) return 'unauthenticated';
    if (!firebaseUser.emailVerified) return 'unverified_email';
    if (isAdmin) return 'authorized';
    if (!currentUserProfile) return 'unauthorized';
    if (currentUserProfile.status === 'suspended') return 'suspended';
    if (currentUserProfile.role === 'employee' && currentUserProfile.status === 'active') return 'authorized';
    return 'unauthorized';
  }, [authReady, firebaseUser, profileLoaded, isAdmin, currentUserProfile]);

  const isEmployee = accessState === 'authorized' && !isAdmin;

  const allowedSections: StaffSectionId[] = useMemo(() => {
    if (isAdmin) return ALL_STAFF_SECTIONS;
    if (currentUserProfile?.allowedSections?.length) {
      return currentUserProfile.allowedSections;
    }
    return ALL_STAFF_SECTIONS;
  }, [isAdmin, currentUserProfile]);

  // Firestore central subscriptions (Strictly scoped per RBAC Tier)
  useEffect(() => {
    if (accessState !== 'authorized' || !firebaseUser?.email) {
      setCannedResponses([]);
      setInquiries([]);
      setRawPolicies([]);
      setSituations([]);
      setReturnStages([]);
      setQuickPhrases([]);
      setEmployeeAlerts([]);
      setRawProducts([]);
      setRawSystemLinks([]);
      setSystemCredentials({});
      setBranding(null);
      setBrandingLoaded(false);
      setUserPreferences(null);
      setCategories([]);
      setAuthorizedUsers([]);
      setAuditLogs([]);
      setBackups([]);
      return;
    }

    setDataLoading(true);
    const unsubs: Array<() => void> = [];
    const emailKey = emailToKey(firebaseUser.email);

    unsubs.push(
      onSnapshot(
        doc(db, 'user_preferences', emailKey),
        (snap) => {
          trackRead(1);
          if (snap.exists()) {
            setUserPreferences({ id: snap.id, ...(snap.data() as Omit<UserPreferences, 'id'>) });
          } else {
            setUserPreferences(null);
          }
        },
        (err) => {
          console.warn('User preferences listener note:', err.message);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'canned_responses'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          setCannedResponses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CannedResponse, 'id'>) })));
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'canned_responses')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'customer_inquiries'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerInquiry, 'id'>) }));
          list.sort((a, b) => (a.sourceOrder ?? 9999) - (b.sourceOrder ?? 9999));
          setInquiries(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'customer_inquiries')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'policies'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Policy, 'id'>) }));
          list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
          setRawPolicies(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'policies')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'situations'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Situation, 'id'>) }));
          list.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
          setSituations(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'situations')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'return_workflow'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReturnWorkflowStage, 'id'>) }));
          list.sort((a, b) => a.stageOrder - b.stageOrder);
          setReturnStages(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'return_workflow')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'quick_phrases'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuickPhrase, 'id'>) }));
          list.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
          setQuickPhrases(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'quick_phrases')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'employee_alerts'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmployeeAlert, 'id'>) }));
          list.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
          setEmployeeAlerts(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'employee_alerts')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'products'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }));
          list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
          setRawProducts(list);
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'products')
      )
    );

    unsubs.push(
      onSnapshot(
        isAdmin
          ? collection(db, 'system_links')
          : query(collection(db, 'system_links'), where('visibility', '==', 'all_staff')),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SystemLink, 'id'>) }));
          list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
          setRawSystemLinks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'system_links')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'site_settings', 'branding'),
        (snap) => {
          trackRead(1);
          if (snap.exists()) {
            setBranding({ id: snap.id, ...(snap.data() as Omit<SiteBrandingSettings, 'id'>) });
          } else {
            setBranding(null);
          }
          setBrandingLoaded(true);
        },
        (err) => {
          setBrandingLoaded(true);
          handleFirestoreError(err, OperationType.GET, 'site_settings/branding');
        }
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'categories'),
        (snap) => {
          trackRead(snap.docChanges().length || 1);
          setCategories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomCategory, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'categories')
      )
    );

    // Credentials: all 7 admins see all; employees see all_staff only
    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'system_credentials'),
          (snap) => {
            trackRead(snap.docChanges().length || 1);
            const map: Record<string, SystemCredential> = {};
            for (const d of snap.docs) {
              map[d.id] = { id: d.id, ...(d.data() as Omit<SystemCredential, 'id'>) };
            }
            setSystemCredentials(map);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'system_credentials')
        )
      );
    } else if (isEmployee) {
      unsubs.push(
        onSnapshot(
          query(collection(db, 'system_credentials'), where('visibility', '==', 'all_staff')),
          (snap) => {
            trackRead(snap.docChanges().length || 1);
            const map: Record<string, SystemCredential> = {};
            for (const d of snap.docs) {
              map[d.id] = { id: d.id, ...(d.data() as Omit<SystemCredential, 'id'>) };
            }
            setSystemCredentials(map);
          },
          (err) => {
            if (isPermissionDeniedError(err)) {
              setSchemaUpgradePending(true);
              setSystemCredentials({});
            } else {
              handleFirestoreError(err, OperationType.LIST, 'system_credentials');
            }
          }
        )
      );
    }

    // Tier 1 ONLY (3 Sensitive Admins): Users, Audit Logs, Backups
    if (isSensitiveAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'authorized_users'),
          (snap) => {
            trackRead(snap.docChanges().length || 1);
            setAuthorizedUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuthorizedUser, 'id'>) })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'authorized_users')
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc')),
          (snap) => {
            trackRead(snap.docChanges().length || 1);
            setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'backups'), orderBy('createdAt', 'desc')),
          (snap) => {
            trackRead(snap.docChanges().length || 1);
            setBackups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BackupRecord, 'id'>) })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'backups')
        )
      );
    } else {
      setAuthorizedUsers([]);
      setAuditLogs([]);
      setBackups([]);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [accessState, firebaseUser?.email, isAdmin, isSensitiveAdmin, isEmployee]);

  // Enrich Firestore documents with catalog fallbacks (strictly NO bottle imageUrl)
  const products: Product[] = useMemo(() => {
    return rawProducts.map((p) => {
      const catMatch = MASHAER_STORE_CATALOG.find(
        (c) =>
          c.id === p.id ||
          (p.sku && normalizeMatch(c.sku) === normalizeMatch(p.sku)) ||
          (p.nameEn && normalizeMatch(c.nameEn) === normalizeMatch(p.nameEn)) ||
          normalizeMatch(c.nameAr) === normalizeMatch(p.nameAr)
      );
      const livePatch = liveProductOverlay[p.id];
      return {
        ...catMatch,
        ...p,
        ...livePatch,
        imageUrl: undefined,
        size: p.size && p.size !== 'تحتاج مراجعة الإدارة' ? p.size : livePatch?.size || catMatch?.size || p.size,
        notesAndIngredients:
          p.notesAndIngredients && !p.notesAndIngredients.includes('تحتاج مراجعة الإدارة')
            ? p.notesAndIngredients
            : catMatch?.notesAndIngredients || p.notesAndIngredients,
        countryPrices: livePatch?.countryPrices || p.countryPrices || catMatch?.countryPrices,
        companionGift:
          p.companionGift !== undefined
            ? p.companionGift
            : catMatch?.companionGift,
        sku: livePatch?.sku || p.sku || catMatch?.sku,
        lastSyncedAt: livePatch?.lastSyncedAt || p.lastSyncedAt || liveLastSyncAt || undefined,
      };
    });
  }, [rawProducts, liveProductOverlay, liveLastSyncAt]);

  const policies: Policy[] = useMemo(() => {
    return rawPolicies.map((pol) => {
      const p2 = PHASE2_POLICIES.find(
        (x) => x.id === pol.id || normalizeMatch(x.category) === normalizeMatch(pol.category)
      );
      if (!p2) return pol;
      return {
        ...pol,
        applicableCases: pol.applicableCases || p2.applicableCases,
        conditions: pol.conditions || p2.conditions,
        exceptions: pol.exceptions || p2.exceptions,
        requiredAction: pol.requiredAction || p2.requiredAction,
        suggestedReply: pol.suggestedReply || p2.suggestedReply,
        source: pol.source || p2.source,
      };
    });
  }, [rawPolicies]);

  const systemLinks: SystemLink[] = useMemo(() => {
    return rawSystemLinks.map((sys) => {
      const s2 = PHASE2_SYSTEM_LINKS.find(
        (x) => x.id === sys.id || normalizeMatch(x.systemName) === normalizeMatch(sys.systemName)
      );
      if (!s2) return sys;
      return {
        ...sys,
        mainCategory: sys.mainCategory || s2.mainCategory,
        subCategory: sys.subCategory || s2.subCategory,
        loginMethod: sys.loginMethod || s2.loginMethod,
        systemStatus: sys.systemStatus || s2.systemStatus,
        otpNote: sys.otpNote || s2.otpNote,
      };
    });
  }, [rawSystemLinks]);

  const effectiveBranding: SiteBrandingSettings | null = useMemo(() => {
    if (!branding && !liveLastSyncAt) return branding;
    return {
      updatedBy: branding?.updatedBy || 'system',
      activeThemeId: DEFAULT_THEME_ID,
      ...branding,
      lastStoreSyncAt: liveLastSyncAt || branding?.lastStoreSyncAt,
    };
  }, [branding, liveLastSyncAt]);

  const uiConfig: SiteUiConfig = useMemo(
    () => resolveUiConfig(effectiveBranding, previewUiConfig),
    [effectiveBranding, previewUiConfig]
  );

  // Apply global Arabic typography family & scale variables across the entire app
  useEffect(() => {
    applyTypographyToDocument(uiConfig.typography);
  }, [uiConfig.typography]);

  // Auto-seed missing unified knowledge ONCE per session ONLY when signed in as Tier 1 Sensitive Admin
  useEffect(() => {
    const missingCoreCollections =
      rawProducts.length === 0 ||
      situations.length === 0 ||
      rawSystemLinks.length < 5 ||
      inquiries.length < 99;
    const needsUpgrade = branding
      ? Number(branding.knowledgeSeedVersion || 0) < KNOWLEDGE_SEED_VERSION || missingCoreCollections
      : missingCoreCollections;

    if (
      accessState === 'authorized' &&
      isSensitiveAdmin &&
      !dataLoading &&
      brandingLoaded &&
      !autoSeedTriggeredRef.current &&
      needsUpgrade
    ) {
      autoSeedTriggeredRef.current = true;
      seedMissingPhase2Data()
        .then((res) => {
          setSchemaUpgradePending(Boolean(res.schemaUpgradePending));
          if (res.seeded) notify('success', res.message);
        })
        .catch((err) => {
          console.error('Auto-seed note:', err);
        });
    }
  }, [
    accessState,
    isSensitiveAdmin,
    dataLoading,
    brandingLoaded,
    branding,
    rawProducts.length,
    situations.length,
    rawSystemLinks.length,
    inquiries.length,
    notify,
  ]);

  // Personal Preferences Updater (Per-User Cloud Persistence in Firestore)
  const updateUserPreferences = useCallback(
    async (
      patch: Partial<
        Pick<
          UserPreferences,
          'themeId' | 'themeMode' | 'favoriteProducts' | 'favoriteSituations' | 'favoritePolicies' | 'dashboardShortcuts'
        >
      >
    ) => {
      if (!firebaseUser?.email) return;
      const next = {
        themeId: patch.themeId ?? userPreferences?.themeId ?? branding?.activeThemeId ?? DEFAULT_THEME_ID,
        themeMode: patch.themeMode ?? userPreferences?.themeMode ?? branding?.themeMode ?? 'light',
        favoriteProducts: patch.favoriteProducts ?? userPreferences?.favoriteProducts ?? [],
        favoriteSituations: patch.favoriteSituations ?? userPreferences?.favoriteSituations ?? [],
        favoritePolicies: patch.favoritePolicies ?? userPreferences?.favoritePolicies ?? [],
        dashboardShortcuts: patch.dashboardShortcuts ?? userPreferences?.dashboardShortcuts ?? DEFAULT_SHORTCUTS,
      };
      await runTrackedMutation(() => saveUserPreferences(next));
    },
    [firebaseUser?.email, userPreferences, branding?.activeThemeId, branding?.themeMode, runTrackedMutation]
  );

  const toggleTheme = useCallback(() => {
    const nextMode: 'light' | 'dark' = effectiveThemeMode === 'dark' ? 'light' : 'dark';
    if (previewTheme) {
      setPreviewTheme({ ...previewTheme, themeMode: nextMode });
      return;
    }
    if (accessState === 'authorized') {
      updateUserPreferences({ themeMode: nextMode }).catch((err) =>
        notify('error', parseFriendlyFirestoreError(err))
      );
    }
  }, [effectiveThemeMode, previewTheme, accessState, updateUserPreferences, notify]);

  const setThemeModeExplicit = useCallback(
    (mode: 'light' | 'dark') => {
      if (previewTheme) {
        setPreviewTheme({ ...previewTheme, themeMode: mode });
        return;
      }
      if (accessState === 'authorized') {
        updateUserPreferences({ themeMode: mode }).catch((err) =>
          notify('error', parseFriendlyFirestoreError(err))
        );
      }
    },
    [previewTheme, accessState, updateUserPreferences, notify]
  );

  const toggleFavorite = useCallback(
    async (kind: 'products' | 'situations' | 'policies', id: string) => {
      const currentList =
        kind === 'products'
          ? userPreferences?.favoriteProducts || []
          : kind === 'situations'
            ? userPreferences?.favoriteSituations || []
            : userPreferences?.favoritePolicies || [];
      const exists = currentList.includes(id);
      const nextList = exists ? currentList.filter((x) => x !== id) : [id, ...currentList].slice(0, 100);
      try {
        await updateUserPreferences(
          kind === 'products'
            ? { favoriteProducts: nextList }
            : kind === 'situations'
              ? { favoriteSituations: nextList }
              : { favoritePolicies: nextList }
        );
        notify('success', exists ? 'تمت الإزالة من المفضلة.' : 'تمت الإضافة إلى مفضلتك الشخصية.');
      } catch (err) {
        notify('error', parseFriendlyFirestoreError(err));
      }
    },
    [userPreferences, updateUserPreferences, notify]
  );

  const toggleShortcut = useCallback(
    async (sectionId: StaffSectionId) => {
      const current = userPreferences?.dashboardShortcuts || DEFAULT_SHORTCUTS;
      const exists = current.includes(sectionId);
      const next = exists ? current.filter((x) => x !== sectionId) : [...current, sectionId].slice(0, 8);
      try {
        await updateUserPreferences({ dashboardShortcuts: next });
        notify('success', exists ? 'تمت إزالة الاختصار.' : 'تمت إضافة الاختصار إلى لوحة التحكم.');
      } catch (err) {
        notify('error', parseFriendlyFirestoreError(err));
      }
    },
    [userPreferences, updateUserPreferences, notify]
  );

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (authLoading) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google Sign-In failed:', error);
      const friendlyMessage = parseFriendlyAuthError(error);
      setAuthError(friendlyMessage);
      notify('error', friendlyMessage);
    } finally {
      setAuthLoading(false);
    }
  }, [authLoading, notify]);

  const logout = useCallback(async () => {
    try {
      setAuthError(null);
      await signOut(auth);
      notify('info', 'تم تسجيل الخروج بنجاح.');
    } catch (error) {
      notify('error', parseFriendlyFirestoreError(error));
    }
  }, [notify]);

  const runInitialSeed = useCallback(async () => {
    if (!isSensitiveAdmin) {
      notify('error', 'هذه العملية مقصورة على مديري النظام الحساسين فقط.');
      return;
    }
    setSeedingPhase2(true);
    setSaveStatus('syncing');
    try {
      const res = await seedInitialFirestoreData();
      setSaveStatus('synced');
      notify(res.seeded ? 'success' : 'info', res.message);
    } catch (error) {
      setSaveStatus('error', parseFriendlyFirestoreError(error));
      notify('error', parseFriendlyFirestoreError(error));
    } finally {
      setSeedingPhase2(false);
    }
  }, [isSensitiveAdmin, notify, setSaveStatus]);

  const runPhase2MissingSeed = useCallback(async () => {
    if (!isSensitiveAdmin) {
      notify('error', 'هذه العملية مقصورة على مديري النظام الحساسين فقط.');
      return;
    }
    setSeedingPhase2(true);
    setSaveStatus('syncing');
    try {
      const res = await seedMissingPhase2Data({ forceCheck: true });
      if (res.schemaUpgradePending) setSchemaUpgradePending(true);
      setSaveStatus('synced');
      notify(res.seeded ? 'success' : 'info', res.message);
    } catch (error) {
      setSaveStatus('error', parseFriendlyFirestoreError(error));
      notify('error', parseFriendlyFirestoreError(error));
    } finally {
      setSeedingPhase2(false);
    }
  }, [isSensitiveAdmin, notify, setSaveStatus]);

  const syncLiveCatalog = useCallback(async () => {
    if (!isAdmin) return;
    setSyncingCatalog(true);
    setSaveStatus('syncing');
    try {
      const res = await syncLiveMashaerCatalogToFirestore(products, branding?.syncHistory);
      const overlay: Record<string, Partial<Product>> = {};
      for (const p of res.products) {
        overlay[p.id] = p;
      }
      setLiveProductOverlay(overlay);
      setLiveLastSyncAt(res.syncedAt);
      if (res.schemaUpgradePending) setSchemaUpgradePending(true);
      setSaveStatus('synced');
      notify(
        'success',
        `تمت مزامنة ${res.products.length} منتج من mashaer.store (تحديث ${res.updatedCount} · إضافة ${res.createdCount} · تعارضات محمية ${res.conflictCount} · تغيرات أسعار ${res.priceChanges}).`
      );
    } catch (error) {
      const msg = parseFriendlyFirestoreError(error);
      setSaveStatus('error', msg);
      notify('error', msg);
    } finally {
      setSyncingCatalog(false);
    }
  }, [isAdmin, products, branding?.syncHistory, notify, setSaveStatus]);

  const globalSearch = useCallback(
    (queryText: string): GlobalSearchResult[] => {
      const qRaw = queryText.trim();
      if (!qRaw) return [];
      const qNorm = normalizeArabicSearch(qRaw);
      const qLower = qRaw.toLowerCase();
      const tokens = tokenizeArabicWithSynonyms(qRaw);
      const skuTokens = qLower.split(/\s+/).filter((t) => t.length >= 2);
      const results: GlobalSearchResult[] = [];

      const calcScore = (primary: string, secondary: string): number => {
        const p = normalizeArabicSearch(primary);
        const s = normalizeArabicSearch(secondary);
        const pRaw = primary.toLowerCase();
        const sRaw = secondary.toLowerCase();
        let score = 0;
        if (p.includes(qNorm) || pRaw.includes(qLower)) score += 12;
        if (s.includes(qNorm) || sRaw.includes(qLower)) score += 7;
        for (const t of tokens) {
          if (p.includes(t)) score += 4;
          if (s.includes(t)) score += 2;
        }
        for (const t of skuTokens) {
          if (pRaw.includes(t)) score += 4;
          if (sRaw.includes(t)) score += 2;
        }
        return score;
      };

      for (const inq of inquiries) {
        const score = calcScore(`${inq.question} ${inq.category}`, inq.answer);
        if (score > 0) {
          results.push({
            id: inq.id,
            sectionId: 'inquiries',
            sectionLabel: SECTION_LABELS.inquiries,
            title: inq.question,
            answer: inq.answer,
            needsAdminReview: inq.needsAdminReview,
            score,
          });
        }
      }

      for (const resp of cannedResponses) {
        const score = calcScore(
          `${resp.title} ${resp.category}`,
          `${resp.content} ${resp.internalNotes || ''}`
        );
        if (score > 0) {
          results.push({
            id: resp.id,
            sectionId: 'responses',
            sectionLabel: SECTION_LABELS.responses,
            title: `${resp.title} (${resp.category})`,
            answer: resp.content,
            internalProcedure: resp.internalNotes,
            score,
          });
        }
      }

      for (const pol of policies) {
        const score = calcScore(
          `${pol.title} ${pol.category} ${pol.escalationDept || ''}`,
          `${pol.content} ${pol.summary || ''} ${pol.applicableCases || ''} ${pol.requiredAction || ''} ${pol.suggestedReply || ''}`
        );
        if (score > 0) {
          results.push({
            id: pol.id,
            sectionId: 'policies',
            sectionLabel: SECTION_LABELS.policies,
            title: pol.title,
            answer: pol.suggestedReply || pol.content,
            internalProcedure: pol.requiredAction,
            responsibleDept: pol.escalationDept,
            needsAdminReview: pol.needsAdminReview,
            score,
          });
        }
      }

      for (const sit of situations) {
        const score = calcScore(
          `${sit.customerInquiry} ${sit.category} ${sit.subCategory || ''} ${sit.situationNumber}`,
          `${sit.cannedReply} ${sit.internalProcedure} ${sit.internalNotes || ''}`
        );
        if (score > 0) {
          results.push({
            id: sit.id,
            sectionId: 'situations',
            sectionLabel: SECTION_LABELS.situations,
            title: `موقف #${sit.situationNumber}: ${sit.customerInquiry}`,
            answer: sit.cannedReply,
            internalProcedure: sit.internalProcedure,
            responsibleDept: sit.responsibleDept,
            needsAdminReview: sit.needsAdminReview,
            score: sit.isImportant ? score + 2 : score,
          });
        }
      }

      for (const ret of returnStages) {
        const score = calcScore(
          `${ret.stage} ${ret.condition}`,
          `${ret.cannedReply} ${ret.procedure}`
        );
        if (score > 0) {
          results.push({
            id: ret.id,
            sectionId: 'returns',
            sectionLabel: SECTION_LABELS.returns,
            title: `${ret.stage}: ${ret.condition}`,
            answer: ret.cannedReply,
            internalProcedure: ret.procedure,
            needsAdminReview: ret.needsAdminReview,
            score,
          });
        }
      }

      for (const prd of products) {
        const pricesText = prd.countryPrices
          ? GCC_COUNTRIES.map((c) => {
              const e = prd.countryPrices?.[c.code];
              return e && e.price !== null ? `${c.nameAr} ${e.price} ${e.currency}` : '';
            })
              .filter(Boolean)
              .join(' · ')
          : '';
        const haystack = buildProductSearchHaystack(prd);
        const score = calcScore(
          `${prd.nameAr} ${prd.sku || ''} ${prd.fragranceCharacter || ''} ${prd.occasionUsage || ''}`,
          `${haystack} ${pricesText}`
        );
        if (score > 0) {
          results.push({
            id: prd.id,
            sectionId: 'products',
            sectionLabel: SECTION_LABELS.products,
            title: `${prd.nameAr}${prd.sku ? ` · ${prd.sku}` : ''}`,
            answer: `${prd.officialDescription}${prd.notesAndIngredients ? `\nالنوتات والمكونات: ${prd.notesAndIngredients}` : ''}${pricesText ? `\nالأسعار: ${pricesText}` : ''}`,
            internalProcedure: prd.internalNotes,
            needsAdminReview: prd.reviewStatus === 'needs_review',
            score,
          });
        }
      }

      for (const sys of systemLinks) {
        if (!isAdmin && sys.visibility === 'admins_only') continue;
        const score = calcScore(
          `${sys.systemName} ${sys.mainCategory || ''} ${sys.subCategory || ''}`,
          `${sys.description || ''} ${sys.usageInstructions || ''}`
        );
        if (score > 0) {
          results.push({
            id: sys.id,
            sectionId: 'systems',
            sectionLabel: SECTION_LABELS.systems,
            title: `${sys.systemName}${sys.mainCategory ? ` (${sys.mainCategory})` : ''}`,
            answer: `${sys.description || ''}\nالرابط: ${sys.url}`,
            internalProcedure: sys.usageInstructions,
            score,
          });
        }
      }

      for (const phr of quickPhrases) {
        const score = calcScore(phr.purpose, phr.phrase);
        if (score > 0) {
          results.push({
            id: phr.id,
            sectionId: 'situations',
            sectionLabel: 'العبارات السريعة',
            title: phr.purpose,
            answer: phr.phrase,
            score,
          });
        }
      }

      return results.sort((a, b) => b.score - a.score).slice(0, 45);
    },
    [inquiries, cannedResponses, policies, situations, returnStages, products, systemLinks, quickPhrases, isAdmin]
  );

  return (
    <HubContext.Provider
      value={{
        firebaseUser,
        accessState,
        roleTier,
        isSensitiveAdmin,
        isOperationalAdmin,
        isAdmin,
        isEmployee,
        allowedSections,
        currentUserProfile,
        userPreferences,
        dataLoading,
        isOffline,
        saveStatus,
        lastSyncError,
        setSaveStatus,
        runTrackedMutation,
        quotaStats,
        themeMode: effectiveThemeMode,
        activeThemeId: effectiveActiveThemeId,
        previewTheme,
        setPreviewTheme,
        uiConfig,
        previewUiConfig,
        setPreviewUiConfig,
        toggleTheme,
        setThemeModeExplicit,
        updateUserPreferences,
        toggleFavorite,
        toggleShortcut,
        signInWithGoogle,
        authLoading,
        authError,
        clearAuthError,
        logout,
        notify,
        toasts,
        dismissToast,
        cannedResponses,
        inquiries,
        policies,
        situations,
        returnStages,
        quickPhrases,
        employeeAlerts,
        products,
        systemLinks,
        systemCredentials,
        branding: effectiveBranding,
        categories,
        authorizedUsers,
        auditLogs,
        backups,
        syncingCatalog,
        seedingPhase2,
        schemaUpgradePending,
        runInitialSeed,
        runPhase2MissingSeed,
        syncLiveCatalog,
        globalSearch,
      }}
    >
      {children}
    </HubContext.Provider>
  );
}

export function useHub(): HubContextValue {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub must be used within HubProvider');
  return ctx;
}
