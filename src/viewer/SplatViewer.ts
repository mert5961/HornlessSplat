import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

export type SplatViewerInstance = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  load: () => Promise<void>;
  updateAndRender: () => void;
  resize: () => void;
  setRenderScale: (scale: number) => void;
};

export function createSplatViewer(container: HTMLElement): SplatViewerInstance {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    premultipliedAlpha: false
  });
  renderer.setClearColor(0x07080b, 0);
  let renderScale = 0.75;

  const applyPixelRatio = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * renderScale);
  };

  applyPixelRatio();
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 1000);
  camera.position.set(0, 0.35, 4);
  camera.lookAt(0, 0.1, 0);

  const viewer = new GaussianSplats3D.Viewer({
    selfDrivenMode: false,
    renderer,
    camera,
    useBuiltInControls: false,
    sharedMemoryForWorkers: false,
    gpuAcceleratedSort: false,
    integerBasedSort: false,
    sphericalHarmonicsDegree: 0,
    webXRMode: GaussianSplats3D.WebXRMode.None,
    renderMode: GaussianSplats3D.RenderMode.Always,
    sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
    logLevel: GaussianSplats3D.LogLevel.None
  });

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    applyPixelRatio();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  };

  const setRenderScale = (scale: number) => {
    renderScale = Math.min(Math.max(scale, 0.5), 1);
    resize();
  };

  resize();

  return {
    renderer,
    camera,
    resize,
    setRenderScale,
    load: () =>
      viewer.addSplatScene('/assets/sample-set.ply', {
        format: GaussianSplats3D.SceneFormat.Ply,
        splatAlphaRemovalThreshold: 1,
        showLoadingUI: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1]
      }),
    updateAndRender: () => {
      viewer.update();
      viewer.render();
    }
  };
}
