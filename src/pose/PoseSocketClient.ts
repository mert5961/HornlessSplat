import type { ConnectionStatus, PosePacket, PoseSource } from '../types/pose';

export type PoseServerState = {
  type: 'poseServerState';
  activeSource: PoseSource;
  androidTrackingState: string;
  androidConnected: boolean;
};

export type PoseSocketClientOptions = {
  url: string;
  reconnectDelayMs?: number;
  onPose: (packet: PosePacket) => void;
  onServerState?: (state: PoseServerState) => void;
  onStatusChange: (status: ConnectionStatus) => void;
};

export class PoseSocketClient {
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private manuallyClosed = false;
  private readonly url: string;
  private readonly reconnectDelayMs: number;
  private readonly onPose: (packet: PosePacket) => void;
  private readonly onServerState?: (state: PoseServerState) => void;
  private readonly onStatusChange: (status: ConnectionStatus) => void;
  private desiredPoseSource: PoseSource = 'fake';

  constructor(options: PoseSocketClientOptions) {
    this.url = options.url;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000;
    this.onPose = options.onPose;
    this.onServerState = options.onServerState;
    this.onStatusChange = options.onStatusChange;
  }

  connect() {
    this.manuallyClosed = false;
    this.openSocket();
  }

  close() {
    this.manuallyClosed = true;

    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer);
    }

    this.socket?.close();
  }

  setPoseSource(source: PoseSource) {
    this.desiredPoseSource = source;
    const message = JSON.stringify({
      type: 'setPoseSource',
      source
    });

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    }
  }

  private openSocket() {
    this.onStatusChange('connecting');
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener('open', () => {
      this.onStatusChange('connected');
      this.setPoseSource(this.desiredPoseSource);
    });

    this.socket.addEventListener('message', (event) => {
      const packet = this.parsePacket(event.data);

      if (packet) {
        this.onPose(packet);
      }
    });

    this.socket.addEventListener('error', () => {
      this.onStatusChange('error');
    });

    this.socket.addEventListener('close', () => {
      this.onStatusChange('disconnected');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.manuallyClosed) {
      return;
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.openSocket();
    }, this.reconnectDelayMs);
  }

  private parsePacket(data: unknown): PosePacket | undefined {
    try {
      const packet = JSON.parse(String(data)) as PosePacket | PoseServerState;

      if (isPoseServerState(packet)) {
        this.onServerState?.(packet);
        return undefined;
      }

      if (
        typeof packet.timestamp === 'number' &&
        typeof packet.position?.x === 'number' &&
        typeof packet.position?.y === 'number' &&
        typeof packet.position?.z === 'number' &&
        typeof packet.rotation?.yaw === 'number' &&
        typeof packet.rotation?.pitch === 'number' &&
        typeof packet.rotation?.roll === 'number' &&
        typeof packet.fov === 'number'
      ) {
        return packet;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }
}

function isPoseServerState(packet: PosePacket | PoseServerState): packet is PoseServerState {
  return (
    (packet as PoseServerState).type === 'poseServerState' &&
    ((packet as PoseServerState).activeSource === 'fake' ||
      (packet as PoseServerState).activeSource === 'android-arcore')
  );
}
