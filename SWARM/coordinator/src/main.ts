import { networkInterfaces } from 'node:os';
import { createApp } from './app';
import { loadConfig } from './config';

const cfg = loadConfig();
try {
  const app = await createApp(cfg);
  const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
  console.log(`\nSWARM Control coordinator (${cfg.env})`);
  console.log(`  This Mac:      http://localhost:${app.port}`);
  for (const ip of lan) console.log(`  Same network:  http://${ip}:${app.port}`);
  console.log('  Nodes:         nine SIMULATED nodes. No hardware is connected.\n');
  const shutdown = async () => {
    console.log('\nShutting down. Simulated nodes stop with the coordinator.');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
