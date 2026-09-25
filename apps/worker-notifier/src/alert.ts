export type PriceAlert = {
  jobId: string;
  watchId: string;
  userId: string;
  email?: string;
  url: string;
  canonicalUrl: string;
  price: number;
  currency: string;
  threshold: number;
  title?: string;
  scrapedAt: string;
};

export type AlertEmitter = (alert: PriceAlert) => Promise<void>;

/** Log-only alert stub (always available). */
export function createLogAlertEmitter(log: {
  info: (obj: unknown, msg?: string) => void;
}): AlertEmitter {
  return async (alert) => {
    log.info(alert, 'price drop alert');
  };
}

/**
 * Optional webhook stub: POST the alert JSON to NOTIFIER_WEBHOOK_URL.
 * Failures are logged by the caller; this throws so the worker can decide.
 */
export function createWebhookAlertEmitter(webhookUrl: string): AlertEmitter {
  return async (alert) => {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'price_drop',
        ...alert,
      }),
    });
    if (!res.ok) {
      throw new Error(`webhook returned HTTP ${res.status}`);
    }
  };
}

export function composeAlertEmitters(
  emitters: AlertEmitter[],
): AlertEmitter {
  return async (alert) => {
    for (const emit of emitters) {
      await emit(alert);
    }
  };
}
