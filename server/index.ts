import { WebSocket, WebSocketServer } from 'ws';
import { FakePoseGenerator } from './fakePoseGenerator';
import type {
  AndroidArCorePosePacket,
  CameraIntrinsicsPacket,
  ClockSyncRequestPacket,
  ClockSyncResponsePacket,
  PosePacket,
  PoseServerControlPacket,
  PoseSource
} from './poseTypes';

const port = Number(process.env.POSE_PORT ?? 8787);
const sendRateHz = Number(process.env.POSE_RATE_HZ ?? 60);
const intervalMs = Math.max(1, Math.round(1000 / sendRateHz));
const androidStaleMs = 1000;
const defaultFovDegrees = 58;
const generator = new FakePoseGenerator();
const wss = new WebSocketServer({ port });

/** Sockets that have sent tracking data. They produce poses and never receive them. */
const senderSockets = new WeakSet<WebSocket>();

let activeSource: PoseSource = 'fake';
let latestAndroidPose: PosePacket | undefined;
let latestAndroidReceivedMs = 0;
let latestAndroidFrameNs: number | undefined;
let lastStateMessage = '';

wss.on('connection', (socket, request) => {
  const client = `${request.socket.remoteAddress ?? 'local'}:${request.socket.remotePort ?? ''}`;
  console.log(`[pose] client connected ${client}`);
  socket.send(JSON.stringify(createServerStatePacket()));

  socket.on('message', (data) => {
    handleClientMessage(socket, data);
  });

  socket.on('close', () => {
    console.log(`[pose] client disconnected ${client}`);
  });
});

// The fake source is the only one driven by a timer. Android poses are forwarded
// once, when they arrive, so viewers never receive the same pose twice.
const fakeInterval = setInterval(() => {
  if (activeSource === 'fake') {
    broadcastToViewers(JSON.stringify(generator.next()));
  }
}, intervalMs);

// Viewers need to learn when the Android sender goes stale, even when no packets arrive.
const stateInterval = setInterval(() => {
  broadcastServerStateIfChanged();
}, 250);

wss.on('listening', () => {
  console.log(`[pose] listening at ws://127.0.0.1:${port}`);
  console.log(`[pose] source=fake at ${sendRateHz} Hz; Android senders can post source=android-arcore packets`);
});

function handleClientMessage(socket: WebSocket, data: WebSocket.RawData) {
  let packet: unknown;

  try {
    packet = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (isClockSyncRequestPacket(packet)) {
    senderSockets.add(socket);
    const response: ClockSyncResponsePacket = {
      type: 'clockSyncResponse',
      clientSendMs: packet.clientSendMs,
      serverMs: Date.now()
    };
    socket.send(JSON.stringify(response));
    return;
  }

  if (isPoseServerControlPacket(packet)) {
    activeSource = packet.source;
    broadcastServerStateIfChanged();
    return;
  }

  if (isAndroidArCorePosePacket(packet)) {
    senderSockets.add(socket);

    // ARCore can report the same camera frame more than once; drop repeats.
    if (packet.frameTimestampNs !== undefined && packet.frameTimestampNs === latestAndroidFrameNs) {
      return;
    }

    latestAndroidFrameNs = packet.frameTimestampNs;
    latestAndroidPose = normalizeAndroidPose(packet);
    latestAndroidReceivedMs = Date.now();

    if (activeSource === 'android-arcore') {
      broadcastToViewers(JSON.stringify(latestAndroidPose));
    }

    broadcastServerStateIfChanged();
  }
}

function broadcastToViewers(message: string) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && !senderSockets.has(client)) {
      client.send(message);
    }
  }
}

function broadcastServerStateIfChanged() {
  const message = JSON.stringify(createServerStatePacket());

  if (message === lastStateMessage) {
    return;
  }

  lastStateMessage = message;
  broadcastToViewers(message);
}

function createServerStatePacket() {
  return {
    type: 'poseServerState',
    activeSource,
    androidTrackingState: latestAndroidPose?.trackingState ?? 'unavailable',
    androidConnected: Boolean(latestAndroidPose && Date.now() - latestAndroidReceivedMs < androidStaleMs),
    androidClockSynced: latestAndroidPose?.clockSynced ?? false
  };
}

function normalizeAndroidPose(packet: AndroidArCorePosePacket): PosePacket {
  // ARCore world space and Three.js share conventions (right-handed, +Y up, camera looks down -Z),
  // so the quaternion passes straight through. Any mount or axis correction happens in calibration.
  return {
    source: 'android-arcore',
    timestamp: packet.timestamp,
    clockSynced: packet.clockSynced ?? false,
    position: packet.position,
    rotation: normalizeQuaternion(packet.rotation.qx, packet.rotation.qy, packet.rotation.qz, packet.rotation.qw),
    fov: verticalFovFromIntrinsics(packet.intrinsics, packet.displayRotation) ?? defaultFovDegrees,
    trackingState: packet.trackingState
  };
}

/**
 * Vertical FOV, in degrees, as seen in the phone's current display orientation.
 * Intrinsics are reported in the sensor's native landscape orientation, so in portrait
 * the image width is the vertical extent.
 */
function verticalFovFromIntrinsics(intrinsics: CameraIntrinsicsPacket | undefined, displayRotation = 0) {
  if (!intrinsics || intrinsics.fx <= 0 || intrinsics.fy <= 0 || intrinsics.width <= 0 || intrinsics.height <= 0) {
    return undefined;
  }

  const portrait = displayRotation === 0 || displayRotation === 2;
  const extentPx = portrait ? intrinsics.width : intrinsics.height;
  const focalPx = portrait ? intrinsics.fx : intrinsics.fy;
  const fov = (2 * Math.atan(extentPx / (2 * focalPx)) * 180) / Math.PI;

  return Number.isFinite(fov) && fov > 1 && fov < 179 ? fov : undefined;
}

function normalizeQuaternion(x: number, y: number, z: number, w: number) {
  const length = Math.hypot(x, y, z, w) || 1;
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}

function isPoseServerControlPacket(packet: unknown): packet is PoseServerControlPacket {
  const candidate = packet as PoseServerControlPacket;

  return (
    candidate?.type === 'setPoseSource' &&
    (candidate.source === 'fake' || candidate.source === 'android-arcore')
  );
}

function isClockSyncRequestPacket(packet: unknown): packet is ClockSyncRequestPacket {
  const candidate = packet as ClockSyncRequestPacket;
  return candidate?.type === 'clockSyncRequest' && typeof candidate.clientSendMs === 'number';
}

function isAndroidArCorePosePacket(packet: unknown): packet is AndroidArCorePosePacket {
  const candidate = packet as AndroidArCorePosePacket;

  return (
    candidate?.source === 'android-arcore' &&
    typeof candidate.timestamp === 'number' &&
    typeof candidate.position?.x === 'number' &&
    typeof candidate.position?.y === 'number' &&
    typeof candidate.position?.z === 'number' &&
    typeof candidate.rotation?.qx === 'number' &&
    typeof candidate.rotation?.qy === 'number' &&
    typeof candidate.rotation?.qz === 'number' &&
    typeof candidate.rotation?.qw === 'number' &&
    typeof candidate.trackingState === 'string'
  );
}

function shutdown() {
  clearInterval(fakeInterval);
  clearInterval(stateInterval);
  wss.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
