export type LeadStatus = 'New' | 'Contacted' | 'Converted' | 'Lost';

export type LeadSource = 'Website' | 'AI Voice Call' | 'Voice Agent' | 'WhatsApp' | 'Dealer Walk-in' | 'Other';

export interface Dealer {
  dealerId: string;
  name: string;
  pincodePrefixes: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  city?: string;
  state?: string;
  totalAssignedLeads?: number;
  leadsByStatus?: Record<LeadStatus, number>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Lead {
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

export interface LeadUniqueness {
  phone: string;
  leadId: string;
  createdAt: string;
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  pincode: string;
  product: string;
  source: LeadSource;
  notes?: string;
}

export type ReconciliationAction = 'imported' | 'fixed' | 'merged' | 'rejected' | 'assigned_inhouse';

export interface ReconciliationItem {
  lead_id: string;
  action: ReconciliationAction;
  reason: string;
}

export interface DashboardMetrics {
  total: number;
  newCount: number;
  contactedCount: number;
  convertedCount: number;
  lostCount: number;
  statusBreakdown: Record<LeadStatus, number>;
  dealerBreakdown: Record<string, {
    dealerId: string;
    dealerName: string;
    count: number;
    byStatus: Record<LeadStatus, number>;
  }>;
}
