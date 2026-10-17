/**
 * PURE Energy PuREPower Dealer Lead Router - Comprehensive Test Suite
 *
 * Validates:
 * 1. Mobile & Pincode Validation
 * 2. Real Dealer Prefix Matching (Single & Multiple Pipe-Separated Prefixes)
 * 3. Fallback to In-house Sales for uncovered pincodes
 * 4. Duplicate Mobile Handling & Merging Policy
 * 5. Legacy Record Cleaning (Date, Casing, Whitespace, Product)
 * 6. Reconciliation Row Counts (Exactly 40 rows) & Allowed Action Values
 * 7. Surviving Benchmark Leads & Pipeline Counts
 */

import { routeLeadToDealer, parsePrefixes, INHOUSE_DEALER_ID, INHOUSE_DEALER_NAME } from '../src/utils/assignment';
import { normalizeIndianPhone, validateIndianPincode } from '../src/utils/validation';
import { INITIAL_DEALERS, BENCHMARK_LEADS } from '../src/data/initialData';
import { RECONCILIATION_DATA } from '../src/data/reconciliationData';

function assert(condition: boolean, testName: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`✅ PASSED: ${testName}`);
}

export function runAllTests() {
  console.log('\n========================================');
  console.log(' RUNNING DEALER LEAD ROUTER TEST SUITE');
  console.log('========================================\n');

  // --- 1. Mobile Validation Tests ---
  console.log('--- 1. Mobile Validation ---');
  assert(normalizeIndianPhone('9447712782').isValid === true, 'Valid 10-digit mobile passes');
  assert(normalizeIndianPhone('9447712782').normalized === '9447712782', 'Normalized matches input');
  assert(normalizeIndianPhone('98480 22 431').isValid === true, 'Formatted mobile with spaces is normalized');
  assert(normalizeIndianPhone('98480 22 431').normalized === '9848022431', 'Spaces removed from phone');
  assert(normalizeIndianPhone('+91-9000012345').isValid === true, 'Mobile with +91- is normalized');
  assert(normalizeIndianPhone('+91-9000012345').normalized === '9000012345', '+91- prefix removed');
  assert(normalizeIndianPhone('+91 9633021001').normalized === '9633021001', '+91 with space removed');
  assert(normalizeIndianPhone('12345').isValid === false, '5-digit invalid mobile rejected');
  assert(normalizeIndianPhone('').isValid === false, 'Empty phone rejected');

  // --- 2. Pincode Validation Tests ---
  console.log('\n--- 2. Pincode Validation ---');
  assert(validateIndianPincode('502285').isValid === true, 'Valid 6-digit pincode 502285 passes');
  assert(validateIndianPincode('530016').isValid === true, 'Valid 6-digit pincode 530016 passes');
  assert(validateIndianPincode('5000').isValid === false, '4-digit pincode 5000 rejected');
  assert(validateIndianPincode('50228599').isValid === false, '8-digit pincode rejected');

  // --- 3. Real Dealer Prefix Matching ---
  console.log('\n--- 3. Real Dealer Territory Prefix Matching ---');
  // D02 covers 502 (Sangareddy - Kandi Energy Point)
  const r1 = routeLeadToDealer('502285', INITIAL_DEALERS);
  assert(r1.dealerId === 'D02', 'Pincode 502285 routes to D02 (Kandi Energy Point)');
  assert(r1.dealerName === 'Kandi Energy Point', 'Dealer name matches Kandi Energy Point');
  assert(r1.isFallback === false, 'Not a fallback route');

  // D05 covers 530|531 (Visakhapatnam - Vizag Home Power)
  const r2 = routeLeadToDealer('530016', INITIAL_DEALERS);
  assert(r2.dealerId === 'D05', 'Pincode 530016 routes to D05 (Vizag Home Power)');

  const r3 = routeLeadToDealer('531001', INITIAL_DEALERS);
  assert(r3.dealerId === 'D05', 'Pincode 531001 routes to D05 (Vizag Home Power)');

  // D06 covers 520|521 (Vijayawada - Krishna Energy Store)
  const r4 = routeLeadToDealer('520010', INITIAL_DEALERS);
  assert(r4.dealerId === 'D06', 'Pincode 520010 routes to D06 (Krishna Energy Store)');

  const r5 = routeLeadToDealer('521137', INITIAL_DEALERS);
  assert(r5.dealerId === 'D06', 'Pincode 521137 routes to D06 (Krishna Energy Store)');

  // D01 covers 500 (Hyderabad - Sri Sai Power Solutions)
  const r6 = routeLeadToDealer('500081', INITIAL_DEALERS);
  assert(r6.dealerId === 'D01', 'Pincode 500081 routes to D01 (Sri Sai Power Solutions)');

  // D07 covers 522 (Guntur Battery World)
  const r7 = routeLeadToDealer('522002', INITIAL_DEALERS);
  assert(r7.dealerId === 'D07', 'Pincode 522002 routes to D07 (Guntur Battery World)');

  // D08 covers 517 (Tirupati PowerHouse)
  const r8 = routeLeadToDealer('517501', INITIAL_DEALERS);
  assert(r8.dealerId === 'D08', 'Pincode 517501 routes to D08 (Tirupati PowerHouse)');

  // D04 covers 505 (Karimnagar Solar Hub)
  const r9 = routeLeadToDealer('505001', INITIAL_DEALERS);
  assert(r9.dealerId === 'D04', 'Pincode 505001 routes to D04 (Karimnagar Solar Hub)');

  // Pipe separated prefixes parsing
  const prefixes = parsePrefixes('530|531');
  assert(prefixes.length === 2 && prefixes[0] === '530' && prefixes[1] === '531', 'parsePrefixes splits 530|531 correctly');

  // --- 4. Fallback to In-house Sales ---
  console.log('\n--- 4. Unserviced Pincode Fallback ---');
  // L1015 has pincode 110001 (prefix 110: Delhi, not in AP/Telangana dealer network)
  const rFallback = routeLeadToDealer('110001', INITIAL_DEALERS);
  assert(rFallback.dealerId === INHOUSE_DEALER_ID, 'Prefix 110 falls back to INHOUSE');
  assert(rFallback.dealerName === INHOUSE_DEALER_NAME, 'Assigned to In-house Sales');
  assert(rFallback.isFallback === true, 'isFallback is true');

  // --- 5. Reconciliation Report Audit (40 Original Leads) ---
  console.log('\n--- 5. Reconciliation Audit (Original 40 Leads) ---');
  assert(RECONCILIATION_DATA.length === 40, 'Reconciliation report contains exactly 40 rows');

  const allowedActions = new Set(['imported', 'fixed', 'merged', 'rejected', 'assigned_inhouse']);
  for (const row of RECONCILIATION_DATA) {
    assert(allowedActions.has(row.action), `Action '${row.action}' for ${row.lead_id} is valid`);
    assert(row.reason.length > 3, `Descriptive reason present for ${row.lead_id}`);
  }

  // Verify duplicates are merged
  const mergedRows = RECONCILIATION_DATA.filter((r) => r.action === 'merged');
  assert(mergedRows.length === 5, 'Exactly 5 duplicate enquiries merged (L1036, L1037, L1038, L1039, second L1033)');

  // Verify rejected leads
  const rejectedRows = RECONCILIATION_DATA.filter((r) => r.action === 'rejected');
  assert(rejectedRows.length === 3, 'Exactly 3 invalid leads rejected (L1009 bad phone, L1012 bad pincode, L1026 empty name)');

  // Verify inhouse lead
  const inhouseRows = RECONCILIATION_DATA.filter((r) => r.action === 'assigned_inhouse');
  assert(inhouseRows.length === 1 && inhouseRows[0].lead_id === 'L1015', 'Exactly 1 lead assigned to in-house sales (L1015)');

  // Verify fixed leads
  const fixedRows = RECONCILIATION_DATA.filter((r) => r.action === 'fixed');
  assert(fixedRows.length === 6, 'Exactly 6 leads fixed (L1004, L1006, L1018, L1020, L1023, L1028)');

  // --- 6. Surviving Benchmark Leads ---
  console.log('\n--- 6. Surviving Benchmark Leads ---');
  assert(BENCHMARK_LEADS.length === 32, 'Exactly 32 surviving leads (40 total minus 3 rejected minus 5 merged = 32)');

  console.log('\n========================================');
  console.log(' ALL 30+ TESTS COMPLETED SUCCESSFULLY!');
  console.log('========================================\n');
}

runAllTests();
