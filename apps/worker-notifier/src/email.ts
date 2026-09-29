import nodemailer, { type Transporter } from 'nodemailer';

import type { AlertEmitter, PriceAlert } from './alert.js';
import type { SmtpConfig } from './config.js';

export type EmailAlertMetrics = {
  sent?: () => void;
  failed?: () => void;
  skipped?: () => void;
};

export type CreateEmailAlertEmitterOptions = {
  /** Inject a transport (unit tests / custom). */
  transport?: Transporter;
  metrics?: EmailAlertMetrics;
  log?: {
    info: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
};

export type AlertEmailContent = {
  subject: string;
  text: string;
  html: string;
};

/** Build plaintext + HTML body for a price-drop alert. */
export function composeAlertEmail(alert: PriceAlert): AlertEmailContent {
  const product = alert.title?.trim() || alert.url;
  const subject = `Price drop: ${product} is now ${formatMoney(alert.price, alert.currency)}`;

  const text = [
    'A watched product is at or below your threshold.',
    '',
    `Product: ${product}`,
    `URL: ${alert.url}`,
    `Price: ${formatMoney(alert.price, alert.currency)}`,
    `Threshold: ${formatMoney(alert.threshold, alert.currency)}`,
    `Scraped at: ${alert.scrapedAt}`,
    `Job ID: ${alert.jobId}`,
  ].join('\n');

  const html = [
    '<p>A watched product is at or below your threshold.</p>',
    '<ul>',
    `<li><strong>Product:</strong> ${escapeHtml(product)}</li>`,
    `<li><strong>URL:</strong> <a href="${escapeHtml(alert.url)}">${escapeHtml(alert.url)}</a></li>`,
    `<li><strong>Price:</strong> ${escapeHtml(formatMoney(alert.price, alert.currency))}</li>`,
    `<li><strong>Threshold:</strong> ${escapeHtml(formatMoney(alert.threshold, alert.currency))}</li>`,
    `<li><strong>Scraped at:</strong> ${escapeHtml(alert.scrapedAt)}</li>`,
    `<li><strong>Job ID:</strong> ${escapeHtml(alert.jobId)}</li>`,
    '</ul>',
  ].join('\n');

  return { subject, text, html };
}

/**
 * SMTP alert emitter. Skips when `alert.email` is missing.
 * Send failures throw after recording metrics so the worker can fail the job.
 */
export function createEmailAlertEmitter(
  smtp: SmtpConfig,
  options: CreateEmailAlertEmitterOptions = {},
): AlertEmitter {
  const transport =
    options.transport ??
    nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user
        ? { auth: { user: smtp.user, pass: smtp.pass ?? '' } }
        : {}),
      ...(smtp.requireTls ? { requireTLS: true } : {}),
    });

  const log = options.log;
  const metrics = options.metrics;

  return async (alert) => {
    const to = alert.email?.trim();
    if (!to) {
      metrics?.skipped?.();
      log?.warn(
        { jobId: alert.jobId, watchId: alert.watchId },
        'price drop email skipped; missing recipient',
      );
      return;
    }

    const content = composeAlertEmail(alert);
    try {
      await transport.sendMail({
        from: smtp.from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      metrics?.sent?.();
      log?.info(
        { jobId: alert.jobId, watchId: alert.watchId, to },
        'price drop email sent',
      );
    } catch (err) {
      metrics?.failed?.();
      log?.error(
        {
          jobId: alert.jobId,
          watchId: alert.watchId,
          to,
          err: err instanceof Error ? err.message : err,
        },
        'price drop email failed',
      );
      throw err;
    }
  };
}

function formatMoney(amount: number, currency: string): string {
  return `${amount} ${currency}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
