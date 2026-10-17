import { EmailPayload, EmailSendResult } from '../types';
import { CONFIG } from '../config';

export interface EmailProvider {
  name: string;
  sendEmail(payload: EmailPayload, apiKey?: string): Promise<EmailSendResult>;
}

/**
 * Mock Email Provider for local testing, CI/CD, and emulator runs without paid APIs.
 */
export class MockEmailProvider implements EmailProvider {
  public name = 'mock';
  public sentEmails: (EmailPayload & { timestamp: string; messageId: string })[] = [];

  async sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
    const messageId = `mock-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.sentEmails.push({
      ...payload,
      timestamp: new Date().toISOString(),
      messageId,
    });
    return {
      success: true,
      messageId,
      provider: 'mock',
    };
  }

  clear(): void {
    this.sentEmails = [];
  }
}

/**
 * Resend Email Provider (Modern REST API)
 */
export class ResendEmailProvider implements EmailProvider {
  public name = 'resend';

  async sendEmail(payload: EmailPayload, apiKey?: string): Promise<EmailSendResult> {
    const key = apiKey || process.env.EMAIL_API_KEY;
    if (!key) {
      throw new Error('Resend API key is missing. Set EMAIL_API_KEY secret.');
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: CONFIG.emailFrom,
          to: [payload.to],
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          success: false,
          provider: 'resend',
          error: data?.message || `HTTP ${response.status} from Resend API`,
        };
      }

      return {
        success: true,
        messageId: data?.id || 'resend-ok',
        provider: 'resend',
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'resend',
        error: err.message || 'Network error reaching Resend',
      };
    }
  }
}

/**
 * SendGrid Email Provider (v3 Web API)
 */
export class SendGridEmailProvider implements EmailProvider {
  public name = 'sendgrid';

  async sendEmail(payload: EmailPayload, apiKey?: string): Promise<EmailSendResult> {
    const key = apiKey || process.env.EMAIL_API_KEY;
    if (!key) {
      throw new Error('SendGrid API key is missing. Set EMAIL_API_KEY secret.');
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: payload.to }] }],
          from: { email: CONFIG.emailFrom.match(/<([^>]+)>/)?.[1] || 'leads@pureenergy.example.com' },
          subject: payload.subject,
          content: [
            { type: 'text/plain', value: payload.text },
            { type: 'text/html', value: payload.html },
          ],
        }),
      });

      if (response.status >= 200 && response.status < 300) {
        const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;
        return { success: true, messageId, provider: 'sendgrid' };
      }

      const errorText = await response.text();
      return {
        success: false,
        provider: 'sendgrid',
        error: `SendGrid error (${response.status}): ${errorText}`,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'sendgrid',
        error: err.message || 'Network error reaching SendGrid',
      };
    }
  }
}

// Global mock singleton for unit testing
export const testMockEmailProvider = new MockEmailProvider();

export function getEmailProvider(name?: string): EmailProvider {
  const providerName = (name || CONFIG.emailProvider || 'mock').toLowerCase();
  switch (providerName) {
    case 'resend':
      return new ResendEmailProvider();
    case 'sendgrid':
      return new SendGridEmailProvider();
    case 'mock':
    default:
      return testMockEmailProvider;
  }
}
