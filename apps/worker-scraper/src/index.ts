import {
  loadScraperWorkerConfig,
} from './config.js';
import { startScraperWorker } from './worker.js';

async function main(): Promise<void> {
  const config = loadScraperWorkerConfig();
  const worker = await startScraperWorker({ config });

  const shutdown = async (signal: string) => {
    console.log(JSON.stringify({ signal, msg: 'shutting down scraper worker' }));
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
