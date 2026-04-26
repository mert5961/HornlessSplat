import type { PosePacket } from '../types/pose';

export class PoseSmoother {
  private target?: PosePacket;
  private current?: PosePacket;
  private enabled = true;
  private strength = 0.45;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  setStrength(strength: number) {
    this.strength = Math.min(Math.max(strength, 0), 1);
  }

  setTarget(packet: PosePacket) {
    this.target = structuredClone(packet);

    if (!this.current) {
      this.current = structuredClone(packet);
    }
  }

  update(deltaSeconds: number): PosePacket | undefined {
    if (!this.target) {
      return this.current;
    }

    if (!this.enabled || !this.current || this.strength <= 0) {
      this.current = structuredClone(this.target);
      return this.current;
    }

    const response = 32 - this.strength * 28;
    const alpha = 1 - Math.exp(-deltaSeconds * response);
    this.current = interpolatePose(this.current, this.target, alpha);

    return this.current;
  }
}

function interpolatePose(from: PosePacket, to: PosePacket, alpha: number): PosePacket {
  return {
    timestamp: to.timestamp,
    position: {
      x: lerp(from.position.x, to.position.x, alpha),
      y: lerp(from.position.y, to.position.y, alpha),
      z: lerp(from.position.z, to.position.z, alpha)
    },
    rotation: {
      yaw: lerpAngle(from.rotation.yaw, to.rotation.yaw, alpha),
      pitch: lerpAngle(from.rotation.pitch, to.rotation.pitch, alpha),
      roll: lerpAngle(from.rotation.roll, to.rotation.roll, alpha)
    },
    fov: lerp(from.fov, to.fov, alpha)
  };
}

function lerp(from: number, to: number, alpha: number) {
  return from + (to - from) * alpha;
}

function lerpAngle(from: number, to: number, alpha: number) {
  let delta = to - from;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return from + delta * alpha;
}
