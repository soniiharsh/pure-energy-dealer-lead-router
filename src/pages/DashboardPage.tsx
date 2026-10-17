import React, { useState } from 'react';
import { Dealer, Lead, LeadStatus, DashboardMetrics } from '../types';
import { StatusDistributionChart, DealerDistributionChart } from '../components/LeadChart';
import { StatusBadge } from '../components/StatusBadge';
import { SourceBadge } from '../components/SourceBadge';
import { routeLeadToDealer } from '../utils/assignment';
import { validateIndianPincode } from '../utils/validation';
import {
  Users,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Building2,
  TrendingUp,
  MapPin,
  ArrowRight,
  Clock,
} from 'lucide-react';

interface DashboardPageProps {
  leads: Lead[];
  dealers: Dealer[];
  onNavigateToLeads: () => void;
  onNavigateToAddLead: () => void;
  onSelectLeadStatus?: (leadId: string, status: LeadStatus) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  leads,
  dealers,
  onNavigateToLeads,
  onNavigateToAddLead,
}) => {
  // Pincode Quick-Router Tester
  const [testPincode, setTestPincode] = useState('');

  // 1. Compute Metrics strictly from live Firestore records
  const total = leads.length;
  const newCount = leads.filter((l) => l.status === 'New').length;
  const contactedCount = leads.filter((l) => l.status === 'Contacted').length;
  const convertedCount = leads.filter((l) => l.status === 'Converted').length;
  const lostCount = leads.filter((l) => l.status === 'Lost').length;

  const statusBreakdown: Record<LeadStatus, number> = {
    New: newCount,
    Contacted: contactedCount,
    Converted: convertedCount,
    Lost: lostCount,
  };

  // 2. Dealer Breakdown
  const dealerBreakdown: DashboardMetrics['dealerBreakdown'] = {};

  // Initialize with all dealers
  dealers.forEach((d) => {
    dealerBreakdown[d.dealerId] = {
      dealerId: d.dealerId,
      dealerName: d.name,
      count: 0,
      byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
    };
  });

  // Also include In-house Sales
  dealerBreakdown['INHOUSE'] = {
    dealerId: 'INHOUSE',
    dealerName: 'In-house Sales (Fallback)',
    count: 0,
    byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
  };

  // Populate from actual leads
  leads.forEach((l) => {
    const id = l.assignedDealerId || 'INHOUSE';
    if (!dealerBreakdown[id]) {
      dealerBreakdown[id] = {
        dealerId: id,
        dealerName: l.assignedDealerName || 'Unknown Dealer',
        count: 0,
        byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
      };
    }
    dealerBreakdown[id].count += 1;
    if (l.status && dealerBreakdown[id].byStatus[l.status] !== undefined) {
      dealerBreakdown[id].byStatus[l.status] += 1;
    }
  });

  const conversionRate = total > 0 ? ((convertedCount / total) * 100).toFixed(1) : '0';

  // Quick routing test result
  const pincodeValidation = validateIndianPincode(testPincode);
  const routeResult = testPincode.length >= 3 ? routeLeadToDealer(testPincode, dealers) : null;

  // Recent 6 leads
  const recentLeads = [...leads].slice(0, 6);

  return (
    <div className="space-y-6">
      {/* 1. Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5 sm:gap-4">
        {/* Total Leads */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Leads</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{total}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-emerald-500" />
              <span>All intake channels</span>
            </div>
          </div>
        </div>

        {/* New Leads */}
        <div className="bg-white p-4 rounded-xl border border-blue-200/80 shadow-xs flex flex-col justify-between bg-blue-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-700">New Leads</span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-blue-900">{newCount}</div>
            <div className="text-[11px] text-blue-600 mt-0.5">
              Pending contact
            </div>
          </div>
        </div>

        {/* Contacted */}
        <div className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-xs flex flex-col justify-between bg-amber-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700">Contacted</span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-900">{contactedCount}</div>
            <div className="text-[11px] text-amber-600 mt-0.5">
              In discussion
            </div>
          </div>
        </div>

        {/* Converted */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200/80 shadow-xs flex flex-col justify-between bg-emerald-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-700">Converted</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-emerald-900">{convertedCount}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              {conversionRate}% conversion rate
            </div>
          </div>
        </div>

        {/* Lost */}
        <div className="bg-white p-4 rounded-xl border border-rose-200/80 shadow-xs flex flex-col justify-between bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-700">Lost Leads</span>
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-900">{lostCount}</div>
            <div className="text-[11px] text-rose-600 mt-0.5">
              Closed unqualified
            </div>
          </div>
        </div>

        {/* Active Dealers */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Authorized Dealers</span>
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{dealers.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              + In-house fallback
            </div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Pincode Routing Tester Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-sm border border-slate-700">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold tracking-wide text-white">
                Interactive Pincode Dealer Router
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              Test any Indian pincode to see 3-digit prefix matching in real time against the 8 dealer territories.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              maxLength={6}
              value={testPincode}
              onChange={(e) => setTestPincode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit pincode (e.g. 560001)"
              className="bg-slate-950/80 border border-slate-700 text-white px-3 py-2 rounded-lg text-xs placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono w-full md:w-64"
            />
          </div>
        </div>

        {/* Live Matching Output */}
        {testPincode.length >= 3 && routeResult && (
          <div className="mt-3.5 pt-3 border-t border-slate-700/80 flex flex-wrap items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Pincode Prefix:</span>
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-emerald-400 font-semibold">
                {testPincode.slice(0, 3)}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-400">Assigned To:</span>
              <span
                className={`font-semibold px-2.5 py-0.5 rounded-full ${
                  routeResult.isFallback
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {routeResult.dealerName} ({routeResult.dealerId})
              </span>
            </div>
            {routeResult.dealer && (
              <span className="text-slate-400 text-[11px]">
                {routeResult.dealer.city}, {routeResult.dealer.state} • Covers [{routeResult.dealer.pincodePrefixes}]
              </span>
            )}
            {routeResult.isFallback && (
              <span className="text-amber-400/90 text-[11px]">
                Prefix {testPincode.slice(0, 3)} not covered by the 8 dealers → Routed to In-house Sales.
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. Distribution Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusDistributionChart
          statusBreakdown={statusBreakdown}
          total={total}
        />
        <DealerDistributionChart
          dealerBreakdown={dealerBreakdown}
          totalLeads={total}
        />
      </div>

      {/* 4. Recent Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Recent Customer Leads</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Latest enquiries received from intake channels
            </p>
          </div>
          <button
            onClick={onNavigateToLeads}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <span>View All Leads ({total})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentLeads.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">No leads in Firestore yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Add your first customer lead or seed the benchmark dataset.
            </p>
            <button
              onClick={onNavigateToAddLead}
              className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
            >
              Add First Lead
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Lead ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile & Pincode</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Assigned Dealer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLeads.map((lead) => (
                  <tr key={lead.leadId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                      {lead.leadId}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {lead.name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-slate-700">{lead.phone}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{lead.pincode}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[160px]">
                      {lead.product}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={lead.source} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{lead.assignedDealerName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{lead.assignedDealerId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
