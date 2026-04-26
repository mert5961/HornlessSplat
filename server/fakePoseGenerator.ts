import type { PosePacket } from './poseTypes';

export type FakePoseOptions = {
  startTimeMs?: number;
};

export class FakePoseGenerator {
  private readonly startTimeMs: number;

  constructor(options: FakePoseOptions = {}) {
    this.startTimeMs = options.startTimeMs ?? Date.now();
  }

  next(nowMs = Date.now()): PosePacket {
    const elapsedSeconds = (nowMs - this.startTimeMs) / 1000;
    const orbit = elapsedSeconds * 0.45;
    const position = {
      x: Math.sin(orbit) * 1.2,
      y: 0.35 + Math.sin(elapsedSeconds * 0.9) * 0.16,
      z: 4 + Math.cos(orbit * 0.8) * 0.45
    };

    const direction = normalize({
      x: -position.x,
      y: -position.y,
      z: -position.z
    });

    return {
      source: 'fake',
      timestamp: nowMs,
      position,
      rotation: {
        yaw: Math.atan2(-direction.x, -direction.z),
        pitch: Math.asin(direction.y),
        roll: Math.sin(elapsedSeconds * 0.7) * 0.035
      },
      fov: 58 + Math.sin(elapsedSeconds * 0.5) * 5
    };
  }
}

function normalize(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}
