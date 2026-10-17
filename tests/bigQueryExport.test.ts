/**
 * Automated Test Suite — Feature B: Firestore to BigQuery Export & Analytics
 *
 * Verifies:
 * 1. Field Mapping & Schema Fidelity (Lead ID, territory prefix, product, dealer)
 * 2. PII Protection (Phone number excluded from analytical rows)
 * 3. Mutation Event Handling (CREATE, UPDATE, DELETE)
 * 4. Idempotent Ingestion & Deduplication via insertId
 * 5. Error Handling on Network / Service Failures
 */

import {
  mapLeadToBigQueryRow,
  exportLeadEventToBigQuery,
  MockBigQueryClient,
} from '../functions/src/bigquery/bigQueryExport';
import { LeadDocument } from '../functions/src/types';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ PASSED: ${testName}`);
}

export async function runBigQueryExportTests() {
  console.log('\n======================================================');
  console.log(' RUNNING FEATURE B: BIGQUERY EXPORT TEST SUITE');
  console.log('======================================================\n');

  const sampleLead: LeadDocument = {
    leadId: 'L1001',
    name: 'K. Venkatesh',
    phone: '9848011223',
    pincode: '500081',
    product: 'PuREPower 5kWh Home Battery',
    source: 'Website',
    assignedDealerId: 'D01',
    assignedDealerName: 'Sri Sai Power Solutions',
    status: 'New',
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    notes: 'Inquired about solar inverter integration',
  };

  // --- Test 1: Field Mapping & Territory Prefix ---
  console.log('--- 1. Field Mapping & Schema Validation ---');
  const mappedRow = mapLeadToBigQueryRow('L1001', sampleLead, 'CREATE', 'event-001', '2026-10-15T10:00:05.000Z');

  assert(mappedRow.lead_id === 'L1001', 'lead_id matches L1001');
  assert(mappedRow.customer_name === 'K. Venkatesh', 'customer_name matches');
  assert(mappedRow.pincode === '500081', 'pincode matches');
  assert(mappedRow.pincode_prefix === '500', 'pincode_prefix extracted as 500');
  assert(mappedRow.product === 'PuREPower 5kWh Home Battery', 'product matches');
  assert(mappedRow.source === 'Website', 'source matches');
  assert(mappedRow.assigned_dealer_id === 'D01', 'assigned_dealer_id matches D01');
  assert(mappedRow.status === 'New', 'status matches New');
  assert(mappedRow.change_type === 'CREATE', 'change_type is CREATE');
  assert(mappedRow.event_id === 'event-001', 'event_id matches CloudEvent ID');

  // --- Test 2: PII Redaction in Analytical Export ---
  console.log('\n--- 2. PII Redaction in Analytical Layer ---');
  assert(!('phone' in mappedRow), 'Phone number is NOT exported to BigQuery');
  assert(!('mobile' in mappedRow), 'Mobile number is NOT exported to BigQuery');

  // --- Test 3: Mutations Handling (CREATE, UPDATE, DELETE) ---
  console.log('\n--- 3. Mutation Event Handling (CREATE, UPDATE, DELETE) ---');
  const mockBq = new MockBigQueryClient();

  // A. CREATE Event
  const createResult = await exportLeadEventToBigQuery({
    leadId: 'L1001',
    before: null,
    after: sampleLead,
    eventId: 'evt-create-001',
    bqClient: mockBq,
  });
  assert(createResult.changeType === 'CREATE', 'Detected CREATE when before is null');
  assert(mockBq.insertedRows.length === 1, 'BigQuery client received 1 row');
  assert(mockBq.insertedRows[0].row.change_type === 'CREATE', 'First row is CREATE');

  // B. UPDATE Event (e.g. Status changed to Converted)
  const updatedLead: LeadDocument = {
    ...sampleLead,
    status: 'Converted',
    updatedAt: '2026-10-16T14:30:00.000Z',
  };

  const updateResult = await exportLeadEventToBigQuery({
    leadId: 'L1001',
    before: sampleLead,
    after: updatedLead,
    eventId: 'evt-update-002',
    bqClient: mockBq,
  });
  assert(updateResult.changeType === 'UPDATE', 'Detected UPDATE when before & after exist');
  assert(mockBq.insertedRows.length === 2, 'BigQuery client has 2 rows in changelog');
  assert(mockBq.insertedRows[1].row.status === 'Converted', 'Updated row reflects status Converted');

  // C. DELETE Event
  const deleteResult = await exportLeadEventToBigQuery({
    leadId: 'L1001',
    before: updatedLead,
    after: null,
    eventId: 'evt-delete-003',
    bqClient: mockBq,
  });
  assert(deleteResult.changeType === 'DELETE', 'Detected DELETE when after is null');
  assert(mockBq.insertedRows.length === 3, 'BigQuery client has 3 rows in changelog');
  assert(mockBq.insertedRows[2].row.change_type === 'DELETE', 'Changelog records DELETE event');

  // --- Test 4: Idempotency & Deduplication via insertId ---
  console.log('\n--- 4. Idempotent Ingestion & Deduplication ---');
  // Re-export the same UPDATE event with identical eventId
  await exportLeadEventToBigQuery({
    leadId: 'L1001',
    before: sampleLead,
    after: updatedLead,
    eventId: 'evt-update-002', // SAME event ID as previous UPDATE
    bqClient: mockBq,
  });

  // Mock client's insertId deduplication simulates BigQuery streaming buffer deduplication
  assert(mockBq.insertedRows.length === 3, 'Changelog length unchanged at 3 (duplicate insertId discarded)');

  // --- Test 5: Error Handling on Failure ---
  console.log('\n--- 5. Error Handling on Upstream Failure ---');
  const failingBq = {
    insertRows: async () => {
      throw new Error('BigQuery quota exceeded or dataset not found');
    },
  };

  let caughtError = false;
  try {
    await exportLeadEventToBigQuery({
      leadId: 'L1001',
      before: null,
      after: sampleLead,
      eventId: 'evt-err-004',
      bqClient: failingBq,
    });
  } catch (err: any) {
    caughtError = true;
    assert(err.message.includes('BigQuery quota'), 'Actionable error thrown on failure');
  }
  assert(caughtError === true, 'Exception safely bubbled up for Cloud Function retry policy');

  console.log('\n======================================================');
  console.log(' ALL FEATURE B TESTS COMPLETED SUCCESSFULLY!');
  console.log('======================================================\n');
}

// Allow direct CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  runBigQueryExportTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
