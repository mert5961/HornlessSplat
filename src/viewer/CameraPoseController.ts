import * as THREE from 'three';
import type { PosePacket } from '../types/pose';

export class CameraPoseController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly homePosition = new THREE.Vector3(0, 0.35, 4);
  private readonly homeQuaternion = new THREE.Quaternion();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.position.copy(this.homePosition);
    this.camera.quaternion.copy(this.homeQuaternion);
  }

  applyPose(packet: PosePacket) {
    const packetPosition = new THREE.Vector3(packet.position.x, packet.position.y, packet.position.z);
    const packetQuaternion = quaternionFromYawPitchRoll(
      packet.rotation.yaw,
      packet.rotation.pitch,
      packet.rotation.roll
    );

    this.camera.position.copy(this.homePosition).add(packetPosition);
    this.camera.quaternion.copy(this.homeQuaternion).multiply(packetQuaternion);
    this.camera.fov = packet.fov;
    this.camera.updateProjectionMatrix();
  }
}

function quaternionFromYawPitchRoll(yaw: number, pitch: number, roll: number) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
}
