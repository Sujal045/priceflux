import type { ServiceMetrics } from './registry.js';

export type QueueDepthReader = {
  checkQueue: (queue: string) => Promise<{ messageCount: number }>;
};

/**
 * Adapt anything with `checkQueue` (e.g. an amqplib channel) to QueueDepthReader.
 */
export function asQueueDepthReader(channel: {
  checkQueue: (queue: string) => Promise<{ messageCount: number }>;
}): QueueDepthReader {
  return {
    checkQueue: async (queue) => {
      const info = await channel.checkQueue(queue);
      return { messageCount: info.messageCount };
    },
  };
}

/**
 * Refresh `priceflux_queue_messages` gauges for the given queue names.
 * Failures for individual queues are ignored so one missing queue does not
 * block the rest.
 */
export async function refreshQueueDepths(
  metrics: ServiceMetrics,
  reader: QueueDepthReader,
  queues: readonly string[],
): Promise<void> {
  await Promise.all(
    queues.map(async (queue) => {
      try {
        const info = await reader.checkQueue(queue);
        metrics.queueMessages.set({ queue }, info.messageCount);
      } catch {
        // Leave the last known value; avoid crashing the scraper on lag polls.
      }
    }),
  );
}

export type QueueLagPoller = {
  stop: () => void;
};

/** Poll queue depths on an interval until `stop()` is called. */
export function startQueueLagPoller(
  metrics: ServiceMetrics,
  reader: QueueDepthReader,
  queues: readonly string[],
  intervalMs = 15_000,
): QueueLagPoller {
  const tick = () => {
    void refreshQueueDepths(metrics, reader, queues);
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return {
    stop: () => clearInterval(handle),
  };
}
