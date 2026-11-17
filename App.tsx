import React, { useEffect, useState } from 'react';
import { HubProvider, useHub } from './context/HubContext';
import { AuthGate } from './components/AuthGate';
import { AppShell } from './components/AppShell';
import { GlobalSearchResults } from './components/GlobalSearchResults';
import { HomeView } from './components/views/HomeView';
import { CannedResponsesView } from './components/views/CannedResponsesView';
import { InquiriesView } from './components/views/InquiriesView';
import { PoliciesView } from './components/views/PoliciesView';
import { SituationsView } from './components/views/SituationsView';
import { ReturnsWorkflowView } from './components/views/ReturnsWorkflowView';
import { ProductsView } from './components/views/ProductsView';
import { SystemsView } from './components/views/SystemsView';
import { AuditLogsView } from './components/views/AuditLogsView';
import { BackupRestoreView } from './components/views/BackupRestoreView';
import { UsersManagementView } from './components/views/UsersManagementView';
import { SettingsView } from './components/views/SettingsView';
import { SENSITIVE_SECTIONS } from './lib/auth-constants';
import type { SectionId, StaffSectionId } from './types/hub';

class HubErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-[var(--hub-bg)] flex items-center justify-center p-6"
        >
          <div className="max-w-lg w-full rounded-2xl border border-red-200 dark:border-red-800 bg-[var(--hub-surface)] p-6 space-y-3 text-center">
            <h2 className="text-lg font-bold text-[var(--hub-heading)]">حدث خطأ غير متوقع</h2>
            <p className="text-xs text-[var(--hub-muted)] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--hub-button)] hover:bg-[var(--hub-button-hover)] text-[var(--hub-button-text)] cursor-pointer"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function HubWorkspace() {
  const { isSensitiveAdmin, isAdmin, allowedSections } = useHub();
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  useEffect(() => {
    if (SENSITIVE_SECTIONS.includes(activeSection) && !isSensitiveAdmin) {
      setActiveSection('home');
      return;
    }
    if (!isAdmin && !SENSITIVE_SECTIONS.includes(activeSection) && !allowedSections.includes(activeSection as StaffSectionId)) {
      setActiveSection('home');
    }
  }, [activeSection, isSensitiveAdmin, isAdmin, allowedSections]);

  const handleSelectSection = (section: SectionId) => {
    setGlobalSearchQuery('');
    if (SENSITIVE_SECTIONS.includes(section) && !isSensitiveAdmin) {
      return;
    }
    if (!isAdmin && !allowedSections.includes(section as StaffSectionId)) {
      return;
    }
    setActiveSection(section);
  };

  const renderSection = () => {
    if (globalSearchQuery.trim()) {
      return (
        <GlobalSearchResults
          query={globalSearchQuery}
          onClear={() => setGlobalSearchQuery('')}
          onNavigate={handleSelectSection}
        />
      );
    }

    if (SENSITIVE_SECTIONS.includes(activeSection) && !isSensitiveAdmin) {
      return <HomeView onNavigate={handleSelectSection} />;
    }

    switch (activeSection) {
      case 'home':
        return <HomeView onNavigate={handleSelectSection} />;
      case 'responses':
        return <CannedResponsesView />;
      case 'inquiries':
        return <InquiriesView />;
      case 'policies':
        return <PoliciesView />;
      case 'situations':
        return <SituationsView />;
      case 'returns':
        return <ReturnsWorkflowView />;
      case 'products':
        return <ProductsView />;
      case 'systems':
        return <SystemsView />;
      case 'audit':
        return <AuditLogsView />;
      case 'backup':
        return <BackupRestoreView />;
      case 'users':
        return <UsersManagementView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView onNavigate={handleSelectSection} />;
    }
  };

  return (
    <AppShell
      activeSection={activeSection}
      onSelectSection={handleSelectSection}
      searchQuery={globalSearchQuery}
      onSearchChange={setGlobalSearchQuery}
    >
      {renderSection()}
    </AppShell>
  );
}

export default function App() {
  return (
    <HubErrorBoundary>
      <HubProvider>
        <AuthGate>
          <HubWorkspace />
        </AuthGate>
      </HubProvider>
    </HubErrorBoundary>
  );
}
