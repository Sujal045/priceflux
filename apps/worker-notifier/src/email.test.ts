import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import nodemailer from 'nodemailer';

import type { PriceAlert } from './alert.js';
import { composeAlertEmail, createEmailAlertEmitter } from './email.js';

function sampleAlert(overrides: Partial<PriceAlert> = {}): PriceAlert {
  return {
    jobId: 'job-1',
    watchId: 'watch-1',
    userId: 'user-1',
    email: 'buyer@example.com',
    url: 'https://shop.example/p/1',
    canonicalUrl: 'https://shop.example/p/1',
    price: 19.99,
    currency: 'USD',
    threshold: 25,
    title: 'Acme Widget',
    scrapedAt: '2026-09-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('composeAlertEmail', () => {
  it('includes price, threshold, and title in subject/body', () => {
    const content = composeAlertEmail(sampleAlert());
    assert.match(content.subject, /Acme Widget/);
    assert.match(content.subject, /19\.99 USD/);
    assert.match(content.text, /Threshold: 25 USD/);
    assert.match(content.text, /https:\/\/shop\.example\/p\/1/);
    assert.match(content.html, /<strong>Price:<\/strong>/);
    assert.match(content.html, /Acme Widget/);
  });

  it('falls back to URL when title is missing', () => {
    const alert = sampleAlert();
    delete (alert as { title?: string }).title;
    const content = composeAlertEmail(alert);
    assert.match(content.subject, /shop\.example\/p\/1/);
  });

  it('escapes HTML special characters', () => {
    const content = composeAlertEmail(
      sampleAlert({ title: 'A <B> & "C"' }),
    );
    assert.match(content.html, /A &lt;B&gt; &amp; &quot;C&quot;/);
    assert.doesNotMatch(content.html, /<B>/);
  });
});

describe('createEmailAlertEmitter', () => {
  it('sends via injected transport and records sent metric', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const events: string[] = [];
    const emit = createEmailAlertEmitter(
      {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        from: 'priceflux@localhost',
        requireTls: false,
      },
      {
        transport,
        metrics: {
          sent: () => events.push('sent'),
          failed: () => events.push('failed'),
          skipped: () => events.push('skipped'),
        },
      },
    );

    await emit(sampleAlert());
    assert.deepEqual(events, ['sent']);
  });

  it('skips when email is missing without throwing', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    let sendCalls = 0;
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (mail) => {
      sendCalls += 1;
      return original(mail);
    }) as typeof transport.sendMail;

    const events: string[] = [];
    const emit = createEmailAlertEmitter(
      {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        from: 'priceflux@localhost',
        requireTls: false,
      },
      {
        transport,
        metrics: {
          skipped: () => events.push('skipped'),
        },
      },
    );

    const alert = sampleAlert();
    delete (alert as { email?: string }).email;
    await emit(alert);
    assert.equal(sendCalls, 0);
    assert.deepEqual(events, ['skipped']);
  });

  it('records failed metric and rethrows on transport error', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    transport.sendMail = (async () => {
      throw new Error('smtp down');
    }) as typeof transport.sendMail;

    const events: string[] = [];
    const emit = createEmailAlertEmitter(
      {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        from: 'priceflux@localhost',
        requireTls: false,
      },
      {
        transport,
        metrics: {
          failed: () => events.push('failed'),
        },
      },
    );

    await assert.rejects(() => emit(sampleAlert()), /smtp down/);
    assert.deepEqual(events, ['failed']);
  });
});
