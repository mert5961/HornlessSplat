import { displayModeLabels, type DisplayMode } from '../video/displayModes';
import type { VideoInputSnapshot, VideoQuality } from '../video/VideoInput';

export type RenderScale = 0.5 | 0.75 | 1;
export type SplatFpsCap = 10 | 15 | 24 | 30 | 60;

export type VideoControlPanelState = {
  video: VideoInputSnapshot;
  displayMode: DisplayMode;
  splatOpacity: number;
  renderScale: RenderScale;
  splatFpsCap: SplatFpsCap;
};

export type VideoControlPanelOptions = VideoControlPanelState & {
  onDeviceChange: (deviceId: string) => void;
  onRequestPermission: () => void;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onResetVideoSettings: () => void;
  onVideoQualityChange: (quality: VideoQuality) => void;
  onRenderScaleChange: (scale: RenderScale) => void;
  onSplatFpsCapChange: (fpsCap: SplatFpsCap) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onSplatOpacityChange: (opacity: number) => void;
};

export class VideoControlPanel {
  private readonly element: HTMLElement;
  private readonly deviceSelect: HTMLSelectElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly displayModeSelect: HTMLSelectElement;
  private readonly renderScaleSelect: HTMLSelectElement;
  private readonly splatFpsCapSelect: HTMLSelectElement;
  private readonly opacityInput: HTMLInputElement;
  private readonly opacityOutput: HTMLOutputElement;
  private readonly resolutionValue: HTMLElement;
  private readonly fpsValue: HTMLElement;
  private readonly droppedValue: HTMLElement;
  private readonly statusValue: HTMLElement;
  private readonly errorValue: HTMLElement;
  private state: VideoControlPanelState;
  private deviceOptionsKey = '';

  constructor(root: HTMLElement, options: VideoControlPanelOptions) {
    this.state = {
      video: options.video,
      displayMode: options.displayMode,
      splatOpacity: options.splatOpacity,
      renderScale: options.renderScale,
      splatFpsCap: options.splatFpsCap
    };
    this.element = document.createElement('section');
    this.element.className = 'video-panel';
    this.element.innerHTML = `
      <div class="video-panel__header">
        <h2>Video</h2>
      </div>
      <div class="video-panel__body">
        <div class="control-row">
          <label for="videoDevice">Camera device</label>
          <select id="videoDevice"></select>
        </div>
        <div class="video-panel__actions">
          <button type="button" data-action="permission">Grant Access</button>
          <button type="button" data-action="start">Start Video</button>
          <button type="button" data-action="stop">Stop Video</button>
          <button type="button" data-action="refresh">Refresh Devices</button>
          <button type="button" data-action="reset-video">Reset Video Settings</button>
        </div>
        <div class="control-row">
          <label for="videoQuality">Video quality</label>
          <select id="videoQuality">
            <option value="low">Low (640 x 360)</option>
            <option value="medium">Medium (1280 x 720)</option>
            <option value="high">High (1920 x 1080)</option>
          </select>
        </div>
        <div class="control-row">
          <label for="displayMode">Display mode</label>
          <select id="displayMode"></select>
        </div>
        <div class="control-row">
          <label for="renderScale">Render scale</label>
          <select id="renderScale">
            <option value="0.5">0.5</option>
            <option value="0.75">0.75</option>
            <option value="1">1.0</option>
          </select>
        </div>
        <div class="control-row">
          <label for="splatFpsCap">Splat FPS cap</label>
          <select id="splatFpsCap">
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="24">24</option>
            <option value="30">30</option>
            <option value="60">60</option>
          </select>
        </div>
        <div class="control-row">
          <label for="splatOpacity">Splat opacity</label>
          <input id="splatOpacity" type="range" min="0" max="1" step="0.01" />
          <output id="splatOpacityValue"></output>
        </div>
        <dl class="video-panel__stats">
          <dt>resolution</dt><dd data-stat="resolution">--</dd>
          <dt>fps</dt><dd data-stat="fps">--</dd>
          <dt>dropped</dt><dd data-stat="dropped">--</dd>
          <dt>stream</dt><dd data-stat="status">inactive</dd>
        </dl>
        <p class="video-panel__error" data-stat="error" hidden></p>
      </div>
    `;

    root.appendChild(this.element);

    this.deviceSelect = this.requireElement<HTMLSelectElement>('#videoDevice');
    this.qualitySelect = this.requireElement<HTMLSelectElement>('#videoQuality');
    this.displayModeSelect = this.requireElement<HTMLSelectElement>('#displayMode');
    this.renderScaleSelect = this.requireElement<HTMLSelectElement>('#renderScale');
    this.splatFpsCapSelect = this.requireElement<HTMLSelectElement>('#splatFpsCap');
    this.opacityInput = this.requireElement<HTMLInputElement>('#splatOpacity');
    this.opacityOutput = this.requireElement<HTMLOutputElement>('#splatOpacityValue');
    this.resolutionValue = this.requireElement<HTMLElement>('[data-stat="resolution"]');
    this.fpsValue = this.requireElement<HTMLElement>('[data-stat="fps"]');
    this.droppedValue = this.requireElement<HTMLElement>('[data-stat="dropped"]');
    this.statusValue = this.requireElement<HTMLElement>('[data-stat="status"]');
    this.errorValue = this.requireElement<HTMLElement>('[data-stat="error"]');

    this.populateDisplayModes();
    this.bindEvents(options);
    this.setState(this.state);
  }

  setState(state: VideoControlPanelState) {
    this.state = state;
    this.populateDevices();
    this.qualitySelect.value = state.video.quality;
    this.displayModeSelect.value = state.displayMode;
    this.renderScaleSelect.value = String(state.renderScale);
    this.splatFpsCapSelect.value = String(state.splatFpsCap);
    this.opacityInput.value = String(state.splatOpacity);
    this.opacityInput.disabled = state.displayMode !== 'overlay';
    this.opacityOutput.value = `${Math.round(state.splatOpacity * 100)}%`;
    this.resolutionValue.textContent =
      state.video.width > 0 && state.video.height > 0 ? `${state.video.width} x ${state.video.height}` : '--';
    this.fpsValue.textContent = state.video.fps > 0 ? state.video.fps.toFixed(1) : '--';
    this.droppedValue.textContent = String(state.video.droppedFrames);
    this.statusValue.textContent = state.video.active ? 'active' : 'inactive';
    this.errorValue.textContent =
      state.video.error ?? state.video.statusMessage ?? getPermissionHint(state.video.needsPermission);
    this.errorValue.hidden = !state.video.error && !state.video.statusMessage && !state.video.needsPermission;
  }

  private bindEvents(options: VideoControlPanelOptions) {
    this.deviceSelect.addEventListener('change', () => {
      options.onDeviceChange(this.deviceSelect.value);
    });
    this.qualitySelect.addEventListener('change', () => {
      options.onVideoQualityChange(this.qualitySelect.value as VideoQuality);
    });
    this.displayModeSelect.addEventListener('change', () => {
      options.onDisplayModeChange(this.displayModeSelect.value as DisplayMode);
    });
    this.renderScaleSelect.addEventListener('change', () => {
      options.onRenderScaleChange(Number(this.renderScaleSelect.value) as RenderScale);
    });
    this.splatFpsCapSelect.addEventListener('change', () => {
      options.onSplatFpsCapChange(Number(this.splatFpsCapSelect.value) as SplatFpsCap);
    });
    this.opacityInput.addEventListener('input', () => {
      options.onSplatOpacityChange(Number(this.opacityInput.value));
    });
    this.element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;

      if (action === 'permission') {
        options.onRequestPermission();
      } else if (action === 'start') {
        options.onStart();
      } else if (action === 'stop') {
        options.onStop();
      } else if (action === 'refresh') {
        options.onRefresh();
      } else if (action === 'reset-video') {
        options.onResetVideoSettings();
      }
    });
  }

  private populateDevices() {
    const selectedValue = this.state.video.selectedDeviceId;
    const optionsKey = this.state.video.devices
      .map((device) => `${device.deviceId}:${device.label}`)
      .join('|');

    if (optionsKey === this.deviceOptionsKey) {
      this.deviceSelect.value = selectedValue;
      return;
    }

    this.deviceOptionsKey = optionsKey;
    this.deviceSelect.replaceChildren();

    if (this.state.video.devices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No cameras found';
      this.deviceSelect.appendChild(option);
      this.deviceSelect.value = '';
      return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Default camera';
    this.deviceSelect.appendChild(defaultOption);

    for (const device of this.state.video.devices) {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label;
      this.deviceSelect.appendChild(option);
    }

    this.deviceSelect.value = selectedValue;
  }

  private populateDisplayModes() {
    this.displayModeSelect.replaceChildren();

    for (const [value, label] of Object.entries(displayModeLabels)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      this.displayModeSelect.appendChild(option);
    }
  }

  private requireElement<T extends HTMLElement>(selector: string) {
    const element = this.element.querySelector<T>(selector);

    if (!element) {
      throw new Error(`Video control panel element was not found: ${selector}`);
    }

    return element;
  }
}

function getPermissionHint(needsPermission: boolean) {
  return needsPermission ? 'Click Grant Access so the browser can reveal camera devices.' : '';
}
