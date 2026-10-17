import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  Dealer,
  Lead,
  LeadStatus,
  CreateLeadInput,
} from '../types';
import { routeLeadToDealer } from '../utils/assignment';
import { normalizeIndianPhone, validateIndianPincode } from '../utils/validation';
import { INITIAL_DEALERS, BENCHMARK_LEADS } from '../data/initialData';

const DEALERS_COLLECTION = 'dealers';
const LEADS_COLLECTION = 'leads';
const UNIQUENESS_COLLECTION = 'lead_uniqueness';

/**
 * Register or update a dealer in Firestore and sync to dealers.csv on disk
 */
export async function createDealer(dealer: {
  dealerId: string;
  name: string;
  pincodePrefixes: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
}): Promise<Dealer> {
  const cleanId = (dealer.dealerId || '').trim();
  if (!cleanId || cleanId.length > 32) {
    throw new Error('Dealer ID is required and must be 32 characters or fewer.');
  }

  const cleanName = (dealer.name || '').trim();
  if (cleanName.length < 2) {
    throw new Error('Dealer business name must be at least 2 characters.');
  }

  // Parse and validate 3-digit prefixes
  const rawPrefixes = dealer.pincodePrefixes || '';
  const prefixArr = rawPrefixes
    .split(/[|,\s]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (prefixArr.length === 0) {
    throw new Error('At least one 3-digit territory pincode prefix is required (e.g. 560).');
  }

  for (const p of prefixArr) {
    if (!/^\d{3}$/.test(p)) {
      throw new Error(`Invalid prefix "${p}". Pincode prefixes must be exactly 3 digits (e.g. 500, 560).`);
    }
  }

  const normalizedPrefixes = prefixArr.join('|');
  const timestamp = new Date().toISOString();

  const newDealer: Dealer = {
    dealerId: cleanId,
    name: cleanName,
    pincodePrefixes: normalizedPrefixes,
    city: dealer.city?.trim() || '',
    state: dealer.state?.trim() || '',
    contactPerson: dealer.contactPerson?.trim() || '',
    phone: dealer.phone?.trim() || '',
    email: dealer.email?.trim() || '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const dealerRef = doc(db, DEALERS_COLLECTION, cleanId);
  try {
    await setDoc(dealerRef, newDealer, { merge: true });

    // Sync with disk CSV via backend API
    try {
      fetch('/api/dealers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDealer),
      }).catch((err) => {
        console.warn('Could not sync dealer to disk CSV:', err);
      });
    } catch {
      // Ignore background fetch error
    }

    return newDealer;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${DEALERS_COLLECTION}/${cleanId}`);
    return newDealer;
  }
}

/**
 * Fetch all dealers from Firestore.
 */
export async function getDealers(): Promise<Dealer[]> {
  try {
    const snap = await getDocs(collection(db, DEALERS_COLLECTION));
    return snap.docs.map((d) => d.data() as Dealer);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, DEALERS_COLLECTION);
  }
}

/**
 * Subscribe to real-time updates for dealers collection.
 */
export function subscribeDealers(
  onUpdate: (dealers: Dealer[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    collection(db, DEALERS_COLLECTION),
    (snapshot) => {
      const dealers = snapshot.docs.map((d) => d.data() as Dealer);
      onUpdate(dealers);
    },
    (error) => {
      if (onError) onError(error as Error);
      handleFirestoreError(error, OperationType.GET, DEALERS_COLLECTION);
    }
  );
}

/**
 * Fetch all leads ordered by createdAt descending.
 */
export async function getLeads(): Promise<Lead[]> {
  try {
    const q = query(collection(db, LEADS_COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Lead);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, LEADS_COLLECTION);
  }
}

/**
 * Subscribe to real-time updates for leads collection.
 */
export function subscribeLeads(
  onUpdate: (leads: Lead[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, LEADS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const leads = snapshot.docs.map((d) => d.data() as Lead);
      onUpdate(leads);
    },
    (error) => {
      if (onError) onError(error as Error);
      handleFirestoreError(error, OperationType.GET, LEADS_COLLECTION);
    }
  );
}

/**
 * Atomic lead creation with concurrent mobile-uniqueness guarantee.
 * Uses a Firestore transaction to prevent duplicate phone numbers even under race conditions.
 */
export async function createLeadAtomic(
  input: CreateLeadInput,
  dealers: Dealer[]
): Promise<{ success: boolean; lead: Lead }> {
  // 1. Validate Phone
  const phoneVal = normalizeIndianPhone(input.phone);
  if (!phoneVal.isValid) {
    throw new Error(phoneVal.error || 'Invalid Indian mobile number');
  }

  // 2. Validate Pincode
  const pincodeVal = validateIndianPincode(input.pincode);
  if (!pincodeVal.isValid) {
    throw new Error(pincodeVal.error || 'Invalid 6-digit pincode');
  }

  // 3. Validate Name & Product
  const trimmedName = input.name.trim();
  if (trimmedName.length < 2) {
    throw new Error('Customer name must be at least 2 characters');
  }

  const trimmedProduct = input.product.trim();
  if (!trimmedProduct) {
    throw new Error('Product selection is required');
  }

  // 4. Assign Dealer via 3-digit pincode prefix
  const routing = routeLeadToDealer(pincodeVal.normalized, dealers);

  const timestamp = new Date().toISOString();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const leadId = `LEAD-${Date.now().toString().slice(-6)}-${randomSuffix}`;

  const newLead: Lead = {
    leadId,
    name: trimmedName,
    phone: phoneVal.normalized,
    pincode: pincodeVal.normalized,
    product: trimmedProduct,
    source: input.source,
    assignedDealerId: routing.dealerId,
    assignedDealerName: routing.dealerName,
    status: 'New',
    createdAt: timestamp,
    updatedAt: timestamp,
    notes: input.notes?.trim() || '',
  };

  const uniquenessRef = doc(db, UNIQUENESS_COLLECTION, phoneVal.normalized);
  const leadRef = doc(db, LEADS_COLLECTION, leadId);

  try {
    await runTransaction(db, async (transaction) => {
      const uniqueDoc = await transaction.get(uniquenessRef);
      if (uniqueDoc.exists()) {
        throw new Error(
          `Duplicate mobile number! Phone ${phoneVal.normalized} is already registered under lead ID: ${
            uniqueDoc.data()?.leadId || 'existing'
          }.`
        );
      }

      transaction.set(uniquenessRef, {
        phone: phoneVal.normalized,
        leadId,
        createdAt: timestamp,
      });

      transaction.set(leadRef, newLead);
    });

    return { success: true, lead: newLead };
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('Duplicate mobile number')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, LEADS_COLLECTION);
  }
}

/**
 * Updates a lead's status immediately in Firestore with validation.
 */
export async function updateLeadStatus(
  leadId: string,
  newStatus: LeadStatus
): Promise<void> {
  const allowed: LeadStatus[] = ['New', 'Contacted', 'Converted', 'Lost'];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const leadRef = doc(db, LEADS_COLLECTION, leadId);
  try {
    await updateDoc(leadRef, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${LEADS_COLLECTION}/${leadId}`);
  }
}

/**
 * Idempotently synchronizes the authentic 8 dealers and original benchmark leads
 * with Firestore, preserving any existing operator status updates and cleaning obsolete placeholders.
 */
export async function syncDatabaseWithOriginalData(options: {
  preserveExistingStatus?: boolean;
  cleanPlaceholders?: boolean;
} = {}): Promise<{
  dealersSynced: number;
  leadsSynced: number;
  dealersPruned: number;
  leadsPruned: number;
}> {
  const { preserveExistingStatus = true, cleanPlaceholders = true } = options;

  try {
    // 1. Fetch current live documents to respect existing operator changes
    const existingDealersSnap = await getDocs(collection(db, DEALERS_COLLECTION));
    const existingLeadsSnap = await getDocs(collection(db, LEADS_COLLECTION));

    const existingLeadMap = new Map<string, any>();
    existingLeadsSnap.docs.forEach((d) => existingLeadMap.set(d.id, d.data()));

    const targetDealerIds = new Set(INITIAL_DEALERS.map((d) => d.dealerId));
    const targetLeadIds = new Set(BENCHMARK_LEADS.map((l) => l.leadId));

    // 2. Batch write dealers
    const dealerBatch = writeBatch(db);
    let dealersSynced = 0;
    for (const dealer of INITIAL_DEALERS) {
      const dRef = doc(db, DEALERS_COLLECTION, dealer.dealerId);
      dealerBatch.set(
        dRef,
        {
          ...dealer,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      dealersSynced++;
    }

    // Identify obsolete placeholder dealers (e.g. D001-D008)
    let dealersPruned = 0;
    if (cleanPlaceholders) {
      existingDealersSnap.docs.forEach((docSnap) => {
        if (!targetDealerIds.has(docSnap.id) && docSnap.id.startsWith('D00')) {
          dealerBatch.delete(docSnap.ref);
          dealersPruned++;
        }
      });
    }

    await dealerBatch.commit();

    // 3. Batch write authentic leads (and preserve any live status updates if present)
    let leadsSynced = 0;
    const chunkSize = 200;

    for (let i = 0; i < BENCHMARK_LEADS.length; i += chunkSize) {
      const chunk = BENCHMARK_LEADS.slice(i, i + chunkSize);
      const leadBatch = writeBatch(db);

      for (const lead of chunk) {
        const existingData = existingLeadMap.get(lead.leadId);
        const finalStatus =
          preserveExistingStatus && existingData?.status
            ? existingData.status
            : lead.status;

        const lRef = doc(db, LEADS_COLLECTION, lead.leadId);
        leadBatch.set(
          lRef,
          {
            ...lead,
            status: finalStatus,
            updatedAt: existingData?.updatedAt || lead.updatedAt,
          },
          { merge: true }
        );

        const uRef = doc(db, UNIQUENESS_COLLECTION, lead.phone);
        leadBatch.set(
          uRef,
          {
            phone: lead.phone,
            leadId: lead.leadId,
            createdAt: lead.createdAt,
          },
          { merge: true }
        );

        leadsSynced++;
      }

      await leadBatch.commit();
    }

    // 4. Prune obsolete placeholder leads (e.g. L001-L040)
    let leadsPruned = 0;
    if (cleanPlaceholders) {
      const obsoleteLeads = existingLeadsSnap.docs.filter(
        (docSnap) =>
          !targetLeadIds.has(docSnap.id) &&
          (docSnap.id.startsWith('L0') || docSnap.id.startsWith('LEAD-'))
      );

      for (let i = 0; i < obsoleteLeads.length; i += chunkSize) {
        const chunk = obsoleteLeads.slice(i, i + chunkSize);
        const pruneBatch = writeBatch(db);
        for (const docSnap of chunk) {
          pruneBatch.delete(docSnap.ref);
          leadsPruned++;
        }
        await pruneBatch.commit();
      }
    }

    return { dealersSynced, leadsSynced, dealersPruned, leadsPruned };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'syncDatabaseWithOriginalData');
  }
}
