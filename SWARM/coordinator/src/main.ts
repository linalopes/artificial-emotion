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
  if (cfg.fleet === 'simulator') {
    console.log(`  Nodes:         nine SIMULATED nodes on ${cfg.devicePath} (${app.codec.name}). No hardware is connected.\n`);
  } else {
    console.log(`  Nodes:         HARDWARE mode — waiting for ESP32 clients on ws://<this-host>:${app.port}${cfg.devicePath}`);
    console.log(`  Codec:         ${app.codec.name}`);
    console.log('  Commission:    on each module Serial: set_coordinator <mac-lan-ip> ' + app.port);
    console.log('                 auth token must match SWARM_AUTH_TOKEN (value not printed).\n');
  }
  const shutdown = async () => {
    console.log(cfg.fleet === 'simulator' ? '\nShutting down. Simulated nodes stop with the coordinator.' : '\nShutting down. Connected modules will apply their disconnect policy.');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
