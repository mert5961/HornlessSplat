export type Vec3Packet = {
  x: number;
  y: number;
  z: number;
};

export type RotationPacket = {
  yaw: number;
  pitch: number;
  roll: number;
};

export type PoseSource = 'fake' | 'android-arcore';

export type PosePacket = {
  source?: PoseSource;
  timestamp: number;
  position: Vec3Packet;
  rotation: RotationPacket;
  fov: number;
  trackingState?: string;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
