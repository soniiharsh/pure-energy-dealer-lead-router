/**
 * Configuration and Secret Management for Firebase Cloud Functions
 */

export const CONFIG = {
  // Provider: 'resend' | 'sendgrid' | 'smtp' | 'mock'
  emailProvider: process.env.EMAIL_PROVIDER || 'mock',
  
  // Default sender
  emailFrom: process.env.EMAIL_FROM || 'PURE Energy Lead Router <leads@pureenergy.example.com>',
  
  // In-house sales email fallback
  inhouseSalesEmail: process.env.INHOUSE_SALES_EMAIL || 'inhouse-sales@pureenergy.example.com',
  
  // Privacy setting: Phone included only if explicitly enabled
  includePhoneInEmail: process.env.INCLUDE_CUSTOMER_PHONE_IN_EMAIL === 'true',
  
  // BigQuery configuration
  bigQueryDatasetId: process.env.BIGQUERY_DATASET || 'pure_energy_analytics',
  bigQueryTableId: process.env.BIGQUERY_TABLE || 'leads_changelog',
  bigQueryLocation: process.env.BIGQUERY_LOCATION || 'US',
  
  // Firestore Collections
  leadsCollection: 'leads',
  dealersCollection: 'dealers',
  notificationsCollection: 'lead_notifications',
};

/**
 * Sanitizes strings for logging to prevent leaking customer PII to public Cloud Logging
 */
export function maskName(name?: string): string {
  if (!name || name.length <= 2) return '***';
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => (p.length > 1 ? `${p[0]}***` : '*')).join(' ');
}

export function maskPhone(phone?: string): string {
  if (!phone || phone.length < 4) return '******';
  return `******${phone.slice(-4)}`;
}

export function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return '***@***';
  const [local, domain] = email.split('@');
  const maskedLocal = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : '***';
  return `${maskedLocal}@${domain}`;
}
