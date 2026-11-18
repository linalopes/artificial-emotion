<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { NodeId } from '@swarm/shared';
  import { NODE_IDS } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, positionText, statusOf } from '../lib/status';
  import { SwarmScene, type CameraPreset, type ModuleVizState } from '../lib/swarm-scene';

  let canvas = $state<HTMLCanvasElement | null>(null);
  let host = $state<HTMLDivElement | null>(null);
  let scene: SwarmScene | null = null;
  let hoverId = $state<NodeId | null>(null);
  let preset = $state<CameraPreset>('oblique');

  const hoverNode = $derived(hoverId ? app.node(hoverId) : null);
  const selected = $derived(app.sel.length === 1 ? app.node(app.sel[0]) : null);
  const info = $derived(hoverNode ?? selected);

  function moduleStates(): ModuleVizState[] {
    return NODE_IDS.map((id) => {
      const n = app.node(id);
      const s = statusOf(n);
      const ghost = app.ghosts[id];
      const showGhost =
        ghost !== undefined && (n.positionMm === null || Math.abs(ghost - (n.positionMm ?? ghost)) > 4);
      return {
        id,
        status: s,
        positionMm: n.positionMm,
        ghostMm: showGhost ? ghost! : null,
        limitMaxMm: n.limitMaxMm,
        selected: app.sel.includes(id)
      };
    });
  }

  function setPreset(p: CameraPreset) {
    preset = p;
    scene?.setPreset(p);
  }

  onMount(() => {
    if (!canvas) return;
    scene = new SwarmScene(canvas, {
      onPick: (id) => app.pick(id),
      onHover: (id) => (hoverId = id)
    });
    scene.setLive(app.mode === 'live');
    scene.updateModules(moduleStates());

    const ro = new ResizeObserver(() => scene?.resize());
    if (host) ro.observe(host);

    return () => {
      ro.disconnect();
      scene?.dispose();
      scene = null;
    };
  });

  onDestroy(() => {
    scene?.dispose();
    scene = null;
  });

  // Sync theme, selection, positions whenever app state ticks.
  $effect(() => {
    if (!scene) return;
    scene.setLive(app.mode === 'live');
    // Depend on telemetry + selection + ghosts
    void app.nodes;
    void app.sel;
    void app.ghosts;
    void app.mode;
    scene.updateModules(moduleStates());
  });
</script>

<div class="stage3d" class:live={app.mode === 'live'} bind:this={host}>
  <canvas bind:this={canvas} aria-label="Interactive 3D view of the nine MauMau modules"></canvas>

  <div class="chrome">
    <span class="l over">3D view</span>
    <div class="cams" role="group" aria-label="Camera presets">
      <button class="b s" class:on={preset === 'oblique'} aria-pressed={preset === 'oblique'} onclick={() => setPreset('oblique')}>Oblique</button>
      <button class="b s" class:on={preset === 'front'} aria-pressed={preset === 'front'} onclick={() => setPreset('front')}>Front</button>
      <button class="b s" class:on={preset === 'top'} aria-pressed={preset === 'top'} onclick={() => setPreset('top')}>Top</button>
      <button class="b s" onclick={() => { preset = 'oblique'; scene?.resetCamera(); }}>Reset</button>
    </div>
  </div>

  <div class="legend m">
    <span><i class="dot solid"></i>Reported estimate</span>
    <span><i class="dot dashed"></i>Planned position</span>
    <span>Drag to orbit · scroll to zoom</span>
  </div>

  {#if info}
    <div class="hud m" role="status">
      <strong>{info.id}</strong>
      <span>{STATUS_LABEL[statusOf(info)]}</span>
      <span>{positionText(info)}</span>
      {#if info.faultCode}<span class="bad">{info.faultCode}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .stage3d {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--gray-green);
    overflow: hidden;
  }
  .stage3d.live { background: var(--purple); color: var(--gray-green); }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
  .chrome {
    position: absolute; left: 12px; top: 10px; right: 12px;
    display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
    pointer-events: none;
  }
  .over { pointer-events: none; }
  .stage3d.live .over { color: var(--gray-green); }
  .cams { display: flex; flex-wrap: wrap; gap: 4px; pointer-events: auto; justify-content: flex-end; }
  .cams .b.s { min-height: 28px; padding: 2px 8px; font-size: 11px; background: rgba(255, 255, 255, 0.72); }
  .stage3d.live .cams .b.s { background: rgba(34, 17, 62, 0.55); color: #fff; border-color: rgba(255, 255, 255, 0.5); }
  .cams .b.on { background: var(--pink); color: var(--purple); border-color: var(--purple); }
  .legend {
    position: absolute; right: 14px; bottom: 12px;
    display: flex; flex-direction: column; gap: 4px; font-size: 11px;
    pointer-events: none;
  }
  .stage3d.live .legend { color: var(--gray-green); }
  .legend span { display: flex; align-items: center; gap: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 999px; border: 1.5px solid currentColor; display: inline-block; }
  .dot.solid { background: rgba(255, 255, 255, 0.55); }
  .dot.dashed { border-style: dashed; background: rgba(234, 125, 255, 0.35); }
  .hud {
    position: absolute; left: 14px; bottom: 12px;
    display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline;
    padding: 6px 10px; border-radius: var(--radius);
    background: rgba(255, 255, 255, 0.82); border: 1px solid var(--line-strong);
    pointer-events: none; max-width: min(420px, 70%);
  }
  .stage3d.live .hud { background: rgba(34, 17, 62, 0.75); color: #fff; border-color: rgba(255, 255, 255, 0.25); }
  .bad { color: var(--danger); font-weight: 700; }
  .stage3d.live .bad { color: #ffb4b4; }
</style>
