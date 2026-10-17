import React, { useState, useEffect, useRef } from 'react';
import { ReconciliationAction, ReconciliationItem } from '../types';
import { RECONCILIATION_DATA } from '../data/reconciliationData';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  Wrench,
  GitMerge,
  Ban,
  Building2,
  Search,
  RefreshCw,
  Database,
  Terminal,
  FileCheck,
  AlertTriangle,
  Play,
  FileText,
  Eye,
  EyeOff,
  RotateCcw,
  Copy,
  Check,
  Info,
} from 'lucide-react';

export { RECONCILIATION_DATA };

interface ImportReconciliationPageProps {
  onSyncFirestore: () => void;
  isSyncing: boolean;
}

export const ImportReconciliationPage: React.FC<ImportReconciliationPageProps> = ({
  onSyncFirestore,
  isSyncing,
}) => {
  const [dealersFile, setDealersFile] = useState<File | null>(null);
  const [leadsFile, setLeadsFile] = useState<File | null>(null);
  const [dealersCsvContent, setDealersCsvContent] = useState<string>('');
  const [leadsCsvContent, setLeadsCsvContent] = useState<string>('');
  const [originalDealersCsv, setOriginalDealersCsv] = useState<string>('');
  const [originalLeadsCsv, setOriginalLeadsCsv] = useState<string>('');

  // Previews
  const [showDealersPreview, setShowDealersPreview] = useState(false);
  const [showLeadsPreview, setShowLeadsPreview] = useState(false);

  // Drag and drop states
  const [isDraggingDealers, setIsDraggingDealers] = useState(false);
  const [isDraggingLeads, setIsDraggingLeads] = useState(false);
  const [isDraggingUnified, setIsDraggingUnified] = useState(false);

  // Python and Sync states
  const [isRunningPython, setIsRunningPython] = useState(false);
  const [pythonTerminalLog, setPythonTerminalLog] = useState<string | null>(null);
  const [reconciliationData, setReconciliationData] = useState<ReconciliationItem[]>(RECONCILIATION_DATA);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    details?: string;
  } | null>(null);
  const [hasCopiedLog, setHasCopiedLog] = useState(false);

  const fileInputDealersRef = useRef<HTMLInputElement>(null);
  const fileInputLeadsRef = useRef<HTMLInputElement>(null);
  const fileInputUnifiedRef = useRef<HTMLInputElement>(null);

  // Load existing CSV data on mount
  useEffect(() => {
    fetch('/api/csv-data')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (data.dealersCsv) {
            setDealersCsvContent(data.dealersCsv);
            setOriginalDealersCsv(data.dealersCsv);
          }
          if (data.leadsCsv) {
            setLeadsCsvContent(data.leadsCsv);
            setOriginalLeadsCsv(data.leadsCsv);
          }
          if (data.reconciliationCsv) {
            parseReconciliationCsv(data.reconciliationCsv);
          }
        }
      })
      .catch((err) => console.warn('Could not pre-fetch CSV data from server: ', err));
  }, []);

  const parseReconciliationCsv = (csvText: string) => {
    const lines = csvText.trim().split('\n');
    const items: ReconciliationItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const firstComma = line.indexOf(',');
      const secondComma = line.indexOf(',', firstComma + 1);
      if (firstComma > -1 && secondComma > -1) {
        const lead_id = line.slice(0, firstComma).trim();
        const action = line.slice(firstComma + 1, secondComma).trim() as ReconciliationAction;
        let reason = line.slice(secondComma + 1).trim();
        if (reason.startsWith('"') && reason.endsWith('"')) {
          reason = reason.slice(1, -1);
        }
        items.push({ lead_id, action, reason });
      }
    }
    if (items.length > 0) {
      setReconciliationData(items);
    }
  };

  const processFileContent = (file: File, target: 'dealers' | 'leads' | 'auto') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const firstLine = text.split('\n')[0].toLowerCase();

      let detectedType = target;
      if (target === 'auto') {
        if (firstLine.includes('pincode_prefixes') || firstLine.includes('dealer_name') || firstLine.includes('dealer_id')) {
          detectedType = 'dealers';
        } else {
          detectedType = 'leads';
        }
      }

      if (detectedType === 'dealers') {
        setDealersFile(file);
        setDealersCsvContent(text);
        setStatusMessage({
          type: 'info',
          text: `Dealers CSV uploaded: "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Contains ${
            text.trim().split('\n').length - 1
          } rows.`,
        });
      } else {
        setLeadsFile(file);
        setLeadsCsvContent(text);
        setStatusMessage({
          type: 'info',
          text: `Leads CSV uploaded: "${file.name}" (${(file.size / 1024).toFixed(1)} KB). Contains ${
            text.trim().split('\n').length - 1
          } rows.`,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDealersFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFileContent(file, 'dealers');
  };

  const handleLeadsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFileContent(file, 'leads');
  };

  const handleUnifiedFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFileContent(file, 'auto');
  };

  const handleResetToBenchmark = () => {
    setDealersFile(null);
    setLeadsFile(null);
    if (originalDealersCsv) setDealersCsvContent(originalDealersCsv);
    if (originalLeadsCsv) setLeadsCsvContent(originalLeadsCsv);
    setReconciliationData(RECONCILIATION_DATA);
    setStatusMessage({
      type: 'info',
      text: 'Reset to original benchmark datasets: 8 authorized dealers (D01-D08) and 40 original legacy leads (L1001-L1040).',
    });
  };

  const handleRunPythonScript = async (commitToFirebase: boolean) => {
    setIsRunningPython(true);
    setStatusMessage(null);
    setPythonTerminalLog('Spawning Python cleaner runtime (python3 scripts/clean_and_import.py)...\n');

    try {
      const payload: any = {
        commit: commitToFirebase,
        prune: true,
      };

      if (dealersCsvContent) payload.dealersCsv = dealersCsvContent;
      if (leadsCsvContent) payload.leadsCsv = leadsCsvContent;

      const response = await fetch('/api/upload-and-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await response.json();

      if (!response.ok || !res.success) {
        throw new Error(res.error || res.details || 'Execution failed');
      }

      setPythonTerminalLog(res.pythonOutput || 'Python script executed with exit code 0.');

      if (res.reconciliation && Array.isArray(res.reconciliation)) {
        setReconciliationData(res.reconciliation);
      }

      if (commitToFirebase) {
        setStatusMessage({
          type: 'success',
          text: `Python script successfully cleaned data and synced to Firebase!`,
          details: `${res.commitResult?.dealersWritten || 8} dealers and ${
            res.commitResult?.leadsWritten || 32
          } leads written to Firestore. ${res.commitResult?.dealersPruned || 0} placeholder dealers and ${
            res.commitResult?.leadsPruned || 0
          } placeholder leads pruned.`,
        });
        // Trigger live refresh in parent
        onSyncFirestore();
      } else {
        setStatusMessage({
          type: 'success',
          text: `Python dry-run completed successfully! Audit generated ${
            res.reconciliation?.length || 40
          } rows in reports/reconciliation.csv. Zero writes were made to production Firestore.`,
        });
      }
    } catch (err: any) {
      console.error('Python script execution error: ', err);
      setPythonTerminalLog((prev) => `${prev}\n[ERROR] ${err.message}`);
      setStatusMessage({
        type: 'error',
        text: `Error executing Python cleaning script: ${err.message}`,
      });
    } finally {
      setIsRunningPython(false);
    }
  };

  const downloadReportCSV = () => {
    if (reconciliationData.length === 0) return;
    const csvContent =
      'data:text/csv;charset=utf-8,lead_id,action,reason\n' +
      reconciliationData
        .map((r) => `${r.lead_id},${r.action},"${r.reason.replace(/"/g, '""')}"`)
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'reconciliation.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyLogToClipboard = () => {
    if (!pythonTerminalLog) return;
    navigator.clipboard.writeText(pythonTerminalLog);
    setHasCopiedLog(true);
    setTimeout(() => setHasCopiedLog(false), 2000);
  };

  const renderCsvTablePreview = (csvContent: string, maxRows = 5) => {
    if (!csvContent.trim()) return <p className="text-xs text-slate-400 p-2">Empty CSV</p>;
    const lines = csvContent.trim().split('\n');
    if (lines.length === 0) return null;
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1, maxRows + 1).map((l) =>
      l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
    );

    return (
      <div className="overflow-x-auto border border-slate-200 rounded-lg mt-2 bg-white">
        <table className="w-full text-left text-[11px] font-mono">
          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="px-2.5 py-1.5 w-8 text-slate-400">#</th>
              {headers.map((h, i) => (
                <th key={i} className="px-2.5 py-1.5 font-sans font-semibold text-slate-800">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50">
                <td className="px-2.5 py-1.5 text-slate-400">{rIdx + 1}</td>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-2.5 py-1.5 text-slate-700 truncate max-w-[140px]">
                    {cell || <span className="text-slate-300 italic">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {lines.length - 1 > maxRows && (
          <div className="bg-slate-50 px-2.5 py-1 text-[10px] text-slate-500 text-center border-t border-slate-200">
            Showing first {maxRows} of {lines.length - 1} records
          </div>
        )}
      </div>
    );
  };

  // Summaries
  const total = reconciliationData.length;
  const importedCount = reconciliationData.filter((r) => r.action === 'imported').length;
  const fixedCount = reconciliationData.filter((r) => r.action === 'fixed').length;
  const mergedCount = reconciliationData.filter((r) => r.action === 'merged').length;
  const rejectedCount = reconciliationData.filter((r) => r.action === 'rejected').length;
  const inhouseCount = reconciliationData.filter((r) => r.action === 'assigned_inhouse').length;

  const filteredData = reconciliationData.filter((item) => {
    const matchesAction = actionFilter === 'all' || item.action === actionFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      item.lead_id.toLowerCase().includes(term) ||
      item.reason.toLowerCase().includes(term) ||
      item.action.toLowerCase().includes(term);
    return matchesAction && matchesSearch;
  });

  const getActionBadge = (action: ReconciliationAction) => {
    switch (action) {
      case 'imported':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>imported</span>
          </span>
        );
      case 'fixed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Wrench className="w-3.5 h-3.5" />
            <span>fixed</span>
          </span>
        );
      case 'merged':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <GitMerge className="w-3.5 h-3.5" />
            <span>merged</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <Ban className="w-3.5 h-3.5" />
            <span>rejected</span>
          </span>
        );
      case 'assigned_inhouse':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Building2 className="w-3.5 h-3.5" />
            <span>assigned_inhouse</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Instructions */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  CSV Data Upload, Python Cleaner & Firebase Sync
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload CSV files, execute the Python cleaning algorithm (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">scripts/clean_and_import.py</code>), inspect reconciliation, and commit directly to Firebase Firestore.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleResetToBenchmark}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
              title="Reset files to original data/dealers.csv and data/legacy_leads.csv"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset to Defaults</span>
            </button>

            <button
              onClick={() => handleRunPythonScript(false)}
              disabled={isRunningPython || isSyncing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              title="Runs Python cleaning script without modifying Firestore database"
            >
              {isRunningPython ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : (
                <Play className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>Run Python Cleaner (Dry-Run)</span>
            </button>

            <button
              onClick={() => handleRunPythonScript(true)}
              disabled={isRunningPython || isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              title="Runs Python cleaning script and synchronizes cleaned leads & dealers to Firebase Firestore"
            >
              {isRunningPython || isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>Clean & Sync to Firebase</span>
            </button>
          </div>
        </div>

        {/* 2. Drag & Drop Upload Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {/* Card A: Dealers CSV Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingDealers(true);
            }}
            onDragLeave={() => setIsDraggingDealers(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingDealers(false);
              const file = e.dataTransfer.files?.[0];
              if (file) processFileContent(file, 'dealers');
            }}
            className={`p-4 rounded-xl border transition-all ${
              isDraggingDealers
                ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-white border border-slate-200 text-emerald-600 shadow-2xs">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    1. Dealers CSV (Territory Coverage)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Expected columns: <code className="font-mono text-slate-700">dealer_id,dealer_name,city,pincode_prefixes,contact_email</code>
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold shrink-0">
                {dealersFile ? dealersFile.name : 'data/dealers.csv'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputDealersRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleDealersFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputDealersRef.current?.click()}
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>{dealersFile ? 'Change CSV' : 'Upload Dealers CSV'}</span>
                </button>

                <button
                  onClick={() => setShowDealersPreview((p) => !p)}
                  className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-600 transition-colors"
                >
                  {showDealersPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showDealersPreview ? 'Hide Preview' : 'Preview Table'}</span>
                </button>
              </div>

              {dealersCsvContent && (
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ {dealersCsvContent.trim().split('\n').length - 1} Dealers Ready
                </span>
              )}
            </div>

            {showDealersPreview && dealersCsvContent && (
              <div className="mt-2 animate-in fade-in-50 duration-200">
                {renderCsvTablePreview(dealersCsvContent, 5)}
              </div>
            )}
          </div>

          {/* Card B: Legacy Leads CSV Box */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingLeads(true);
            }}
            onDragLeave={() => setIsDraggingLeads(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingLeads(false);
              const file = e.dataTransfer.files?.[0];
              if (file) processFileContent(file, 'leads');
            }}
            className={`p-4 rounded-xl border transition-all ${
              isDraggingLeads
                ? 'border-emerald-500 bg-emerald-50/70 shadow-sm'
                : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-white border border-slate-200 text-emerald-600 shadow-2xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    2. Legacy Leads CSV (Raw Enquiries)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Expected columns: <code className="font-mono text-slate-700">lead_id,name,phone,pincode,product,source,created_on,status</code>
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold shrink-0">
                {leadsFile ? leadsFile.name : 'data/legacy_leads.csv'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputLeadsRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleLeadsFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputLeadsRef.current?.click()}
                  className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>{leadsFile ? 'Change CSV' : 'Upload Leads CSV'}</span>
                </button>

                <button
                  onClick={() => setShowLeadsPreview((p) => !p)}
                  className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-600 transition-colors"
                >
                  {showLeadsPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showLeadsPreview ? 'Hide Preview' : 'Preview Table'}</span>
                </button>
              </div>

              {leadsCsvContent && (
                <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ {leadsCsvContent.trim().split('\n').length - 1} Leads Ready
                </span>
              )}
            </div>

            {showLeadsPreview && leadsCsvContent && (
              <div className="mt-2 animate-in fade-in-50 duration-200">
                {renderCsvTablePreview(leadsCsvContent, 5)}
              </div>
            )}
          </div>
        </div>

        {/* Unified Quick Dropzone for any CSV */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingUnified(true);
          }}
          onDragLeave={() => setIsDraggingUnified(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingUnified(false);
            const file = e.dataTransfer.files?.[0];
            if (file) processFileContent(file, 'auto');
          }}
          onClick={() => fileInputUnifiedRef.current?.click()}
          className={`mt-4 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            isDraggingUnified
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/50'
          }`}
        >
          <input
            ref={fileInputUnifiedRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleUnifiedFileUpload}
            className="hidden"
          />
          <div className="flex items-center justify-center gap-2 text-xs text-slate-600 font-medium">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>
              <strong>Drop any CSV file here</strong> (Auto-detects whether file is Dealers CSV or Leads CSV by headers) or click to browse
            </span>
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`mt-4 p-3.5 rounded-lg text-xs font-medium flex items-start gap-2.5 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : statusMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.text}</p>
              {statusMessage.details && (
                <p className="text-[11px] opacity-90 mt-0.5">{statusMessage.details}</p>
              )}
            </div>
          </div>
        )}

        {/* Python Terminal Drawer */}
        {pythonTerminalLog && (
          <div className="mt-4 rounded-xl bg-slate-950 border border-slate-800 p-4 text-slate-200 font-mono text-xs space-y-2 shadow-inner">
            <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-800 text-[11px]">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-slate-300">
                  Python Cleaner Engine Logs (scripts/clean_and_import.py)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyLogToClipboard}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-900 px-2 py-1 rounded border border-slate-700 cursor-pointer"
                >
                  {hasCopiedLog ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{hasCopiedLog ? 'Copied' : 'Copy Log'}</span>
                </button>
                <button
                  onClick={() => setPythonTerminalLog(null)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 underline cursor-pointer"
                >
                  Close Console
                </button>
              </div>
            </div>
            <pre className="text-emerald-400/90 whitespace-pre-wrap leading-relaxed text-[11px] max-h-60 overflow-y-auto">
              {pythonTerminalLog}
            </pre>
          </div>
        )}
      </div>

      {/* 3. Reconciliation Summary KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500">Total Input</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{total}</div>
          <span className="text-[10px] text-slate-400">100% accounted</span>
        </div>

        <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200 shadow-xs">
          <span className="text-[11px] font-medium text-emerald-800">imported</span>
          <div className="text-xl font-bold text-emerald-900 mt-1">{importedCount}</div>
          <span className="text-[10px] text-emerald-600">Pristine records</span>
        </div>

        <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200 shadow-xs">
          <span className="text-[11px] font-medium text-blue-800">fixed</span>
          <div className="text-xl font-bold text-blue-900 mt-1">{fixedCount}</div>
          <span className="text-[10px] text-blue-600">Formatted / casing</span>
        </div>

        <div className="bg-purple-50/50 p-3.5 rounded-xl border border-purple-200 shadow-xs">
          <span className="text-[11px] font-medium text-purple-800">merged</span>
          <div className="text-xl font-bold text-purple-900 mt-1">{mergedCount}</div>
          <span className="text-[10px] text-purple-600">Duplicate phones</span>
        </div>

        <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200 shadow-xs">
          <span className="text-[11px] font-medium text-amber-800">assigned_inhouse</span>
          <div className="text-xl font-bold text-amber-900 mt-1">{inhouseCount}</div>
          <span className="text-[10px] text-amber-600">Unserviced prefix</span>
        </div>

        <div className="bg-rose-50/50 p-3.5 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-[11px] font-medium text-rose-800">rejected</span>
          <div className="text-xl font-bold text-rose-900 mt-1">{rejectedCount}</div>
          <span className="text-[10px] text-rose-600">Unrecoverable invalid</span>
        </div>
      </div>

      {/* 4. Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search lead ID, action, or reason..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-emerald-500 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
          <span className="text-slate-500 font-medium">Filter Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold focus:ring-emerald-500 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Actions ({total})</option>
            <option value="imported">imported ({importedCount})</option>
            <option value="fixed">fixed ({fixedCount})</option>
            <option value="merged">merged ({mergedCount})</option>
            <option value="assigned_inhouse">assigned_inhouse ({inhouseCount})</option>
            <option value="rejected">rejected ({rejectedCount})</option>
          </select>

          <button
            onClick={downloadReportCSV}
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Download reconciliation.csv containing lead_id,action,reason"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 5. Reconciliation Report Table (Exactly 40 Rows) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-16">#</th>
                <th className="px-4 py-3 w-28">lead_id</th>
                <th className="px-4 py-3 w-44">action</th>
                <th className="px-4 py-3">reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredData.map((row, idx) => (
                <tr key={`${row.lead_id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-2.5 font-bold text-slate-900">
                    {row.lead_id}
                  </td>
                  <td className="px-4 py-2.5 font-sans">
                    {getActionBadge(row.action)}
                  </td>
                  <td className="px-4 py-2.5 font-sans text-slate-700">
                    {row.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
