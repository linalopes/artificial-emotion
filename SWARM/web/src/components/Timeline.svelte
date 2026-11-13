<script lang="ts">
  import { NODE_IDS, positionAt } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { fmtTime } from '../lib/status';

  const W = 1000;
  const H = 20;
  const N = 200;
  const d = $derived(app.score.durationMs);
  const bad = $derived(new Set(app.validation.issues.map((i) => i.node)));
  const tracks = $derived(
    NODE_IDS.map((id) => {
      let pts = '';
      for (let j = 0; j <= N; j++) pts += `${((j / N) * W).toFixed(1)},${(2 + (positionAt(app.score, id, (d * j) / N) / 1000) * (H - 4)).toFixed(1)} `;
      return { id, pts };
    })
  );
  const live = $derived(app.run !== null && (app.run.phase === 'armed' || app.run.phase === 'running') && app.runIsThisScore);
  const head = $derived(Math.max(0, Math.min(1, (live ? app.runT : app.tMs) / d)));
</script>

<div class="col" style="gap: 4px">
  <div class="row" style="gap: 16px; flex-wrap: wrap">
    <span class="l">Timeline</span>
    <span class="m" style="font-weight: 700">{app.score.name}</span>
    <span class="m">{fmtTime(live ? Math.max(0, app.runT) : app.tMs)} / {fmtTime(d)}</span>
    <span class="m">{app.loop ? 'Loop on' : 'Loop off'}</span>
    <span class="bd {live ? 'moving' : 'idle'}">{live ? 'Live run clock' : 'Preview'}</span>
    <span class="m small" style="margin-left: auto">top of track = endstop, bottom = 1000 mm</span>
  </div>
  <div class="ruler">
    {#each [0, 0.25, 0.5, 0.75] as f}
      <span class="m" style="left: {f * 100}%">{fmtTime(f * d)}</span>
    {/each}
  </div>
  <div class="tracks">
    {#each tracks as tr (tr.id)}
      <div class="track" class:sel={app.sel.includes(tr.id)}>
        <button class="tl" onclick={() => app.pick(tr.id)}>{tr.id}</button>
        <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true"><polyline points={tr.pts} class:bad={bad.has(tr.id)} /></svg>
      </div>
    {/each}
    <div class="lane"><div class="head" style="left: {head * 100}%"></div></div>
  </div>
</div>

<style>
  .ruler { position: relative; height: 14px; margin-left: 64px; }
  .ruler span { position: absolute; top: 0; font-size: 11px; line-height: 14px; border-left: 1px solid var(--line-strong); padding-left: 3px; }
  .tracks { position: relative; }
  .track { display: flex; align-items: center; height: 20px; }
  .track.sel { background: rgba(234, 125, 255, 0.35); }
  .tl { width: 64px; flex: none; }
  svg { flex: 1; min-width: 0; height: 20px; display: block; border-top: 1px solid rgba(34, 17, 62, 0.1); }
  polyline { fill: none; stroke: var(--purple); stroke-width: 1; vector-effect: non-scaling-stroke; }
  polyline.bad { stroke: var(--danger); stroke-width: 2; }
  .lane { position: absolute; left: 64px; right: 0; top: -6px; bottom: 0; pointer-events: none; }
  .head { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--purple); }
  .head::before { content: ''; position: absolute; left: -4px; top: 0; width: 10px; height: 10px; background: var(--pink); border: 1px solid var(--purple); box-sizing: border-box; }
</style>
