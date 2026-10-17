import React, { useState, useMemo } from 'react';
import { Dealer, Lead, LeadStatus } from '../types';
import { parsePrefixes, routeLeadToDealer } from '../utils/assignment';
import { createDealer } from '../services/leadService';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
  Search,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Plus,
  X,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Check,
  ExternalLink,
} from 'lucide-react';

interface DealersPageProps {
  dealers: Dealer[];
  leads: Lead[];
  onDealerAdded?: (dealer: Dealer) => void;
}

export const DealersPage: React.FC<DealersPageProps> = ({
  dealers,
  leads,
  onDealerAdded,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [testPincode, setTestPincode] = useState('');

  // Add Dealer Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Form Fields
  const [dealerId, setDealerId] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincodePrefixesInput, setPincodePrefixesInput] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Calculate next dealer ID suggestion (e.g. D09, D10)
  const suggestedDealerId = useMemo(() => {
    let maxNum = 0;
    dealers.forEach((d) => {
      const match = d.dealerId.match(/^D(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    return `D${nextNum < 10 ? '0' + nextNum : nextNum}`;
  }, [dealers]);

  // Open modal and pre-fill suggested ID
  const handleOpenAddModal = () => {
    setDealerId(suggestedDealerId);
    setName('');
    setCity('');
    setState('');
    setPincodePrefixesInput('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Parse entered prefixes in real time
  const parsedPrefixes = useMemo(() => {
    return pincodePrefixesInput
      .split(/[|,\s]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [pincodePrefixesInput]);

  // Detect any prefix overlap with existing dealers
  const prefixConflicts = useMemo(() => {
    const conflicts: { prefix: string; existingDealer: Dealer }[] = [];
    const currentCleanId = dealerId.trim().toUpperCase();

    parsedPrefixes.forEach((prefix) => {
      dealers.forEach((d) => {
        if (d.dealerId.toUpperCase() === currentCleanId) return;
        const existingList = parsePrefixes(d.pincodePrefixes);
        if (existingList.includes(prefix)) {
          conflicts.push({ prefix, existingDealer: d });
        }
      });
    });

    return conflicts;
  }, [parsedPrefixes, dealers, dealerId]);

  // Handle Form Submission
  const handleCreateDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanId = dealerId.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanPrefixes = parsedPrefixes.join('|');

    if (!cleanId) {
      setFormError('Dealer ID is required (e.g. D09).');
      return;
    }

    if (!/^[a-zA-Z0-9_\-.]+$/.test(cleanId)) {
      setFormError('Dealer ID may only contain letters, numbers, hyphens, and underscores.');
      return;
    }

    if (cleanName.length < 2) {
      setFormError('Dealership name must be at least 2 characters.');
      return;
    }

    if (parsedPrefixes.length === 0) {
      setFormError('Please specify at least one 3-digit pincode prefix (e.g. 518).');
      return;
    }

    for (const p of parsedPrefixes) {
      if (!/^\d{3}$/.test(p)) {
        setFormError(`Prefix "${p}" is invalid. Each prefix must be exactly 3 digits (e.g. 518, 506).`);
        return;
      }
    }

    if (phone.trim() && !/^[6-9]\d{9}$/.test(phone.trim().replace(/\D/g, ''))) {
      setFormError('Phone number should be a valid 10-digit Indian mobile number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanPhone = phone.trim().replace(/\D/g, '');
      const created = await createDealer({
        dealerId: cleanId,
        name: cleanName,
        pincodePrefixes: cleanPrefixes,
        city: city.trim(),
        state: state.trim(),
        contactPerson: contactPerson.trim(),
        phone: cleanPhone,
        email: email.trim(),
      });

      if (onDealerAdded) {
        onDealerAdded(created);
      }

      setSuccessBanner(
        `Dealer ${created.dealerId} (${created.name}) successfully registered with prefix territory ${created.pincodePrefixes}!`
      );
      setIsAddModalOpen(false);

      // Auto-set the territory lookup to test the new dealer's first prefix
      if (parsedPrefixes.length > 0) {
        setTestPincode(`${parsedPrefixes[0]}001`);
      }
    } catch (err: any) {
      console.error('Failed to create dealer: ', err);
      setFormError(err.message || 'Failed to register dealer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate assigned leads and status counts for each dealer directly from live Firestore leads
  const dealerStats = useMemo(() => {
    const stats: Record<
      string,
      { total: number; byStatus: Record<LeadStatus, number> }
    > = {};

    dealers.forEach((d) => {
      stats[d.dealerId] = {
        total: 0,
        byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
      };
    });

    // In-house fallback stats
    stats['INHOUSE'] = {
      total: 0,
      byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
    };

    leads.forEach((l) => {
      const id = l.assignedDealerId || 'INHOUSE';
      if (!stats[id]) {
        stats[id] = {
          total: 0,
          byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
        };
      }
      stats[id].total += 1;
      if (l.status && stats[id].byStatus[l.status] !== undefined) {
        stats[id].byStatus[l.status] += 1;
      }
    });

    return stats;
  }, [dealers, leads]);

  const filteredDealers = dealers.filter((d) => {
    const term = searchTerm.toLowerCase();
    return (
      d.name.toLowerCase().includes(term) ||
      d.dealerId.toLowerCase().includes(term) ||
      (d.city && d.city.toLowerCase().includes(term)) ||
      (d.state && d.state.toLowerCase().includes(term)) ||
      (d.pincodePrefixes && d.pincodePrefixes.includes(term))
    );
  });

  const testResult = testPincode.length >= 3 ? routeLeadToDealer(testPincode, dealers) : null;

  return (
    <div className="space-y-6">
      {/* Success Notification Banner */}
      {successBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl flex items-center justify-between text-xs shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Territory Pincode Lookup Widget */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white tracking-wide">
                Territory Coverage & Prefix Lookup
              </h3>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Enter any 6-digit Indian postal code to immediately resolve its servicing dealer territory across all active dealers.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="text"
              maxLength={6}
              value={testPincode}
              onChange={(e) => setTestPincode(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 560001 or 518001"
              className="bg-slate-950 border border-slate-700 px-3 py-2 rounded-lg text-xs font-mono text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 w-full md:w-56"
            />
          </div>
        </div>

        {testResult && (
          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Prefix {testResult.matchedPrefix}:</span>
              <span
                className={`font-semibold px-2.5 py-0.5 rounded-full ${
                  testResult.isFallback
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {testResult.dealerName} ({testResult.dealerId})
              </span>
            </div>
            {testResult.dealer && (
              <span className="text-slate-400 text-[11px]">
                {testResult.dealer.city}{testResult.dealer.state ? `, ${testResult.dealer.state}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Network Header & Search Bar & Add Dealer Button */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900">
            Authorized Dealerships ({dealers.length})
          </h2>
          <span className="bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
            Live in Firestore
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search dealer, city, prefix..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={handleOpenAddModal}
            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Dealer</span>
          </button>
        </div>
      </div>

      {/* Dealer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {filteredDealers.map((dealer) => {
          const stats = dealerStats[dealer.dealerId] || {
            total: 0,
            byStatus: { New: 0, Contacted: 0, Converted: 0, Lost: 0 },
          };
          const prefixes = parsePrefixes(dealer.pincodePrefixes);

          return (
            <div
              key={dealer.dealerId}
              className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {dealer.dealerId}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                      {dealer.name}
                    </h3>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>

                {/* Location */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {dealer.city}{dealer.state ? `, ${dealer.state}` : ''}
                  </span>
                </div>

                {/* Contact Info (Source fields only) */}
                <div className="space-y-1.5 text-xs text-slate-600 pt-3 border-t border-slate-100">
                  {dealer.contactPerson && (
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dealer.contactPerson}</span>
                    </div>
                  )}
                  {dealer.phone && (
                    <div className="flex items-center gap-2 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dealer.phone}</span>
                    </div>
                  )}
                  {dealer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{dealer.email}</span>
                    </div>
                  )}
                </div>

                {/* Covered Pincode Prefixes */}
                <div className="mt-3.5 pt-3 border-t border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                    Covered 3-Digit Prefixes:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {prefixes.map((pref) => (
                      <span
                        key={pref}
                        className="font-mono text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold"
                      >
                        {pref}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lead Counts Breakdown */}
              <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 -mx-5 -mb-5 p-3.5 rounded-b-xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-slate-500 font-medium">Assigned Leads:</span>
                  <span className="font-bold text-slate-900 font-mono text-sm">
                    {stats.total}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                  <div className="p-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    <div className="font-bold">{stats.byStatus.New}</div>
                    <div className="text-[9px]">New</div>
                  </div>
                  <div className="p-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    <div className="font-bold">{stats.byStatus.Contacted}</div>
                    <div className="text-[9px]">Contact</div>
                  </div>
                  <div className="p-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <div className="font-bold">{stats.byStatus.Converted}</div>
                    <div className="text-[9px]">Won</div>
                  </div>
                  <div className="p-1 rounded bg-rose-50 text-rose-700 border border-rose-200">
                    <div className="font-bold">{stats.byStatus.Lost}</div>
                    <div className="text-[9px]">Lost</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* In-House Sales Fallback Card */}
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-xs flex flex-col justify-between bg-amber-50/10">
          <div>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  INHOUSE
                </span>
                <h3 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                  PURE Energy In-house Sales
                </h3>
              </div>
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-3">
              HQ Direct / Unserviced Regions
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Default fallback routing for all customer enquiries whose pincode does not match any of the regional dealer territories.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-amber-200 bg-amber-50/50 -mx-5 -mb-5 p-3.5 rounded-b-xl">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-amber-800 font-medium">Assigned Leads:</span>
              <span className="font-bold text-slate-900 font-mono text-sm">
                {dealerStats['INHOUSE']?.total || 0}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
              <div className="p-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                <div className="font-bold">{dealerStats['INHOUSE']?.byStatus.New || 0}</div>
                <div className="text-[9px]">New</div>
              </div>
              <div className="p-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                <div className="font-bold">{dealerStats['INHOUSE']?.byStatus.Contacted || 0}</div>
                <div className="text-[9px]">Contact</div>
              </div>
              <div className="p-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                <div className="font-bold">{dealerStats['INHOUSE']?.byStatus.Converted || 0}</div>
                <div className="text-[9px]">Won</div>
              </div>
              <div className="p-1 rounded bg-rose-50 text-rose-700 border border-rose-200">
                <div className="font-bold">{dealerStats['INHOUSE']?.byStatus.Lost || 0}</div>
                <div className="text-[9px]">Lost</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Dealer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add Authorized Dealership</h3>
                  <p className="text-[11px] text-slate-500">Configure territory prefixes for automated lead routing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateDealer} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* ID and Name */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dealer ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={dealerId}
                    onChange={(e) => setDealerId(e.target.value.toUpperCase())}
                    placeholder="e.g. D09"
                    maxLength={32}
                    className="w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Suggested next: {suggestedDealerId}
                  </span>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dealership Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Apex Solar Solutions"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* City and State */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Kurnool"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operating State
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Andhra Pradesh"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Territory 3-Digit Pincode Prefixes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Covered 3-Digit Pincode Prefixes *
                  </label>
                  <span className="text-[10px] text-slate-500">
                    Pipe, comma, or space separated
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={pincodePrefixesInput}
                  onChange={(e) => setPincodePrefixesInput(e.target.value)}
                  placeholder="e.g. 518, 519 or 518|519"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />

                {/* Parsed Prefixes Chips */}
                {parsedPrefixes.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 mr-1">Prefixes:</span>
                    {parsedPrefixes.map((p) => {
                      const isValid = /^\d{3}$/.test(p);
                      return (
                        <span
                          key={p}
                          className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            isValid
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {isValid ? <Check className="w-3 h-3 text-emerald-600" /> : '!'}
                          {p}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Prefix Conflict Alert */}
                {prefixConflicts.length > 0 && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Territory Overlap Notice</span>
                    </div>
                    {prefixConflicts.map((c, i) => (
                      <p key={i} className="text-amber-800">
                        Prefix <span className="font-mono font-bold">{c.prefix}</span> is already covered by <span className="font-semibold">{c.existingDealer.dealerId} ({c.existingDealer.name})</span>. The router deterministically assigns leads by lower dealer ID.
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact Information */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700 block mb-2">
                  Contact Information (Optional)
                </span>
                <div className="space-y-2.5">
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      placeholder="Manager / Contact person name"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit mobile"
                        maxLength={10}
                        className="w-full pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="dealer@pureenergy.in"
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulation Note */}
              {parsedPrefixes.length > 0 && /^\d{3}$/.test(parsedPrefixes[0]) && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-lg text-emerald-800 text-[11px]">
                  <span className="font-semibold block mb-0.5">Automated Routing Simulation:</span>
                  Customer enquiries from pincodes starting with{' '}
                  <span className="font-mono font-bold">{parsedPrefixes.join(', ')}</span> (e.g. {parsedPrefixes[0]}001) will immediately route to this dealership.
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Registering...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Register Dealership</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
