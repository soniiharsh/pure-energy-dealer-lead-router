import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Building2,
  FileSpreadsheet,
  Zap,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'leads' | 'add-lead' | 'dealers' | 'reconciliation';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  leadsCount: number;
  dealersCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  leadsCount,
  dealersCount,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Live Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'leads' as NavTab,
      label: 'Leads Management',
      icon: Users,
      badge: leadsCount > 0 ? leadsCount : null,
    },
    {
      id: 'add-lead' as NavTab,
      label: 'Add Customer Lead',
      icon: UserPlus,
      badge: '+',
    },
    {
      id: 'dealers' as NavTab,
      label: 'Dealer Network',
      icon: Building2,
      badge: dealersCount > 0 ? dealersCount : null,
    },
    {
      id: 'reconciliation' as NavTab,
      label: 'CSV Reconciliation',
      icon: FileSpreadsheet,
      badge: '40',
    },
  ];

  return (
    <aside
      className={`relative flex flex-col bg-slate-900 text-slate-200 transition-all duration-300 border-r border-slate-800 select-none z-30 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800/80 justify-between">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <Zap className="w-5 h-5 fill-emerald-400" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-white text-base">PURE</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold uppercase tracking-wider text-[10px]">
                  PuREPower
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                Dealer Lead Router
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5 fill-emerald-400" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative group ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />
              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate text-left">
                  <span className="truncate">{item.label}</span>
                  {item.badge !== null && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        isActive
                          ? 'bg-emerald-700/80 text-emerald-100'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* System Status in Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-medium text-slate-300">Firestore Secured</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Zero-Trust ABAC Lead Rules
          </p>
        </div>
      )}

      {/* Collapse Toggle Button */}
      <button
        onClick={onToggleCollapse}
        className="h-10 flex items-center justify-center border-t border-slate-800 hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <ChevronLeft className="w-4 h-4" />
            <span>Collapse Navigation</span>
          </div>
        )}
      </button>
    </aside>
  );
};
