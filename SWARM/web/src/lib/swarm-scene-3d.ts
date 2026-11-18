/**
 * Imperative Three.js scene for SWARM Control.
 * Camera / pick only — never issues motor intents.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NODE_IDS, type NodeId, type NodeState } from '@swarm/shared';
import { statusOf } from './status';
import {
  ANCHOR_SPACING_M,
  CAMERA_LOOK_AT,
  CAMERA_PRESETS,
  CEILING_Y_M,
  SPHERE_RADIUS_M,
  anchorWorld,
  sphereWorld,
  type CameraPreset
} from './world-space';

export type ScenePalette = 'preview' | 'live';

const PALETTE = {
  preview: {
    clear: 0xcad8d8,
    ink: 0x22113e,
    glass: 0xffffff,
    ghost: 0xea7dff,
    ring: 0x22113e,
    moving: 0x08f2db,
    homing: 0xea7dff,
    fault: 0xb93232
  },
  live: {
    clear: 0x22113e,
    ink: 0xffffff,
    glass: 0xffffff,
    ghost: 0xea7dff,
    ring: 0xea7dff,
    moving: 0x08f2db,
    homing: 0xea7dff,
    fault: 0xb93232
  }
} as const;

type ModuleMeshes = {
  id: NodeId;
  group: THREE.Group;
  string: THREE.Line;
  sphere: THREE.Mesh;
  ghost: THREE.Mesh;
  ring: THREE.Mesh;
  placeholder: THREE.Mesh;
  label: THREE.Sprite;
};

function makeLabelSprite(text: string, ink: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = `#${ink.toString(16).padStart(6, '0')}`;
  ctx.font = '700 36px "Courier Prime", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.22, 0.11, 1);
  return sprite;
}

export class SwarmScene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly root = new THREE.Group();
  private readonly modules = new Map<NodeId, ModuleMeshes>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickables: THREE.Object3D[] = [];
  private palette: ScenePalette = 'preview';
  private disposed = false;
  private running = false;
  private raf = 0;
  private camFrom = new THREE.Vector3();
  private camTo = new THREE.Vector3();
  private lookFrom = new THREE.Vector3();
  private lookTo = new THREE.Vector3(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y, CAMERA_LOOK_AT.z);
  private camT = 1;
  private camDuration = 0.55;
  private resizeObs: ResizeObserver | null = null;
  private hoverId: NodeId | null = null;
  onHover: ((id: NodeId | null) => void) | null = null;
  onPick: ((id: NodeId) => void) | null = null;

  constructor(private readonly host: HTMLElement) {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.05, 40);
    const eye = CAMERA_PRESETS.oblique;
    this.camera.position.set(eye.x, eye.y, eye.z);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y, CAMERA_LOOK_AT.z);
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minPolarAngle = 0.08;
    this.controls.update();

    this.scene.add(this.root);
    this.buildStatic();
    this.buildModules();
    this.applyPalette('preview');

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
  }

  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running || this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      this.stepCamera(1 / 60);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
      const sprite = obj as THREE.Sprite;
      if (sprite.material?.map) sprite.material.map.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setPalette(mode: ScenePalette): void {
    if (this.palette === mode) return;
    this.applyPalette(mode);
  }

  setCameraPreset(preset: CameraPreset, animate = true): void {
    const eye = CAMERA_PRESETS[preset];
    this.lookTo.set(CAMERA_LOOK_AT.x, CAMERA_LOOK_AT.y, CAMERA_LOOK_AT.z);
    if (!animate) {
      this.camera.position.set(eye.x, eye.y, eye.z);
      this.controls.target.copy(this.lookTo);
      this.controls.update();
      this.camT = 1;
      return;
    }
    this.camFrom.copy(this.camera.position);
    this.lookFrom.copy(this.controls.target);
    this.camTo.set(eye.x, eye.y, eye.z);
    this.camT = 0;
  }

  resetCamera(): void {
    this.setCameraPreset('oblique', true);
  }

  update(opts: {
    nodes: NodeState[];
    ghosts: Partial<Record<NodeId, number>>;
    selected: readonly NodeId[];
    palette: ScenePalette;
  }): void {
    this.setPalette(opts.palette);
    const selected = new Set(opts.selected);
    for (const n of opts.nodes) {
      const m = this.modules.get(n.id);
      if (!m) continue;
      const st = statusOf(n);
      const anchor = anchorWorld(n.id);
      const known = n.homed && n.positionMm !== null && n.positionValid !== false;
      const travel = known ? n.positionMm! : null;
      const ghostMm = opts.ghosts[n.id];
      const showGhost =
        ghostMm !== undefined && (travel === null || Math.abs(ghostMm - travel) > 4);

      // Suspension line: always from ceiling; end at sphere or short stub when unknown.
      const endY =
        travel !== null
          ? sphereWorld(n.id, travel).y + SPHERE_RADIUS_M
          : anchor.y - 0.12;
      const positions = m.string.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, anchor.x, anchor.y, anchor.z);
      positions.setXYZ(1, anchor.x, endY, anchor.z);
      positions.needsUpdate = true;

      if (travel !== null) {
        const p = sphereWorld(n.id, travel);
        m.sphere.visible = true;
        m.placeholder.visible = false;
        m.sphere.position.set(p.x, p.y, p.z);
        m.sphere.scale.setScalar(1);
        this.tintSphere(m.sphere);
      } else {
        m.sphere.visible = false;
        m.placeholder.visible = st !== 'offline';
        m.placeholder.position.set(anchor.x, anchor.y - 0.12, anchor.z);
        m.placeholder.scale.setScalar(0.75);
        this.tintPlaceholder(m.placeholder);
      }

      if (showGhost) {
        const g = sphereWorld(n.id, ghostMm!);
        m.ghost.visible = true;
        m.ghost.position.set(g.x, g.y, g.z);
      } else {
        m.ghost.visible = false;
      }

      // Selection ring only — never changes sphere scale or opacity.
      const sel = selected.has(n.id);
      m.ring.visible = sel && (m.sphere.visible || m.placeholder.visible);
      if (m.ring.visible) {
        const src = m.sphere.visible ? m.sphere.position : m.placeholder.position;
        m.ring.position.copy(src);
      }
      m.label.position.set(anchor.x, anchor.y + 0.08, anchor.z);
      m.group.visible = true;
    }
  }

  private stepCamera(dt: number): void {
    if (this.camT >= 1) return;
    this.camT = Math.min(1, this.camT + dt / this.camDuration);
    const t = 1 - Math.pow(1 - this.camT, 3);
    this.camera.position.lerpVectors(this.camFrom, this.camTo, t);
    this.controls.target.lerpVectors(this.lookFrom, this.lookTo, t);
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
  }

  private buildStatic(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.85);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.65);
    key.position.set(2.2, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-2, 2, -1);
    this.scene.add(fill);

    const span = ANCHOR_SPACING_M * 2.4;
    const y = CEILING_Y_M;
    const pts: number[] = [];
    // Outer rectangle + cross grid
    const half = span / 2;
    const rect = [
      [-half, half],
      [half, half],
      [half, -half],
      [-half, -half],
      [-half, half]
    ];
    for (let i = 0; i < rect.length - 1; i++) {
      pts.push(rect[i][0], y, rect[i][1], rect[i + 1][0], y, rect[i + 1][1]);
    }
    for (const d of [-ANCHOR_SPACING_M, 0, ANCHOR_SPACING_M]) {
      pts.push(-half, y, d, half, y, d);
      pts.push(d, y, -half, d, y, half);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ceiling = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x22113e, transparent: true, opacity: 0.35 })
    );
    ceiling.name = 'ceiling';
    this.root.add(ceiling);

    // Small anchor dots
    const dotGeo = new THREE.SphereGeometry(0.015, 10, 10);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x22113e });
    for (const id of NODE_IDS) {
      const a = anchorWorld(id);
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(a.x, a.y, a.z);
      this.root.add(dot);
    }
  }

  private buildModules(): void {
    // Schematic white wireframe. No physical glass / IBL. No dashed lines.
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 1,
      depthWrite: false
    });
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xea7dff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22113e,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    });
    const phMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      depthWrite: false
    });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x22113e, transparent: true, opacity: 0.45 });
    const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS_M, 24, 16);
    const ringGeo = new THREE.RingGeometry(SPHERE_RADIUS_M + 0.012, SPHERE_RADIUS_M + 0.02, 32);
    /** Unknown/unhomed display scale vs homed radius (geometry segments unchanged). */
    const unknownScale = 0.75;

    for (const id of NODE_IDS) {
      const group = new THREE.Group();
      group.name = id;
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const string = new THREE.Line(lineGeo, lineMat.clone());
      const sphere = new THREE.Mesh(sphereGeo, sphereMat.clone());
      sphere.userData.nodeId = id;
      sphere.scale.setScalar(1);
      const ghost = new THREE.Mesh(sphereGeo, ghostMat.clone());
      ghost.visible = false;
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      const placeholder = new THREE.Mesh(sphereGeo, phMat.clone());
      placeholder.userData.nodeId = id;
      placeholder.scale.setScalar(unknownScale);
      placeholder.visible = false;
      const label = makeLabelSprite(id.slice(3), 0x22113e);
      group.add(string, ghost, sphere, ring, placeholder, label);
      this.root.add(group);
      this.modules.set(id, { id, group, string, sphere, ghost, ring, placeholder, label });
      this.pickables.push(sphere, placeholder);
    }
  }

  private applyPalette(mode: ScenePalette): void {
    this.palette = mode;
    const p = PALETTE[mode];
    this.renderer.setClearColor(p.clear, 1);
    this.scene.traverse((obj) => {
      if (obj.name === 'ceiling' && obj instanceof THREE.LineSegments) {
        (obj.material as THREE.LineBasicMaterial).color.setHex(p.ink);
      }
    });
    for (const m of this.modules.values()) {
      (m.string.material as THREE.LineBasicMaterial).color.setHex(p.ink);
      (m.ring.material as THREE.MeshBasicMaterial).color.setHex(p.ring);
      const labelMat = m.label.material as THREE.SpriteMaterial;
      // rebuild label texture ink
      const map = labelMat.map;
      if (map && map.image instanceof HTMLCanvasElement) {
        const ctx = map.image.getContext('2d')!;
        ctx.clearRect(0, 0, 128, 64);
        ctx.fillStyle = `#${p.ink.toString(16).padStart(6, '0')}`;
        ctx.font = '700 36px "Courier Prime", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.id.slice(3), 64, 32);
        map.needsUpdate = true;
      }
    }
  }

  private tintSphere(mesh: THREE.Mesh): void {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(0xffffff);
    mat.opacity = 1;
  }

  private tintPlaceholder(mesh: THREE.Mesh): void {
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(0xffffff);
    mat.opacity = 0.35;
  }

  private hit(ev: PointerEvent): NodeId | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const h of hits) {
      const id = h.object.userData.nodeId as NodeId | undefined;
      if (id) return id;
    }
    return null;
  }

  private onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    // Ignore if user is orbiting (movement after down); simple click = small movement
    const startX = ev.clientX;
    const startY = ev.clientY;
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) return;
      const id = this.hit(e);
      if (id) this.onPick?.(id);
    };
    window.addEventListener('pointerup', up);
  };

  private onPointerMove = (ev: PointerEvent): void => {
    const id = this.hit(ev);
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.onHover?.(id);
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    }
  };

  private onPointerLeave = (): void => {
    if (this.hoverId) {
      this.hoverId = null;
      this.onHover?.(null);
    }
    this.renderer.domElement.style.cursor = 'grab';
  };
}
