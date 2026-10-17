export type LeadStatus = 'New' | 'Contacted' | 'Converted' | 'Lost';
export type LeadSource = 'Website' | 'AI Voice Call' | 'Voice Agent' | 'WhatsApp' | 'Dealer Walk-in' | 'Other';

export interface LeadDocument {
  leadId: string;
  name: string;
  phone: string;
  pincode: string;
  product: string;
  source: LeadSource;
  assignedDealerId: string;
  assignedDealerName: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface DealerDocument {
  dealerId: string;
  name: string;
  pincodePrefixes: string;
  city?: string;
  state?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
}

export type NotificationStatus = 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED_NO_DEALER_EMAIL' | 'SKIPPED_INHOUSE_NO_EMAIL';

export interface LeadNotificationRecord {
  leadId: string;
  eventId: string;
  status: NotificationStatus;
  recipientEmail?: string;
  recipientName?: string;
  provider: string;
  messageId?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  errorMessage?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface BigQueryLeadRow {
  event_id: string;
  lead_id: string;
  customer_name: string;
  pincode: string;
  pincode_prefix: string;
  product: string;
  source: string;
  assigned_dealer_id: string;
  assigned_dealer_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  event_timestamp: string;
  change_type: ChangeType;
  notes?: string;
}
