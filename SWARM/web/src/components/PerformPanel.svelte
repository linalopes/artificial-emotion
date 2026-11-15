<script lang="ts">
  import { clockReadyForCollective, type PresetType } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { fmtTime } from '../lib/status';

  const PRESETS: { id: PresetType; label: string; note: string }[] = [
    { id: 'wave', label: 'Wave', note: 'A sine travels across the 3×3 grid.' },
    { id: 'breathing', label: 'Breathing', note: 'All nine rise and fall together, the centre leading.' },
    { id: 'drift', label: 'Drift', note: 'Each module follows its own slow curve. Same seed, same movement.' }
  ];
  const note = $derived(PRESETS.find((p) => p.id === app.preset)!.note);
  const v = $derived(app.validation);
  const run = $derived(app.run);
  const nodes = $derived(app.nodes);

  const positioned = $derived(run?.phase === 'positioned' && app.runIsThisScore);
  const checks = $derived([
    { label: 'Modules connected', ok: nodes.every((n) => n.connected), detail: `${nodes.filter((n) => n.connected).length} of 9` },
    { label: 'Modules homed', ok: nodes.every((n) => n.homed), detail: `${nodes.filter((n) => n.homed).length} of 9` },
    { label: 'Clocks synchronised', ok: nodes.every((n) => clockReadyForCollective(n, app.simulated ? 'simulator' : 'hardware')), detail: `${nodes.filter((n) => clockReadyForCollective(n, app.simulated ? 'simulator' : 'hardware')).length} of 9` },
    { label: 'No active faults', ok: nodes.every((n) => !n.faultCode), detail: nodes.filter((n) => n.faultCode).map((n) => n.id).join(', ') || 'none' },
    { label: 'Score feasible', ok: v.ok && app.limitsReported, detail: v.ok ? (app.limitsReported ? 'validated' : 'limits not all reported') : 'see above' },
    { label: 'Software stop released', ok: !app.stopEngaged, detail: app.stopEngaged ? 'engaged' : 'yes' },
    { label: 'At start positions', ok: positioned, detail: positioned ? 'confirmed by telemetry' : run?.phase === 'positioning' && app.runIsThisScore ? 'moving' : 'not yet' }
  ]);
  const canPosition = $derived(app.canCommand && !app.runActive && checks.filter((c) => c.label !== 'Clocks synchronised' && c.label !== 'At start positions').every((c) => c.ok));
  const canExecute = $derived(app.canCommand && !app.runActive && checks.every((c) => c.ok));

  const PHASE: Record<string, string> = {
    idle: 'No run.', positioning: 'Moving to start positions…', positioned: 'At start positions.', loading: 'Loading trajectories…', preparing: 'Preparing…',
    committing: 'Committing start time…', armed: 'Armed. Waiting for the shared start time.', running: 'Running.', finished: 'Finished. All nine confirmed completion.',
    failed: 'Failed.', cancelled: 'Stopped.'
  };
  const stats = $derived(Object.values(v.stats));
  const peak = $derived(Math.max(...stats.map((s) => s.peakSpeedMmS)));
  const lo = $derived(Math.min(...stats.map((s) => s.minMm)));
  const hi = $derived(Math.max(...stats.map((s) => s.maxMm)));
  const locked = $derived(app.runActive);
</script>

<div class="col" style="gap: 14px">
  <div class="sec">
    <span class="l">Choreography</span>
    <div class="grid3">
      {#each PRESETS as p}
        <button class="b" class:pk={app.preset === p.id} style="padding: 6px 2px" disabled={locked} onclick={() => { app.preset = p.id; app.resetPreview(); }}>{p.label}</button>
      {/each}
    </div>
    <span class="small">{note}</span>
    {#if app.preset === 'wave'}
      {@const p = app.params.wave}
      <label class="col"><span class="k"><span class="l">Amplitude</span><span class="m">{p.amplitudeMm} mm</span></span><input type="range" min="20" max="450" step="10" bind:value={p.amplitudeMm} disabled={locked} /></label>
      <label class="col"><span class="k"><span class="l">Period</span><span class="m">{p.periodS} s</span></span><input type="range" min="30" max="300" step="10" bind:value={p.periodS} disabled={locked} /></label>
      <label class="col"><span class="k"><span class="l">Phase offset per module</span><span class="m">{p.phaseDeg}°</span></span><input type="range" min="0" max="120" step="5" bind:value={p.phaseDeg} disabled={locked} /></label>
      <label class="k"><span class="l">Direction</span>
        <select bind:value={p.direction} disabled={locked}><option value="diagonal">Diagonal</option><option value="rows">Back to front</option><option value="columns">Left to right</option></select></label>
    {:else if app.preset === 'breathing'}
      {@const p = app.params.breathing}
      <label class="col"><span class="k"><span class="l">Amplitude</span><span class="m">{p.amplitudeMm} mm</span></span><input type="range" min="20" max="450" step="10" bind:value={p.amplitudeMm} disabled={locked} /></label>
      <label class="col"><span class="k"><span class="l">Breath period</span><span class="m">{p.periodS} s</span></span><input type="range" min="30" max="300" step="10" bind:value={p.periodS} disabled={locked} /></label>
      <label class="col"><span class="k"><span class="l">Delay from centre outward</span><span class="m">{p.ringDelayDeg}°</span></span><input type="range" min="0" max="90" step="5" bind:value={p.ringDelayDeg} disabled={locked} /></label>
    {:else}
      {@const p = app.params.drift}
      <label class="col"><span class="k"><span class="l">Amplitude</span><span class="m">{p.amplitudeMm} mm</span></span><input type="range" min="20" max="400" step="10" bind:value={p.amplitudeMm} disabled={locked} /></label>
      <label class="col"><span class="k"><span class="l">Duration</span><span class="m">{p.durationS} s</span></span><input type="range" min="120" max="900" step="30" bind:value={p.durationS} disabled={locked} /></label>
      <label class="col"><span class="k"><span class="l">Variation between modules</span><span class="m">{Math.round(p.variation * 100)}%</span></span><input type="range" min="0" max="1" step="0.1" bind:value={p.variation} disabled={locked} /></label>
      <label class="k"><span class="l">Random seed</span><input type="number" min="0" max="99999" step="1" style="width: 90px" bind:value={p.seed} disabled={locked} /></label>
    {/if}
    <button class="b s" onclick={() => app.savePresets()}>Save parameters</button>
  </div>

  <div class="sec">
    <span class="l">Preview, in this browser only</span>
    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 6px">
      <button class="b on" disabled={locked} onclick={() => app.togglePlay()}>{app.playing ? 'Pause preview' : 'Play preview'}</button>
      <button class="b" disabled={locked} onclick={() => app.resetPreview()}>Reset</button>
      <button class="b" class:on={app.loop} aria-pressed={app.loop} disabled={locked} onclick={() => (app.loop = !app.loop)}>Loop</button>
    </div>
    <div class="k small"><span class="m">{fmtTime(app.tMs)} / {fmtTime(app.score.durationMs)}</span>
      <label class="row" style="gap: 6px"><span class="l">Preview speed</span>
        <select bind:value={app.rate}><option value={1}>1×</option><option value={10}>10×</option><option value={30}>30×</option></select></label></div>
    <div class="row" style="gap: 8px; align-items: flex-start">
      <span class="bd {v.ok ? 'good' : 'bad'}">{v.ok ? 'Valid' : 'Not feasible'}</span>
      <span class="small">
        {#if v.ok}Peak {peak.toFixed(1)} mm/s, travel {Math.round(lo)} to {Math.round(hi)} mm. Checked against {app.limitsReported ? 'the limits the modules report' : 'nominal limits, because not every module has reported'}.
        {:else}{v.issues[0].message}{v.issues.length > 1 ? ` (${v.issues.length - 1} more)` : ''}{/if}
      </span>
    </div>
  </div>

  <div class="col" style="gap: 6px">
    <span class="l">Live run</span>
    {#each checks as c}
      <div class="k" style="font-size: 13px"><span>{c.label}</span><span class="row" style="gap: 6px"><span class="m small">{c.detail}</span><span class="bd {c.ok ? 'good' : 'bad'}">{c.ok ? 'OK' : 'Blocked'}</span></span></div>
    {/each}
    <label class="row" style="gap: 8px; align-items: center">
      <input type="checkbox" bind:checked={app.autonomous} disabled={locked} />
      <span class="small">Autonomous on modules — continue if the Mac disconnects after start</span>
    </label>
    {#if app.autonomous && app.loop}
      <label class="row" style="gap: 8px; align-items: center">
        <input type="checkbox" bind:checked={app.continuousAutonomous} disabled={locked} />
        <span class="small">Continuous local loop (still stops on fault / Stop while connected)</span>
      </label>
      {#if !app.continuousAutonomous}
        <label class="k"><span class="l">Local loop count</span>
          <input type="number" min="1" max="1000" step="1" style="width: 90px" bind:value={app.autonomousMaxLoops} disabled={locked} />
        </label>
      {/if}
    {/if}
    {#if app.runActive}
      <button class="b d big" disabled={!app.linked} onclick={() => app.send({ type: 'cancelRun' })}>Stop run</button>
    {:else}
      <div class="grid2">
        <button class="b big" disabled={!canPosition} onclick={() => app.send({ type: 'goToStart', score: app.score })}>1. Go to start</button>
        <button class="b a big" disabled={!canExecute} onclick={() => (app.confirm = true)}>2. Execute live…</button>
      </div>
    {/if}
    {#if run && run.phase !== 'idle'}
      <div class={run.phase === 'failed' ? 'alert' : 'note'} role="status">
        {run.scoreName}{app.runIsThisScore ? '' : ' (not the score shown here)'}: {PHASE[run.phase]}
        {#if run.autonomous} Autonomous.{/if}
        {#if run.pass > 1} Pass {run.pass}.{/if}
        {#if run.error} {run.error}{/if}
      </div>
    {/if}
    <span class="small">
      {#if app.mode !== 'live'}Switch to Live to run on the modules. Preview never sends commands.
      {:else if !app.isOperator}Take control to run the choreography.
      {:else}Go to start moves the spheres to their first positions. Execute never repositions them.
        {#if app.autonomous}
          Autonomous uses each module's local clock after start. Long-run sync will drift without the Mac.
        {:else if app.loop}
          With Loop on (and Autonomous off), the coordinator re-arms after each pass. That needs this Mac running.
        {/if}
      {/if}
    </span>
  </div>
</div>
