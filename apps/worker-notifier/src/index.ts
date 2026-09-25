import {
  loadNotifierWorkerConfig,
} from './config.js';
import { startNotifierWorker } from './worker.js';

async function main(): Promise<void> {
  const config = loadNotifierWorkerConfig();
  const worker = await startNotifierWorker({ config });

  const shutdown = async (signal: string) => {
    console.log(
      JSON.stringify({ signal, msg: 'shutting down notifier worker' }),
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
