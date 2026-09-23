import { buildApp } from './app.js';
import { loadApiConfig } from './config.js';

async function main(): Promise<void> {
  const config = loadApiConfig();
  const app = await buildApp({ config });

  try {
    await app.listen({ host: config.host, port: config.port });
    app.log.info(
      { host: config.host, port: config.port, env: config.nodeEnv },
      'API listening',
    );
  } catch (err) {
    app.log.error(err);
    process.exitCode = 1;
    await app.close();
  }
}

void main();
