import { LeadDocument, BigQueryLeadRow, ChangeType } from '../types';
import { CONFIG } from '../config';

export interface BigQueryClientInterface {
  insertRows(datasetId: string, tableId: string, rows: { insertId?: string; json: BigQueryLeadRow }[]): Promise<any>;
}

/**
 * Transforms a Firestore Lead document into a sanitized BigQuery record.
 * Strips sensitive PII (such as phone numbers) to adhere to least-privilege analytical design.
 */
export function mapLeadToBigQueryRow(
  leadId: string,
  lead: Partial<LeadDocument> | null,
  changeType: ChangeType,
  eventId: string,
  eventTimestamp: string = new Date().toISOString()
): BigQueryLeadRow {
  const pincode = lead?.pincode ? String(lead.pincode).trim() : '';
  const pincodePrefix = pincode.length >= 3 ? pincode.slice(0, 3) : '';

  return {
    event_id: eventId,
    lead_id: leadId,
    customer_name: lead?.name || '',
    pincode: pincode,
    pincode_prefix: pincodePrefix,
    product: lead?.product || '',
    source: lead?.source || 'Other',
    assigned_dealer_id: lead?.assignedDealerId || 'INHOUSE',
    assigned_dealer_name: lead?.assignedDealerName || 'In-house Sales',
    status: lead?.status || 'New',
    created_at: lead?.createdAt || eventTimestamp,
    updated_at: lead?.updatedAt || eventTimestamp,
    event_timestamp: eventTimestamp,
    change_type: changeType,
    notes: lead?.notes || '',
  };
}

/**
 * Mock BigQuery Client for automated unit testing and local development.
 */
export class MockBigQueryClient implements BigQueryClientInterface {
  public insertedRows: { insertId?: string; row: BigQueryLeadRow }[] = [];

  async insertRows(
    datasetId: string,
    tableId: string,
    rows: { insertId?: string; json: BigQueryLeadRow }[]
  ): Promise<any> {
    for (const r of rows) {
      // Idempotency test: check if insertId already exists
      const existing = this.insertedRows.find((item) => item.insertId && item.insertId === r.insertId);
      if (existing) {
        // BigQuery streaming buffer silently deduplicates by insertId within buffer window
        continue;
      }
      this.insertedRows.push({ insertId: r.insertId, row: r.json });
    }
    return [{ success: true, count: rows.length }];
  }

  clear(): void {
    this.insertedRows = [];
  }
}

export const testMockBigQueryClient = new MockBigQueryClient();

/**
 * Production BigQuery Client Wrapper
 */
export class GoogleBigQueryClient implements BigQueryClientInterface {
  private projectId?: string;

  constructor(projectId?: string) {
    this.projectId = projectId;
  }

  async insertRows(
    datasetId: string,
    tableId: string,
    rows: { insertId?: string; json: BigQueryLeadRow }[]
  ): Promise<any> {
    const modulePath = '@google-cloud/bigquery';
    // @ts-ignore
    const { BigQuery } = await import(/* @vite-ignore */ modulePath);
    const bq = new BigQuery({ projectId: this.projectId });
    const dataset = bq.dataset(datasetId);
    const table = dataset.table(tableId);

    // Stream rows with insertId for automatic deduplication
    const streamPayload = rows.map((r) => ({
      insertId: r.insertId,
      raw: r.json,
    }));

    return table.insert(streamPayload, {
      raw: true,
      skipInvalidRows: false,
      ignoreUnknownValues: false,
    });
  }
}

export interface ExportLeadEventOptions {
  leadId: string;
  before: Partial<LeadDocument> | null;
  after: Partial<LeadDocument> | null;
  eventId: string;
  eventTimestamp?: string;
  bqClient?: BigQueryClientInterface;
}

/**
 * Core export function for Firestore onDocumentWritten event.
 * Handles CREATE, UPDATE, and DELETE with deduplication and field mapping.
 */
export async function exportLeadEventToBigQuery(
  options: ExportLeadEventOptions
): Promise<{ success: boolean; changeType: ChangeType; row: BigQueryLeadRow }> {
  const { leadId, before, after, eventId, eventTimestamp = new Date().toISOString(), bqClient } = options;

  let changeType: ChangeType = 'UPDATE';
  if (!before && after) {
    changeType = 'CREATE';
  } else if (before && !after) {
    changeType = 'DELETE';
  }

  const activeDoc = after || before;
  const row = mapLeadToBigQueryRow(leadId, activeDoc, changeType, eventId, eventTimestamp);

  // BigQuery streaming insert with deterministic insertId for deduplication
  const insertId = `${eventId}_${leadId}_${changeType}`;
  const client = bqClient || testMockBigQueryClient;

  try {
    await client.insertRows(CONFIG.bigQueryDatasetId, CONFIG.bigQueryTableId, [
      {
        insertId,
        json: row,
      },
    ]);

    return { success: true, changeType, row };
  } catch (error: any) {
    console.error(`[BigQuery Export] Failed streaming event ${eventId} for lead ${leadId}:`, error.message);
    throw error;
  }
}
