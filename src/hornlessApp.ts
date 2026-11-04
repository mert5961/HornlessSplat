import { PoseCalibration } from './pose/PoseCalibration';
import { PoseSocketClient } from './pose/PoseSocketClient';
import { PoseSmoother } from './pose/PoseSmoother';
import { CalibrationPanel } from './ui/CalibrationPanel';
import { DebugOverlay } from './ui/DebugOverlay';
import { PerformanceHud } from './ui/PerformanceHud';
import { PoseSourcePanel } from './ui/PoseSourcePanel';
import { VideoControlPanel, type RenderScale, type SplatFpsCap } from './ui/VideoControlPanel';
import { displayModeLabels, type DisplayMode } from './video/displayModes';
import { VideoInput } from './video/VideoInput';
import { CameraPoseController } from './viewer/CameraPoseController';
import { createSplatViewer } from './viewer/SplatViewer';
import type { ConnectionStatus, PosePacket, PoseSource } from './types/pose';

export async function startHornlessApp(root: HTMLDivElement) {
const viewerRoot = document.createElement('main');
viewerRoot.className = 'viewer-root';
root.appendChild(viewerRoot);

const productionStage = document.createElement('section');
productionStage.className = 'production-stage production-stage--splat-only';
viewerRoot.appendChild(productionStage);

const videoLayer = document.createElement('div');
videoLayer.className = 'video-layer';
productionStage.appendChild(videoLayer);

const splatLayer = document.createElement('div');
splatLayer.className = 'splat-layer';
productionStage.appendChild(splatLayer);

const statusElement = document.createElement('div');
statusElement.className = 'load-status';
statusElement.textContent = 'Loading local Gaussian Splat scene...';
root.appendChild(statusElement);

const videoInput = new VideoInput();
videoLayer.appendChild(videoInput.videoElement);

let displayMode: DisplayMode = 'splat-only';
let splatOpacity = 0.7;
let renderScale: RenderScale = 0.75;
let splatFpsCap: SplatFpsCap = 15;

const splatViewer = createSplatViewer(splatLayer);
const cameraController = new CameraPoseController(splatViewer.camera);
const calibration = new PoseCalibration();
const smoother = new PoseSmoother();
const debugOverlay = new DebugOverlay(root);
const performanceHud = new PerformanceHud(root);
let poseSourcePanel: PoseSourcePanel;
let calibrationPanel: CalibrationPanel;
let videoControlPanel: VideoControlPanel;

calibrationPanel = new CalibrationPanel(root, {
  settings: calibration.getSettings(),
  onChange: (settings) => {
    calibration.updateSettings(settings);
    syncCalibrationSettings();
  },
  onSetOrigin: () => {
    calibration.setCurrentPoseAsOrigin(lastRawPose);
    calibrationPanel.setSettings(calibration.getSettings());
    pushCalibratedTarget();
  },
  onReset: () => {
    calibration.reset();
    calibrationPanel.setSettings(calibration.getSettings());
    syncCalibrationSettings();
  },
  onSave: () => {
    calibration.saveToLocalStorage();
  },
  onLoad: () => {
    calibration.loadFromLocalStorage();
    calibrationPanel.setSettings(calibration.getSettings());
    syncCalibrationSettings();
  }
});

poseSourcePanel = new PoseSourcePanel(root, {
  source: 'fake',
  androidConnected: false,
  androidTrackingState: '--',
  onSourceChange: (source) => {
    activePoseSource = source;
    poseClient.setPoseSource(source);
    syncPoseSourcePanel();
  }
});

videoControlPanel = new VideoControlPanel(root, {
  video: videoInput.getSnapshot(),
  displayMode,
  splatOpacity,
  renderScale,
  splatFpsCap,
  onDeviceChange: (deviceId) => {
    videoInput.setSelectedDeviceId(deviceId);
    syncVideoPanel();
  },
  onRequestPermission: () => {
    void videoInput.requestPermission();
  },
  onStart: () => {
    void videoInput.start().then(() => {
      videoInput.setVisible(isVideoVisible());
    });
  },
  onStop: () => {
    videoInput.stop();
  },
  onRefresh: () => {
    void videoInput.refreshDevices();
  },
  onResetVideoSettings: () => {
    videoInput.resetSettings();
    syncVideoPanel();
  },
  onVideoQualityChange: (quality) => {
    const wasActive = videoInput.getSnapshot().active;
    videoInput.setQuality(quality);

    if (wasActive) {
      void videoInput.start().then(() => {
        videoInput.setVisible(isVideoVisible());
      });
    }

    syncVideoPanel();
  },
  onRenderScaleChange: (scale) => {
    renderScale = scale;
    splatViewer.setRenderScale(renderScale);
    syncVideoPanel();
  },
  onSplatFpsCapChange: (fpsCap) => {
    splatFpsCap = fpsCap;
    syncVideoPanel();
  },
  onDisplayModeChange: (mode) => {
    displayMode = mode;
    applyDisplayMode();
    syncVideoPanel();
  },
  onSplatOpacityChange: (opacity) => {
    splatOpacity = opacity;
    applyDisplayMode();
    syncVideoPanel();
  }
});

let connectionStatus: ConnectionStatus = 'connecting';
let activePoseSource: PoseSource = 'fake';
let androidConnected = false;
let androidTrackingState = '--';
let lastRawPose: PosePacket | undefined;
let lastCalibratedPose: PosePacket | undefined;
let lastCameraPose: PosePacket | undefined;
let lastFrameMs = performance.now();
let lastUiRenderMs = 0;
let lastSplatRenderMs = 0;
let fps = 0;
let splatFps = 0;

smoother.setStrength(calibration.getSettings().smoothingStrength);
splatViewer.setRenderScale(renderScale);
applyDisplayMode();
void videoInput.refreshDevices();
videoInput.onChange(() => {
  syncVideoPanel();
});

const poseUrl = import.meta.env.VITE_POSE_WS_URL ?? 'ws://127.0.0.1:8787';
const poseClient = new PoseSocketClient({
  url: poseUrl,
  onPose: (packet) => {
    lastRawPose = packet;
    if (packet.source) {
      activePoseSource = packet.source;
    }
    androidTrackingState = packet.trackingState ?? androidTrackingState;
    pushCalibratedTarget();
  },
  onServerState: (state) => {
    activePoseSource = state.activeSource;
    androidConnected = state.androidConnected;
    androidTrackingState = state.androidTrackingState;
    syncPoseSourcePanel();
  },
  onStatusChange: (status) => {
    connectionStatus = status;
  }
});

window.addEventListener('resize', splatViewer.resize);
const resizeObserver = new ResizeObserver(() => {
  splatViewer.resize();
});
resizeObserver.observe(splatLayer);

window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }

  if (event.key.toLowerCase() === 'r') {
    calibration.setCurrentPoseAsOrigin(lastRawPose);
    calibrationPanel.setSettings(calibration.getSettings());
    pushCalibratedTarget();
  }

  if (event.key.toLowerCase() === 's') {
    smoother.setEnabled(!smoother.isEnabled());
  }

  if (event.key.toLowerCase() === 'd') {
    debugOverlay.toggle();
  }
});

await splatViewer.load();
statusElement.remove();
poseClient.connect();
requestAnimationFrame(tick);

function tick(nowMs: number) {
  const deltaSeconds = Math.min((nowMs - lastFrameMs) / 1000, 0.1);
  lastFrameMs = nowMs;
  fps = fps === 0 ? 1 / deltaSeconds : fps * 0.9 + (1 / deltaSeconds) * 0.1;

  const pose = smoother.update(deltaSeconds);
  const videoSnapshot = videoInput.getSnapshot();

  if (pose) {
    lastCameraPose = pose;
    cameraController.applyPose(pose);
  }

  if (shouldRenderSplat(nowMs)) {
    updateSplatFps(nowMs);
    splatViewer.updateAndRender();
  }

  if (nowMs - lastUiRenderMs >= 200) {
    lastUiRenderMs = nowMs;
    performanceHud.render({
      renderFps: splatFps,
      videoFps: videoSnapshot.fps,
      droppedFrames: videoSnapshot.droppedFrames
    });
    debugOverlay.render({
      connected: connectionStatus,
      fps,
      smoothing: smoother.isEnabled(),
      poseSource: activePoseSource,
      trackingState: androidTrackingState,
      selectedCamera: videoSnapshot.selectedDeviceLabel,
      videoWidth: videoSnapshot.width,
      videoHeight: videoSnapshot.height,
      videoFps: videoSnapshot.fps,
      displayMode,
      rawPose: lastRawPose,
      calibratedPose: lastCalibratedPose,
      cameraPose: lastCameraPose,
      // Assumes the browser runs on the same machine as the pose server (shared Date.now() clock).
      poseAgeMs: lastRawPose ? Date.now() - lastRawPose.timestamp : undefined,
      basisValid: calibration.isBasisValid()
    });
  }

  requestAnimationFrame(tick);
}

function pushCalibratedTarget() {
  if (!lastRawPose) {
    return;
  }

  lastCalibratedPose = calibration.calibrate(lastRawPose);
  smoother.setTarget(lastCalibratedPose);
}

function syncCalibrationSettings() {
  const settings = calibration.getSettings();
  smoother.setStrength(settings.smoothingStrength);
  calibrationPanel.setSettings(settings);
  pushCalibratedTarget();
}

function applyDisplayMode() {
  productionStage.className = `production-stage production-stage--${displayMode}`;
  productionStage.style.setProperty('--splat-opacity', String(displayMode === 'overlay' ? splatOpacity : 1));
  productionStage.setAttribute('aria-label', `${displayModeLabels[displayMode]} preview`);
  videoInput.setVisible(isVideoVisible());
  requestAnimationFrame(splatViewer.resize);
}

function syncVideoPanel() {
  videoControlPanel.setState({
    video: videoInput.getSnapshot(),
    displayMode,
    splatOpacity,
    renderScale,
    splatFpsCap
  });
}

function syncPoseSourcePanel() {
  poseSourcePanel.setState({
    source: activePoseSource,
    androidConnected,
    androidTrackingState
  });
}

function isSplatVisible() {
  return displayMode !== 'video-only';
}

function isVideoVisible() {
  return displayMode === 'video-only' || displayMode === 'side-by-side' || displayMode === 'overlay';
}

function shouldRenderSplat(nowMs: number) {
  if (!isSplatVisible()) {
    return false;
  }

  const minFrameMs = 1000 / splatFpsCap;
  return lastSplatRenderMs === 0 || nowMs - lastSplatRenderMs >= minFrameMs;
}

function updateSplatFps(nowMs: number) {
  if (lastSplatRenderMs > 0) {
    const instantFps = 1000 / Math.max(nowMs - lastSplatRenderMs, 1);
    splatFps = splatFps === 0 ? instantFps : splatFps * 0.85 + instantFps * 0.15;
  } else {
    splatFps = splatFpsCap;
  }

  lastSplatRenderMs = nowMs;
}
}
