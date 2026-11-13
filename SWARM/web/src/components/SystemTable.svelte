<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { agoText, clockText, confidenceText, wifiText } from '../lib/status';
  const now = $derived(app.snap?.wallTimeMs ?? Date.now());
</script>

<div class="wrap">
  <table class="m">
    <thead>
      <tr><th>Module</th><th>Link</th><th>Kind</th><th>Firmware</th><th>Homing</th><th>Position validity</th><th>Endstop</th><th>Clock</th><th>Wi-Fi</th><th>Fault</th><th>Last telemetry</th></tr>
    </thead>
    <tbody>
      {#each app.nodes as n (n.id)}
        <tr class:sel={app.sel.includes(n.id)}>
          <td><button class="tl" style="font-weight: 700" onclick={() => app.pick(n.id)}>{n.id}</button></td>
          <td>{n.connected ? 'Connected' : 'Offline'}</td>
          <td>{n.fwVersion === null ? 'never seen' : n.simulated ? 'simulated' : 'hardware'}</td>
          <td>{n.fwVersion ?? 'n/a'}</td>
          <td>{n.homing ? 'homing' : n.homed ? `homed ${agoText(n.lastHomedAtMs, now)}` : 'not homed'}</td>
          <td>{confidenceText(n)}</td>
          <td>{n.endstop === null ? 'unknown' : n.endstop ? 'pressed' : 'open'}</td>
          <td>{clockText(n)}</td>
          <td>{wifiText(n)}</td>
          <td class:bad={!!n.faultCode}>{n.faultCode ?? 'none'}</td>
          <td>{agoText(n.lastTelemetryAtMs, now)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; white-space: nowrap; }
  th { text-align: left; font-weight: 700; border-bottom: 1px solid var(--purple); padding: 2px 10px 2px 0; }
  td { border-bottom: 1px solid rgba(34, 17, 62, 0.1); padding: 1px 10px 1px 0; height: 21px; }
  tr.sel { background: rgba(234, 125, 255, 0.35); }
  td.bad { color: var(--danger-dark); font-weight: 700; }
</style>
