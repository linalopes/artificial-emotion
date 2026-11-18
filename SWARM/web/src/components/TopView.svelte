<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { STATUS_LABEL, statusOf } from '../lib/status';
  import {
    NODE_IDS,
    VIEW_COLS_LEFT_TO_RIGHT,
    VIEW_DIAGONALS,
    VIEW_ROWS_PLAN_TOP_TO_BOTTOM
  } from '../lib/view-grid';
</script>

<div class="col" style="gap: 6px">
  <div class="k"><span class="l">Top view</span><span class="m small">front = 01 04 07 (bottom)</span></div>
  <div class="tvgrid">
    <span></span>
    {#each VIEW_COLS_LEFT_TO_RIGHT as c}
      <button class="b s" onclick={() => app.select(c.nodes)} aria-label="Select {c.label.toLowerCase()} column ({c.id})" title="{c.label} column">{c.id}</button>
    {/each}
    {#each VIEW_ROWS_PLAN_TOP_TO_BOTTOM as row}
      <button
        class="b s tall"
        onclick={() => app.select(row.nodes)}
        aria-label="Select {row.label.toLowerCase()} row ({row.id})"
        title="{row.label} row"
      >{row.id}</button>
      {#each row.nodes as id}
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
    {#each VIEW_DIAGONALS as d}
      <button class="b s" aria-label={d.aria} onclick={() => app.select([...d.nodes])}>{d.label}</button>
    {/each}
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
