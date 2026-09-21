/**
 * Apply + assert Priceflux RabbitMQ topology from infra/rabbitmq/definitions.json
 * via the management HTTP API. User/vhost come from Compose env (not definitions).
 *
 * Usage (repo root, RabbitMQ healthy):
 *   pnpm topology:assert
 *
 * Env (optional; defaults match .env.example):
 *   RABBITMQ_USER, RABBITMQ_PASSWORD, RABBITMQ_VHOST, RABBITMQ_MANAGEMENT_PORT
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFINITIONS_PATH = path.join(ROOT, 'infra/rabbitmq/definitions.json');

type ExchangeDef = {
  name: string;
  vhost: string;
  type: string;
  durable: boolean;
  auto_delete: boolean;
  internal: boolean;
  arguments: Record<string, unknown>;
};

type QueueDef = {
  name: string;
  vhost: string;
  durable: boolean;
  auto_delete: boolean;
  arguments: Record<string, unknown>;
};

type BindingDef = {
  source: string;
  vhost: string;
  destination: string;
  destination_type: string;
  routing_key: string;
  arguments: Record<string, unknown>;
};

type Definitions = {
  exchanges: ExchangeDef[];
  queues: QueueDef[];
  bindings: BindingDef[];
};

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function managementBase(): string {
  const port = env('RABBITMQ_MANAGEMENT_PORT', '15672');
  return `http://127.0.0.1:${port}/api`;
}

function authHeader(): string {
  const user = env('RABBITMQ_USER', 'priceflux');
  const pass = env('RABBITMQ_PASSWORD', 'priceflux');
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

async function api<T>(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<T | undefined> {
  const res = await fetch(`${managementBase()}${pathname}`, {
    method,
    headers: {
      Authorization: authHeader(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204 || res.status === 201) {
    return undefined;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${pathname} → ${res.status}: ${text}`);
  }

  if (res.status === 200) {
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : undefined;
  }

  return undefined;
}

async function waitForBroker(timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      await api<{ rabbitmq_version: string }>('GET', '/overview');
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(
    `Broker not ready after ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function applyTopology(defs: Definitions, vhost: string): Promise<void> {
  for (const ex of defs.exchanges) {
    if (ex.vhost !== vhost) continue;
    await api('PUT', `/exchanges/${enc(vhost)}/${enc(ex.name)}`, {
      type: ex.type,
      durable: ex.durable,
      auto_delete: ex.auto_delete,
      internal: ex.internal,
      arguments: ex.arguments,
    });
    console.log(`applied exchange ${ex.name}`);
  }

  for (const q of defs.queues) {
    if (q.vhost !== vhost) continue;
    await api('PUT', `/queues/${enc(vhost)}/${enc(q.name)}`, {
      durable: q.durable,
      auto_delete: q.auto_delete,
      arguments: q.arguments,
    });
    console.log(`applied queue ${q.name}`);
  }

  for (const b of defs.bindings) {
    if (b.vhost !== vhost) continue;
    if (b.destination_type !== 'queue') {
      throw new Error(`Unsupported binding destination_type: ${b.destination_type}`);
    }
    await api(
      'POST',
      `/bindings/${enc(vhost)}/e/${enc(b.source)}/q/${enc(b.destination)}`,
      {
        routing_key: b.routing_key,
        arguments: b.arguments,
      },
    );
    console.log(
      `applied binding ${b.source} --[${b.routing_key}]--> ${b.destination}`,
    );
  }
}

async function assertTopology(defs: Definitions, vhost: string): Promise<void> {
  const failures: string[] = [];

  for (const ex of defs.exchanges) {
    if (ex.vhost !== vhost) continue;
    try {
      const live = await api<{ name: string; type: string }>(
        'GET',
        `/exchanges/${enc(vhost)}/${enc(ex.name)}`,
      );
      if (!live || live.type !== ex.type) {
        failures.push(`exchange ${ex.name}: type mismatch or missing`);
      } else {
        console.log(`ok  exchange ${ex.name} (${ex.type})`);
      }
    } catch (err) {
      failures.push(`exchange ${ex.name}: ${(err as Error).message}`);
    }
  }

  for (const q of defs.queues) {
    if (q.vhost !== vhost) continue;
    try {
      await api('GET', `/queues/${enc(vhost)}/${enc(q.name)}`);
      console.log(`ok  queue ${q.name}`);
    } catch (err) {
      failures.push(`queue ${q.name}: ${(err as Error).message}`);
    }
  }

  type LiveBinding = {
    source: string;
    destination: string;
    destination_type: string;
    routing_key: string;
  };
  const liveBindings =
    (await api<LiveBinding[]>('GET', `/bindings/${enc(vhost)}`)) ?? [];

  for (const b of defs.bindings) {
    if (b.vhost !== vhost) continue;
    const found = liveBindings.some(
      (lb) =>
        lb.source === b.source &&
        lb.destination === b.destination &&
        lb.destination_type === b.destination_type &&
        lb.routing_key === b.routing_key,
    );
    const label = `${b.source} --[${b.routing_key}]--> ${b.destination}`;
    if (found) {
      console.log(`ok  binding ${label}`);
    } else {
      failures.push(`binding missing: ${label}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nTopology assert failed:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nTopology assert passed.');
}

async function main(): Promise<void> {
  const vhost = env('RABBITMQ_VHOST', 'priceflux');
  const raw = await readFile(DEFINITIONS_PATH, 'utf8');
  const defs = JSON.parse(raw) as Definitions;

  console.log('Waiting for RabbitMQ management API...');
  await waitForBroker();
  const overview = await api<{ rabbitmq_version: string }>('GET', '/overview');
  console.log(`Connected to RabbitMQ ${overview?.rabbitmq_version ?? 'unknown'}`);

  console.log('\nApplying topology from definitions.json...');
  await applyTopology(defs, vhost);

  console.log('\nAsserting topology...');
  await assertTopology(defs, vhost);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
