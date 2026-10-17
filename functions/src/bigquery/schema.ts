/**
 * BigQuery Table Schema Definitions for PURE Energy Leads Analytics
 */

export const LEADS_CHANGELOG_TABLE_SCHEMA = [
  { name: 'event_id', type: 'STRING', mode: 'REQUIRED', description: 'Unique CloudEvent/execution ID for deduplication' },
  { name: 'lead_id', type: 'STRING', mode: 'REQUIRED', description: 'Stable business lead identifier (e.g. L1001, LEAD-xxx)' },
  { name: 'customer_name', type: 'STRING', mode: 'NULLABLE', description: 'Customer full name' },
  { name: 'pincode', type: 'STRING', mode: 'NULLABLE', description: '6-digit Indian postal code' },
  { name: 'pincode_prefix', type: 'STRING', mode: 'NULLABLE', description: 'First 3 digits of customer pincode used for territory assignment' },
  { name: 'product', type: 'STRING', mode: 'NULLABLE', description: 'Requested energy storage product' },
  { name: 'source', type: 'STRING', mode: 'NULLABLE', description: 'Lead acquisition channel' },
  { name: 'assigned_dealer_id', type: 'STRING', mode: 'NULLABLE', description: 'Assigned dealer ID (e.g. D01) or INHOUSE' },
  { name: 'assigned_dealer_name', type: 'STRING', mode: 'NULLABLE', description: 'Assigned dealer business name or In-house Sales' },
  { name: 'status', type: 'STRING', mode: 'NULLABLE', description: 'Pipeline status: New, Contacted, Converted, Lost' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: 'Timestamp when lead was originally created' },
  { name: 'updated_at', type: 'TIMESTAMP', mode: 'NULLABLE', description: 'Timestamp of last update or status change' },
  { name: 'event_timestamp', type: 'TIMESTAMP', mode: 'REQUIRED', description: 'Timestamp when this CDC event was captured' },
  { name: 'change_type', type: 'STRING', mode: 'REQUIRED', description: 'Type of mutation: CREATE, UPDATE, or DELETE' },
  { name: 'notes', type: 'STRING', mode: 'NULLABLE', description: 'Operational notes or requirements' },
];

export const BIGQUERY_PARTITION_CONFIG = {
  timePartitioning: {
    type: 'DAY',
    field: 'event_timestamp',
  },
  clustering: {
    fields: ['assigned_dealer_id', 'status', 'product'],
  },
};
