import React, { useState, useMemo } from 'react';
import { Dealer, Lead, LeadSource, LeadStatus } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { SourceBadge } from '../components/SourceBadge';
import { updateLeadStatus } from '../services/leadService';
import { LEAD_SOURCES, LEAD_STATUSES } from '../utils/validation';
import {
  Search,
  Filter,
  Download,
  Building2,
  Phone,
  Clock,
  Eye,
  X,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
} from 'lucide-react';

interface LeadsPageProps {
  leads: Lead[];
  dealers: Dealer[];
  onNavigateToAddLead: () => void;
}

export const LeadsPage: React.FC<LeadsPageProps> = ({
  leads,
  dealers,
  onNavigateToAddLead,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dealerFilter, setDealerFilter] = useState<string>('all');

  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [updateFeedback, setUpdateFeedback] = useState<{
    leadId: string;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Search
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        lead.name.toLowerCase().includes(term) ||
        lead.phone.includes(term) ||
        lead.leadId.toLowerCase().includes(term) ||
        lead.pincode.includes(term);

      // Status
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;

      // Source
      const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter;

      // Dealer
      const matchesDealer =
        dealerFilter === 'all' ||
        lead.assignedDealerId === dealerFilter;

      return matchesSearch && matchesStatus && matchesSource && matchesDealer;
    });
  }, [leads, searchTerm, statusFilter, sourceFilter, dealerFilter]);

  // Pagination slice
  const totalPages = Math.ceil(filteredLeads.length / pageSize) || 1;
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, currentPage, pageSize]);

  // Handle status update
  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    setUpdatingLeadId(leadId);
    setUpdateFeedback(null);

    try {
      await updateLeadStatus(leadId, newStatus);
      setUpdateFeedback({
        leadId,
        type: 'success',
        message: `Status updated to ${newStatus}`,
      });
      setTimeout(() => setUpdateFeedback(null), 3000);
    } catch (err: any) {
      console.error('Failed to update lead status: ', err);
      setUpdateFeedback({
        leadId,
        type: 'error',
        message: err.message || 'Failed to update status',
      });
    } finally {
      setUpdatingLeadId(null);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredLeads.length === 0) return;

    const headers = [
      'Lead ID',
      'Customer Name',
      'Phone',
      'Pincode',
      'Product',
      'Source',
      'Assigned Dealer ID',
      'Assigned Dealer Name',
      'Status',
      'Created At',
      'Notes',
    ];

    const rows = filteredLeads.map((l) => [
      l.leadId,
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.phone}"`,
      `"${l.pincode}"`,
      `"${l.product.replace(/"/g, '""')}"`,
      `"${l.source}"`,
      `"${l.assignedDealerId}"`,
      `"${l.assignedDealerName.replace(/"/g, '""')}"`,
      `"${l.status}"`,
      `"${l.createdAt}"`,
      `"${(l.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-5">
      {/* Search and Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by customer name, phone, lead ID, or pincode..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Export and Add Lead */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredLeads.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV ({filteredLeads.length})</span>
            </button>

            <button
              onClick={onNavigateToAddLead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <span>+ Add Lead</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1 text-slate-500 font-medium">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-xs focus:ring-emerald-500 focus:outline-hidden font-medium"
          >
            <option value="all">All Statuses</option>
            {LEAD_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-xs focus:ring-emerald-500 focus:outline-hidden font-medium"
          >
            <option value="all">All Channels</option>
            {LEAD_SOURCES.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>

          {/* Dealer Filter */}
          <select
            value={dealerFilter}
            onChange={(e) => {
              setDealerFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 text-xs focus:ring-emerald-500 focus:outline-hidden font-medium max-w-[200px] truncate"
          >
            <option value="all">All Dealers & Territories</option>
            <option value="INHOUSE">In-house Sales (Fallback)</option>
            {dealers.map((d) => (
              <option key={d.dealerId} value={d.dealerId}>
                {d.name} ({d.dealerId})
              </option>
            ))}
          </select>

          {/* Reset Filters button */}
          {(statusFilter !== 'all' || sourceFilter !== 'all' || dealerFilter !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setSourceFilter('all');
                setDealerFilter('all');
                setSearchTerm('');
                setCurrentPage(1);
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1"
            >
              Reset Filters
            </button>
          )}

          <div className="ml-auto text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-800">{filteredLeads.length}</span> leads
          </div>
        </div>
      </div>

      {/* Inline Feedback Banner if any */}
      {updateFeedback && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between ${
            updateFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {updateFeedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>
              Lead <strong>{updateFeedback.leadId}</strong>: {updateFeedback.message}
            </span>
          </div>
          <button
            onClick={() => setUpdateFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-700">No matching leads found</h4>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search criteria or filters, or add a new customer enquiry.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Lead ID</th>
                    <th className="px-4 py-3">Customer Name</th>
                    <th className="px-4 py-3">Mobile & Pincode</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Assigned Dealer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedLeads.map((lead) => {
                    const isUpdating = updatingLeadId === lead.leadId;
                    const isInHouse = lead.assignedDealerId === 'INHOUSE';

                    return (
                      <tr
                        key={lead.leadId}
                        className="hover:bg-slate-50/70 transition-colors group"
                      >
                        {/* Lead ID */}
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                          {lead.leadId}
                        </td>

                        {/* Customer Name */}
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {lead.name}
                        </td>

                        {/* Phone & Pincode */}
                        <td className="px-4 py-3">
                          <div className="font-mono text-slate-800 font-medium">
                            {lead.phone}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            Pincode: {lead.pincode}
                          </div>
                        </td>

                        {/* Product */}
                        <td className="px-4 py-3 text-slate-700 max-w-[170px] truncate" title={lead.product}>
                          {lead.product}
                        </td>

                        {/* Source */}
                        <td className="px-4 py-3">
                          <SourceBadge source={lead.source} size="sm" />
                        </td>

                        {/* Assigned Dealer */}
                        <td className="px-4 py-3">
                          <div
                            className={`font-medium ${
                              isInHouse ? 'text-amber-700' : 'text-slate-900'
                            }`}
                          >
                            {lead.assignedDealerName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {lead.assignedDealerId}
                          </div>
                        </td>

                        {/* Status with Interactive Dropdown */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={lead.status}
                              disabled={isUpdating}
                              onChange={(e) =>
                                handleStatusChange(
                                  lead.leadId,
                                  e.target.value as LeadStatus
                                )
                              }
                              className={`text-xs rounded-md border py-1 px-2 font-medium cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-emerald-500 ${
                                lead.status === 'New'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : lead.status === 'Contacted'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : lead.status === 'Converted'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {LEAD_STATUSES.map((st) => (
                                <option key={st} value={st}>
                                  {st}
                                </option>
                              ))}
                            </select>
                            {isUpdating && (
                              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                            )}
                          </div>
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setSelectedLead(lead)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="View lead details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{' '}
                {Math.min(currentPage * pageSize, filteredLeads.length)} of{' '}
                {filteredLeads.length} leads
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Lead Dossier</h3>
                <span className="font-mono text-xs text-slate-500">{selectedLead.leadId}</span>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 font-medium">Customer Name</span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{selectedLead.name}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Mobile Phone</span>
                  <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">{selectedLead.phone}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Postal Pincode</span>
                  <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">{selectedLead.pincode}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Source Channel</span>
                  <div className="mt-1">
                    <SourceBadge source={selectedLead.source} size="sm" />
                  </div>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Requested PuREPower Product</span>
                <div className="text-sm font-semibold text-slate-900 mt-0.5 p-2 bg-slate-50 rounded border border-slate-200">
                  {selectedLead.product}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200 space-y-1">
                <span className="text-emerald-800 font-semibold flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <span>Assigned Dealership</span>
                </span>
                <div className="text-sm font-bold text-slate-900">
                  {selectedLead.assignedDealerName}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Dealer ID: {selectedLead.assignedDealerId}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-500">Current Lead Status:</span>
                <StatusBadge status={selectedLead.status} size="md" />
              </div>

              {selectedLead.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500 font-medium">Enquiry Notes:</span>
                  <p className="mt-1 text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200">
                    {selectedLead.notes}
                  </p>
                </div>
              )}

              <div className="text-[11px] text-slate-400 pt-2 flex justify-between">
                <span>Created: {new Date(selectedLead.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(selectedLead.updatedAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedLead(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
