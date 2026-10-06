import { loadSchedulerWorkerConfig } from './config.js';
import { startSchedulerWorker } from './scheduler.js';

async function main(): Promise<void> {
  const config = loadSchedulerWorkerConfig();
  const worker = await startSchedulerWorker({ config });

  const shutdown = async (signal: string) => {
    console.log(
      JSON.stringify({ signal, msg: 'shutting down scheduler worker' }),
    );
    await worker.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
