# AI Usage & Verification Log — Dealer Lead Router

## 1. AI Tools & Environments Used
- **Google AI Studio Build Engine**: Interactive agent runtime with full filesystem and bash command execution.
- **Gemini 3.8 Flash**: Core model utilized for code generation, test case synthesis, and architectural verification.
- **Firebase Fax RPC Services**: Used to provision Google Cloud Firestore and deploy hardened security rules (`ProvisionFirebase`, `DeployRules`).
- **Node.js 22 / TypeScript 7 / Vite 8**: Build and execution environment.

---

## 2. Three Useful Prompts Used During Development

### Prompt 1: Designing the Atomic Mobile Uniqueness Architecture
> *"How should concurrent lead submissions from the same mobile number be prevented in Firebase without resorting to full-table client queries or paid Cloud Functions?"*
- **Outcome**: Established the dedicated `/lead_uniqueness/{phone}` index pattern. By using the customer's normalized 10-digit phone number as the document ID, a Firestore `runTransaction` can read and write the uniqueness lock atomically, providing strict concurrency guarantees on the free Spark plan without costly queries.

### Prompt 2: Standardizing the 3-Digit Pincode Routing Engine
> *"Implement a deterministic dealer assignment algorithm that handles pipe-separated 3-digit pincode prefixes (e.g. `560|561|562`), handles potential territory overlaps deterministically, and falls back to In-house Sales."*
- **Outcome**: Designed the reusable `routeLeadToDealer` function in TypeScript and Python, sorting dealers by `dealerId` ascending to resolve any prefix conflicts deterministically.

### Prompt 3: Legacy CSV Cleaning & Reconciliation Report Rules
> *"Formulate a 1:1 reconciliation audit pipeline that ingests 40 legacy records, classifies each into imported, fixed, merged, rejected, or assigned_inhouse, and outputs a strict 3-column CSV report preserving the original lead ID."*
- **Outcome**: Created `scripts/clean_and_import.py` producing `reports/reconciliation.csv` with exactly 40 rows and descriptive reasons for every operation.

---

## 3. Unsuitable AI Suggestion & How It Was Verified and Corrected

### The Issue
Initially, an AI-generated draft suggested enforcing mobile number uniqueness solely by querying Firestore from the client before submitting:
```ts
// Flawed Suggestion:
const querySnapshot = await getDocs(query(collection(db, 'leads'), where('phone', '==', userPhone)));
if (!querySnapshot.empty) {
  throw new Error('Duplicate phone');
}
await addDoc(collection(db, 'leads'), leadData);
```

### Why It Was Unsuitable & Insecure
1. **Race Conditions**: Two customers or channels (e.g. WhatsApp Webhook and Website) submitting simultaneously would both see 0 existing records and both successfully write duplicate leads.
2. **Security Rules Incompatibility**: Firestore Security Rules cannot execute arbitrary collection queries across `/leads` to block concurrent writes without an expensive collection scan.
3. **Information Disclosure**: Relying on unconstrained client queries risks exposing sensitive lead records.

### How It Was Corrected
We rejected the client-query approach and implemented an atomic transaction pattern with a dedicated `/lead_uniqueness/{phone}` collection:
```ts
// Hardened Atomic Transaction Pattern:
const uniquenessRef = doc(db, 'lead_uniqueness', normalizedPhone);
const leadRef = doc(db, 'leads', leadId);

await runTransaction(db, async (transaction) => {
  const uniqueDoc = await transaction.get(uniquenessRef);
  if (uniqueDoc.exists()) {
    throw new Error('Duplicate mobile number prevented');
  }
  transaction.set(uniquenessRef, { phone: normalizedPhone, leadId, createdAt: timestamp });
  transaction.set(leadRef, newLead);
});
```
This guarantees mathematical atomicity at the database level and works completely within Firebase Spark tier constraints.

---

## 4. Optional Extra-Credit Features: Architectural Decisions & Safety

### 1. Feature A: Durable Idempotency vs. Double-Email Hazards
- **Challenge**: 2nd-gen Cloud Functions and Eventarc operate under *at-least-once delivery*, which can cause duplicate email dispatches to dealers on transient retries.
- **Solution**: Implemented an atomic transactional reservation check in a dedicated `/lead_notifications/{leadId}` ledger. If a notification for that lead is already marked `SENT`, subsequent event executions exit immediately, completely eliminating duplicate emails.

### 2. Feature B: Modern BigQuery CDC vs. Deprecated Extensions
- **Challenge**: Older Firebase extensions relied on legacy 1st-generation functions and raw JSON blob exports that required heavy parsing in BigQuery.
- **Solution**: Implemented a native 2nd-generation `onDocumentWritten` streaming pipeline writing structured changelog rows (`leads_changelog`) with `insertId` deduplication and a BigQuery `QUALIFY ROW_NUMBER() OVER (PARTITION BY lead_id ...)` deduplicated view (`v_latest_leads`).

### 3. Billing & Deployment Safety
- **Strict Guardrail**: Verified that neither feature deployed live to production cloud resources or incurred cloud costs without explicit user authorization, providing comprehensive hermetic local test suites (`tests/emailNotification.test.ts` and `tests/bigQueryExport.test.ts`) that execute in 100% offline environments.
