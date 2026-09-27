/** Canonical HTTP / AMQP correlation header names. */
export const CORRELATION_HEADERS = {
  /** Incoming HTTP requests (Fastify genReqId). */
  requestId: 'x-request-id',
  /** Optional explicit correlation across services. */
  correlationId: 'x-correlation-id',
} as const;

/**
 * Prefer an existing correlation/request id, else fall back to `fallback`
 * (typically a new UUID or a jobId).
 */
export function resolveCorrelationId(
  headers: Record<string, unknown> | undefined,
  fallback: string,
): string {
  if (!headers) return fallback;

  const correlation = headers[CORRELATION_HEADERS.correlationId];
  if (typeof correlation === 'string' && correlation.length > 0) {
    return correlation;
  }

  const requestId = headers[CORRELATION_HEADERS.requestId];
  if (typeof requestId === 'string' && requestId.length > 0) {
    return requestId;
  }

  return fallback;
}
