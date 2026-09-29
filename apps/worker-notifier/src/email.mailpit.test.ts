import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import nodemailer from 'nodemailer';

import type { PriceAlert } from './alert.js';
import { createEmailAlertEmitter } from './email.js';
import { loadSmtpConfig } from './config.js';

const mailpitEnabled = process.env.PRICEFLUX_MAILPIT_INTEGRATION === '1';

describe(
  'email alert (Mailpit integration)',
  {
    skip: !mailpitEnabled
      ? 'set PRICEFLUX_MAILPIT_INTEGRATION=1 (Mailpit must be up)'
      : false,
  },
  () => {
    it('delivers a visible message to Mailpit', async () => {
      const smtp =
        loadSmtpConfig(process.env) ??
        ({
          host: process.env.NOTIFIER_SMTP_HOST ?? '127.0.0.1',
          port: Number(process.env.NOTIFIER_SMTP_PORT ?? '1025'),
          secure: false,
          from: process.env.NOTIFIER_SMTP_FROM ?? 'priceflux@localhost',
          requireTls: false,
        } as const);

      const to = `mailpit-${randomUUID()}@example.com`;
      const alert: PriceAlert = {
        jobId: randomUUID(),
        watchId: randomUUID(),
        userId: randomUUID(),
        email: to,
        url: 'https://shop.example/mailpit-check',
        canonicalUrl: 'https://shop.example/mailpit-check',
        price: 12.5,
        currency: 'USD',
        threshold: 15,
        title: 'Mailpit Fixture Widget',
        scrapedAt: new Date().toISOString(),
      };

      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
      });

      const emit = createEmailAlertEmitter(smtp, { transport });
      await emit(alert);

      const uiBase =
        process.env.MAILPIT_UI_URL?.replace(/\/$/, '') ??
        'http://127.0.0.1:8025';
      const search = await fetch(
        `${uiBase}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      );
      assert.equal(search.ok, true, `Mailpit search HTTP ${search.status}`);
      const body = (await search.json()) as {
        messages?: Array<{ To?: Array<{ Address?: string }>; Subject?: string }>;
      };
      const messages = body.messages ?? [];
      assert.ok(
        messages.some((m) =>
          m.To?.some((addr) => addr.Address === to),
        ),
        'expected Mailpit to list the delivered message',
      );
      assert.ok(
        messages.some((m) => m.Subject?.includes('Mailpit Fixture Widget')),
        'expected subject to include product title',
      );
    });
  },
);
