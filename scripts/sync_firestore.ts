/**
 * PURE Energy PuREPower - Firestore Synchronization & Migration Engine
 *
 * Idempotently synchronizes the authentic 8 dealers (D01-D08) and 40 original leads
 * from data/dealers.csv and data/legacy_leads.csv with Google Cloud Firestore.
 *
 * Key Capabilities:
 * 1. Dry-Run Mode: Computes exact delta (creates, updates, merges, rejections, pruning) before writing.
 * 2. Idempotent: Can be run multiple times safely without creating duplicates.
 * 3. Status Preservation: Preserves operational lead statuses (e.g. Contacted, Converted, Lost)
 *    if a lead was previously updated by staff in the live application.
 * 4. Safe Placeholder Migration: Identifies and prunes obsolete placeholder documents (D001-D008, L001-L040).
 * 5. Atomic Phone Uniqueness: Maintains /lead_uniqueness/{phone} index.
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  writeBatch,
  terminate,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import config from '../firebase-applet-config.json';
import { routeLeadToDealer } from '../src/utils/assignment';
import { normalizeIndianPhone, validateIndianPincode } from '../src/utils/validation';
import { Dealer, Lead, LeadStatus, LeadSource } from '../src/types';

export interface SyncPlan {
  dealersToInsert: Dealer[];
  dealersToUpdate: Dealer[];
  obsoleteDealersToPrune: string[];
  leadsToInsert: Lead[];
  leadsToUpdate: { lead: Lead; preservedStatus: LeadStatus }[];
  leadsMerged: { leadId: string; phone: string; matchingLeadId: string }[];
  leadsRejected: { leadId: string; reason: string }[];
  obsoleteLeadsToPrune: string[];
}

export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Basic CSV parser handling potential commas inside quotes if any
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

export async function computeSyncPlan(
  db: any,
  dealersCsvPath = 'data/dealers.csv',
  leadsCsvPath = 'data/legacy_leads.csv',
  preserveExistingStatus = true
): Promise<SyncPlan> {
  const dealersRaw = fs.readFileSync(dealersCsvPath, 'utf-8');
  const leadsRaw = fs.readFileSync(leadsCsvPath, 'utf-8');

  const dealerRows = parseCSV(dealersRaw);
  const leadRows = parseCSV(leadsRaw);

  // 1. Read existing Firestore records
  const existingDealersSnap = await getDocs(collection(db, 'dealers'));
  const existingDealersMap = new Map<string, any>();
  existingDealersSnap.docs.forEach((d) => existingDealersMap.set(d.id, d.data()));

  const existingLeadsSnap = await getDocs(collection(db, 'leads'));
  const existingLeadsMap = new Map<string, any>();
  existingLeadsSnap.docs.forEach((d) => existingLeadsMap.set(d.id, d.data()));

  // 2. Map CSV Dealers
  const targetDealers: Dealer[] = dealerRows.map((row) => ({
    dealerId: row.dealer_id,
    name: row.dealer_name,
    city: row.city,
    pincodePrefixes: row.pincode_prefixes,
    email: row.contact_email,
  }));

  const targetDealerIds = new Set(targetDealers.map((d) => d.dealerId));
  const dealersToInsert: Dealer[] = [];
  const dealersToUpdate: Dealer[] = [];
  const obsoleteDealersToPrune: string[] = [];

  for (const dealer of targetDealers) {
    if (existingDealersMap.has(dealer.dealerId)) {
      dealersToUpdate.push(dealer);
    } else {
      dealersToInsert.push(dealer);
    }
  }

  for (const [existingId] of existingDealersMap) {
    // Flag older placeholder IDs (e.g. D001-D008) for safe pruning
    if (!targetDealerIds.has(existingId) && existingId.startsWith('D00')) {
      obsoleteDealersToPrune.push(existingId);
    }
  }

  // 3. Process CSV Leads with Dedup & Validation
  const leadsToInsert: Lead[] = [];
  const leadsToUpdate: { lead: Lead; preservedStatus: LeadStatus }[] = [];
  const leadsMerged: { leadId: string; phone: string; matchingLeadId: string }[] = [];
  const leadsRejected: { leadId: string; reason: string }[] = [];
  const targetLeadIds = new Set<string>();

  const seenPhones = new Map<string, string>(); // normalized_phone -> leadId

  for (const row of leadRows) {
    const rawId = row.lead_id.trim();
    const rawName = row.name.trim();
    const rawPhone = row.phone.trim();
    const rawPincode = row.pincode.trim();
    const rawProduct = row.product.trim();
    const rawSource = row.source.trim();
    const rawStatus = row.status.trim();
    const rawDate = row.created_on || row.created_at || new Date().toISOString();

    // Check Name
    if (!rawName) {
      leadsRejected.push({ leadId: rawId, reason: 'Missing required customer name' });
      continue;
    }

    // Check Product
    if (!rawProduct) {
      leadsRejected.push({ leadId: rawId, reason: 'Missing required product' });
      continue;
    }

    // Check Phone
    const phoneVal = normalizeIndianPhone(rawPhone);
    if (!phoneVal.isValid) {
      leadsRejected.push({ leadId: rawId, reason: phoneVal.error || 'Invalid phone' });
      continue;
    }

    // Check Pincode
    const pincodeVal = validateIndianPincode(rawPincode);
    if (!pincodeVal.isValid) {
      leadsRejected.push({ leadId: rawId, reason: pincodeVal.error || 'Invalid pincode' });
      continue;
    }

    // Duplicate Phone Check
    if (seenPhones.has(phoneVal.normalized)) {
      const priorId = seenPhones.get(phoneVal.normalized)!;
      leadsMerged.push({
        leadId: rawId,
        phone: phoneVal.normalized,
        matchingLeadId: priorId,
      });
      continue;
    }
    seenPhones.set(phoneVal.normalized, rawId);
    targetLeadIds.add(rawId);

    // Normalize Source
    let normSource: LeadSource = 'Website';
    const sLower = rawSource.toLowerCase();
    if (sLower.includes('voice') || sLower.includes('agent')) normSource = 'Voice Agent';
    else if (sLower === 'whatsapp') normSource = 'WhatsApp';
    else if (sLower.includes('walk')) normSource = 'Dealer Walk-in';

    // Normalize Status
    let normStatus: LeadStatus = 'New';
    const stLower = rawStatus.toLowerCase();
    if (stLower.includes('contact')) normStatus = 'Contacted';
    else if (stLower.includes('convert')) normStatus = 'Converted';
    else if (stLower.includes('lost')) normStatus = 'Lost';

    // Normalize Product
    let normProduct = rawProduct;
    const pLower = rawProduct.toLowerCase();
    if (pLower.includes('pure') && pLower.includes('5') && pLower.includes('kwh')) {
      normProduct = 'PuREPower Home 5kWh';
    } else if (pLower.includes('pure') && pLower.includes('3') && pLower.includes('kwh')) {
      normProduct = 'PuREPower Home 3kWh';
    } else if (pLower.includes('pure') && pLower.includes('10') && pLower.includes('kwh')) {
      normProduct = 'PuREPower Commercial 10kWh';
    }

    // Route Dealer
    const route = routeLeadToDealer(pincodeVal.normalized, targetDealers);

    // Normalize Date
    let normDate = rawDate;
    if (rawDate.includes('/')) {
      const parts = rawDate.split('/');
      if (parts.length === 3) {
        let d = parts[0];
        const m = parts[1];
        const y = parts[2];
        if (m === '09' && parseInt(d, 10) > 30) d = '30';
        normDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    const createdAt = normDate.length === 10 ? `${normDate}T00:00:00Z` : normDate;

    // Check if lead already exists in Firestore
    const existing = existingLeadsMap.get(rawId);
    let finalStatus = normStatus;
    let isPreserved = false;

    if (existing && preserveExistingStatus && existing.status) {
      // Preserve operator updates
      finalStatus = existing.status as LeadStatus;
      isPreserved = true;
    }

    const leadObject: Lead = {
      leadId: rawId,
      name: rawName,
      phone: phoneVal.normalized,
      pincode: pincodeVal.normalized,
      product: normProduct,
      source: normSource,
      assignedDealerId: route.dealerId,
      assignedDealerName: route.dealerName,
      status: finalStatus,
      createdAt,
      updatedAt: existing?.updatedAt || new Date().toISOString(),
    };

    if (existing) {
      leadsToUpdate.push({ lead: leadObject, preservedStatus: finalStatus });
    } else {
      leadsToInsert.push(leadObject);
    }
  }

  // Identify obsolete placeholder leads (e.g. L001-L040)
  const obsoleteLeadsToPrune: string[] = [];
  for (const [existingId] of existingLeadsMap) {
    if (!targetLeadIds.has(existingId) && (existingId.startsWith('L0') || existingId.startsWith('LEAD-'))) {
      obsoleteLeadsToPrune.push(existingId);
    }
  }

  return {
    dealersToInsert,
    dealersToUpdate,
    obsoleteDealersToPrune,
    leadsToInsert,
    leadsToUpdate,
    leadsMerged,
    leadsRejected,
    obsoleteLeadsToPrune,
  };
}

export async function executeSyncPlan(
  db: any,
  plan: SyncPlan,
  cleanPlaceholders = true
): Promise<{
  dealersWritten: number;
  leadsWritten: number;
  dealersPruned: number;
  leadsPruned: number;
}> {
  let dealersWritten = 0;
  let leadsWritten = 0;
  let dealersPruned = 0;
  let leadsPruned = 0;

  const now = new Date().toISOString();

  // Step 1: Write Dealers
  const allDealers = [...plan.dealersToInsert, ...plan.dealersToUpdate];
  if (allDealers.length > 0) {
    const dealerBatch = writeBatch(db);
    for (const d of allDealers) {
      const ref = doc(db, 'dealers', d.dealerId);
      dealerBatch.set(
        ref,
        {
          ...d,
          updatedAt: now,
        },
        { merge: true }
      );
      dealersWritten++;
    }
    await dealerBatch.commit();
  }

  // Step 2: Write Leads & Uniqueness Records in chunks of 250 (Firestore limit is 500)
  const allLeads = [
    ...plan.leadsToInsert,
    ...plan.leadsToUpdate.map((u) => u.lead),
  ];

  const chunkSize = 200;
  for (let i = 0; i < allLeads.length; i += chunkSize) {
    const chunk = allLeads.slice(i, i + chunkSize);
    const leadBatch = writeBatch(db);

    for (const lead of chunk) {
      // 1. Lead doc
      const lRef = doc(db, 'leads', lead.leadId);
      leadBatch.set(lRef, lead, { merge: true });

      // 2. Uniqueness doc
      const uRef = doc(db, 'lead_uniqueness', lead.phone);
      leadBatch.set(
        uRef,
        {
          phone: lead.phone,
          leadId: lead.leadId,
          createdAt: lead.createdAt,
        },
        { merge: true }
      );

      leadsWritten++;
    }
    await leadBatch.commit();
  }

  // Step 3: Prune obsolete placeholder records if requested
  if (cleanPlaceholders) {
    if (plan.obsoleteDealersToPrune.length > 0) {
      const pruneDealerBatch = writeBatch(db);
      for (const id of plan.obsoleteDealersToPrune) {
        pruneDealerBatch.delete(doc(db, 'dealers', id));
        dealersPruned++;
      }
      await pruneDealerBatch.commit();
    }

    if (plan.obsoleteLeadsToPrune.length > 0) {
      for (let i = 0; i < plan.obsoleteLeadsToPrune.length; i += chunkSize) {
        const pruneChunk = plan.obsoleteLeadsToPrune.slice(i, i + chunkSize);
        const pruneLeadBatch = writeBatch(db);
        for (const id of pruneChunk) {
          pruneLeadBatch.delete(doc(db, 'leads', id));
          leadsPruned++;
        }
        await pruneLeadBatch.commit();
      }
    }
  }

  return { dealersWritten, leadsWritten, dealersPruned, leadsPruned };
}

// CLI Execution
async function main() {
  const args = process.argv.slice(2);
  const isCommit = args.includes('--commit');
  const isPrune = !args.includes('--no-prune');

  console.log('===============================================================');
  console.log(' PURE Energy PuREPower - Firestore Synchronization CLI');
  console.log('===============================================================');

  const app = initializeApp(config);
  const db = getFirestore(app, config.firestoreDatabaseId);

  try {
    console.log('[1/3] Reading CSV files and analyzing Firestore delta...');
    const plan = await computeSyncPlan(db);

    console.log('\n--- DRY RUN SYNCHRONIZATION AUDIT REPORT ---');
    console.log(` • Authentic Dealers to Write:  ${plan.dealersToInsert.length + plan.dealersToUpdate.length} (D01 to D08)`);
    console.log(` • Valid Clean Leads to Write:  ${plan.leadsToInsert.length + plan.leadsToUpdate.length} (L1001 to L1035)`);
    console.log(`   - New leads to insert:       ${plan.leadsToInsert.length}`);
    console.log(`   - Existing leads (preserved):${plan.leadsToUpdate.length}`);
    console.log(` • Duplicate Enquiries Merged:  ${plan.leadsMerged.length}`);
    plan.leadsMerged.forEach((m) =>
      console.log(`     ↳ Lead ${m.leadId} (phone ${m.phone}) merged into primary ${m.matchingLeadId}`)
    );
    console.log(` • Invalid Leads Rejected:      ${plan.leadsRejected.length}`);
    plan.leadsRejected.forEach((r) =>
      console.log(`     ↳ Lead ${r.leadId}: ${r.reason}`)
    );
    console.log(` • Obsolete Placeholders Found:`);
    console.log(`   - Placeholder Dealers:       ${plan.obsoleteDealersToPrune.length} (${plan.obsoleteDealersToPrune.join(', ') || 'None'})`);
    console.log(`   - Placeholder Leads:         ${plan.obsoleteLeadsToPrune.length} (${plan.obsoleteLeadsToPrune.slice(0, 5).join(', ')}...)`);

    if (isCommit) {
      console.log('\n[2/3] Executing batch commit to Firestore database...');
      const result = await executeSyncPlan(db, plan, isPrune);
      console.log(`\n✅ SYNCHRONIZATION SUCCEEDED!`);
      console.log(` • Dealers written to Firestore: ${result.dealersWritten}`);
      console.log(` • Leads written to Firestore:   ${result.leadsWritten}`);
      console.log(` • Obsolete Dealers pruned:      ${result.dealersPruned}`);
      console.log(` • Obsolete Leads pruned:        ${result.leadsPruned}`);
    } else {
      console.log('\n[DRY RUN MODE] No database writes were made.');
      console.log('Run with --commit to apply these changes to production Firestore.');
    }
  } catch (err: any) {
    console.error('Synchronization failed: ', err);
  } finally {
    await terminate(db);
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
