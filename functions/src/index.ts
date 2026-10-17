import { initializeApp, getApps } from 'firebase-admin/app';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { processNewLeadNotification } from './notifications/emailNotification';
import { exportLeadEventToBigQuery, GoogleBigQueryClient } from './bigquery/bigQueryExport';
import { LeadDocument } from './types';
import { CONFIG } from './config';

// Initialize Firebase Admin if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Define Secret Manager parameters for 2nd-generation Cloud Functions
const emailApiKeySecret = defineSecret('EMAIL_API_KEY');

/**
 * FEATURE A: Automated New-Lead Email Notification
 *
 * Trigger: Fires when a document is created in the leads collection.
 * 2nd Generation Firestore Event API.
 * Idempotency: Uses /lead_notifications/{leadId} ledger to avoid duplicate dispatches.
 */
export const onLeadCreatedSendEmail = onDocumentCreated(
  {
    document: `${CONFIG.leadsCollection}/{leadId}`,
    secrets: [emailApiKeySecret],
    region: 'us-central1',
    retry: true,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.warn('[onLeadCreatedSendEmail] No snapshot data available.');
      return;
    }

    const lead = snap.data() as LeadDocument;
    const eventId = event.id;
    const apiKey = emailApiKeySecret.value();

    console.log(`[onLeadCreatedSendEmail] Event ${eventId} triggered for lead ${lead.leadId || event.params.leadId}`);

    await processNewLeadNotification({
      lead: {
        ...lead,
        leadId: lead.leadId || event.params.leadId,
      },
      eventId,
      apiKey,
    });
  }
);

/**
 * FEATURE B: Real-Time BigQuery CDC Streaming Pipeline
 *
 * Trigger: Fires on any create, update, or delete in the leads collection.
 * 2nd Generation Firestore Event API.
 * Streams change events to BigQuery changelog table with automatic deduplication.
 */
export const onLeadWrittenExportBigQuery = onDocumentWritten(
  {
    document: `${CONFIG.leadsCollection}/{leadId}`,
    region: 'us-central1',
    retry: true,
  },
  async (event) => {
    const leadId = event.params.leadId;
    const beforeData = event.data?.before.data() as LeadDocument | undefined;
    const afterData = event.data?.after.data() as LeadDocument | undefined;
    const eventId = event.id;
    const eventTimestamp = event.time;

    const bqClient = new GoogleBigQueryClient();

    await exportLeadEventToBigQuery({
      leadId,
      before: beforeData || null,
      after: afterData || null,
      eventId,
      eventTimestamp,
      bqClient,
    });
  }
);

// Re-export processors and utilities for modularity and testing
export { processNewLeadNotification } from './notifications/emailNotification';
export { exportLeadEventToBigQuery } from './bigquery/bigQueryExport';
export * from './types';
