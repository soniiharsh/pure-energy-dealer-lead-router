import { LeadDocument, DealerDocument, LeadNotificationRecord } from '../types';
import { CONFIG, maskName, maskEmail } from '../config';
import { formatNewLeadEmail } from './emailTemplates';
import { getEmailProvider, EmailProvider } from './providers';

export interface FirestoreDbInterface {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): any }>;
      set(data: any, options?: { merge?: boolean }): Promise<any>;
    };
  };
  runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T>;
}

export interface ProcessLeadNotificationOptions {
  lead: LeadDocument;
  eventId: string;
  db?: FirestoreDbInterface | any;
  provider?: EmailProvider;
  apiKey?: string;
}

export interface NotificationResult {
  action: 'SENT' | 'SKIPPED_ALREADY_SENT' | 'SKIPPED_NO_DEALER_EMAIL' | 'FAILED';
  recipientEmail?: string;
  messageId?: string;
  error?: string;
}

/**
 * Core notification processor with durable idempotency and zero PII leak.
 * Decoupled from runtime event listener so it can be thoroughly unit-tested locally.
 */
export async function processNewLeadNotification(
  options: ProcessLeadNotificationOptions
): Promise<NotificationResult> {
  const { lead, eventId, db, provider: customProvider, apiKey } = options;
  let firestore = db;
  if (!firestore) {
    try {
      const modulePath = 'firebase-admin/firestore';
      // @ts-ignore
      const adminFirestore = await import(/* @vite-ignore */ modulePath);
      firestore = adminFirestore.getFirestore();
    } catch {
      throw new Error('Firestore instance required or firebase-admin must be installed.');
    }
  }
  const provider = customProvider || getEmailProvider();

  const notificationRef = firestore.collection(CONFIG.notificationsCollection).doc(lead.leadId);

  // 1. Transactional Idempotency Check & Lock
  let shouldProceed = false;
  let attempts = 1;

  try {
    await firestore.runTransaction(async (t: any) => {
      const snap = await t.get(notificationRef);
      if (snap.exists) {
        const data = snap.data() as LeadNotificationRecord;
        if (data.status === 'SENT') {
          shouldProceed = false;
          return;
        }
        attempts = (data.attempts || 1) + 1;
      }

      t.set(
        notificationRef,
        {
          leadId: lead.leadId,
          eventId,
          status: 'PROCESSING',
          provider: provider.name,
          updatedAt: new Date().toISOString(),
          attempts,
        },
        { merge: true }
      );
      shouldProceed = true;
    });
  } catch (err: any) {
    console.error(`[Notification] Failed acquiring idempotency lock for lead ${lead.leadId}:`, err.message);
    return {
      action: 'FAILED',
      error: `Lock error: ${err.message}`,
    };
  }

  if (!shouldProceed) {
    console.log(`[Notification] Lead ${lead.leadId} notification already sent. Idempotent skip.`);
    return { action: 'SKIPPED_ALREADY_SENT' };
  }

  // 2. Fetch assigned dealer contact details
  let recipientEmail: string | undefined;
  let dealer: DealerDocument | null = null;

  if (lead.assignedDealerId && lead.assignedDealerId !== 'INHOUSE') {
    try {
      const dealerDoc = await firestore.collection(CONFIG.dealersCollection).doc(lead.assignedDealerId).get();
      if (dealerDoc.exists) {
        dealer = dealerDoc.data() as DealerDocument;
        recipientEmail = dealer.email?.trim();
      }
    } catch (err: any) {
      console.warn(`[Notification] Error fetching dealer ${lead.assignedDealerId}:`, err.message);
    }
  } else {
    // In-house fallback
    recipientEmail = CONFIG.inhouseSalesEmail;
  }

  // 3. Gracefully handle missing email
  if (!recipientEmail) {
    const errorMsg = `No verified contact email configured for assigned dealer ${lead.assignedDealerId} (Lead: ${lead.leadId})`;
    console.warn(`[Notification] ${errorMsg}`);

    await notificationRef.set(
      {
        leadId: lead.leadId,
        eventId,
        status: 'SKIPPED_NO_DEALER_EMAIL',
        errorMessage: errorMsg,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return {
      action: 'SKIPPED_NO_DEALER_EMAIL',
      error: errorMsg,
    };
  }

  // 4. Format branded email payload
  const emailPayload = formatNewLeadEmail(lead, dealer);
  const fullPayload = {
    to: recipientEmail,
    subject: emailPayload.subject,
    text: emailPayload.text,
    html: emailPayload.html,
  };

  // 5. Send Email via Provider
  try {
    const sendResult = await provider.sendEmail(fullPayload, apiKey);

    if (sendResult.success) {
      await notificationRef.set(
        {
          leadId: lead.leadId,
          eventId,
          status: 'SENT',
          recipientEmail,
          recipientName: dealer?.contactPerson || dealer?.name || 'Assigned Territory Dealer',
          provider: provider.name,
          messageId: sendResult.messageId,
          sentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log(
        `[Notification] Successfully dispatched lead alert for ${lead.leadId} to ${maskEmail(recipientEmail)} (${dealer?.dealerId || 'INHOUSE'}) via ${provider.name}. Masked lead: ${maskName(lead.name)}`
      );

      return {
        action: 'SENT',
        recipientEmail,
        messageId: sendResult.messageId,
      };
    } else {
      await notificationRef.set(
        {
          leadId: lead.leadId,
          eventId,
          status: 'FAILED',
          errorMessage: sendResult.error || 'Provider rejected email dispatch',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.error(`[Notification] Provider ${provider.name} failed sending for lead ${lead.leadId}:`, sendResult.error);
      return {
        action: 'FAILED',
        recipientEmail,
        error: sendResult.error,
      };
    }
  } catch (err: any) {
    await notificationRef.set(
      {
        leadId: lead.leadId,
        eventId,
        status: 'FAILED',
        errorMessage: err.message,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    console.error(`[Notification] Exception sending email for lead ${lead.leadId}:`, err.message);
    return {
      action: 'FAILED',
      recipientEmail,
      error: err.message,
    };
  }
}
