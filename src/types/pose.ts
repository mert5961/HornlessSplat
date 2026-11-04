export type Vec3Packet = {
  x: number;
  y: number;
  z: number;
};

/** Unit quaternion. Same convention as THREE.Quaternion. */
export type QuaternionPacket = {
  x: number;
  y: number;
  z: number;
  w: number;
};

/**
 * Euler angles in radians, applied in YXZ order (yaw, then pitch, then roll).
 * Only used for human-facing values such as calibration offsets and debug output;
 * the pose pipeline itself works with quaternions.
 */
export type RotationPacket = {
  yaw: number;
  pitch: number;
  roll: number;
};

export type PoseSource = 'fake' | 'android-arcore';

export type PosePacket = {
  source?: PoseSource;
  /** Capture time in milliseconds, in the pose server's clock domain (Date.now() on the server). */
  timestamp: number;
  position: Vec3Packet;
  rotation: QuaternionPacket;
  /** Vertical field of view in degrees. */
  fov: number;
  trackingState?: string;
  /** Whether `timestamp` is synced to the server clock. Fake poses are always synced. */
  clockSynced?: boolean;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
