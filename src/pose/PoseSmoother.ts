import * as THREE from 'three';
import type { PosePacket } from '../types/pose';

export class PoseSmoother {
  private target?: PosePacket;
  private current?: PosePacket;
  private enabled = true;
  private strength = 0.45;
  private readonly fromQuaternion = new THREE.Quaternion();
  private readonly toQuaternion = new THREE.Quaternion();

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

    // Frame-rate independent exponential smoothing.
    const response = 32 - this.strength * 28;
    const alpha = 1 - Math.exp(-deltaSeconds * response);
    this.current = this.interpolatePose(this.current, this.target, alpha);

    return this.current;
  }

  private interpolatePose(from: PosePacket, to: PosePacket, alpha: number): PosePacket {
    // slerp takes the shortest arc, so there is no angle wrap-around to handle.
    const rotation = this.fromQuaternion
      .set(from.rotation.x, from.rotation.y, from.rotation.z, from.rotation.w)
      .slerp(this.toQuaternion.set(to.rotation.x, to.rotation.y, to.rotation.z, to.rotation.w), alpha);

    return {
      ...to,
      position: {
        x: lerp(from.position.x, to.position.x, alpha),
        y: lerp(from.position.y, to.position.y, alpha),
        z: lerp(from.position.z, to.position.z, alpha)
      },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      fov: lerp(from.fov, to.fov, alpha)
    };
  }
}

function lerp(from: number, to: number, alpha: number) {
  return from + (to - from) * alpha;
}
