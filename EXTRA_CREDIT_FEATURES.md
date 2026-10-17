# PURE Energy PuREPower — Optional Extra-Credit Features Specification

This document details the architectural design, implementation, testing, billing constraints, and deployment procedures for both optional features:
1. **Feature A**: 2nd-Generation Firebase Cloud Function for Automated Dealer Email Notifications.
2. **Feature B**: Real-Time BigQuery CDC Streaming Pipeline & Territory Lead Analytics.

---

## 1. Implementation Status Overview

| Component | Status | Verification & Notes |
| :--- | :---: | :--- |
| **Feature A: Code Implementation** | **Completed** | Modular TypeScript Cloud Function in `functions/src/notifications/` with multi-provider adapter (Mock, Resend, SendGrid) and durable idempotency ledger `/lead_notifications/{leadId}`. |
| **Feature A: Local & Unit Testing** | **Verified (Passed)** | 5 hermetic test suites covering successful send, missing dealer email, provider errors, retry idempotency, and PII masking passed in `tests/emailNotification.test.ts`. |
| **Feature A: Project Config / Billing** | **Requires Approval** | Requires Firebase Blaze Plan (Pay-as-you-go) to enable Cloud Run / 2nd-gen Cloud Functions and outbound HTTP calls to email providers. |
| **Feature A: Production Deployment** | **Awaiting Approval** | **NOT deployed to live GCP** per safety policy. Deployment commands provided below. |
| **Feature B: Code Implementation** | **Completed** | CDC streaming exporter in `functions/src/bigquery/` mapping all mutations (CREATE, UPDATE, DELETE) with PII redaction and `insertId` deduplication. |
| **Feature B: Local & Unit Testing** | **Verified (Passed)** | 5 automated test suites covering field mapping, 3-digit prefix extraction, mutation handling, deduplication, and failure recovery in `tests/bigQueryExport.test.ts`. |
| **Feature B: Project Config / Billing** | **Requires Approval** | Requires Google Cloud BigQuery API enabled on project `onyx-sphere-c3kqt` with linked billing. |
| **Feature B: Production Deployment** | **Awaiting Approval** | **NOT deployed to live BigQuery** per safety policy. DDL, deduplicated view, and analytical SQL provided in `functions/src/bigquery/queries.sql`. |

---

## 2. Feature A — New-Lead Email Notification

### 2.1 Architecture & Data Flow

```
[Customer Form / WhatsApp / Voice Agent]
                │
                ▼
      Firestore /leads/{leadId}
                │
      (onDocumentCreated Trigger)
                │
                ▼
┌───────────────────────────────────────────────┐
│ Cloud Function: onLeadCreatedSendEmail        │
│                                               │
│ 1. Transactional Idempotency Check            │
│    Inspect /lead_notifications/{leadId}       │
│    • If already 'SENT' ──► Exit Immediately   │
│    • Else ──► Acquire lock ('PROCESSING')     │
│                                               │
│ 2. Territory Dealer Lookup                    │
│    Fetch /dealers/{assignedDealerId}          │
│    • If 'INHOUSE' ──► INHOUSE_SALES_EMAIL     │
│    • If missing email ──► Log warning & exit  │
│                                               │
│ 3. PII-Safe Template Generation               │
│    Mask customer phone (unless enabled)       │
│    Format Lead ID, Product, Pincode, Source   │
│                                               │
│ 4. Transporter Dispatch (Resend / SendGrid)   │
│    API Key from Firebase Secret Manager       │
│                                               │
│ 5. Durable Audit Record                       │
│    Write status: 'SENT', messageId, timestamp │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
       [Assigned Dealer Inbox / CRM]
```

### 2.2 Security, Privacy & Least-Privilege Logs
- **No Unencrypted Secrets**: Email provider API keys are accessed solely via Firebase 2nd-gen Secret Manager (`defineSecret('EMAIL_API_KEY')`).
- **Customer PII Masking**: Customer phone numbers and names are masked in Cloud Logging (`H*** S***`, `******2345`). In emails, customer mobile numbers are redacted by default (`******2345 (masked for privacy — view full lead in portal)`) unless `INCLUDE_CUSTOMER_PHONE_IN_EMAIL=true` is explicitly configured.
- **Rule Isolation**: Web client SDKs cannot read or tamper with `/lead_notifications` (secured via default-deny rule in `firestore.rules`).

---

## 3. Feature B — BigQuery Export & Analytics

### 3.1 Architecture & Ingestion Pipeline

```
          Firestore /leads/{leadId}
      (Create, Status Update, Reassignment)
                      │
           (onDocumentWritten Trigger)
                      │
                      ▼
┌───────────────────────────────────────────────┐
│ Cloud Function: onLeadWrittenExportBigQuery   │
│                                               │
│ 1. Event Classification                       │
│    • !before && after  ──► CREATE             │
│    • before && after   ──► UPDATE             │
│    • before && !after  ──► DELETE             │
│                                               │
│ 2. Field Normalization & PII Exclusion        │
│    • Extract 3-digit pincode_prefix           │
│    • Strip customer phone/mobile              │
│    • Map stable timestamps                    │
│                                               │
│ 3. BigQuery Streaming Buffer Insert           │
│    Table: pure_energy_analytics.leads_changelog│
│    insertId: ${eventId}_${leadId}_${changeType}│
└───────────────────────┬───────────────────────┘
                        │
                        ▼
       BigQuery Dataset: pure_energy_analytics
                        │
 ┌──────────────────────┴──────────────────────┐
 │ Partitioned Table: leads_changelog (DAY)    │
 │ Clustering: assigned_dealer_id, status      │
 └──────────────────────┬──────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────┐
 │ Deduplicated View: v_latest_leads           │
 │ (QUALIFY ROW_NUMBER() OVER (...) = 1)       │
 └─────────────────────────────────────────────┘
```

### 3.2 BigQuery Table Schema (`pure_energy_analytics.leads_changelog`)

| Column Name | BigQuery Type | Mode | Description |
| :--- | :--- | :--- | :--- |
| `event_id` | `STRING` | `REQUIRED` | Unique CloudEvent/execution ID for deduplication |
| `lead_id` | `STRING` | `REQUIRED` | Stable business lead identifier (e.g. `L1001`) |
| `customer_name` | `STRING` | `NULLABLE` | Customer name |
| `pincode` | `STRING` | `NULLABLE` | 6-digit Indian postal code |
| `pincode_prefix` | `STRING` | `NULLABLE` | First 3 digits of pincode (territory partition) |
| `product` | `STRING` | `NULLABLE` | PuREPower product requested |
| `source` | `STRING` | `NULLABLE` | Origin acquisition channel |
| `assigned_dealer_id`| `STRING` | `NULLABLE` | Assigned dealership ID or `INHOUSE` |
| `assigned_dealer_name`| `STRING` | `NULLABLE` | Assigned dealership name or `In-house Sales` |
| `status` | `STRING` | `NULLABLE` | Status: `New`, `Contacted`, `Converted`, `Lost` |
| `created_at` | `TIMESTAMP` | `NULLABLE` | Original lead submission time |
| `updated_at` | `TIMESTAMP` | `NULLABLE` | Last modification / status update time |
| `event_timestamp` | `TIMESTAMP` | `REQUIRED` | Ingestion timestamp (Day Partitioning Column) |
| `change_type` | `STRING` | `REQUIRED` | `CREATE`, `UPDATE`, or `DELETE` |
| `notes` | `STRING` | `NULLABLE` | Customer requirements or staff notes |

*Notice: Sensitive customer phone numbers are intentionally excluded from the analytical layer to prevent unnecessary PII proliferation.*

---

## 4. The 5 Analytical SQL Queries

All queries are executed against the deduplicated view `pure_energy_analytics.v_latest_leads` to guarantee accurate, deduplicated operational metrics.

### Query 1: Lead Counts by Dealer
```sql
SELECT
  assigned_dealer_id,
  assigned_dealer_name,
  COUNT(1) AS total_leads,
  COUNTIF(status = 'New') AS new_leads,
  COUNTIF(status = 'Contacted') AS contacted_leads,
  COUNTIF(status = 'Converted') AS converted_leads,
  COUNTIF(status = 'Lost') AS lost_leads,
  ROUND(COUNT(1) * 100.0 / SUM(COUNT(1)) OVER (), 2) AS percentage_of_total
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY assigned_dealer_id, assigned_dealer_name
ORDER BY total_leads DESC;
```

### Query 2: Lead Counts by Status
```sql
SELECT
  status,
  COUNT(1) AS lead_count,
  ROUND(COUNT(1) * 100.0 / SUM(COUNT(1)) OVER (), 2) AS percentage_of_pipeline
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY status
ORDER BY 
  CASE status
    WHEN 'New' THEN 1
    WHEN 'Contacted' THEN 2
    WHEN 'Converted' THEN 3
    WHEN 'Lost' THEN 4
    ELSE 5
  END;
```

### Query 3: Conversion Rate by Dealer
```sql
SELECT
  assigned_dealer_id,
  assigned_dealer_name,
  COUNT(1) AS total_assigned_leads,
  COUNTIF(status = 'Converted') AS converted_count,
  COUNTIF(status = 'Lost') AS lost_count,
  COUNTIF(status IN ('Converted', 'Lost')) AS closed_leads,
  -- Overall Conversion Rate
  ROUND(
    SAFE_DIVIDE(COUNTIF(status = 'Converted') * 100.0, COUNT(1)), 
    2
  ) AS overall_conversion_rate_pct,
  -- Closed-Deal Win Rate
  ROUND(
    SAFE_DIVIDE(
      COUNTIF(status = 'Converted') * 100.0, 
      NULLIF(COUNTIF(status IN ('Converted', 'Lost')), 0)
    ), 
    2
  ) AS closed_deal_win_rate_pct
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY assigned_dealer_id, assigned_dealer_name
ORDER BY converted_count DESC, overall_conversion_rate_pct DESC;
```

### Query 4: Leads Created Per Day
```sql
SELECT
  DATE(created_at, 'Asia/Kolkata') AS lead_date,
  COUNT(1) AS daily_new_leads,
  COUNTIF(source = 'Website') AS website_leads,
  COUNTIF(source IN ('AI Voice Call', 'Voice Agent')) AS voice_agent_leads,
  COUNTIF(source = 'WhatsApp') AS whatsapp_leads,
  COUNTIF(source = 'Dealer Walk-in') AS walkin_leads,
  COUNTIF(source NOT IN ('Website', 'AI Voice Call', 'Voice Agent', 'WhatsApp', 'Dealer Walk-in')) AS other_leads
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY lead_date
ORDER BY lead_date DESC;
```

### Query 5: Product-wise Lead Distribution
```sql
SELECT
  product,
  COUNT(1) AS total_enquiries,
  ROUND(COUNT(1) * 100.0 / SUM(COUNT(1)) OVER (), 2) AS demand_share_pct,
  COUNTIF(status = 'Converted') AS converted_units,
  ROUND(SAFE_DIVIDE(COUNTIF(status = 'Converted') * 100.0, COUNT(1)), 2) AS conversion_rate_pct
FROM `pure_energy_analytics.v_latest_leads`
GROUP BY product
ORDER BY total_enquiries DESC;
```

---

## 5. Billing & Deployment Safety Analysis

### 5.1 Plan Constraints: Spark (Free) vs Blaze (Pay-as-you-go)
The core PURE Energy web application runs on Firebase Hosting and Cloud Firestore under the **Spark (Free)** tier.

To deploy second-generation Cloud Functions and BigQuery streaming to Google Cloud:
1. **Cloud Functions 2nd Gen**: Powered by Cloud Run and Google Cloud Build. Deploying them requires a billing account attached to project `onyx-sphere-c3kqt` (Blaze plan).
2. **Outbound Networking**: The free Spark plan restricts outbound socket networking. Contacting email APIs (Resend, SendGrid) or BigQuery Streaming APIs requires Blaze.
3. **BigQuery**: BigQuery offers a generous free tier (10 GB storage, 1 TB analysis queries/month free), but the BigQuery API must be enabled with billing enabled on the Google Cloud project.

### 5.2 Estimated Costs Under Normal Operational Volume
Assuming 500 new leads/month and 1,500 status updates/month:
- **Cloud Functions Executions**: ~2,000 invocations/month. (Firebase free tier includes 2,000,000 invocations/month → **$0.00 / month**).
- **Email Delivery (Resend / SendGrid)**: Free tiers allow 100–3,000 emails/month free → **$0.00 / month**.
- **BigQuery Storage & Ingest**: 500 leads is < 1 MB. (Free tier includes 10 GB storage and 1 TB query scans → **$0.00 / month**).
- **Estimated Net Ongoing Cost**: **$0.00 to <$0.50 / month**.
- **Budget Alerts**: We recommend setting a Google Cloud Budget Alert of **$5.00** with email notification in the Google Cloud Console.

---

## 6. Local Testing Commands

All unit and integration tests run hermetically without external network access or billable API keys:

```bash
# 1. Run complete master test suite (Router + Email Notification + BigQuery Export)
npm test

# 2. Run router & legacy reconciliation test suite individually
npm run test:router

# 3. Run email notification tests individually
npx tsx tests/emailNotification.test.ts

# 4. Run BigQuery CDC streaming tests individually
npx tsx tests/bigQueryExport.test.ts

# 5. Typecheck TypeScript codebase
npm run lint
```

---

## 7. Production Deployment Commands (Run ONLY After Explicit Approval)

When you are ready to enable billing and deploy both features to live Google Cloud:

### Step 1: Upgrade to Blaze & Enable Required APIs
```bash
# In Google Cloud Console or via gcloud CLI:
gcloud services enable \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  --project onyx-sphere-c3kqt
```

### Step 2: Configure Secrets
```bash
# Set your email delivery API key (Resend or SendGrid) in Firebase Secret Manager
firebase functions:secrets:set EMAIL_API_KEY --project onyx-sphere-c3kqt
```

### Step 3: Initialize BigQuery Dataset & Table
```bash
# Using bq CLI tool:
bq mk --location=US pure_energy_analytics
bq query --use_legacy_sql=false < functions/src/bigquery/queries.sql
```

### Step 4: Deploy Cloud Functions
```bash
# Install dependencies in functions/
cd functions && npm install && npm run build && cd ..

# Deploy only functions to Firebase project
firebase deploy --only functions --project onyx-sphere-c3kqt
```

---

## 8. End-to-End Verification Checklist

- [x] **Lead Form Validation**: 10-digit phone, 6-digit pincode, duplicate mobile blocking preserved.
- [x] **Territory Routing**: 3-digit prefix matching (`500` → `D01`, `530|531` → `D05`) and `INHOUSE` fallback preserved.
- [x] **Email Notification Trigger**: `onLeadCreatedSendEmail` triggers on `leads/{leadId}` creation.
- [x] **Email Idempotency**: `/lead_notifications/{leadId}` prevents duplicate dispatches.
- [x] **Missing Email Fallback**: Gracefully skips without crash when dealer has no email.
- [x] **Customer Privacy**: Customer mobile numbers masked in logs and redacted from BigQuery.
- [x] **BigQuery CDC Streaming**: Captures `CREATE`, `UPDATE`, `DELETE` mutations.
- [x] **BigQuery Deduplication**: Deduplicated view `v_latest_leads` collapses change events.
- [x] **Analytical Queries**: All 5 SQL queries tested and verified against schema.
- [x] **Safety Policy**: No billable resources deployed without user authorization.
