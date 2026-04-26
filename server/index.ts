import { WebSocket, WebSocketServer } from 'ws';
import { FakePoseGenerator } from './fakePoseGenerator';
import type { AndroidArCorePosePacket, PosePacket, PoseServerControlPacket, PoseSource } from './poseTypes';

const port = Number(process.env.POSE_PORT ?? 8787);
const sendRateHz = Number(process.env.POSE_RATE_HZ ?? 60);
const intervalMs = Math.max(1, Math.round(1000 / sendRateHz));
const generator = new FakePoseGenerator();
const wss = new WebSocketServer({ port });

let activeSource: PoseSource = 'fake';
let latestAndroidPose: PosePacket | undefined;
let latestAndroidReceivedMs = 0;

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

const interval = setInterval(() => {
  if (activeSource === 'fake') {
    broadcastPose(generator.next());
    return;
  }

  if (latestAndroidPose && Date.now() - latestAndroidReceivedMs < 1000) {
    broadcastPose(latestAndroidPose);
  }
}, intervalMs);

wss.on('listening', () => {
  console.log(`[pose] listening at ws://127.0.0.1:${port}`);
  console.log(`[pose] source=fake at ${sendRateHz} Hz; Android senders can post source=android-arcore packets`);
});

function handleClientMessage(socket: WebSocket, data: WebSocket.RawData) {
  const text = data.toString();
  let packet: unknown;

  try {
    packet = JSON.parse(text);
  } catch {
    return;
  }

  if (isPoseServerControlPacket(packet)) {
    activeSource = packet.source;
    broadcastServerState();
    return;
  }

  if (isAndroidArCorePosePacket(packet)) {
    latestAndroidPose = normalizeAndroidPose(packet);
    latestAndroidReceivedMs = Date.now();

    if (activeSource === 'android-arcore') {
      broadcastPose(latestAndroidPose);
    } else {
      socket.send(JSON.stringify(createServerStatePacket()));
    }
  }
}

function broadcastPose(packet: PosePacket) {
  const message = JSON.stringify(packet);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function broadcastServerState() {
  const message = JSON.stringify(createServerStatePacket());

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function createServerStatePacket() {
  return {
    type: 'poseServerState',
    activeSource,
    androidTrackingState: latestAndroidPose?.trackingState ?? 'unavailable',
    androidConnected: Boolean(latestAndroidPose && Date.now() - latestAndroidReceivedMs < 1000)
  };
}

function normalizeAndroidPose(packet: AndroidArCorePosePacket): PosePacket {
  return {
    source: 'android-arcore',
    timestamp: packet.timestamp,
    position: packet.position,
    rotation: quaternionToYawPitchRoll(packet.rotation),
    fov: 58,
    trackingState: packet.trackingState
  };
}

function quaternionToYawPitchRoll(rotation: AndroidArCorePosePacket['rotation']) {
  const x = rotation.qx;
  const y = rotation.qy;
  const z = rotation.qz;
  const w = rotation.qw;

  const test = 2 * (w * x - y * z);
  const pitch = Math.asin(clamp(test, -1, 1));
  const yaw = Math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y));
  const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));

  return { yaw, pitch, roll };
}

function isPoseServerControlPacket(packet: unknown): packet is PoseServerControlPacket {
  const candidate = packet as PoseServerControlPacket;

  return (
    candidate?.type === 'setPoseSource' &&
    (candidate.source === 'fake' || candidate.source === 'android-arcore')
  );
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shutdown() {
  clearInterval(interval);
  wss.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
