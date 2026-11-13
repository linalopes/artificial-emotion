<script lang="ts">
  import { COLS, DIAGONALS, NODE_IDS, ROWS } from '@swarm/shared';
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, statusOf } from '../lib/status';
</script>

<div class="col" style="gap: 6px">
  <div class="k"><span class="l">Top view</span><span class="m small">back row first</span></div>
  <div class="tvgrid">
    <span></span>
    {#each COLS as c, i}
      <button class="b s" onclick={() => app.select(c)} aria-label="Select column {i + 1}">C{i + 1}</button>
    {/each}
    {#each ROWS as r, i}
      <button class="b s tall" onclick={() => app.select(r)} aria-label="Select row {i + 1}">R{i + 1}</button>
      {#each r as id}
        {@const s = statusOf(app.node(id))}
        <button class="b tv tall" class:sel={app.sel.includes(id)} class:dim={s === 'offline'} aria-pressed={app.sel.includes(id)} onclick={() => app.pick(id)}>
          <span class="num">{id.slice(3)}</span>
          <span class="st">{STATUS_LABEL[s]}</span>
        </button>
      {/each}
    {/each}
  </div>
  <div class="quick">
    <button class="b s" onclick={() => app.select([...NODE_IDS])}>All</button>
    <button class="b s" onclick={() => app.select([])}>None</button>
    <button class="b s" aria-label="Diagonal from back left" onclick={() => app.select(DIAGONALS[0])}>Diag A</button>
    <button class="b s" aria-label="Diagonal from back right" onclick={() => app.select(DIAGONALS[1])}>Diag B</button>
  </div>
  <button class="b s" class:on={app.multi} aria-pressed={app.multi} onclick={() => (app.multi = !app.multi)}>Multi-select {app.multi ? 'on' : 'off'}</button>
</div>

<style>
  .tvgrid { display: grid; grid-template-columns: 34px repeat(3, minmax(0, 1fr)); gap: 4px; }
  .quick { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .b.s { padding: 2px 0; }
  .tall { min-height: 44px; }
  .tv { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 2px; text-transform: none; }
  .tv.dim { opacity: 0.6; }
  .num { font-weight: 700; }
  .st { font-size: 10px; letter-spacing: 0; }
</style>
