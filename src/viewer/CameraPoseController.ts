import * as THREE from 'three';
import type { PosePacket } from '../types/pose';

/** Applies a calibrated, scene-space pose directly to the virtual camera. */
export class CameraPoseController {
  private readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  applyPose(packet: PosePacket) {
    this.camera.position.set(packet.position.x, packet.position.y, packet.position.z);
    this.camera.quaternion.set(packet.rotation.x, packet.rotation.y, packet.rotation.z, packet.rotation.w);

    if (this.camera.fov !== packet.fov) {
      this.camera.fov = packet.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
