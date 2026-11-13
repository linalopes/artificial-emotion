<script lang="ts">
  import { app } from '../lib/app.svelte';

  const snap = $derived(app.snap);
  const faults = $derived(app.nodes.filter((n) => n.faultCode || !n.connected));
  const target = $derived(app.sel.length === 1 ? app.sel[0] : undefined);
  const time = (ms: number) => new Date(ms).toLocaleTimeString('en-GB');
  let ota = $state(false);
</script>

<div class="col" style="gap: 14px">
  <div class="sec">
    <span class="l">Coordinator</span>
    <span class="t" style="font-size: 24px">{app.linked ? 'Connected' : 'Unreachable'}</span>
    <div class="col" style="font-size: 13px; gap: 2px">
      <div class="k"><span>Nodes</span><span class="m">{snap ? (snap.fleet === 'simulator' ? 'simulated' : 'hardware') : 'unknown'}</span></div>
      <div class="k"><span>Modules online</span><span class="m">{app.nodes.filter((n) => n.connected).length} of 9</span></div>
      <div class="k"><span>Browsers attached</span><span class="m">{snap?.clients ?? 0}</span></div>
      <div class="k"><span>Control held by</span><span class="m">{!snap?.operatorClientId ? 'nobody' : app.isOperator ? 'this browser' : 'another browser'}</span></div>
    </div>
    {#if !app.linked}<span class="alert">The page shows the last state received. The coordinator and the modules keep running without this browser.</span>{/if}
  </div>

  <div class="sec">
    <span class="l">Active faults</span>
    {#each faults as n}
      <span class="small" style="color: var(--danger-dark); font-weight: 600">{n.id}: {n.connected ? `fault ${n.faultCode}` : 'not connected'}</span>
    {:else}
      <span class="small">None. All nine modules report normally.</span>
    {/each}
  </div>

  <div class="sec">
    <span class="l">Firmware updates</span>
    <button class="b" aria-expanded={ota} onclick={() => (ota = !ota)}>OTA manager</button>
    {#if ota}<span class="small">Not part of this version. Update the modules with the firmware project's own tools.</span>{/if}
  </div>

  <div class="sec">
    <span class="l">Coordinator log</span>
    {#each (snap?.log ?? []).slice(-7).reverse() as g}
      <div class="m" style="font-size: 11px; line-height: 1.35; display: flex; gap: 8px; color: {g.level === 'error' ? 'var(--danger-dark)' : 'inherit'}"><span style="font-weight: 700">{time(g.atMs)}</span><span>{g.message}</span></div>
    {/each}
  </div>

  {#if app.simulated}
    <div class="note col" style="gap: 6px">
      <span class="l">Simulator scenarios</span>
      <span class="small">Affects {target ?? 'the single selected module (select one)'}. Only exists with simulated nodes.</span>
      <div class="grid2">
        <button class="b s" disabled={!app.isOperator || !target} onclick={() => app.send({ type: 'simScenario', scenario: 'disconnect', node: target })}>Disconnect</button>
        <button class="b s" disabled={!app.isOperator || !target} onclick={() => app.send({ type: 'simScenario', scenario: 'reconnect', node: target })}>Reconnect</button>
        <button class="b s" disabled={!app.isOperator || !target} onclick={() => app.send({ type: 'simScenario', scenario: 'homingFault', node: target })}>Homing fault</button>
        <button class="b s" disabled={!app.isOperator || !target} onclick={() => app.send({ type: 'simScenario', scenario: 'clockFault', node: target })}>Clock sync loss</button>
      </div>
      <button class="b s" disabled={!app.isOperator} onclick={() => app.send({ type: 'simScenario', scenario: 'reset' })}>Reset links and clocks</button>
    </div>
  {/if}
</div>
