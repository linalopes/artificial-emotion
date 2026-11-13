<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, agoText, positionText, statusOf } from '../lib/status';
  const now = $derived(app.snap?.wallTimeMs ?? Date.now());
</script>

<div class="col" style="gap: 10px">
  <div class="k"><span class="l">Device overview</span><span class="m small">Positions are step-count estimates reported by each module.</span></div>
  <div class="cards">
    {#each app.nodes as n (n.id)}
      {@const s = statusOf(n)}
      <button class="card" class:sel={app.sel.includes(n.id)} aria-pressed={app.sel.includes(n.id)} onclick={() => app.pick(n.id)}>
        <span class="m" style="font-weight: 700; font-size: 15px">{n.id}</span>
        <span class="bd {s}">{STATUS_LABEL[s]}</span>
        <span class="m">{positionText(n)}</span>
        <span class="small">{!n.connected ? 'Link lost' : !n.homed ? 'No reference' : `Homed ${agoText(n.lastHomedAtMs, now)}`}</span>
        <span class="small">Endstop {n.endstop === null ? 'unknown' : n.endstop ? 'pressed' : 'open'}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .cards { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: 8px; }
  .small { font-size: 11px; line-height: 1.35; }
  @media (max-width: 1179px) { .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
