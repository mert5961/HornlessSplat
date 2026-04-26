import { VideoInput } from './video/VideoInput';

export function startVideoDebugApp(root: HTMLDivElement) {
  const videoInput = new VideoInput();
  videoInput.videoElement.classList.add('video-debug__video');
  videoInput.videoElement.style.opacity = '1';
  videoInput.videoElement.style.transform = 'none';
  videoInput.videoElement.style.filter = 'none';
  videoInput.videoElement.style.willChange = 'auto';

  const app = document.createElement('main');
  app.className = 'video-debug';
  app.innerHTML = `
    <section class="video-debug__controls">
      <h1>Video Debug</h1>
      <label>
        <span>Camera device</span>
        <select data-role="device"></select>
      </label>
      <div class="video-debug__actions">
        <button type="button" data-action="start">Start</button>
        <button type="button" data-action="stop">Stop</button>
        <button type="button" data-action="refresh">Refresh</button>
      </div>
      <dl>
        <dt>resolution</dt><dd data-stat="resolution">--</dd>
        <dt>fps</dt><dd data-stat="fps">--</dd>
        <dt>dropped</dt><dd data-stat="dropped">0</dd>
        <dt>active</dt><dd data-stat="active">false</dd>
        <dt>fps source</dt><dd data-stat="fps-source">--</dd>
      </dl>
      <p data-stat="status" class="video-debug__status"></p>
    </section>
  `;

  const preview = document.createElement('section');
  preview.className = 'video-debug__preview';
  preview.appendChild(videoInput.videoElement);
  app.appendChild(preview);
  root.appendChild(app);

  const deviceSelect = requireElement<HTMLSelectElement>(app, '[data-role="device"]');
  const resolutionValue = requireElement<HTMLElement>(app, '[data-stat="resolution"]');
  const fpsValue = requireElement<HTMLElement>(app, '[data-stat="fps"]');
  const droppedValue = requireElement<HTMLElement>(app, '[data-stat="dropped"]');
  const activeValue = requireElement<HTMLElement>(app, '[data-stat="active"]');
  const sourceValue = requireElement<HTMLElement>(app, '[data-stat="fps-source"]');
  const statusValue = requireElement<HTMLElement>(app, '[data-stat="status"]');
  let deviceOptionsKey = '';

  sourceValue.textContent =
    'requestVideoFrameCallback' in videoInput.videoElement ? 'requestVideoFrameCallback' : 'playback quality fallback';

  deviceSelect.addEventListener('change', () => {
    videoInput.setSelectedDeviceId(deviceSelect.value);
  });

  app.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const action = target.dataset.action;

    if (action === 'start') {
      void videoInput.start(deviceSelect.value);
    } else if (action === 'stop') {
      videoInput.stop();
    } else if (action === 'refresh') {
      void videoInput.refreshDevices();
    }
  });

  videoInput.onChange((snapshot) => {
    const nextDeviceOptionsKey = snapshot.devices.map((device) => `${device.deviceId}:${device.label}`).join('|');

    if (nextDeviceOptionsKey !== deviceOptionsKey) {
      deviceOptionsKey = nextDeviceOptionsKey;
      deviceSelect.replaceChildren();

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Default camera';
      deviceSelect.appendChild(defaultOption);

      for (const device of snapshot.devices) {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label;
        deviceSelect.appendChild(option);
      }
    }

    deviceSelect.value = snapshot.selectedDeviceId;
    resolutionValue.textContent =
      snapshot.width > 0 && snapshot.height > 0 ? `${snapshot.width} x ${snapshot.height}` : '--';
    fpsValue.textContent = snapshot.fps > 0 ? snapshot.fps.toFixed(1) : '--';
    droppedValue.textContent = String(snapshot.droppedFrames);
    activeValue.textContent = String(snapshot.active);
    statusValue.textContent =
      snapshot.error ?? snapshot.statusMessage ?? (snapshot.needsPermission ? 'Press Start to grant camera access.' : '');
  });

  void videoInput.refreshDevices();
}

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Video debug element was not found: ${selector}`);
  }

  return element;
}
