import * as THREE from 'three';
import type { PosePacket, RotationPacket, Vec3Packet } from '../types/pose';

export type AxisName = 'x' | 'y' | 'z';

export type AxisRemap = {
  x: AxisName;
  y: AxisName;
  z: AxisName;
};

export type PoseCalibrationSettings = {
  positionScale: number;
  positionOffset: Vec3Packet;
  rotationOffset: RotationPacket;
  axisRemap: AxisRemap;
  invert: {
    x: boolean;
    y: boolean;
    z: boolean;
  };
  smoothingStrength: number;
  latencyOffsetMs: number;
  originPosition: Vec3Packet;
  originRotation: RotationPacket;
};

const STORAGE_KEY = 'hornlesssplat.calibration.v1';

export const DEFAULT_CALIBRATION: PoseCalibrationSettings = {
  positionScale: 1,
  positionOffset: { x: 0, y: 0, z: 0 },
  rotationOffset: { yaw: 0, pitch: 0, roll: 0 },
  axisRemap: { x: 'x', y: 'y', z: 'z' },
  invert: { x: false, y: false, z: false },
  smoothingStrength: 0.45,
  latencyOffsetMs: 0,
  originPosition: { x: 0, y: 0.35, z: 4 },
  originRotation: { yaw: 0, pitch: 0, roll: 0 }
};

export class PoseCalibration {
  private settings: PoseCalibrationSettings;

  constructor(settings: PoseCalibrationSettings = DEFAULT_CALIBRATION) {
    this.settings = cloneSettings(settings);
  }

  getSettings() {
    return cloneSettings(this.settings);
  }

  updateSettings(nextSettings: PoseCalibrationSettings) {
    this.settings = sanitizeSettings(nextSettings);
  }

  reset() {
    this.settings = cloneSettings(DEFAULT_CALIBRATION);
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
      return true;
    } catch {
      return false;
    }
  }

  setCurrentPoseAsOrigin(rawPose?: PosePacket) {
    if (!rawPose) {
      return;
    }

    const adjusted = this.applyStaticTransforms(rawPose);
    this.settings.originPosition = adjusted.position;
    this.settings.originRotation = adjusted.rotation;
  }

  calibrate(rawPose: PosePacket): PosePacket {
    const adjusted = this.applyStaticTransforms(rawPose);
    const originPosition = vec3ToThree(this.settings.originPosition);
    const adjustedPosition = vec3ToThree(adjusted.position);
    const relativePosition = adjustedPosition.sub(originPosition);

    const originQuaternion = quaternionFromYawPitchRoll(this.settings.originRotation);
    const adjustedQuaternion = quaternionFromYawPitchRoll(adjusted.rotation);
    const relativeQuaternion = originQuaternion.invert().multiply(adjustedQuaternion);
    const relativeEuler = new THREE.Euler().setFromQuaternion(relativeQuaternion, 'YXZ');

    return {
      timestamp: rawPose.timestamp,
      position: {
        x: relativePosition.x,
        y: relativePosition.y,
        z: relativePosition.z
      },
      rotation: {
        yaw: relativeEuler.y,
        pitch: relativeEuler.x,
        roll: relativeEuler.z
      },
      fov: rawPose.fov
    };
  }

  private applyStaticTransforms(rawPose: PosePacket): PosePacket {
    const settings = this.settings;
    const remapped = {
      x: rawPose.position[settings.axisRemap.x],
      y: rawPose.position[settings.axisRemap.y],
      z: rawPose.position[settings.axisRemap.z]
    };

    return {
      timestamp: rawPose.timestamp,
      position: {
        x: transformAxis(remapped.x, settings.invert.x, settings.positionScale, settings.positionOffset.x),
        y: transformAxis(remapped.y, settings.invert.y, settings.positionScale, settings.positionOffset.y),
        z: transformAxis(remapped.z, settings.invert.z, settings.positionScale, settings.positionOffset.z)
      },
      rotation: {
        yaw: rawPose.rotation.yaw + settings.rotationOffset.yaw,
        pitch: rawPose.rotation.pitch + settings.rotationOffset.pitch,
        roll: rawPose.rotation.roll + settings.rotationOffset.roll
      },
      fov: rawPose.fov
    };
  }
}

function transformAxis(value: number, inverted: boolean, scale: number, offset: number) {
  return (inverted ? -value : value) * scale + offset;
}

function vec3ToThree(vector: Vec3Packet) {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function quaternionFromYawPitchRoll(rotation: RotationPacket) {
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
    originPosition: { ...fallback.originPosition, ...settings.originPosition },
    originRotation: { ...fallback.originRotation, ...settings.originRotation }
  };

  return {
    ...merged,
    positionScale: clampNumber(merged.positionScale, 0.01, 20, fallback.positionScale),
    smoothingStrength: clampNumber(merged.smoothingStrength, 0, 1, fallback.smoothingStrength),
    latencyOffsetMs: clampNumber(merged.latencyOffsetMs, -1000, 1000, fallback.latencyOffsetMs),
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
