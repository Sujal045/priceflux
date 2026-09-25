/**
 * Replay messages from scrape.dead back onto scrape.work / scrape.job.
 *
 * Usage (repo root, broker + topology up):
 *   pnpm replay:dead
 *   pnpm replay:dead -- --limit 10
 *   pnpm replay:dead -- --dry-run
 *
 * Resets x-attempt to 1 and clears x-error-class / x-first-failure-at so the
 * job gets a fresh retry budget.
 */

import {
  assertTopology,
  connectRabbitMq,
  publishScrapeJob,
} from '@priceflux/mq';
import {
  DEFAULT_MAX_ATTEMPTS,
  Queues,
  ScrapeJobSchema,
  type ScrapeJob,
} from '@priceflux/shared';

function parseArgs(argv: string[]): { limit: number; dryRun: boolean } {
  let limit = Number.POSITIVE_INFINITY;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--limit') {
      const raw = argv[i + 1];
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid --limit: ${raw}`);
      }
      limit = n;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: pnpm replay:dead [-- --limit N] [-- --dry-run]`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { limit, dryRun };
}

async function main(): Promise<void> {
  const { limit, dryRun } = parseArgs(process.argv.slice(2));
  const rabbit = await connectRabbitMq();

  try {
    await assertTopology(rabbit.channel);

    let replayed = 0;
    let skipped = 0;

    while (replayed + skipped < limit) {
      const msg = await rabbit.channel.get(Queues.scrapeDead, {
        noAck: false,
      });
      if (!msg) {
        break;
      }

      let job: ScrapeJob;
      try {
        job = ScrapeJobSchema.parse(
          JSON.parse(msg.content.toString('utf8')),
        );
      } catch (err) {
        skipped += 1;
        console.error(
          JSON.stringify({
            msg: 'skip invalid dead-letter payload',
            err: err instanceof Error ? err.message : err,
          }),
        );
        // Leave poison on dead: ack to drop, or nack requeue forever.
        // Prefer ack + log so replay can proceed.
        rabbit.channel.ack(msg);
        continue;
      }

      if (dryRun) {
        console.log(
          JSON.stringify({
            msg: 'dry-run would replay',
            jobId: job.jobId,
            url: job.canonicalUrl,
          }),
        );
        rabbit.channel.nack(msg, false, true);
        skipped += 1;
        // Avoid spinning on the same message in dry-run.
        break;
      }

      await publishScrapeJob(rabbit.channel, {
        job,
        headers: {
          'x-attempt': 1,
          'x-max-attempts': DEFAULT_MAX_ATTEMPTS,
          'x-dedupe-key': job.dedupeKey,
        },
      });
      rabbit.channel.ack(msg);
      replayed += 1;
      console.log(
        JSON.stringify({
          msg: 'replayed dead letter',
          jobId: job.jobId,
          url: job.canonicalUrl,
        }),
      );
    }

    console.log(
      JSON.stringify({
        msg: 'replay-dead finished',
        replayed,
        skipped,
        dryRun,
      }),
    );
  } finally {
    await rabbit.close();
  }
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
