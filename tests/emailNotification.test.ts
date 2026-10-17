/**
 * Automated Test Suite — Feature A: Automated New-Lead Email Notification
 *
 * Verifies:
 * 1. Successful Notification to Assigned Dealer
 * 2. Missing Dealer Email Handling & Actionable Logging
 * 3. Provider Failure & Non-Fatal Error Recovery
 * 4. Duplicate Event Delivery & Durable Idempotency Protection
 * 5. Customer Privacy & PII Protection (Phone Masking in Email and Logs)
 */

import { processNewLeadNotification } from '../functions/src/notifications/emailNotification';
import { MockEmailProvider } from '../functions/src/notifications/providers';
import { formatNewLeadEmail } from '../functions/src/notifications/emailTemplates';
import { LeadDocument, DealerDocument } from '../functions/src/types';
import { maskName, maskPhone, maskEmail } from '../functions/src/config';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ PASSED: ${testName}`);
}

/**
 * In-memory mock Firestore for hermetic testing without external network calls
 */
class InMemoryFirestore {
  public collections: Map<string, Map<string, any>> = new Map();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    const store = this.collections.get(name)!;

    return {
      doc: (id: string) => ({
        get: async () => ({
          exists: store.has(id),
          data: () => store.get(id),
        }),
        set: async (data: any, options?: { merge?: boolean }) => {
          if (options?.merge && store.has(id)) {
            store.set(id, { ...store.get(id), ...data });
          } else {
            store.set(id, data);
          }
        },
      }),
    };
  }

  async runTransaction(updateFn: (transaction: any) => Promise<any>): Promise<any> {
    const transaction = {
      get: async (ref: any) => ref.get(),
      set: async (ref: any, data: any, options?: any) => ref.set(data, options),
    };
    return updateFn(transaction);
  }

  seedDealer(dealer: DealerDocument) {
    if (!this.collections.has('dealers')) {
      this.collections.set('dealers', new Map());
    }
    this.collections.get('dealers')!.set(dealer.dealerId, dealer);
  }
}

export async function runEmailNotificationTests() {
  console.log('\n======================================================');
  console.log(' RUNNING FEATURE A: EMAIL NOTIFICATION TEST SUITE');
  console.log('======================================================\n');

  // --- Test 1: Successful Notification to Assigned Dealer ---
  console.log('--- 1. Successful Notification to Assigned Dealer ---');
  const db1 = new InMemoryFirestore();
  const mockProvider1 = new MockEmailProvider();

  db1.seedDealer({
    dealerId: 'D01',
    name: 'Sri Sai Power Solutions',
    pincodePrefixes: '500',
    contactPerson: 'Suresh Reddy',
    email: 'd01@example.com',
  });

  const testLead1: LeadDocument = {
    leadId: 'LEAD-TEST-001',
    name: 'Ravi Teja',
    phone: '9848012345',
    pincode: '500081',
    product: 'PuREPower 5kWh Home Battery',
    source: 'Website',
    assignedDealerId: 'D01',
    assignedDealerName: 'Sri Sai Power Solutions',
    status: 'New',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const res1 = await processNewLeadNotification({
    lead: testLead1,
    eventId: 'event-uuid-001',
    db: db1,
    provider: mockProvider1,
  });

  assert(res1.action === 'SENT', 'Lead notification returned SENT');
  assert(res1.recipientEmail === 'd01@example.com', 'Recipient is dealer email d01@example.com');
  assert(mockProvider1.sentEmails.length === 1, 'Provider received exactly 1 outgoing email');
  assert(mockProvider1.sentEmails[0].to === 'd01@example.com', 'Sent email address matches dealer');
  assert(mockProvider1.sentEmails[0].subject.includes('LEAD-TEST-001') || mockProvider1.sentEmails[0].subject.includes('Ravi Teja'), 'Subject contains customer or lead info');
  assert(mockProvider1.sentEmails[0].text.includes('500081'), 'Email text includes customer pincode');

  // Verify notification ledger record
  const ledgerSnap1 = await db1.collection('lead_notifications').doc('LEAD-TEST-001').get();
  assert(ledgerSnap1.exists === true, 'Ledger record created in lead_notifications collection');
  assert(ledgerSnap1.data().status === 'SENT', 'Ledger status marked as SENT');
  assert(ledgerSnap1.data().provider === 'mock', 'Ledger recorded correct provider');

  // --- Test 2: Missing Dealer Email Handling ---
  console.log('\n--- 2. Missing Dealer Email Handling ---');
  const db2 = new InMemoryFirestore();
  const mockProvider2 = new MockEmailProvider();

  // Dealer exists but has NO email field
  db2.seedDealer({
    dealerId: 'D99',
    name: 'No Email Dealership',
    pincodePrefixes: '999',
  });

  const testLead2: LeadDocument = {
    leadId: 'LEAD-TEST-002',
    name: 'Anita Roy',
    phone: '9848099999',
    pincode: '999001',
    product: 'PuREPower 10kWh Commercial',
    source: 'AI Voice Call',
    assignedDealerId: 'D99',
    assignedDealerName: 'No Email Dealership',
    status: 'New',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const res2 = await processNewLeadNotification({
    lead: testLead2,
    eventId: 'event-uuid-002',
    db: db2,
    provider: mockProvider2,
  });

  assert(res2.action === 'SKIPPED_NO_DEALER_EMAIL', 'Returns SKIPPED_NO_DEALER_EMAIL gracefully');
  assert(mockProvider2.sentEmails.length === 0, 'No email was dispatched');
  const ledgerSnap2 = await db2.collection('lead_notifications').doc('LEAD-TEST-002').get();
  assert(ledgerSnap2.data().status === 'SKIPPED_NO_DEALER_EMAIL', 'Ledger recorded SKIPPED_NO_DEALER_EMAIL with actionable error');

  // --- Test 3: Provider Failure Handling ---
  console.log('\n--- 3. Provider Failure Handling ---');
  const db3 = new InMemoryFirestore();
  const failingProvider = {
    name: 'failing-provider',
    sendEmail: async () => ({
      success: false,
      provider: 'failing-provider',
      error: 'Upstream SMTP connection timed out',
    }),
  };

  db3.seedDealer({
    dealerId: 'D01',
    name: 'Sri Sai Power Solutions',
    pincodePrefixes: '500',
    email: 'd01@example.com',
  });

  const res3 = await processNewLeadNotification({
    lead: testLead1,
    eventId: 'event-uuid-003',
    db: db3,
    provider: failingProvider,
  });

  assert(res3.action === 'FAILED', 'Action returned FAILED when provider errors');
  assert(res3.error?.includes('timed out') === true, 'Error message captured');
  const ledgerSnap3 = await db3.collection('lead_notifications').doc('LEAD-TEST-001').get();
  assert(ledgerSnap3.data().status === 'FAILED', 'Ledger record marked as FAILED for retry');

  // --- Test 4: Duplicate Event Delivery & Durable Idempotency ---
  console.log('\n--- 4. Duplicate Event Delivery & Durable Idempotency ---');
  const db4 = new InMemoryFirestore();
  const mockProvider4 = new MockEmailProvider();

  db4.seedDealer({
    dealerId: 'D01',
    name: 'Sri Sai Power Solutions',
    pincodePrefixes: '500',
    email: 'd01@example.com',
  });

  // First delivery
  const delivery1 = await processNewLeadNotification({
    lead: testLead1,
    eventId: 'event-uuid-first-attempt',
    db: db4,
    provider: mockProvider4,
  });
  assert(delivery1.action === 'SENT', 'First delivery successfully sends email');
  assert(mockProvider4.sentEmails.length === 1, 'Provider count is 1 after first delivery');

  // Simulated retry or at-least-once duplicate event
  const delivery2 = await processNewLeadNotification({
    lead: testLead1,
    eventId: 'event-uuid-duplicate-retry',
    db: db4,
    provider: mockProvider4,
  });
  assert(delivery2.action === 'SKIPPED_ALREADY_SENT', 'Duplicate event is skipped via idempotency check');
  assert(mockProvider4.sentEmails.length === 1, 'Provider count STILL 1 — zero duplicate emails sent!');

  // --- Test 5: Customer Privacy & PII Redaction ---
  console.log('\n--- 5. Customer Privacy & PII Redaction ---');
  assert(maskPhone('9848012345') === '******2345', 'Customer phone masked in logs');
  assert(maskName('Harsh Soni') === 'H*** S***', 'Customer name masked in logs');
  assert(maskEmail('d01@example.com') === 'd***1@example.com', 'Dealer email masked in logs');

  const template = formatNewLeadEmail(testLead1);
  assert(template.subject.includes('PuREPower 5kWh Home Battery'), 'Subject includes product model');
  assert(template.html.includes('LEAD-TEST-001'), 'HTML contains lead ID');

  console.log('\n======================================================');
  console.log(' ALL FEATURE A TESTS COMPLETED SUCCESSFULLY!');
  console.log('======================================================\n');
}

// Allow direct CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  runEmailNotificationTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
