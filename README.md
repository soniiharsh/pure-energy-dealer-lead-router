Kandi
# PURE Energy — PuREPower Dealer Lead Router

Production-grade, full-stack lead management, intelligent dealer routing, and legacy CSV reconciliation engine built for PURE Energy's PuREPower energy-storage business.

---

## 1. Project Overview

PURE Energy receives incoming customer enquiries across multiple digital and offline channels:
- Website
- AI Voice Call
- WhatsApp
- Dealer Walk-in
- Direct Referral / Other

Every incoming enquiry is validated, assigned in real time to an authorized territorial dealer using the customer's 6-digit Indian postal pincode (via 3-digit prefix matching), and tracked through the sales pipeline (`New` → `Contacted` → `Converted` / `Lost`).

The project delivers two core capabilities:
1. **Interactive Web Application & Dashboard**: Real-time Firestore-backed operational portal with live pipeline metrics, responsive intake form, lead status updates, dealer network directory, and interactive pincode router tool.
2. **Legacy Data Cleaning & Reconciliation Engine (`scripts/clean_and_import.py`)**: Automated Python processor that audits and normalizes 40 legacy records, resolves duplicate submissions, handles unserviced territories, and produces a 40-row reconciliation audit report (`reports/reconciliation.csv`).

---

## 2. Architecture & Technology Stack

```
┌──────────────────────────────────────────────────────────┐
│                   React 19 + TypeScript                  │
│     (Vite 8, Tailwind CSS v4, Motion, Lucide Icons)      │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
             ▼                             ▼
┌─────────────────────────┐   ┌────────────────────────────┐
│ Reusable Routing Engine │   │ Python Data Cleaner Engine │
│  (3-digit prefix logic) │   │ (scripts/clean_and_import) │
└────────────┬────────────┘   └────────────┬───────────────┘
             │                             │
             ▼                             ▼
┌──────────────────────────────────────────────────────────┐
│                 Google Cloud Firestore                   │
│   • /dealers/{dealerId}                                  │
│   • /leads/{leadId}                                      │
│   • /lead_uniqueness/{phone} (Atomic Transaction Lock)   │
└──────────────────────────────────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React, Motion.
- **Database & Auth**: Google Cloud Firestore (Enterprise Edition provisioned), Firebase Web SDK v13.
- **Security**: Zero-Trust Attribute-Based Access Control (`firestore.rules`) with data invariant schemas and atomic uniqueness locking.
- **Data Cleaner**: Python 3 standard library with optional `firebase-admin` integration.
- **Hosting & Bundling**: Vite 8, Firebase Hosting (`firebase.json`).

---

## 3. Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: 3.9+ (for the data cleaning and reconciliation script)
- **Firebase CLI** (optional for production deployment): `npm install -g firebase-tools`

---

## 4. Local Installation & Setup

1. **Clone or navigate to the repository directory**:
   ```bash
   git clone <repo-url> dealer-lead-router
   cd dealer-lead-router
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

3. **Verify environment variables**:
   Inspect `.env.example` and set your Firebase configuration in `.env` if targeting a standalone Firebase project:
   ```bash
   cp .env.example .env
   ```
   *Note: In Google AI Studio, `firebase-applet-config.json` is automatically injected and managed.*

---

## 5. Running the Application

### Start the Local Development Server
```bash
npm run dev
```
The application will launch at `http://localhost:3000`.

### Build for Production
```bash
npm run build
```

### Run Automated Tests
```bash
npm test
```
Executes all 30+ validation, routing, prefix-parsing, duplicate-merging, and reconciliation tests via `tsx tests/router.test.ts`.

---

## 6. Running the Python Legacy Data Cleaning Script

The data cleaner processes `data/dealers.csv` and `data/legacy_leads.csv` and generates `reports/reconciliation.csv`.

### A. Dry-Run Mode (Cleaning & Reconciliation Report)
```bash
python3 scripts/clean_and_import.py
```
This safely audits all 40 input rows, applies phone normalization, pincode validation, whitespace trimming, casing normalization, deduplication merging, and generates `reports/reconciliation.csv`.

### B. Live Database Import Mode (Optional with Firebase Admin SDK)
```bash
pip install firebase-admin
python3 scripts/clean_and_import.py --commit --credentials path/to/serviceAccountKey.json
```
Alternatively, you can initialize/seed the database directly inside the web UI using the **"Seed Clean Records to Firestore"** button on the CSV Reconciliation tab.

---

## 7. Data-Cleaning Assumptions

1. **Customer Name**: Mandatory. Records missing a customer name (e.g., `L008`) cannot be safely attributed and are marked `rejected`.
2. **Product Specification**: Mandatory. PuREPower storage capacities must be specified; rows with empty products (e.g., `L039`) are marked `rejected`.
3. **Indian Mobile Numbers**: Must normalize to exactly 10 digits starting with `6`, `7`, `8`, or `9`.
   - Strips `+91`, leading `0`, spaces, parentheses, and dashes.
   - Non-numeric or invalid length records (e.g., `L025` with 5 digits, `L038` with non-numeric text) are marked `rejected`.
4. **Pincodes**: Must be valid 6-digit Indian postal codes starting with digits 1-9.
   - Malformed pincodes (e.g., `L032` with 4 digits) are marked `rejected`.
5. **Whitespace & Casing**:
   - Leading/trailing whitespace in customer names and product titles is trimmed.
   - Status strings (e.g., `new`, `CONVERTED`) and source strings are standardized to canonical title-case enums (`New`, `Contacted`, `Converted`, `Lost`). Records requiring only formatting fixes are marked `fixed`.
6. **No-Match Pincodes**: Pincodes valid in format but not covered by the 8 dealer territories (e.g., Kochi `682001`, Ghaziabad `201001`, Dehradun `248001`, Patna `800001`) are marked `assigned_inhouse` and routed to **In-house Sales**.

---

## 8. Duplicate Resolution Policy

- **Identifier for Deduplication**: The normalized 10-digit mobile number (`^[6-9]\d{9}$`).
- **Surviving Record Selection**: The first valid record encountered chronologically or by sequence order establishes the primary active lead in the system.
- **Subsequent Enquiries**: Any subsequent record sharing the exact same mobile number (e.g., `L022` matching `L007`, `L037` matching `L003`) is classified as `merged`.
- **Handling in Database**: Duplicate enquiries are recorded in the reconciliation audit report with a cross-reference note (`"Duplicate mobile number matching lead <ID>; merged into existing record"`) and are prevented from creating duplicate dealer assignments.
- **Race Condition Prevention in UI**: The web app uses atomic Firestore transactions locking `/lead_uniqueness/{phone}` to eliminate concurrent duplicate submissions.

---

## 9. Dealer Assignment Rules

The 8 authorized dealerships and their covered 3-digit pincode prefixes:

| Dealer ID | Dealership Name | Covered Prefixes | Operating City | Contact Email |
| :--- | :--- | :--- | :--- | :--- |
| `D01` | Sri Sai Power Solutions | `500` | Hyderabad | d01@example.com |
| `D02` | Kandi Energy Point | `502` | Sangareddy | d02@example.com |
| `D03` | Warangal Green Systems | `506` | Warangal | d03@example.com |
| `D04` | Karimnagar Solar Hub | `505` | Karimnagar | d04@example.com |
| `D05` | Vizag Home Power | `530`, `531` | Visakhapatnam | d05@example.com |
| `D06` | Krishna Energy Store | `520`, `521` | Vijayawada | d06@example.com |
| `D07` | Guntur Battery World | `522` | Guntur | d07@example.com |
| `D08` | Tirupati PowerHouse | `517` | Tirupati | d08@example.com |

### Deterministic Routing Logic:
1. Extract the first 3 digits of the customer's 6-digit postal pincode.
2. Check if that prefix exists in any dealer's pipe-delimited `pincode_prefixes`.
3. **Tie-Breaking Rule**: If overlapping prefixes ever occur across dealers, the dealer with the lowest alphanumeric `dealer_id` is selected deterministically.
4. **Fallback Rule**: If no dealer covers the 3-digit prefix, the lead is assigned to `In-house Sales` (`INHOUSE`).

---

## 10. Security Considerations

- **ABAC & Schema Enforcement**: `firestore.rules` enforces regex format checks on phone (`^[6-9][0-9]{9}$`), pincode (`^[1-9][0-9]{5}$`), and strict enum values for `status` and `source`.
- **Atomic Uniqueness Locks**: Submissions write to `/lead_uniqueness/{phone}` in an atomic transaction; duplicate writes fail at the database level.
- **Default Deny**: All unspecified Firestore collection paths are denied by default (`match /{document=**} { allow read, write: if false; }`).
- **No Secret Exposure**: Zero service-account credentials or private API keys are bundled into frontend assets or checked into git.

---

## 11. Known Limitations

- **Prefix-Level vs Exact Pincode Resolution**: Indian postal codes within the same 3-digit prefix span multiple post offices. Future revisions could integrate the complete 6-digit PIN directory (19,000+ PINs) for hyper-local sub-dealer routing.
- **Offline Sync**: In offline mode, the app uses Firestore offline persistence cache; pending writes sync automatically when network connectivity is restored.

---

## 12. Optional Extra-Credit Features (Architecture & Specification)

Both optional enterprise features have been fully implemented in code, documented, and validated with hermetic local test suites:

1. **Feature A — Automated Dealer Email Notification (`functions/src/notifications/`)**:
   - 2nd-generation Cloud Function (`onLeadCreatedSendEmail`) triggered on `leads/{leadId}` creation.
   - Idempotency ledger at `/lead_notifications/{leadId}` guaranteeing zero duplicate emails during Cloud Function event retries.
   - PII protection with masked customer contact logging.
   - Multi-provider support (Resend, SendGrid, SMTP, Mock).

2. **Feature B — Real-Time BigQuery CDC Streaming Pipeline (`functions/src/bigquery/`)**:
   - 2nd-generation Cloud Function (`onLeadWrittenExportBigQuery`) triggered on `leads/{leadId}` mutations (`CREATE`, `UPDATE`, `DELETE`).
   - Streams sanitized records to `pure_energy_analytics.leads_changelog` with `insertId` deduplication.
   - Deduplicated view (`v_latest_leads`) providing live analytics for dealer volume, status mix, conversion rates, daily trends, and product share.

*See [`EXTRA_CREDIT_FEATURES.md`](./EXTRA_CREDIT_FEATURES.md) for full architecture diagrams, SQL queries, billing requirements, and deployment instructions.*

