/**
 * Master Test Runner for Dealer Lead Router & Extra-Credit Integrations
 */

import { runAllTests as runRouterTests } from './router.test';
import { runEmailNotificationTests } from './emailNotification.test';
import { runBigQueryExportTests } from './bigQueryExport.test';

async function main() {
  console.log('🚀 EXECUTING COMPLETE TEST SUITE FOR PURE ENERGY DEALER LEAD ROUTER...\n');
  
  // 1. Core Router & Reconciliation Tests
  runRouterTests();

  // 2. Feature A: Automated Email Notification & Idempotency Tests
  await runEmailNotificationTests();

  // 3. Feature B: BigQuery CDC Streaming & Deduplication Tests
  await runBigQueryExportTests();

  console.log('\n🎉 ALL CORE AND OPTIONAL FEATURE TEST SUITES PASSED FLAWLESSLY!\n');
}

main().catch((err) => {
  console.error('\n❌ TEST RUNNER FAILED WITH ERROR:', err);
  process.exit(1);
});
