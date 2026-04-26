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

export type AndroidArCorePosePacket = {
  source: 'android-arcore';
  timestamp: number;
  position: Vec3Packet;
  rotation: {
    qx: number;
    qy: number;
    qz: number;
    qw: number;
  };
  trackingState: string;
};

export type PoseServerControlPacket = {
  type: 'setPoseSource';
  source: PoseSource;
};
