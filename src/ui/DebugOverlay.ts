import * as THREE from 'three';
import type { ConnectionStatus, PosePacket, QuaternionPacket } from '../types/pose';
import { displayModeLabels, type DisplayMode } from '../video/displayModes';

export type DebugOverlayState = {
  connected: ConnectionStatus;
  fps: number;
  smoothing: boolean;
  poseSource: string;
  trackingState: string;
  selectedCamera: string;
  videoWidth: number;
  videoHeight: number;
  videoFps: number;
  displayMode: DisplayMode;
  rawPose?: PosePacket;
  calibratedPose?: PosePacket;
  cameraPose?: PosePacket;
  /** Time from pose capture to now, when the pose timestamp is in this machine's clock domain. */
  poseAgeMs?: number;
  basisValid: boolean;
};

export class DebugOverlay {
  private readonly element: HTMLElement;
  private visible = true;

  constructor(root: HTMLElement) {
    this.element = document.createElement('aside');
    this.element.className = 'debug-panel';
    root.appendChild(this.element);
  }

  toggle() {
    this.visible = !this.visible;
    this.element.hidden = !this.visible;
  }

  render(state: DebugOverlayState) {
    const rawPose = state.rawPose;
    const calibratedPose = state.calibratedPose;
    const cameraPose = state.cameraPose;
    const timestamp = rawPose ? new Date(rawPose.timestamp).toLocaleTimeString() : '--';

    this.element.innerHTML = `
      <div class="debug-panel__title">HornlessSplat</div>
      <dl>
        <dt>connection</dt><dd>${state.connected}</dd>
        <dt>fps</dt><dd>${state.fps.toFixed(0)}</dd>
        <dt>smoothing</dt><dd>${state.smoothing ? 'on' : 'off'}</dd>
        <dt>pose src</dt><dd>${escapeHtml(state.poseSource)}</dd>
        <dt>tracking</dt><dd>${escapeHtml(state.trackingState)}</dd>
        <dt>camera</dt><dd>${escapeHtml(state.selectedCamera)}</dd>
        <dt>video res</dt><dd>${formatResolution(state.videoWidth, state.videoHeight)}</dd>
        <dt>video fps</dt><dd>${state.videoFps > 0 ? state.videoFps.toFixed(1) : '--'}</dd>
        <dt>mode</dt><dd>${displayModeLabels[state.displayMode]}</dd>
        <dt>raw pos</dt><dd>${formatVec(rawPose?.position)}</dd>
        <dt>raw rot</dt><dd>${formatRot(rawPose?.rotation)}</dd>
        <dt>cal pos</dt><dd>${formatVec(calibratedPose?.position)}</dd>
        <dt>cal rot</dt><dd>${formatRot(calibratedPose?.rotation)}</dd>
        <dt>cam pos</dt><dd>${formatVec(cameraPose?.position)}</dd>
        <dt>cam rot</dt><dd>${formatRot(cameraPose?.rotation)}</dd>
        <dt>fov</dt><dd>${cameraPose ? cameraPose.fov.toFixed(1) : '--'}</dd>
        <dt>timestamp</dt><dd>${timestamp}</dd>
        <dt>pose age</dt><dd>${formatPoseAge(state.poseAgeMs, rawPose)}</dd>
        ${state.basisValid ? '' : '<dt>warning</dt><dd>axis remap repeats an axis; rotation not remapped</dd>'}
      </dl>
    `;
  }
}

function formatResolution(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return '--';
  }

  return `${width} x ${height}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatVec(value?: { x: number; y: number; z: number }) {
  if (!value) {
    return '--';
  }

  return `${value.x.toFixed(2)} ${value.y.toFixed(2)} ${value.z.toFixed(2)}`;
}

const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();

/** Yaw / pitch / roll in degrees (YXZ), for display only. */
function formatRot(value?: QuaternionPacket) {
  if (!value) {
    return '--';
  }

  scratchEuler.setFromQuaternion(scratchQuaternion.set(value.x, value.y, value.z, value.w), 'YXZ');
  const toDegrees = THREE.MathUtils.radToDeg;

  return `${toDegrees(scratchEuler.y).toFixed(1)}° ${toDegrees(scratchEuler.x).toFixed(1)}° ${toDegrees(scratchEuler.z).toFixed(1)}°`;
}

function formatPoseAge(poseAgeMs: number | undefined, rawPose?: PosePacket) {
  if (!rawPose) {
    return '--';
  }

  if (!rawPose.clockSynced || poseAgeMs === undefined) {
    return 'clock not synced';
  }

  return `${poseAgeMs.toFixed(0)} ms`;
}
