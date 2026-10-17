import { LeadDocument, DealerDocument } from '../types';
import { CONFIG, maskPhone } from '../config';

export function formatNewLeadEmail(lead: LeadDocument, dealer?: DealerDocument | null): {
  subject: string;
  text: string;
  html: string;
} {
  const isDealer = Boolean(dealer && dealer.dealerId !== 'INHOUSE');
  const recipientName = dealer?.contactPerson || dealer?.name || 'Sales Team';
  const dealerTitle = dealer?.name || lead.assignedDealerName || 'PURE Energy Territory Network';
  
  const subject = `[New Lead Alert] ${lead.product} — ${lead.name} (${lead.pincode})`;

  const phoneDisplay = CONFIG.includePhoneInEmail
    ? lead.phone
    : `${maskPhone(lead.phone)} (masked for privacy — view full lead in portal)`;

  const formattedDate = lead.createdAt
    ? new Date(lead.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'
    : 'Just now';

  const text = `
NEW LEAD ASSIGNMENT — PURE ENERGY PuREPower
======================================================
Hello ${recipientName},

A new customer enquiry matching your assigned territory has been received and routed to your dealership:

• Lead ID:          ${lead.leadId}
• Customer Name:    ${lead.name}
• Product Model:    ${lead.product}
• Customer Pincode: ${lead.pincode}
• Customer Mobile:  ${phoneDisplay}
• Lead Source:      ${lead.source}
• Assigned Dealer:  ${dealerTitle} (ID: ${lead.assignedDealerId})
• Submission Time:  ${formattedDate}
${lead.notes ? `• Customer Notes:   ${lead.notes}\n` : ''}
Operational SLA:
Please initiate first customer contact within 3 business hours to maximize conversion rate.

Login to update status: New -> Contacted -> Converted / Lost
PURE Energy Dealer Lead Portal
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 24px; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 4px 0 0; opacity: 0.9; font-size: 13px; }
    .content { padding: 24px; }
    .greeting { font-size: 15px; margin-bottom: 16px; color: #334155; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; overflow: hidden; }
    .table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .table td.label { width: 38%; font-weight: 600; color: #64748b; }
    .table td.value { width: 62%; font-weight: 500; color: #0f172a; }
    .highlight { background-color: #ecfdf5; color: #065f46; font-weight: 600; padding: 2px 8px; border-radius: 4px; display: inline-block; }
    .sla-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 20px 0; font-size: 13px; color: #92400e; }
    .footer { padding: 16px 24px; background: #f1f5f9; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ PURE Energy — PuREPower Lead Alert</h1>
      <p>Automated Dealer Territory Routing</p>
    </div>
    <div class="content">
      <div class="greeting">Hello <strong>${recipientName}</strong>,</div>
      <p style="font-size: 14px; color: #475569; margin-top: 0;">
        A new customer enquiry matching your territory has been routed to <strong>${dealerTitle}</strong>:
      </p>

      <table class="table">
        <tr>
          <td class="label">Lead ID</td>
          <td class="value"><span class="highlight">${lead.leadId}</span></td>
        </tr>
        <tr>
          <td class="label">Customer Name</td>
          <td class="value"><strong>${lead.name}</strong></td>
        </tr>
        <tr>
          <td class="label">Product Enquired</td>
          <td class="value"><strong>${lead.product}</strong></td>
        </tr>
        <tr>
          <td class="label">Customer Pincode</td>
          <td class="value">${lead.pincode}</td>
        </tr>
        <tr>
          <td class="label">Contact Mobile</td>
          <td class="value">${phoneDisplay}</td>
        </tr>
        <tr>
          <td class="label">Origin Source</td>
          <td class="value">${lead.source}</td>
        </tr>
        <tr>
          <td class="label">Assigned Dealer</td>
          <td class="value">${dealerTitle} (${lead.assignedDealerId})</td>
        </tr>
        <tr>
          <td class="label">Submitted At</td>
          <td class="value">${formattedDate}</td>
        </tr>
        ${lead.notes ? `<tr><td class="label">Customer Notes</td><td class="value">${lead.notes}</td></tr>` : ''}
      </table>

      <div class="sla-box">
        ⏱️ <strong>Target SLA:</strong> Contact within <strong>3 hours</strong> during business hours to maximize conversion velocity.
      </div>
    </div>
    <div class="footer">
      This is an automated dispatch from PURE Energy PuREPower Dealer Router.<br/>
      Update progress directly in the Dealer Portal.
    </div>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
}
