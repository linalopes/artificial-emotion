/**
 * Imperative Three.js scene for SWARM Control.
 * Visualization only — never emits motor intents.
 */
import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { NodeId } from '@swarm/shared';
import { NODE_IDS } from '@swarm/shared';
import {
  VIZ_ANCHOR_SPACING_MM,
  VIZ_SPHERE_RADIUS_MM,
  worldAnchorOf,
  worldSphereOf
} from './view-grid';

export type CameraPreset = 'oblique' | 'front' | 'top';

export type ModuleVizState = {
  id: NodeId;
  status: 'offline' | 'fault' | 'homing' | 'unhomed' | 'moving' | 'idle';
  /** Firmware travel estimate (mm). null when unknown / unhomed. */
  positionMm: number | null;
  /** Planned / preview travel (mm). */
  ghostMm: number | null;
  /** Travel limit for a tick mark, when known. */
  limitMaxMm: number | null;
  selected: boolean;
};

type Theme = {
  bg: number;
  ink: number;
  glass: number;
  glassOpacity: number;
  ghost: number;
  accent: number;
  fault: number;
  moving: number;
  homing: number;
};

const PREVIEW: Theme = {
  bg: 0xcad8d8,
  ink: 0x22113e,
  glass: 0xffffff,
  glassOpacity: 0.42,
  ghost: 0xea7dff,
  accent: 0xea7dff,
  fault: 0xb93232,
  moving: 0x08f2db,
  homing: 0xea7dff
};

const LIVE: Theme = {
  bg: 0x22113e,
  ink: 0xffffff,
  glass: 0xffffff,
  glassOpacity: 0.28,
  ghost: 0xea7dff,
  accent: 0xea7dff,
  fault: 0xb93232,
  moving: 0x08f2db,
  homing: 0xea7dff
};

const LOOK = new Vector3(0, -180, VIZ_ANCHOR_SPACING_MM);
const PRESETS: Record<CameraPreset, { pos: Vector3; target: Vector3 }> = {
  oblique: {
    pos: new Vector3(-900, 420, -1100),
    target: LOOK.clone()
  },
  front: {
    pos: new Vector3(0, 80, -1400),
    target: LOOK.clone()
  },
  top: {
    pos: new Vector3(0, 2200, VIZ_ANCHOR_SPACING_MM),
    target: new Vector3(0, 0, VIZ_ANCHOR_SPACING_MM)
  }
};

type ModuleMeshes = {
  id: NodeId;
  group: Group;
  line: Line;
  sphere: Mesh;
  ghost: Mesh;
  ring: Mesh;
  label: Sprite;
  placeholder: Mesh;
};

function makeLabel(text: string, ink: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = ink;
  ctx.font = '700 36px "Courier Prime", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new CanvasTexture(c);
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new Sprite(mat);
  spr.scale.set(110, 55, 1);
  spr.position.set(0, 40, 0);
  return spr;
}

export class SwarmScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private controls: OrbitControls;
  private root = new Group();
  private modules = new Map<NodeId, ModuleMeshes>();
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private live = false;
  private theme: Theme = PREVIEW;
  private glassMat!: MeshPhysicalMaterial;
  private ghostMat!: MeshPhysicalMaterial;
  private lineMat!: LineBasicMaterial;
  private ringMat!: MeshBasicMaterial;
  private placeholderMat!: MeshBasicMaterial;
  private active = true;
  private raf = 0;
  private camAnim: { from: Vector3; to: Vector3; tFrom: Vector3; tTo: Vector3; t0: number; dur: number } | null =
    null;
  private hoverId: NodeId | null = null;
  private disposed = false;
  private onPick: (id: NodeId) => void;
  private onHover: (id: NodeId | null) => void;
  private canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    handlers: { onPick: (id: NodeId) => void; onHover: (id: NodeId | null) => void }
  ) {
    this.canvas = canvas;
    this.onPick = handlers.onPick;
    this.onHover = handlers.onHover;

    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(this.theme.bg, 1);

    this.camera = new PerspectiveCamera(42, 1, 10, 8000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 400;
    this.controls.maxDistance = 4200;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.target.copy(PRESETS.oblique.target);
    this.camera.position.copy(PRESETS.oblique.pos);

    this.scene.add(new AmbientLight(0xffffff, 0.55));
    this.scene.add(new HemisphereLight(0xffffff, 0x445566, 0.45));
    const key = new DirectionalLight(0xffffff, 0.85);
    key.position.set(-400, 800, -600);
    this.scene.add(key);
    const fill = new DirectionalLight(0xaaccff, 0.25);
    fill.position.set(500, 200, 400);
    this.scene.add(fill);

    this.buildMaterials();
    this.buildCeiling();
    this.buildModules();
    this.scene.add(this.root);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    this.resize();
    this.loop();
  }

  setLive(live: boolean): void {
    this.live = live;
    this.theme = live ? LIVE : PREVIEW;
    this.renderer.setClearColor(this.theme.bg, 1);
    this.applyTheme();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active && !this.raf && !this.disposed) this.loop();
  }

  setPreset(preset: CameraPreset): void {
    const p = PRESETS[preset];
    this.camAnim = {
      from: this.camera.position.clone(),
      to: p.pos.clone(),
      tFrom: this.controls.target.clone(),
      tTo: p.target.clone(),
      t0: performance.now(),
      dur: 650
    };
  }

  resetCamera(): void {
    this.setPreset('oblique');
  }

  updateModules(states: ModuleVizState[]): void {
    for (const st of states) {
      const m = this.modules.get(st.id);
      if (!m) continue;
      const known = st.positionMm !== null && st.status !== 'unhomed' && st.status !== 'offline';
      const pos = worldSphereOf(st.id, known ? st.positionMm : null);
      const anchor = worldAnchorOf(st.id);

      m.sphere.visible = known;
      m.placeholder.visible = !known;
      m.sphere.position.set(pos.x, pos.y, pos.z);
      m.placeholder.position.set(anchor.x, -VIZ_SPHERE_RADIUS_MM * 0.6, anchor.z);

      const linePos = known ? pos : m.placeholder.position;
      const geo = m.line.geometry as BufferGeometry;
      geo.setAttribute(
        'position',
        new Float32BufferAttribute([anchor.x, anchor.y, anchor.z, linePos.x, linePos.y, linePos.z], 3)
      );

      if (st.ghostMm !== null && Number.isFinite(st.ghostMm)) {
        const g = worldSphereOf(st.id, st.ghostMm);
        m.ghost.visible = true;
        m.ghost.position.set(g.x, g.y, g.z);
      } else {
        m.ghost.visible = false;
      }

      m.ring.visible = st.selected;
      m.ring.position.copy(known ? m.sphere.position : m.placeholder.position);

      // Status tint on glass / placeholder
      const mat = m.sphere.material as MeshPhysicalMaterial;
      if (st.status === 'fault') mat.color.setHex(this.theme.fault);
      else if (st.status === 'moving') mat.color.setHex(this.theme.moving);
      else if (st.status === 'homing') mat.color.setHex(this.theme.homing);
      else mat.color.setHex(this.theme.glass);
      mat.opacity = st.status === 'offline' ? 0.15 : this.theme.glassOpacity;
      m.sphere.visible = known && st.status !== 'offline';
      if (st.status === 'offline') {
        m.placeholder.visible = true;
        (m.placeholder.material as MeshBasicMaterial).opacity = 0.25;
      } else if (!known) {
        (m.placeholder.material as MeshBasicMaterial).opacity = st.status === 'fault' ? 0.85 : 0.55;
        if (st.status === 'fault') (m.placeholder.material as MeshBasicMaterial).color.setHex(this.theme.fault);
        else (m.placeholder.material as MeshBasicMaterial).color.setHex(this.theme.ink);
      }
    }
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else {
          const map = (mat as MeshBasicMaterial).map;
          if (map) map.dispose();
          mat.dispose();
        }
      }
    });
    this.renderer.dispose();
  }

  private buildMaterials(): void {
    // Simple glass-like shell (no env map / postprocessing).
    this.glassMat = new MeshPhysicalMaterial({
      color: this.theme.glass,
      metalness: 0.05,
      roughness: 0.18,
      transparent: true,
      opacity: this.theme.glassOpacity,
      reflectivity: 0.55,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      depthWrite: false
    });
    this.ghostMat = new MeshPhysicalMaterial({
      color: this.theme.ghost,
      metalness: 0,
      roughness: 0.4,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this.lineMat = new LineBasicMaterial({ color: this.theme.ink, transparent: true, opacity: 0.45 });
    this.ringMat = new MeshBasicMaterial({
      color: this.theme.accent,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.placeholderMat = new MeshBasicMaterial({
      color: this.theme.ink,
      transparent: true,
      opacity: 0.5,
      wireframe: true
    });
  }

  private applyTheme(): void {
    this.lineMat.color.setHex(this.theme.ink);
    this.glassMat.opacity = this.theme.glassOpacity;
    this.ghostMat.color.setHex(this.theme.ghost);
    this.ringMat.color.setHex(this.theme.accent);
    this.placeholderMat.color.setHex(this.theme.ink);
    const ink = this.live ? '#cad8d8' : '#22113e';
    for (const m of this.modules.values()) {
      const old = m.label.material as SpriteMaterial;
      const next = makeLabel(m.id.slice(3), ink);
      old.map?.dispose();
      old.dispose();
      m.label.material = next.material;
    }
  }

  private buildCeiling(): void {
    const ink = this.theme.ink;
    const mat = new LineBasicMaterial({ color: ink, transparent: true, opacity: 0.35 });
    const s = VIZ_ANCHOR_SPACING_MM;
    const pts: number[] = [];
    // Outer rectangle + cross grid at y=0
    const corners = [
      [-s, 0, 0],
      [s, 0, 0],
      [s, 0, 2 * s],
      [-s, 0, 2 * s],
      [-s, 0, 0]
    ];
    for (const p of corners) pts.push(...p);
    const loop = new BufferGeometry();
    loop.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.root.add(new Line(loop, mat));

    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * s;
      const zLine = new BufferGeometry();
      zLine.setAttribute('position', new Float32BufferAttribute([x, 0, 0, x, 0, 2 * s], 3));
      this.root.add(new Line(zLine, mat));
      const z = i * s;
      const xLine = new BufferGeometry();
      xLine.setAttribute('position', new Float32BufferAttribute([-s, 0, z, s, 0, z], 3));
      this.root.add(new Line(xLine, mat));
    }
  }

  private buildModules(): void {
    const sphereGeo = new SphereGeometry(VIZ_SPHERE_RADIUS_MM, 32, 24);
    const ringGeo = new SphereGeometry(VIZ_SPHERE_RADIUS_MM + 8, 24, 16);
    const phGeo = new SphereGeometry(VIZ_SPHERE_RADIUS_MM * 0.7, 12, 8);

    for (const id of NODE_IDS) {
      const anchor = worldAnchorOf(id);
      const group = new Group();
      group.userData.nodeId = id;

      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute(
        'position',
        new Float32BufferAttribute([anchor.x, anchor.y, anchor.z, anchor.x, -100, anchor.z], 3)
      );
      const line = new Line(lineGeo, this.lineMat);

      const sphere = new Mesh(sphereGeo, this.glassMat.clone());
      sphere.userData.nodeId = id;
      sphere.position.set(anchor.x, -120, anchor.z);

      const ghost = new Mesh(sphereGeo, this.ghostMat.clone());
      ghost.userData.nodeId = id;
      ghost.visible = false;

      const ring = new Mesh(ringGeo, this.ringMat.clone());
      ring.userData.nodeId = id;
      ring.visible = false;
      (ring.material as MeshBasicMaterial).wireframe = true;

      const placeholder = new Mesh(phGeo, this.placeholderMat.clone());
      placeholder.userData.nodeId = id;
      placeholder.position.set(anchor.x, -VIZ_SPHERE_RADIUS_MM * 0.6, anchor.z);

      const label = makeLabel(id.slice(3), '#22113e');
      label.position.set(anchor.x, 55, anchor.z);

      // Tiny anchor nub
      const nub = new Mesh(
        new SphereGeometry(8, 8, 8),
        new MeshBasicMaterial({ color: this.theme.ink })
      );
      nub.position.copy(new Vector3(anchor.x, anchor.y, anchor.z));

      group.add(line, sphere, ghost, ring, placeholder, label, nub);
      this.root.add(group);
      this.modules.set(id, { id, group, line, sphere, ghost, ring, label, placeholder });
    }
  }

  private pickObject(clientX: number, clientY: number): NodeId | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets: Object3D[] = [];
    for (const m of this.modules.values()) {
      if (m.sphere.visible) targets.push(m.sphere);
      if (m.placeholder.visible) targets.push(m.placeholder);
      if (m.ghost.visible) targets.push(m.ghost);
    }
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    return (hits[0].object.userData.nodeId as NodeId) ?? null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // Only pick when the pointer barely moved — orbit uses drag.
    const startX = e.clientX;
    const startY = e.clientY;
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) return;
      const id = this.pickObject(ev.clientX, ev.clientY);
      if (id) this.onPick(id);
    };
    window.addEventListener('pointerup', up);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const id = this.pickObject(e.clientX, e.clientY);
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.onHover(id);
      this.canvas.style.cursor = id ? 'pointer' : 'grab';
    }
  };

  private onPointerLeave = (): void => {
    this.hoverId = null;
    this.onHover(null);
    this.canvas.style.cursor = 'grab';
  };

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.active) return;

    if (this.camAnim) {
      const u = Math.min(1, (performance.now() - this.camAnim.t0) / this.camAnim.dur);
      const e = 1 - Math.pow(1 - u, 3);
      this.camera.position.lerpVectors(this.camAnim.from, this.camAnim.to, e);
      this.controls.target.lerpVectors(this.camAnim.tFrom, this.camAnim.tTo, e);
      if (u >= 1) this.camAnim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
