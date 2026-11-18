<script lang="ts">
  import { onMount } from 'svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import Overview from './components/Overview.svelte';
  import PerformPanel from './components/PerformPanel.svelte';
  import Stage from './components/Stage.svelte';
  import SystemPanel from './components/SystemPanel.svelte';
  import SystemTable from './components/SystemTable.svelte';
  import Timeline from './components/Timeline.svelte';
  import TopView from './components/TopView.svelte';
  import { app, type Area } from './lib/app.svelte';

  const AREAS: { id: Area; label: string }[] = [
    { id: 'control', label: 'Control' },
    { id: 'perform', label: 'Perform' },
    { id: 'system', label: 'System' }
  ];
  const ready = $derived(app.nodes.filter((n) => n.connected && n.homed && !n.faultCode).length);
  const fleetTag = $derived(!app.snap ? 'No coordinator' : app.simulated ? 'Simulated nodes' : 'Hardware');
  const banner = $derived.by(() => {
    if (!app.linked) return { cls: 'stop', tag: 'OFFLINE', text: 'Coordinator unreachable. Showing the last known state. Commands are disabled.' };
    if (app.stopEngaged) return { cls: 'stop', tag: 'STOPPED', text: 'Software stop engaged. Motion commands are blocked. Motor power is not cut.' };
    if (app.mode === 'live') {
      const what = app.runActive && app.run ? `${app.run.scoreName}: ${app.run.phase}.` : `${ready} of 9 modules ready.`;
      return { cls: 'live', tag: 'LIVE', text: `Commands reach the ${app.simulated ? 'simulated nodes' : 'motors'}. ${what}` };
    }
    return { cls: 'preview', tag: 'PREVIEW', text: 'Nothing is sent to the modules. Playback happens in this browser.' };
  });

  let cancelBtn = $state<HTMLButtonElement | null>(null);
  $effect(() => {
    if (app.confirm) cancelBtn?.focus();
  });
  async function execute() {
    app.confirm = false;
    await app.send({
      type: 'execute',
      score: app.score,
      confirmed: true,
      repeat: app.loop,
      autonomous: app.autonomous || undefined,
      autonomousLoop: app.autonomous && app.loop ? true : undefined,
      continuous: app.autonomous && app.continuousAutonomous ? true : undefined,
      maxLoops: app.autonomous && app.loop && !app.continuousAutonomous ? app.autonomousMaxLoops : undefined
    });
  }
  const stats = $derived(Object.values(app.validation.stats));

  onMount(() => {
    app.connect();
    void app.loadPresets();
    let last = performance.now();
    let raf = requestAnimationFrame(function loop(now) {
      app.frame(Math.min(100, now - last));
      last = now;
      raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="app">
  <header class="top">
    <div class="brand"><span class="t" style="font-size: 26px">SWARM Control</span><span class="l wide">Artificial Emotion</span></div>
    <nav class="nav" aria-label="Areas">
      {#each AREAS as a}
        <button class="b" class:on={app.area === a.id} aria-current={app.area === a.id ? 'page' : undefined} onclick={() => (app.area = a.id)}>{a.label}</button>
      {/each}
    </nav>
    <div style="flex: 1"></div>
    {#if app.isOperator}
      <button class="b s" onclick={() => app.releaseControl()}>Release control</button>
    {:else if app.snap?.operatorClientId}
      <span class="l">Monitoring. Another browser has control.</span>
    {:else}
      <button class="b s pk" disabled={!app.linked} onclick={() => app.takeControl()}>Take control</button>
    {/if}
    <div class="row" role="group" aria-label="Mode">
      <button class="b" class:on={app.mode === 'preview'} aria-pressed={app.mode === 'preview'} style="border-radius: 4px 0 0 4px" onclick={() => app.setMode('preview')}>Preview</button>
      <button class="b" class:a={app.mode === 'live'} aria-pressed={app.mode === 'live'} style="border-radius: 0 4px 4px 0; border-left: 0" onclick={() => app.setMode('live')}>Live</button>
    </div>
    <div class="row stopwrap" style="gap: 10px">
      <span class="wide" style="font-size: 11px; line-height: 1.3; text-align: right">Software stop.<br />Not an electrical cut-off.</span>
      <button class="b d big" disabled={!app.linked} onclick={() => app.send({ type: 'engageStop' })}>Stop all motors</button>
    </div>
  </header>

  <div class="banner m {banner.cls}" role="status">
    <span style="font-weight: 700; letter-spacing: 0.14em">{banner.tag}</span>
    <span>{banner.text}</span>
    <span style="flex: 1"></span>
    <span class="fleet">{fleetTag}</span>
    {#if app.stopEngaged && app.linked}
      <button class="b s" style="background: #fff" disabled={!app.isOperator} title={app.isOperator ? '' : 'Only the controlling browser can release the stop'} onclick={() => app.send({ type: 'releaseStop' })}>Release stop</button>
    {/if}
  </div>

  {#if app.notice}
    <div class="notice m" class:bad={!app.notice.ok} role={app.notice.ok ? 'status' : 'alert'}>
      <span>{app.notice.text}</span>
      <button class="tl" aria-label="Dismiss" onclick={() => (app.notice = null)}>Dismiss</button>
    </div>
  {/if}

  <main class="main">
    <section class="work">
      <div class="views">
        <div class="stagebox">
          <Stage variant="oblique" />
          <span class="l over" class:live={app.mode === 'live'} style="left: 16px; top: 12px">Oblique view</span>
          <div class="legend m" class:live={app.mode === 'live'}>
            <span><i class="dot solid"></i>Reported by firmware (estimate)</span>
            <span><i class="dot dashed"></i>Planned position</span>
            <span><i class="tick"></i>Travel limit</span>
          </div>
        </div>
        <div class="side">
          <div class="stagebox">
            <Stage variant="front" />
            <span class="l over" class:live={app.mode === 'live'} style="left: 12px; top: 10px">Front view</span>
          </div>
          <div style="padding: 10px 12px; border-top: 1px solid var(--line)"><TopView /></div>
        </div>
      </div>
      <nav class="mnav" aria-label="Areas">
        {#each AREAS as a}
          <button class="b" class:on={app.area === a.id} onclick={() => (app.area = a.id)}>{a.label}</button>
        {/each}
      </nav>
      <div class="bottom">
        {#if app.area === 'control'}<Overview />{:else if app.area === 'perform'}<Timeline />{:else}<SystemTable />{/if}
      </div>
    </section>
    <aside class="panel">
      <div class="compact"><TopView /></div>
      {#if app.area === 'control'}<ControlPanel />{:else if app.area === 'perform'}<PerformPanel />{:else}<SystemPanel />{/if}
    </aside>
  </main>

  <footer class="mstop">
    {#if app.stopEngaged}
      <button class="b big" disabled={!app.isOperator || !app.linked} onclick={() => app.send({ type: 'releaseStop' })}>Release software stop</button>
    {:else}
      <button class="b d big" style="min-height: 52px; font-size: 15px" disabled={!app.linked} onclick={() => app.send({ type: 'engageStop' })}>Stop all motors</button>
    {/if}
    <span style="font-size: 11px; text-align: center">Software stop. Not an electrical cut-off.</span>
  </footer>
</div>

{#if app.confirm}
  <div class="overlay">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <span class="l">Live, {app.simulated ? 'simulated nodes' : 'motors will move'}</span>
      <span class="t" id="confirm-title" style="font-size: 30px">Start {app.score.name} on nine {app.simulated ? 'simulated modules' : 'motors'}?</span>
      <span>
        The spheres will travel between {Math.round(Math.min(...stats.map((s) => s.minMm)))} and {Math.round(Math.max(...stats.map((s) => s.maxMm)))} mm at up to
        {Math.max(...stats.map((s) => s.peakSpeedMmS)).toFixed(1)} mm/s for {Math.round(app.score.durationMs / 1000)} s
        {app.autonomous
          ? (app.loop
            ? (app.continuousAutonomous ? ', looping on each module for up to 12 hours (or until Stop / fault)' : `, looping ${app.autonomousMaxLoops} times on each module`)
            : ', once on each module')
          : (app.loop ? ', then the Mac re-arms until stopped' : '')}.
        They start from where they are now. Keep the space below clear.
        {#if app.autonomous}
          <strong> Autonomous:</strong> after start, the Mac may disconnect; modules continue from their local clocks. Software Stop will not reach them while offline. Keep a physical power cut-off available. Independent clocks will drift over long runs.
        {/if}
      </span>
      <div class="row" style="gap: 8px; justify-content: flex-end">
        <button class="b" bind:this={cancelBtn} onclick={() => (app.confirm = false)}>Cancel</button>
        <button class="b a" onclick={execute}>{app.autonomous ? 'Start autonomous run' : `Start ${app.score.name} live`}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .app { height: 100dvh; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; gap: 20px; padding: 8px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .brand { display: flex; align-items: baseline; gap: 10px; }
  .nav { display: flex; gap: 6px; }
  .banner { display: flex; align-items: center; gap: 14px; padding: 6px 20px; min-height: 32px; border-bottom: 1px solid var(--line-strong); }
  .banner.preview { background: var(--gray-green); }
  .banner.live { background: var(--purple); color: var(--turquoise); }
  .banner.stop { background: var(--danger); color: #fff; }
  .fleet { border: 1px solid currentColor; border-radius: 999px; padding: 0 10px; font-weight: 700; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
  .notice { display: flex; justify-content: space-between; gap: 16px; padding: 4px 20px; background: var(--gray-green); font-size: 12px; }
  .notice.bad { background: #fbe9e9; color: var(--danger-dark); font-weight: 700; }
  .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
  .work { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .views { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 250px; }
  .stagebox { position: relative; min-height: 0; min-width: 0; }
  .side { display: grid; grid-template-rows: minmax(0, 1fr) auto; border-left: 1px solid var(--line); min-height: 0; }
  .over { position: absolute; }
  .over.live { color: var(--gray-green); }
  .legend { position: absolute; right: 16px; bottom: 14px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
  .legend.live { color: var(--gray-green); }
  .legend span { display: flex; align-items: center; gap: 8px; }
  .dot { width: 14px; height: 14px; border-radius: 999px; border: 1.5px solid currentColor; display: inline-block; }
  .dot.solid { background: rgba(255, 255, 255, 0.6); }
  .dot.dashed { border-style: dashed; background: rgba(234, 125, 255, 0.3); }
  .tick { width: 14px; border-top: 1px solid currentColor; display: inline-block; }
  .bottom { flex: none; height: 258px; overflow: auto; border-top: 1px solid var(--purple); padding: 12px 24px; }
  .panel { border-left: 1px solid var(--purple); padding: 18px 20px; overflow-y: auto; min-height: 0; }
  .compact, .mnav, .mstop { display: none; }
  .overlay { position: fixed; inset: 0; background: rgba(34, 17, 62, 0.6); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
  .dialog { background: #fff; border: 1px solid var(--purple); border-radius: var(--radius); padding: 24px; display: flex; flex-direction: column; gap: 16px; width: 460px; max-width: 100%; }

  /* Tablet: the stage keeps its place, the top view moves into the side panel. */
  @media (max-width: 1179px) {
    .main { grid-template-columns: minmax(0, 1fr) 360px; }
    .views { grid-template-columns: minmax(0, 1fr); }
    .side, .wide, .legend { display: none; }
    .compact { display: block; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--line); }
    .top { gap: 12px; padding: 8px 16px; }
  }
  /* Mobile: a remote. Stage, area tabs, essential controls, and a stop bar that stays in reach. */
  @media (max-width: 699px) {
    .app { height: auto; min-height: 100dvh; }
    .main { display: block; }
    .nav, .stopwrap { display: none; }
    .stagebox { height: 42vh; min-height: 240px; }
    .mnav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--purple); border-bottom: 1px solid var(--purple); }
    .mnav .b { border: 0; border-radius: 0; }
    .panel { border-left: 0; padding: 12px; overflow: visible; }
    .bottom { height: auto; padding: 12px; order: 3; }
    .work { display: contents; }
    .main { display: flex; flex-direction: column; }
    .views { order: 0; flex: none; }
    .mnav { order: 1; }
    .panel { order: 2; }
    .mstop { display: flex; flex-direction: column; gap: 4px; position: sticky; bottom: 0; background: #fff; border-top: 1px solid var(--purple); padding: 8px 12px calc(10px + env(safe-area-inset-bottom, 0px)); }
    .banner { padding: 6px 12px; flex-wrap: wrap; gap: 8px; font-size: 12px; }
    .top { padding: 8px 12px; }
  }
</style>
