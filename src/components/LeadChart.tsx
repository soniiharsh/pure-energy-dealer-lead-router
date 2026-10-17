import React from 'react';
import { LeadStatus } from '../types';

interface StatusDistributionProps {
  statusBreakdown: Record<LeadStatus, number>;
  total: number;
}

export const StatusDistributionChart: React.FC<StatusDistributionProps> = ({
  statusBreakdown,
  total,
}) => {
  const statuses: { label: LeadStatus; color: string; bg: string; border: string }[] = [
    { label: 'New', color: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Contacted', color: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Converted', color: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Lost', color: 'bg-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Lead Status Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">Live conversion pipeline breakdown</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
          {total} Total
        </span>
      </div>

      {/* Progress Bar Segment */}
      <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex mb-5 ring-1 ring-slate-200/50">
        {total === 0 ? (
          <div className="h-full w-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">
            No leads recorded yet
          </div>
        ) : (
          statuses.map((s) => {
            const count = statusBreakdown[s.label] || 0;
            const percentage = total > 0 ? (count / total) * 100 : 0;
            if (percentage === 0) return null;
            return (
              <div
                key={s.label}
                style={{ width: `${percentage}%` }}
                className={`${s.color} transition-all duration-500 relative group`}
                title={`${s.label}: ${count} (${percentage.toFixed(1)}%)`}
              />
            );
          })
        )}
      </div>

      {/* Grid of status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statuses.map((s) => {
          const count = statusBreakdown[s.label] || 0;
          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
          return (
            <div
              key={s.label}
              className={`p-3 rounded-lg border ${s.border} ${s.bg} flex flex-col justify-between`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${s.color}`} />
                <span className="text-xs font-medium text-slate-700">{s.label}</span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xl font-bold text-slate-900">{count}</span>
                <span className="text-xs font-semibold text-slate-500">{percentage}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface DealerDistributionProps {
  dealerBreakdown: Record<
    string,
    {
      dealerId: string;
      dealerName: string;
      count: number;
      byStatus: Record<LeadStatus, number>;
    }
  >;
  totalLeads: number;
}

export const DealerDistributionChart: React.FC<DealerDistributionProps> = ({
  dealerBreakdown,
  totalLeads,
}) => {
  const dealersList = Object.values(dealerBreakdown).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...dealersList.map((d) => d.count), 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Dealer-Wise Lead Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">Assigned lead volume by dealership territory</p>
        </div>
        <span className="text-xs text-slate-500">
          {dealersList.length} Territories
        </span>
      </div>

      {dealersList.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">
          No dealer assignment data available
        </div>
      ) : (
        <div className="space-y-3.5">
          {dealersList.map((dealer) => {
            const percentage = totalLeads > 0 ? ((dealer.count / totalLeads) * 100).toFixed(1) : '0';
            const barWidth = maxCount > 0 ? (dealer.count / maxCount) * 100 : 0;
            const isInHouse = dealer.dealerId === 'INHOUSE';

            return (
              <div key={dealer.dealerId} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold ${
                        isInHouse ? 'text-amber-700 font-medium' : 'text-slate-800'
                      }`}
                    >
                      {dealer.dealerName}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {dealer.dealerId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-semibold text-slate-900">{dealer.count} leads</span>
                    <span className="text-slate-400 text-[11px]">({percentage}%)</span>
                  </div>
                </div>

                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${barWidth}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${
                      isInHouse
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    }`}
                  />
                </div>

                {/* Sub-status pills for dealer */}
                <div className="flex gap-2 text-[10px] text-slate-500 pt-0.5">
                  <span className="text-blue-600 font-medium">New: {dealer.byStatus.New || 0}</span>
                  <span>•</span>
                  <span className="text-amber-600 font-medium">Contacted: {dealer.byStatus.Contacted || 0}</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-medium">Converted: {dealer.byStatus.Converted || 0}</span>
                  <span>•</span>
                  <span className="text-rose-600 font-medium">Lost: {dealer.byStatus.Lost || 0}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
