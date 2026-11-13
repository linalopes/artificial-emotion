<script lang="ts">
  import { ACCEL_MAX_MM_S2, ACCEL_MIN_MM_S2, NODE_IDS, RPM_MAX, RPM_MIN, rpmToMmPerS } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, agoText, confidenceText, positionText, statusOf } from '../lib/status';

  const nodes = $derived(app.sel.map((id) => app.node(id)));
  const one = $derived(nodes.length === 1 ? nodes[0] : null);
  const usable = $derived(nodes.filter((n) => n.connected && !n.faultCode));
  const movable = $derived(usable.filter((n) => n.homed));
  const faulted = $derived(nodes.filter((n) => n.faultCode));
  const now = $derived(app.snap?.wallTimeMs ?? Date.now());

  const title = $derived(nodes.length === 0 ? 'No selection' : one ? one.id : nodes.length === 9 ? 'All nine' : `${nodes.length} modules`);
  const sub = $derived(nodes.length === 0 ? 'Pick a sphere, a row or a column.' : one ? STATUS_LABEL[statusOf(one)] : `${app.sel.join(', ')}. Controls apply to the whole group.`);

  // Sliders show the value the nodes report. While dragging they show the pending value.
  let rpmDraft = $state<number | null>(null);
  let accelDraft = $state<number | null>(null);
  const same = (key: 'rpm' | 'accelMmS2') => nodes.length > 0 && nodes.every((n) => n[key] !== null && n[key] === nodes[0][key]);
  const rpm = $derived(rpmDraft ?? nodes[0]?.rpm ?? 12);
  const accel = $derived(accelDraft ?? nodes[0]?.accelMmS2 ?? 30);

  const hint = $derived.by(() => {
    if (!app.linked) return 'The coordinator is not reachable. Showing the last known state.';
    if (app.stopEngaged) return 'Software stop engaged. Release it before sending commands.';
    if (app.mode !== 'live') return 'Preview sends nothing. Switch to Live to command the modules.';
    if (!app.isOperator) return 'This browser is monitoring. Take control to send commands.';
    if (nodes.length === 0) return 'Select a sphere or use the top view to enable controls.';
    if (app.runActive) return 'A run is in progress. Manual moves are locked until it stops.';
    const off = nodes.filter((n) => !n.connected);
    if (faulted.length) return `${faulted.map((n) => n.id).join(', ')} has a fault. Clear it, then home.`;
    if (off.length) return `${off.map((n) => n.id).join(', ')} is offline and will not receive commands.`;
    const unhomed = usable.filter((n) => !n.homed);
    if (unhomed.length) return `${unhomed.map((n) => n.id).join(', ')} is not homed and cannot be moved until it is.`;
    return 'Live: commands go to the selected modules. Results appear only after each module confirms.';
  });
  const idle = $derived(app.canCommand && !app.runActive);

  async function commit(kind: 'rpm' | 'accel') {
    if (kind === 'rpm' && rpmDraft !== null) await app.send({ type: 'setParams', nodes: app.sel, rpm: rpmDraft });
    if (kind === 'accel' && accelDraft !== null) await app.send({ type: 'setParams', nodes: app.sel, accelMmS2: accelDraft });
    rpmDraft = accelDraft = null;
  }
</script>

<div class="col" style="gap: 14px">
  <div class="sec">
    <span class="l">Selection</span>
    <span class="t" style="font-size: 30px">{title}</span>
    <span class="small">{sub}</span>
    {#if one}
      <div class="col small" style="gap: 4px; font-size: 13px">
        <div class="k"><span>Reported position</span><span class="m">{positionText(one)}</span></div>
        <div class="k"><span>Planned position</span><span class="m">{app.ghosts[one.id] === undefined ? 'none' : `${Math.round(app.ghosts[one.id]!)} mm`}</span></div>
        <div class="k"><span>Endstop</span><span class="m">{one.endstop === null ? 'unknown' : one.endstop ? 'pressed' : 'open'}</span></div>
        <div class="k"><span>Confidence</span><span class="m">{confidenceText(one)}</span></div>
        <div class="k"><span>Travel limits</span><span class="m">{one.limitMinMm === null ? 'not reported' : `${one.limitMinMm} to ${one.limitMaxMm} mm`}</span></div>
        <span class="note">
          {#if !one.connected}No telemetry. Anything shown is the last report before the link dropped.
          {:else if !one.homed}Position unknown. Home this module to set an endstop reference.
          {:else}Estimated by the firmware from its step count, not measured. Last homed {agoText(one.lastHomedAtMs, now)}; about {Math.round(one.travelSinceHomeMm)} mm travelled since.{/if}
        </span>
      </div>
    {/if}
    {#if faulted.length}
      <div class="alert col" style="gap: 8px">
        <span>{faulted.map((n) => `${n.id}: ${n.faultCode}`).join('. ')}</span>
        <button class="b s" disabled={!app.canCommand} onclick={() => app.send({ type: 'clearFault', nodes: faulted.map((n) => n.id) })}>Clear fault</button>
      </div>
    {/if}
  </div>

  <div class="sec">
    <label class="col" style="gap: 2px">
      <span class="k"><span class="l">Move to</span><span class="m">{app.moveMm} mm</span></span>
      <input type="range" min="0" max="1000" step="10" bind:value={app.moveMm} />
    </label>
    <div class="grid2">
      <button class="b on" disabled={!idle || movable.length === 0} onclick={() => app.send({ type: 'move', nodes: app.sel, targetMm: app.moveMm })}>Move selected</button>
      <button class="b" disabled={!app.linked || !app.isOperator || nodes.length === 0} onclick={() => app.send({ type: 'stopNodes', nodes: app.sel })}>Stop selected</button>
      <button class="b" disabled={!idle || usable.length === 0} onclick={() => app.send({ type: 'home', nodes: app.sel })}>Home selected</button>
      <button class="b" disabled={!idle} onclick={() => app.send({ type: 'home', nodes: [...NODE_IDS] })}>Home all</button>
    </div>
    <span class="small">{hint}</span>
  </div>

  <div class="col" style="gap: 6px">
    <label class="col">
      <span class="k"><span class="l">Speed</span><span class="m">{nodes.length === 0 ? 'no selection' : rpmDraft === null && !same('rpm') ? 'mixed' : `${rpm} RPM, about ${rpmToMmPerS(rpm).toFixed(1)} mm/s`}</span></span>
      <input type="range" min={RPM_MIN} max={RPM_MAX} step="1" value={rpm} disabled={!idle || nodes.length === 0} oninput={(e) => (rpmDraft = +e.currentTarget.value)} onchange={() => commit('rpm')} />
    </label>
    <label class="col">
      <span class="k"><span class="l">Acceleration</span><span class="m">{nodes.length === 0 ? 'no selection' : accelDraft === null && !same('accelMmS2') ? 'mixed' : `${accel} mm/s²`}</span></span>
      <input type="range" min={ACCEL_MIN_MM_S2} max={ACCEL_MAX_MM_S2} step="1" value={accel} disabled={!idle || nodes.length === 0} oninput={(e) => (accelDraft = +e.currentTarget.value)} onchange={() => commit('accel')} />
    </label>
    <span class="small">mm/s figures assume the nominal 15 mm spool. Travel limits are read from the modules and are not edited here.</span>
    <button class="b" disabled={!app.linked} onclick={() => app.send({ type: 'stopAll' })}>Stop all</button>
  </div>
</div>
