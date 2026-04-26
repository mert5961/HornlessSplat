export type VideoDevice = {
  deviceId: string;
  groupId: string;
  label: string;
};

export type VideoQuality = 'low' | 'medium' | 'high';

export type VideoInputSnapshot = {
  devices: VideoDevice[];
  selectedDeviceId: string;
  selectedDeviceLabel: string;
  active: boolean;
  width: number;
  height: number;
  fps: number;
  droppedFrames: number;
  quality: VideoQuality;
  needsPermission: boolean;
  statusMessage?: string;
  error?: string;
};

type VideoInputListener = (snapshot: VideoInputSnapshot) => void;

const savedDeviceIdKey = 'hornlesssplat.video.deviceId';
const virtualCameraPattern = /\b(ndi|obs|virtual|capture)\b/i;

const videoQualityConstraints: Record<VideoQuality, { width: number; height: number; maxWidth: number; maxHeight: number }> = {
  low: { width: 640, height: 360, maxWidth: 1280, maxHeight: 720 },
  medium: { width: 1280, height: 720, maxWidth: 1280, maxHeight: 720 },
  high: { width: 1920, height: 1080, maxWidth: 1920, maxHeight: 1080 }
};

type VideoFrameMetadata = {
  presentedFrames: number;
  width: number;
  height: number;
};

type VideoFrameCallback = (now: number, metadata: VideoFrameMetadata) => void;

type VideoElementWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: VideoFrameCallback) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class VideoInput {
  readonly videoElement: HTMLVideoElement;

  private devices: VideoDevice[] = [];
  private selectedDeviceId = '';
  private stream?: MediaStream;
  private width = 0;
  private height = 0;
  private fps = 0;
  private droppedFrames = 0;
  private quality: VideoQuality = 'low';
  private hasRequestedPermission = false;
  private statusMessage?: string;
  private error?: string;
  private frameCallbackHandle?: number;
  private animationFrameHandle?: number;
  private lastPresentedFrames = 0;
  private lastFrameTimeMs = 0;
  private lastQualityFrames = 0;
  private lastQualityTimeMs = 0;
  private lastNotifyMs = 0;
  private readonly listeners = new Set<VideoInputListener>();

  constructor() {
    this.videoElement = document.createElement('video');
    this.videoElement.className = 'video-input';
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.selectedDeviceId = loadSavedDeviceId();

    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      void this.refreshDevices();
    });
  }

  onChange(listener: VideoInputListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  async refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.error = 'media devices are not available';
      this.devices = [];
      this.notify(true);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          label: device.label || `Camera ${index + 1}`
        }));

      if (this.selectedDeviceId && !this.devices.some((device) => device.deviceId === this.selectedDeviceId)) {
        this.selectedDeviceId = '';
        clearSavedDeviceId();
        this.statusMessage = 'stale saved device removed';
      } else {
        const virtualCamera = this.devices.find((device) => virtualCameraPattern.test(device.label));

        if (virtualCamera) {
          this.statusMessage = `virtual camera detected: ${virtualCamera.label}`;
        }
      }

      this.error = undefined;
      this.notify(true);
    } catch (error) {
      this.devices = [];
      this.error = error instanceof Error ? error.message : 'could not enumerate video devices';
      this.notify(true);
    }
  }

  setSelectedDeviceId(deviceId: string) {
    this.selectedDeviceId = deviceId;
    this.notify(true);
  }

  setQuality(quality: VideoQuality) {
    this.quality = quality;
    this.statusMessage = `video quality set to ${quality}`;
    this.notify(true);
  }

  resetSettings() {
    clearSavedDeviceId();
    this.selectedDeviceId = '';
    this.statusMessage = 'video settings reset';
    this.error = undefined;
    this.notify(true);
  }

  async start(deviceId = this.selectedDeviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'getUserMedia is not available in this browser';
      this.notify(true);
      return;
    }

    this.stop();
    this.hasRequestedPermission = true;
    this.selectedDeviceId = deviceId;
    this.error = undefined;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(getLowLatencyVideoConstraints(deviceId, this.quality));
      await this.attachStream();
    } catch (error) {
      if (deviceId && isMissingRequestedDeviceError(error)) {
        this.stop();
        this.selectedDeviceId = '';
        clearSavedDeviceId();
        this.statusMessage = 'retrying default camera';
        this.error = undefined;
        this.notify(true);

        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
          });
          await this.attachStream();
          return;
        } catch (fallbackError) {
          this.stop();
          this.error = fallbackError instanceof Error ? fallbackError.message : 'could not start default video stream';
          this.notify(true);
          return;
        }
      }

      this.stop();
      this.error = error instanceof Error ? error.message : 'could not start video stream';
      this.notify(true);
    }
  }

  private async attachStream() {
    this.videoElement.srcObject = this.stream ?? null;
    await this.videoElement.play();
    this.syncTrackSettings();
    this.startFpsCounter();
    await this.refreshDevices();
    saveSelectedDeviceId(this.selectedDeviceId);
    this.notify(true);
  }

  stop() {
    this.stopFpsCounter();

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }

    this.stream = undefined;
    this.videoElement.srcObject = null;
    this.width = 0;
    this.height = 0;
    this.fps = 0;
    this.droppedFrames = 0;
    this.notify(true);
  }

  async requestPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'getUserMedia is not available in this browser';
      this.notify(true);
      return;
    }

    this.hasRequestedPermission = true;
    this.error = undefined;

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      });

      for (const track of permissionStream.getTracks()) {
        track.stop();
      }

      await this.refreshDevices();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'camera permission was not granted';
      this.notify(true);
    }
  }

  getSnapshot(): VideoInputSnapshot {
    const selectedDevice = this.devices.find((device) => device.deviceId === this.selectedDeviceId);

    return {
      devices: [...this.devices],
      selectedDeviceId: this.selectedDeviceId,
      selectedDeviceLabel: selectedDevice?.label ?? '--',
      active: Boolean(this.stream?.active),
      width: this.width,
      height: this.height,
      fps: this.fps,
      droppedFrames: this.droppedFrames,
      quality: this.quality,
      needsPermission: this.devices.length === 0 && !this.hasRequestedPermission,
      statusMessage: this.statusMessage,
      error: this.error
    };
  }

  private syncTrackSettings() {
    const settings = this.stream?.getVideoTracks()[0]?.getSettings();

    if (!settings) {
      return;
    }

    this.selectedDeviceId = settings.deviceId ?? this.selectedDeviceId;
    this.width = settings.width ?? this.videoElement.videoWidth;
    this.height = settings.height ?? this.videoElement.videoHeight;
  }

  setVisible(visible: boolean) {
    if (visible) {
      if (this.stream && this.videoElement.paused) {
        void this.videoElement.play();
      }
      return;
    }

    if (!this.videoElement.paused) {
      this.videoElement.pause();
    }
  }

  private startFpsCounter() {
    this.stopFpsCounter();
    this.lastPresentedFrames = 0;
    this.lastFrameTimeMs = 0;
    this.lastQualityFrames = 0;
    this.lastQualityTimeMs = 0;

    const video = this.videoElement as VideoElementWithFrameCallback;

    if (video.requestVideoFrameCallback) {
      const updateFrameRate: VideoFrameCallback = (now, metadata) => {
        const frameDelta = metadata.presentedFrames - this.lastPresentedFrames;
        const timeDeltaSeconds = (now - this.lastFrameTimeMs) / 1000;

        if (this.lastFrameTimeMs > 0 && frameDelta > 0 && timeDeltaSeconds > 0) {
          const instantFps = frameDelta / timeDeltaSeconds;
          this.fps = this.fps === 0 ? instantFps : this.fps * 0.8 + instantFps * 0.2;
        }

        this.width = metadata.width || this.videoElement.videoWidth || this.width;
        this.height = metadata.height || this.videoElement.videoHeight || this.height;
        this.syncPlaybackQuality();
        this.lastPresentedFrames = metadata.presentedFrames;
        this.lastFrameTimeMs = now;
        this.notify();
        this.frameCallbackHandle = video.requestVideoFrameCallback?.(updateFrameRate);
      };

      this.frameCallbackHandle = video.requestVideoFrameCallback(updateFrameRate);
      return;
    }

    this.startPlaybackQualityCounter();
  }

  private startPlaybackQualityCounter() {
    const updateFrameRate = (now: number) => {
      const quality = this.videoElement.getVideoPlaybackQuality?.();

      if (quality && this.lastQualityTimeMs > 0) {
        const timeDeltaSeconds = (now - this.lastQualityTimeMs) / 1000;
        const frameDelta = quality.totalVideoFrames - this.lastQualityFrames;

        if (timeDeltaSeconds >= 0.5 && frameDelta >= 0) {
          const instantFps = frameDelta / timeDeltaSeconds;
          this.fps = this.fps === 0 ? instantFps : this.fps * 0.8 + instantFps * 0.2;
          this.lastQualityFrames = quality.totalVideoFrames;
          this.lastQualityTimeMs = now;
        }
      } else if (quality) {
        this.lastQualityFrames = quality.totalVideoFrames;
        this.lastQualityTimeMs = now;
      }

      this.width = this.videoElement.videoWidth || this.width;
      this.height = this.videoElement.videoHeight || this.height;
      this.syncPlaybackQuality();
      this.notify();
      this.animationFrameHandle = requestAnimationFrame(updateFrameRate);
    };

    this.animationFrameHandle = requestAnimationFrame(updateFrameRate);
  }

  private stopFpsCounter() {
    const video = this.videoElement as VideoElementWithFrameCallback;

    if (this.frameCallbackHandle !== undefined && video.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(this.frameCallbackHandle);
    }

    if (this.animationFrameHandle !== undefined) {
      cancelAnimationFrame(this.animationFrameHandle);
    }

    this.frameCallbackHandle = undefined;
    this.animationFrameHandle = undefined;
  }

  private syncPlaybackQuality() {
    const quality = this.videoElement.getVideoPlaybackQuality?.();

    if (quality) {
      this.droppedFrames = quality.droppedVideoFrames;
    }
  }

  private notify(force = false) {
    const now = performance.now();

    if (!force && now - this.lastNotifyMs < 250) {
      return;
    }

    this.lastNotifyMs = now;
    const snapshot = this.getSnapshot();

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

function getLowLatencyVideoConstraints(deviceId: string, quality: VideoQuality): MediaStreamConstraints {
  const constraints = videoQualityConstraints[quality];

  return {
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      width: { ideal: constraints.width, max: constraints.maxWidth },
      height: { ideal: constraints.height, max: constraints.maxHeight },
      frameRate: { ideal: 30, max: 30 }
    }
  };
}

function isMissingRequestedDeviceError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'OverconstrainedError' ||
    error.name === 'NotFoundError' ||
    error.message.toLowerCase().includes('requested device not found')
  );
}

function loadSavedDeviceId() {
  try {
    return window.localStorage.getItem(savedDeviceIdKey) ?? '';
  } catch {
    return '';
  }
}

function saveSelectedDeviceId(deviceId: string) {
  if (!deviceId) {
    return;
  }

  try {
    window.localStorage.setItem(savedDeviceIdKey, deviceId);
  } catch {
    // Ignore storage failures; the active stream still works.
  }
}

function clearSavedDeviceId() {
  try {
    window.localStorage.removeItem(savedDeviceIdKey);
  } catch {
    // Ignore storage failures; reset should still clear in-memory selection.
  }
}
