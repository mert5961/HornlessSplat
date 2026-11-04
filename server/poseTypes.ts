export type { PosePacket, PoseSource, QuaternionPacket, Vec3Packet } from '../src/types/pose';
import type { PoseSource, Vec3Packet } from '../src/types/pose';

export type CameraIntrinsicsPacket = {
  /** Focal length in pixels. */
  fx: number;
  fy: number;
  /** Principal point in pixels. */
  cx: number;
  cy: number;
  /** Image size in pixels, in the sensor's native (usually landscape) orientation. */
  width: number;
  height: number;
};

export type AndroidArCorePosePacket = {
  source: 'android-arcore';
  /** Capture time in ms. In the server clock domain when `clockSynced` is true. */
  timestamp: number;
  clockSynced?: boolean;
  /** ARCore frame timestamp (ns, arbitrary epoch). Monotonic; used for dedupe and jitter checks. */
  frameTimestampNs?: number;
  position: Vec3Packet;
  rotation: {
    qx: number;
    qy: number;
    qz: number;
    qw: number;
  };
  trackingState: string;
  intrinsics?: CameraIntrinsicsPacket;
  /** android.view.Surface rotation constant: 0, 1 (90), 2 (180), 3 (270). */
  displayRotation?: number;
};

export type PoseServerControlPacket = {
  type: 'setPoseSource';
  source: PoseSource;
};

export type ClockSyncRequestPacket = {
  type: 'clockSyncRequest';
  /** Sender's clock at send time, in ms. */
  clientSendMs: number;
};

export type ClockSyncResponsePacket = {
  type: 'clockSyncResponse';
  clientSendMs: number;
  serverMs: number;
};
