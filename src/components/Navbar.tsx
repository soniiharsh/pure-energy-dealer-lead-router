import React from 'react';
import { NavTab } from './Sidebar';
import { Plus, Database, RefreshCw, UserCheck, Menu } from 'lucide-react';

interface NavbarProps {
  currentTab: NavTab;
  onNavigateToAddLead: () => void;
  onSeedData: () => void;
  isSeeding: boolean;
  totalLeads: number;
  totalDealers: number;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onNavigateToAddLead,
  onSeedData,
  isSeeding,
  totalLeads,
  totalDealers,
  onToggleMobileMenu,
}) => {
  const getPageTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return {
          title: 'Live Lead Routing Dashboard',
          subtitle: 'Real-time performance metrics and dealer distribution from Firestore',
        };
      case 'leads':
        return {
          title: 'Leads Management',
          subtitle: 'Search, filter, update and track customer enquiries across all channels',
        };
      case 'add-lead':
        return {
          title: 'Add New Customer Lead',
          subtitle: 'Validated intake form with instant 3-digit pincode dealer routing',
        };
      case 'dealers':
        return {
          title: 'Authorized Dealer Network',
          subtitle: '8 territorial dealers, covered pincode prefixes, and live lead pipeline counts',
        };
      case 'reconciliation':
        return {
          title: 'Legacy CSV Cleaning & Reconciliation',
          subtitle: 'Audit report and deduplication analysis for 40 legacy records',
        };
      default:
        return { title: 'Dealer Lead Router', subtitle: 'PURE Energy PuREPower' };
    }
  };

  const { title, subtitle } = getPageTitle();

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Mobile hamburger & Titles */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
            {title}
          </h1>
          <p className="text-xs text-slate-500 hidden sm:block leading-none mt-0.5">
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Sync Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>Firestore Live ({totalLeads} Leads / {totalDealers} Dealers)</span>
        </div>

        {/* Database Seed Button */}
        {(totalDealers === 0 || totalLeads === 0) && (
          <button
            onClick={onSeedData}
            disabled={isSeeding}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold shadow-xs transition-colors"
            title="Seed the 8 authorized dealers and benchmark leads into Firestore"
          >
            {isSeeding ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Database className="w-3.5 h-3.5 text-amber-700" />
            )}
            <span>Seed Data</span>
          </button>
        )}

        {/* Add Lead Primary CTA */}
        {currentTab !== 'add-lead' && (
          <button
            onClick={onNavigateToAddLead}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Customer Lead</span>
            <span className="sm:hidden">Add Lead</span>
          </button>
        )}

        {/* Admin Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs ring-2 ring-slate-100">
            HS
          </div>
          <div className="hidden xl:block text-left text-xs">
            <div className="font-semibold text-slate-800 leading-tight">Harsh Soni</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-emerald-500" />
              <span>MIS Lead Admin</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
