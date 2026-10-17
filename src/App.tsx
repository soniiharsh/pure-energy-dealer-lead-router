/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { AddLeadPage } from './pages/AddLeadPage';
import { DealersPage } from './pages/DealersPage';
import { ImportReconciliationPage } from './pages/ImportReconciliationPage';
import { Dealer, Lead, LeadStatus } from './types';
import {
  subscribeDealers,
  subscribeLeads,
  syncDatabaseWithOriginalData,
  updateLeadStatus,
} from './services/leadService';
import { db } from './services/firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Loader2, AlertCircle, Database, CheckCircle2, RefreshCw, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Firestore real-time state
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [syncSuccessNotice, setSyncSuccessNotice] = useState<string | null>(null);

  // Check if outdated placeholder data is in Firestore
  const hasOutdatedPlaceholders =
    dealers.some((d) => d.dealerId.startsWith('D00')) ||
    leads.some((l) => l.leadId.startsWith('L00'));

  // Verify connection to Firestore on boot as mandated by the Firebase skill
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('the client is offline')
        ) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
    testConnection();
  }, []);

  // Subscribe to real-time dealers & leads directly from Firestore
  useEffect(() => {
    let unsubDealers: (() => void) | undefined;
    let unsubLeads: (() => void) | undefined;

    try {
      unsubDealers = subscribeDealers(
        (updatedDealers) => {
          setDealers(updatedDealers);
          setIsLoading(false);
        },
        (err) => {
          console.warn('Dealers subscription notice: ', err);
          setIsLoading(false);
        }
      );

      unsubLeads = subscribeLeads(
        (updatedLeads) => {
          setLeads(updatedLeads);
          setIsLoading(false);
        },
        (err) => {
          console.warn('Leads subscription notice: ', err);
          setIsLoading(false);
        }
      );
    } catch (e: any) {
      console.error('Error starting Firestore subscriptions: ', e);
      setGlobalError(e.message || String(e));
      setIsLoading(false);
    }

    return () => {
      if (unsubDealers) unsubDealers();
      if (unsubLeads) unsubLeads();
    };
  }, []);

  const handleSyncFirestore = async () => {
    setIsSyncing(true);
    setGlobalError(null);
    try {
      const res = await syncDatabaseWithOriginalData({
        preserveExistingStatus: true,
        cleanPlaceholders: true,
      });

      if (res) {
        setSyncSuccessNotice(
          `Firestore successfully synchronized! ${res.dealersSynced} dealers (D01-D08) & ${res.leadsSynced} clean leads (L1001-L1035) committed. ${res.dealersPruned} placeholder dealers and ${res.leadsPruned} placeholder leads pruned.`
        );
        setTimeout(() => setSyncSuccessNotice(null), 8000);
      }
    } catch (err: any) {
      console.error('Failed to sync Firestore data: ', err);
      setGlobalError(err.message || 'Failed to synchronize database.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLeadAdded = (newLead: Lead) => {
    setLeads((prev) => {
      if (prev.some((l) => l.leadId === newLead.leadId)) return prev;
      return [newLead, ...prev];
    });
  };

  const handleDealerAdded = (newDealer: Dealer) => {
    setDealers((prev) => {
      if (prev.some((d) => d.dealerId === newDealer.dealerId)) {
        return prev.map((d) => (d.dealerId === newDealer.dealerId ? newDealer : d));
      }
      return [...prev, newDealer];
    });
  };

  const handleUpdateLeadStatus = async (leadId: string, status: LeadStatus) => {
    try {
      await updateLeadStatus(leadId, status);
    } catch (err: any) {
      console.error('Failed to update lead status: ', err);
      setGlobalError(err.message || 'Status update failed');
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-800 antialiased overflow-hidden">
      {/* Sidebar for Desktop */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setCurrentTab(tab);
            setGlobalError(null);
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
          leadsCount={leads.length}
          dealersCount={dealers.length}
        />
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-64 bg-slate-900 h-full flex flex-col z-10 shadow-2xl">
            <Sidebar
              currentTab={currentTab}
              onSelectTab={(tab) => {
                setCurrentTab(tab);
                setIsMobileMenuOpen(false);
                setGlobalError(null);
              }}
              isCollapsed={false}
              onToggleCollapse={() => setIsMobileMenuOpen(false)}
              leadsCount={leads.length}
              dealersCount={dealers.length}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <Navbar
          currentTab={currentTab}
          onNavigateToAddLead={() => setCurrentTab('add-lead')}
          onSeedData={handleSyncFirestore}
          isSeeding={isSyncing}
          totalLeads={leads.length}
          totalDealers={dealers.length}
          onToggleMobileMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Outdated Data Migration Alert Banner */}
        {hasOutdatedPlaceholders && !isLoading && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs flex items-center justify-between shadow-xs font-medium">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-slate-950" />
              <span>
                <strong>Data Synchronization Notice:</strong> Firestore currently contains previous placeholder records (e.g. D001-D008). Click to synchronize Firestore with the original CSV dataset (D01-D08 & L1001-L1035).
              </span>
            </div>
            <button
              onClick={handleSyncFirestore}
              disabled={isSyncing}
              className="bg-slate-950 text-white font-bold px-3 py-1 rounded text-xs hover:bg-slate-800 disabled:opacity-50 transition-colors shrink-0 ml-3 flex items-center gap-1.5 cursor-pointer"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>Sync Original Data</span>
            </button>
          </div>
        )}

        {/* Global Error Banner if any */}
        {globalError && (
          <div className="bg-rose-600 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{globalError}</span>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="font-bold underline text-xs px-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Global Success Notification */}
        {syncSuccessNotice && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs flex items-center justify-between shadow-xs animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncSuccessNotice}</span>
            </div>
            <button
              onClick={() => setSyncSuccessNotice(null)}
              className="text-xs text-emerald-100 hover:text-white px-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-2" />
              <p className="text-xs font-semibold text-slate-600">Connecting to Firestore...</p>
            </div>
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <DashboardPage
                  leads={leads}
                  dealers={dealers}
                  onNavigateToLeads={() => setCurrentTab('leads')}
                  onNavigateToAddLead={() => setCurrentTab('add-lead')}
                  onSelectLeadStatus={handleUpdateLeadStatus}
                />
              )}

              {currentTab === 'leads' && (
                <LeadsPage
                  leads={leads}
                  dealers={dealers}
                  onNavigateToAddLead={() => setCurrentTab('add-lead')}
                />
              )}

              {currentTab === 'add-lead' && (
                <AddLeadPage
                  dealers={dealers}
                  existingLeads={leads}
                  onLeadAdded={handleLeadAdded}
                  onNavigateToLeads={() => setCurrentTab('leads')}
                />
              )}

              {currentTab === 'dealers' && (
                <DealersPage
                  dealers={dealers}
                  leads={leads}
                  onDealerAdded={handleDealerAdded}
                />
              )}

              {currentTab === 'reconciliation' && (
                <ImportReconciliationPage
                  onSyncFirestore={handleSyncFirestore}
                  isSyncing={isSyncing}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
