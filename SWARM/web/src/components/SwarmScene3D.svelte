<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { NodeId } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, positionText, statusOf } from '../lib/status';
  import { SwarmScene3D } from '../lib/swarm-scene-3d';
  import type { CameraPreset } from '../lib/world-space';

  let host = $state<HTMLDivElement | null>(null);
  let scene: SwarmScene3D | null = null;
  let hoverId = $state<NodeId | null>(null);
  let preset = $state<CameraPreset>('oblique');

  const PRESETS: { id: CameraPreset; label: string }[] = [
    { id: 'oblique', label: 'Oblique' },
    { id: 'front', label: 'Front' },
    { id: 'top', label: 'Top' }
  ];

  onMount(() => {
    if (!host) return;
    scene = new SwarmScene3D(host);
    scene.onPick = (id) => app.pick(id);
    scene.onHover = (id) => (hoverId = id);
    scene.start();
  });

  onDestroy(() => {
    scene?.dispose();
    scene = null;
  });

  $effect(() => {
    if (!scene) return;
    scene.update({
      nodes: app.nodes,
      ghosts: app.ghosts,
      selected: app.sel,
      palette: app.mode === 'live' ? 'live' : 'preview'
    });
  });

  function setPreset(id: CameraPreset) {
    preset = id;
    scene?.setCameraPreset(id, true);
  }
</script>

<div class="wrap" class:live={app.mode === 'live'}>
  <div class="canvas" bind:this={host} role="img" aria-label="Interactive 3D view of the nine MauMau modules"></div>
  <span class="l over">3D view</span>
  <div class="cams" role="group" aria-label="Camera presets">
    {#each PRESETS as p}
      <button class="b s" class:on={preset === p.id} aria-pressed={preset === p.id} onclick={() => setPreset(p.id)}>{p.label}</button>
    {/each}
    <button class="b s" onclick={() => { preset = 'oblique'; scene?.resetCamera(); }}>Reset</button>
  </div>
  <div class="legend m">
    <span><i class="dot solid"></i>Reported by firmware (estimate)</span>
    <span><i class="dot dashed"></i>Planned position</span>
  </div>
  {#if hoverId}
    {@const n = app.node(hoverId)}
    {@const s = statusOf(n)}
    <div class="tip m" role="status">{hoverId} · {STATUS_LABEL[s]} · {positionText(n)}</div>
  {/if}
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 0; background: var(--gray-green); }
  .wrap.live { background: var(--purple); }
  .canvas { position: absolute; inset: 0; }
  .over { position: absolute; left: 16px; top: 12px; pointer-events: none; z-index: 2; }
  .wrap.live .over, .wrap.live .legend, .wrap.live .tip { color: var(--gray-green); }
  .cams { position: absolute; left: 16px; bottom: 14px; display: flex; gap: 4px; z-index: 2; flex-wrap: wrap; }
  .cams .b { min-height: 28px; padding: 2px 8px; font-size: 11px; background: rgba(255, 255, 255, 0.55); }
  .wrap.live .cams .b { background: rgba(34, 17, 62, 0.45); color: #fff; border-color: rgba(255, 255, 255, 0.45); }
  .wrap.live .cams .b.on { background: var(--turquoise); color: var(--purple); border-color: var(--turquoise); }
  .legend { position: absolute; right: 16px; bottom: 14px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; z-index: 2; pointer-events: none; }
  .legend span { display: flex; align-items: center; gap: 8px; }
  .dot { width: 14px; height: 14px; border-radius: 999px; border: 1.5px solid currentColor; display: inline-block; }
  .dot.solid { background: rgba(255, 255, 255, 0.6); }
  .dot.dashed { border-style: dashed; background: rgba(234, 125, 255, 0.3); }
  .tip { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); z-index: 2; padding: 4px 10px; border-radius: var(--radius); background: rgba(255, 255, 255, 0.82); border: 1px solid var(--line-strong); pointer-events: none; white-space: nowrap; }
  .wrap.live .tip { background: rgba(34, 17, 62, 0.75); border-color: rgba(255, 255, 255, 0.35); }
</style>
