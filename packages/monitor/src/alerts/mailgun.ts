import type { AlertsConfig } from '@homelab/shared';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { logger } from '../logger.js';

interface MailgunSender {
  domain: string;
  from: string;
  to: string;
  client: ReturnType<InstanceType<typeof Mailgun>['client']>;
}

let sender: MailgunSender | null = null;

export function initMailgun(config: AlertsConfig): void {
  const mg = new Mailgun(formData);
  sender = {
    domain: config.mailgun.domain,
    from: config.mailgun.from,
    to: config.to,
    client: mg.client({ username: 'api', key: config.mailgun.apiKey }),
  };
  logger.info({ domain: sender.domain, to: sender.to }, 'mailgun initialized');
}

/**
 * Send an alert email. Fail-soft: errors are logged, never thrown.
 * Alerting must never crash the poller.
 */
export async function send(subject: string, text: string): Promise<void> {
  if (!sender) {
    logger.warn({ subject }, 'mailgun not initialized; alert dropped');
    return;
  }
  try {
    await sender.client.messages.create(sender.domain, {
      from: sender.from,
      to: sender.to,
      subject,
      text,
    });
    logger.info({ subject }, 'alert email sent');
  } catch (err) {
    logger.warn({ err, subject }, 'mailgun send failed');
  }
}
