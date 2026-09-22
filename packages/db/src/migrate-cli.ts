import { runMigrations } from './migrate.js';

async function main(): Promise<void> {
  console.log('Running migrations...');
  await runMigrations();
  console.log('Migrations complete.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
