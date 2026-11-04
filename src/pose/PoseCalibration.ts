import * as THREE from 'three';
import type { PosePacket, RotationPacket, Vec3Packet } from '../types/pose';

export type AxisName = 'x' | 'y' | 'z';

export type AxisRemap = {
  x: AxisName;
  y: AxisName;
  z: AxisName;
};

/**
 * Tracking space -> scene space conversion, applied in this order:
 *
 * 1. Basis change (axis remap + invert). Applied to position AND rotation, so remapping
 *    an axis keeps the camera's motion and orientation consistent.
 * 2. Origin. Pose is made relative to the captured origin position and heading (yaw only,
 *    so the horizon stays level with gravity-aligned trackers such as ARCore).
 * 3. Position scale.
 * 4. Scene placement (rotation offset, then position offset): where the tracking origin
 *    sits in the splat scene.
 */
export type PoseCalibrationSettings = {
  positionScale: number;
  positionOffset: Vec3Packet;
  /** Radians, YXZ order. Composed as a quaternion, never added to angles. */
  rotationOffset: RotationPacket;
  axisRemap: AxisRemap;
  invert: {
    x: boolean;
    y: boolean;
    z: boolean;
  };
  smoothingStrength: number;
  latencyOffsetMs: number;
  /** Origin position in remapped tracking space. */
  originPosition: Vec3Packet;
  /** Origin heading in radians, in remapped tracking space. */
  originYaw: number;
};

const STORAGE_KEY = 'hornlesssplat.calibration.v2';
const HOME_POSITION: Vec3Packet = { x: 0, y: 0.35, z: 4 };

export const DEFAULT_CALIBRATION: PoseCalibrationSettings = {
  positionScale: 1,
  // Origin and offset cancel out by default, so an uncalibrated pose is used as-is,
  // and "Set Current Pose As Origin" puts the camera at the scene's home viewpoint.
  positionOffset: { ...HOME_POSITION },
  rotationOffset: { yaw: 0, pitch: 0, roll: 0 },
  axisRemap: { x: 'x', y: 'y', z: 'z' },
  invert: { x: false, y: false, z: false },
  smoothingStrength: 0.45,
  latencyOffsetMs: 0,
  originPosition: { ...HOME_POSITION },
  originYaw: 0
};

const AXIS_INDEX: Record<AxisName, number> = { x: 0, y: 1, z: 2 };
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export class PoseCalibration {
  private settings: PoseCalibrationSettings;
  private basis = new THREE.Matrix4();
  /** Camera-local reflection that keeps the rotation proper when the basis is a mirror. */
  private localReflection = new THREE.Matrix4();
  private basisIsPermutation = true;

  constructor(settings: PoseCalibrationSettings = DEFAULT_CALIBRATION) {
    this.settings = cloneSettings(settings);
    this.rebuildBasis();
  }

  getSettings() {
    return cloneSettings(this.settings);
  }

  /** False when the axis remap maps two outputs to the same input; rotation is then left un-remapped. */
  isBasisValid() {
    return this.basisIsPermutation;
  }

  updateSettings(nextSettings: PoseCalibrationSettings) {
    this.settings = sanitizeSettings(nextSettings);
    this.rebuildBasis();
  }

  reset() {
    this.settings = cloneSettings(DEFAULT_CALIBRATION);
    this.rebuildBasis();
  }

  saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  loadFromLocalStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return false;
    }

    try {
      this.settings = sanitizeSettings(JSON.parse(stored) as Partial<PoseCalibrationSettings>);
      this.rebuildBasis();
      return true;
    } catch {
      return false;
    }
  }

  setCurrentPoseAsOrigin(rawPose?: PosePacket) {
    if (!rawPose) {
      return;
    }

    const { position, quaternion } = this.applyBasis(rawPose);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);

    this.settings.originPosition = { x: position.x, y: position.y, z: position.z };
    this.settings.originYaw = Math.atan2(-forward.x, -forward.z);
  }

  calibrate(rawPose: PosePacket): PosePacket {
    const settings = this.settings;
    const { position, quaternion } = this.applyBasis(rawPose);

    // Relative to origin: undo origin position, then origin heading.
    const inverseOriginHeading = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -settings.originYaw);
    position.sub(vec3ToThree(settings.originPosition)).applyQuaternion(inverseOriginHeading);
    quaternion.premultiply(inverseOriginHeading);

    position.multiplyScalar(settings.positionScale);

    // Place tracking space in the scene.
    const sceneRotation = quaternionFromEuler(settings.rotationOffset);
    position.applyQuaternion(sceneRotation).add(vec3ToThree(settings.positionOffset));
    quaternion.premultiply(sceneRotation).normalize();

    return {
      source: rawPose.source,
      timestamp: rawPose.timestamp,
      clockSynced: rawPose.clockSynced,
      trackingState: rawPose.trackingState,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
      fov: rawPose.fov
    };
  }

  /**
   * Basis change: p' = M p, R' = M R N.
   * The camera's physical forward (-Z) and up (+Y) go through M just like positions do.
   * N is identity for a proper remap; for a mirrored remap (det M = -1) it flips the camera's
   * local X so the result is still a rotation (forward and up stay exact, right mirrors with the world).
   */
  private applyBasis(rawPose: PosePacket) {
    const position = vec3ToThree(rawPose.position).applyMatrix4(this.basis);
    const quaternion = new THREE.Quaternion(
      rawPose.rotation.x,
      rawPose.rotation.y,
      rawPose.rotation.z,
      rawPose.rotation.w
    ).normalize();

    if (this.basisIsPermutation) {
      const rotation = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
      rotation.premultiply(this.basis).multiply(this.localReflection);
      quaternion.setFromRotationMatrix(rotation);
    }

    return { position, quaternion };
  }

  private rebuildBasis() {
    const { axisRemap, invert } = this.settings;
    const rows: [AxisName, boolean][] = [
      [axisRemap.x, invert.x],
      [axisRemap.y, invert.y],
      [axisRemap.z, invert.z]
    ];
    const elements = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    rows.forEach(([inputAxis, inverted], row) => {
      elements[row * 3 + AXIS_INDEX[inputAxis]] = inverted ? -1 : 1;
    });

    this.basis.set(
      elements[0], elements[1], elements[2], 0,
      elements[3], elements[4], elements[5], 0,
      elements[6], elements[7], elements[8], 0,
      0, 0, 0, 1
    );
    this.localReflection.makeScale(this.basis.determinant() < 0 ? -1 : 1, 1, 1);
    this.basisIsPermutation = new Set([axisRemap.x, axisRemap.y, axisRemap.z]).size === 3;
  }
}

function vec3ToThree(vector: Vec3Packet) {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function quaternionFromEuler(rotation: RotationPacket) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.pitch, rotation.yaw, rotation.roll, 'YXZ'));
}

function cloneSettings(settings: PoseCalibrationSettings): PoseCalibrationSettings {
  return structuredClone(settings);
}

function sanitizeSettings(settings: Partial<PoseCalibrationSettings>): PoseCalibrationSettings {
  const fallback = cloneSettings(DEFAULT_CALIBRATION);
  const merged = {
    ...fallback,
    ...settings,
    positionOffset: { ...fallback.positionOffset, ...settings.positionOffset },
    rotationOffset: { ...fallback.rotationOffset, ...settings.rotationOffset },
    axisRemap: { ...fallback.axisRemap, ...settings.axisRemap },
    invert: { ...fallback.invert, ...settings.invert },
    originPosition: { ...fallback.originPosition, ...settings.originPosition }
  };

  return {
    ...merged,
    positionScale: clampNumber(merged.positionScale, 0.01, 20, fallback.positionScale),
    smoothingStrength: clampNumber(merged.smoothingStrength, 0, 1, fallback.smoothingStrength),
    latencyOffsetMs: clampNumber(merged.latencyOffsetMs, -1000, 1000, fallback.latencyOffsetMs),
    originYaw: clampNumber(merged.originYaw, -Math.PI * 2, Math.PI * 2, fallback.originYaw),
    axisRemap: {
      x: sanitizeAxis(merged.axisRemap.x),
      y: sanitizeAxis(merged.axisRemap.y),
      z: sanitizeAxis(merged.axisRemap.z)
    }
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function sanitizeAxis(axis: unknown): AxisName {
  return axis === 'x' || axis === 'y' || axis === 'z' ? axis : 'x';
}
