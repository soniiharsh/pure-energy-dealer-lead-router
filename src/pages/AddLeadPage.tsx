import React, { useState } from 'react';
import { Dealer, Lead, LeadSource } from '../types';
import { PURE_PRODUCTS, LEAD_SOURCES, normalizeIndianPhone, validateIndianPincode } from '../utils/validation';
import { routeLeadToDealer } from '../utils/assignment';
import { createLeadAtomic } from '../services/leadService';
import {
  UserPlus,
  Building2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Sparkles,
  Phone,
  MapPin,
  Package,
  Layers,
  FileText,
} from 'lucide-react';

interface AddLeadPageProps {
  dealers: Dealer[];
  existingLeads?: Lead[];
  onLeadAdded: (lead: Lead) => void;
  onNavigateToLeads: () => void;
}

export const AddLeadPage: React.FC<AddLeadPageProps> = ({
  dealers,
  existingLeads = [],
  onLeadAdded,
  onNavigateToLeads,
}) => {
  const [name, setName] = useState('');
  const [rawPhone, setRawPhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [product, setProduct] = useState<string>(PURE_PRODUCTS[0]);
  const [source, setSource] = useState<LeadSource>('Website');
  const [notes, setNotes] = useState('');

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [createdLead, setCreatedLead] = useState<Lead | null>(null);

  // Field validations
  const phoneValidation = normalizeIndianPhone(rawPhone);
  const pincodeValidation = validateIndianPincode(pincode);
  const isNameValid = name.trim().length >= 2;

  // Real-time client-side duplicate phone detection against loaded leads
  const duplicateLead = phoneValidation.isValid && existingLeads.length > 0
    ? existingLeads.find((l) => l.phone === phoneValidation.normalized)
    : null;

  // Real-time live dealer assignment preview
  const routingPreview = pincode.trim().length >= 3
    ? routeLeadToDealer(pincode, dealers)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);
    setCreatedLead(null);

    setTouched({
      name: true,
      phone: true,
      pincode: true,
      product: true,
      source: true,
    });

    if (!isNameValid || !phoneValidation.isValid || !pincodeValidation.isValid) {
      return;
    }

    if (duplicateLead) {
      setSubmissionError(
        `Duplicate Mobile Number: Phone ${phoneValidation.normalized} is already registered under Lead ID ${duplicateLead.leadId} (${duplicateLead.name}). Duplicates are strictly blocked.`
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await createLeadAtomic(
        {
          name: name.trim(),
          phone: phoneValidation.normalized,
          pincode: pincodeValidation.normalized,
          product,
          source,
          notes,
        },
        dealers
      );

      if (res.success && res.lead) {
        setCreatedLead(res.lead);
        onLeadAdded(res.lead);
        // Reset form
        setName('');
        setRawPhone('');
        setPincode('');
        setNotes('');
        setTouched({});
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Duplicate mobile') || msg.includes('already registered')) {
        const match = msg.match(/under lead ID:\s*([A-Za-z0-9\-_]+)/);
        const existingId = match ? match[1] : '';
        setSubmissionError(
          existingId
            ? `Duplicate Mobile Number: Phone ${phoneValidation.normalized} is already registered under Lead ID ${existingId}. Duplicates are strictly blocked.`
            : `Duplicate Mobile Number: Phone ${phoneValidation.normalized} is already registered in the system. Duplicates are strictly blocked.`
        );
      } else {
        console.error('Lead submission failed: ', err);
        setSubmissionError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Title Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Add Customer Enquiry</h2>
            <p className="text-xs text-slate-500">
              Captures and automatically assigns incoming leads to the territorial dealer by 3-digit pincode prefix
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToLeads}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
        >
          View Leads Table
        </button>
      </div>

      {/* Success Notification Alert */}
      {createdLead && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-5 shadow-xs animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-emerald-900">
                  Lead Successfully Created & Routed!
                </h4>
                <span className="font-mono text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                  {createdLead.leadId}
                </span>
              </div>
              <p className="text-xs text-emerald-700 mt-1">
                Customer <span className="font-semibold">{createdLead.name}</span> ({createdLead.phone}) has been routed to{' '}
                <span className="font-semibold">{createdLead.assignedDealerName}</span>.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => setCreatedLead(null)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  Add Another Lead
                </button>
                <button
                  onClick={onNavigateToLeads}
                  className="text-xs font-semibold text-emerald-800 hover:underline flex items-center gap-1"
                >
                  <span>Go to Leads Management</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {submissionError && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 shadow-xs">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-900">Submission Blocked</h4>
              <p className="text-xs text-rose-700 mt-0.5">{submissionError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Customer Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                placeholder="e.g. Ramesh Kumar"
                className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-hidden focus:ring-2 ${
                  touched.name && !isNameValid
                    ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                    : 'border-slate-300 focus:ring-emerald-500'
                }`}
              />
              {touched.name && !isNameValid && (
                <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>Customer name must be at least 2 characters</span>
                </p>
              )}
            </div>

            {/* Mobile Number & Pincode Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Mobile Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number (India) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={rawPhone}
                    onChange={(e) => setRawPhone(e.target.value)}
                    onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                    placeholder="10 digits (e.g. 9845012345)"
                    className={`w-full px-3 py-2 text-xs rounded-lg border font-mono focus:outline-hidden focus:ring-2 ${
                      touched.phone && !phoneValidation.isValid
                        ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                        : 'border-slate-300 focus:ring-emerald-500'
                    }`}
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                </div>
                {touched.phone && !phoneValidation.isValid && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{phoneValidation.error}</span>
                  </p>
                )}
                {duplicateLead && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-[11px] space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Duplicate Mobile Detected</span>
                    </div>
                    <p>
                      Phone <span className="font-mono font-semibold">{phoneValidation.normalized}</span> is already registered under lead{' '}
                      <span className="font-mono font-semibold">{duplicateLead.leadId}</span> ({duplicateLead.name}).
                    </p>
                    <p className="text-amber-700">Duplicate submissions are strictly blocked.</p>
                  </div>
                )}
                {phoneValidation.isValid && !duplicateLead && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Valid: <span className="font-mono font-semibold">{phoneValidation.normalized}</span></span>
                  </p>
                )}
              </div>

              {/* Pincode */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  6-Digit Pincode <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    onBlur={() => setTouched((p) => ({ ...p, pincode: true }))}
                    placeholder="e.g. 560001"
                    className={`w-full px-3 py-2 text-xs rounded-lg border font-mono focus:outline-hidden focus:ring-2 ${
                      touched.pincode && !pincodeValidation.isValid
                        ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/20'
                        : 'border-slate-300 focus:ring-emerald-500'
                    }`}
                  />
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                </div>
                {touched.pincode && !pincodeValidation.isValid && (
                  <p className="text-[11px] text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{pincodeValidation.error}</span>
                  </p>
                )}
                {pincode.length >= 3 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Prefix: <span className="font-mono font-semibold text-slate-700">{pincode.slice(0, 3)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Product & Lead Source Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Product */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PuREPower Product <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  >
                    {PURE_PRODUCTS.map((prod) => (
                      <option key={prod} value={prod}>
                        {prod}
                      </option>
                    ))}
                  </select>
                  <Package className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Source */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lead Intake Source <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value as LeadSource)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  >
                    {LEAD_SOURCES.map((src) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                  <Layers className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Additional Notes / Customer Inquiries (Optional)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Specific backup capacity requirements, installation timeline, or dealer notes..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800 resize-none"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Guaranteed mobile uniqueness check backed by Firestore transactions.
              </span>
              <button
                type="submit"
                disabled={isSubmitting || Boolean(duplicateLead)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying & Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Submit & Route Lead</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: Live Routing Preview Card */}
        <div className="space-y-4">
          <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Dealer Assignment Engine
              </h3>
            </div>

            {routingPreview ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-lg bg-slate-800/80 border border-slate-700">
                  <div className="text-[11px] text-slate-400 mb-1">Matched Territory</div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span>{routingPreview.dealerName}</span>
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-1">
                    ID: {routingPreview.dealerId}
                  </div>
                </div>

                <div className="text-xs space-y-2 text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Pincode Prefix:</span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {routingPreview.matchedPrefix}
                    </span>
                  </div>
                  {routingPreview.dealer && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Territory City:</span>
                        <span className="font-medium text-slate-200">{routingPreview.dealer.city}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Contact:</span>
                        <span className="font-medium text-slate-200">{routingPreview.dealer.contactPerson}</span>
                      </div>
                    </>
                  )}
                  {routingPreview.isFallback && (
                    <div className="text-[11px] text-amber-300/90 pt-1 border-t border-slate-800">
                      ⚠️ No authorized dealer covers prefix {routingPreview.matchedPrefix}. Assigned to PURE Energy In-house Sales.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs">
                <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p>Type at least 3 digits of the pincode to preview territory dealer routing.</p>
              </div>
            )}
          </div>

          {/* Quick Rules Explainer Card */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-4 text-xs text-slate-600 shadow-xs space-y-2">
            <h4 className="font-semibold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>Routing Rules Summary</span>
            </h4>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
              <li>Pincodes are matched by their 3-digit prefix against dealer prefixes.</li>
              <li>Multiple prefixes separated by pipe (<code className="bg-slate-100 px-1">|</code>) are evaluated.</li>
              <li>Uncovered prefixes route to <strong>In-house Sales</strong> automatically.</li>
              <li>Duplicate mobile numbers are rejected atomically to prevent duplicate dealer calls.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
