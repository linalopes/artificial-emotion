/**
 * Three.js STL viewer. Loaded only after a [data-model-viewer] enters view.
 * Renders on demand (resize / orbit), not on a continuous loop.
 */
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const MESH_COLOR = 0x8f92a2;
const LIGHT_GROUND = 0xcad8d8;

function setStatus(root: HTMLElement, message: string | null): void {
  const status = root.querySelector<HTMLElement>('[data-model-status]');
  if (!status) return;
  if (message) {
    status.hidden = false;
    status.textContent = message;
    return;
  }
  status.hidden = true;
  status.textContent = '';
}

function disposeObject(mesh: Mesh): void {
  mesh.geometry.dispose();
  const { material } = mesh;
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

export function mountModelViewer(root: HTMLElement): void {
  const src = root.dataset.src?.trim();
  const stage = root.querySelector<HTMLElement>('.model-embed__stage');
  const reset = root.querySelector<HTMLButtonElement>('[data-model-reset]');
  if (!src || !stage) {
    setStatus(root, 'This model could not be loaded.');
    return;
  }

  if (!root.isConnected) return;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    setStatus(root, 'This browser cannot display the 3D model.');
    return;
  }

  renderer.setClearColor(new Color(0xffffff), 1);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.append(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0xffffff);
  const camera = new PerspectiveCamera(35, 1, 0.1, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;

  scene.add(new AmbientLight(0xffffff, 0.62));
  const hemi = new HemisphereLight(0xffffff, LIGHT_GROUND, 0.55);
  scene.add(hemi);
  const key = new DirectionalLight(0xffffff, 0.85);
  key.position.set(0.7, 1.1, 0.55);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.28);
  fill.position.set(-0.8, 0.2, -0.6);
  scene.add(fill);

  const homePosition = new Vector3();
  const homeTarget = new Vector3();
  let mesh: Mesh | null = null;
  let disposed = false;

  const render = () => {
    if (disposed) return;
    renderer.render(scene, camera);
  };

  const fit = () => {
    if (!mesh) return;
    const box = new Box3().setFromObject(mesh);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const radius = Math.max(size.length() * 0.5, 0.001);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360) / 1.35;

    camera.near = Math.max(distance / 100, 0.01);
    camera.far = distance * 20;
    camera.position.set(center.x + distance * 0.72, center.y + distance * 0.42, center.z + distance * 0.78);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.minDistance = radius * 0.4;
    controls.maxDistance = radius * 8;
    controls.update();
    homePosition.copy(camera.position);
    homeTarget.copy(controls.target);
  };

  const resize = () => {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    setStatus(root, 'The 3D view was interrupted. Reload the page to try again.');
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    controls.dispose();
    renderer.domElement.removeEventListener('webglcontextlost', onLost);
    if (mesh) {
      scene.remove(mesh);
      disposeObject(mesh);
    }
    renderer.dispose();
    renderer.domElement.remove();
    reset?.removeEventListener('click', onReset);
    window.removeEventListener('pagehide', dispose);
  };

  const onReset = () => {
    camera.position.copy(homePosition);
    controls.target.copy(homeTarget);
    controls.update();
    render();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  controls.addEventListener('change', render);
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  reset?.addEventListener('click', onReset);
  window.addEventListener('pagehide', dispose);

  const loader = new STLLoader();
  loader.load(
    src,
    (geometry: BufferGeometry) => {
      if (disposed) {
        geometry.dispose();
        return;
      }
      geometry.computeVertexNormals();
      geometry.center();
      mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({
          color: MESH_COLOR,
          roughness: 0.42,
          metalness: 0.08,
        }),
      );
      scene.add(mesh);
      fit();
      resize();
      setStatus(root, null);
      if (reset) reset.disabled = false;
    },
    undefined,
    () => {
      if (disposed) return;
      setStatus(root, 'This model could not be loaded.');
    },
  );
}
