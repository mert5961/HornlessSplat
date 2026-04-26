import type { AxisName, PoseCalibrationSettings } from '../pose/PoseCalibration';

export type CalibrationPanelOptions = {
  settings: PoseCalibrationSettings;
  onChange: (settings: PoseCalibrationSettings) => void;
  onSetOrigin: () => void;
  onReset: () => void;
  onSave: () => void;
  onLoad: () => void;
};

type NumberPath =
  | 'positionScale'
  | 'positionOffset.x'
  | 'positionOffset.y'
  | 'positionOffset.z'
  | 'rotationOffset.yaw'
  | 'rotationOffset.pitch'
  | 'rotationOffset.roll'
  | 'smoothingStrength'
  | 'latencyOffsetMs';

export class CalibrationPanel {
  private readonly element: HTMLElement;
  private settings: PoseCalibrationSettings;
  private readonly onChange: (settings: PoseCalibrationSettings) => void;

  constructor(root: HTMLElement, options: CalibrationPanelOptions) {
    this.settings = structuredClone(options.settings);
    this.onChange = options.onChange;
    this.element = document.createElement('section');
    this.element.className = 'calibration-panel';
    root.appendChild(this.element);
    this.render(options);
  }

  setSettings(settings: PoseCalibrationSettings) {
    this.settings = structuredClone(settings);
    this.renderControls();
  }

  private render(options: CalibrationPanelOptions) {
    this.element.innerHTML = `
      <div class="calibration-panel__header">
        <h2>Calibration</h2>
      </div>
      <div class="calibration-panel__body">
        <div class="control-row">
          <label for="positionScale">Position scale</label>
          <input id="positionScale" data-number-path="positionScale" type="number" min="0.01" max="20" step="0.01" />
        </div>
        <fieldset>
          <legend>Position offset</legend>
          <div class="axis-grid">
            ${numberInput('X', 'positionOffset.x', 0.01)}
            ${numberInput('Y', 'positionOffset.y', 0.01)}
            ${numberInput('Z', 'positionOffset.z', 0.01)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Rotation offset</legend>
          <div class="axis-grid">
            ${numberInput('Yaw', 'rotationOffset.yaw', 0.001)}
            ${numberInput('Pitch', 'rotationOffset.pitch', 0.001)}
            ${numberInput('Roll', 'rotationOffset.roll', 0.001)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Axis remap</legend>
          <div class="axis-grid">
            ${axisSelect('X', 'x')}
            ${axisSelect('Y', 'y')}
            ${axisSelect('Z', 'z')}
          </div>
        </fieldset>
        <fieldset>
          <legend>Invert axes</legend>
          <div class="toggle-grid">
            ${toggleInput('Invert X', 'x')}
            ${toggleInput('Invert Y', 'y')}
            ${toggleInput('Invert Z', 'z')}
          </div>
        </fieldset>
        <div class="control-row">
          <label for="smoothingStrength">Smoothing strength</label>
          <input id="smoothingStrength" data-number-path="smoothingStrength" type="range" min="0" max="1" step="0.01" />
          <output id="smoothingStrengthValue"></output>
        </div>
        <div class="control-row">
          <label for="latencyOffsetMs">Latency offset ms</label>
          <input id="latencyOffsetMs" data-number-path="latencyOffsetMs" type="number" min="-1000" max="1000" step="1" />
        </div>
      </div>
      <div class="calibration-panel__actions">
        <button type="button" data-action="origin">Set Current Pose As Origin</button>
        <button type="button" data-action="reset">Reset Calibration</button>
        <button type="button" data-action="save">Save Calibration</button>
        <button type="button" data-action="load">Load Calibration</button>
      </div>
    `;

    this.element.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    this.element.addEventListener('change', (event) => {
      this.handleInput(event);
    });
    this.element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;

      if (action === 'origin') {
        options.onSetOrigin();
      } else if (action === 'reset') {
        options.onReset();
      } else if (action === 'save') {
        options.onSave();
      } else if (action === 'load') {
        options.onLoad();
      }
    });
    this.renderControls();
  }

  private handleInput(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const numberPath = target.dataset.numberPath as NumberPath | undefined;
    const remapAxis = target.dataset.remapAxis as AxisName | undefined;
    const invertAxis = target.dataset.invertAxis as AxisName | undefined;

    if (numberPath) {
      setNumberValue(this.settings, numberPath, Number(target.value));
    }

    if (remapAxis) {
      this.settings.axisRemap[remapAxis] = target.value as AxisName;
    }

    if (invertAxis && target instanceof HTMLInputElement) {
      this.settings.invert[invertAxis] = target.checked;
    }

    this.onChange(structuredClone(this.settings));
    this.renderControls();
  }

  private renderControls() {
    for (const input of this.element.querySelectorAll<HTMLInputElement>('[data-number-path]')) {
      const path = input.dataset.numberPath as NumberPath;
      input.value = String(getNumberValue(this.settings, path));
    }

    for (const select of this.element.querySelectorAll<HTMLSelectElement>('[data-remap-axis]')) {
      const axis = select.dataset.remapAxis as AxisName;
      select.value = this.settings.axisRemap[axis];
    }

    for (const input of this.element.querySelectorAll<HTMLInputElement>('[data-invert-axis]')) {
      const axis = input.dataset.invertAxis as AxisName;
      input.checked = this.settings.invert[axis];
    }

    const smoothingOutput = this.element.querySelector<HTMLOutputElement>('#smoothingStrengthValue');

    if (smoothingOutput) {
      smoothingOutput.value = this.settings.smoothingStrength.toFixed(2);
    }
  }
}

function numberInput(label: string, path: NumberPath, step: number) {
  return `
    <label>
      <span>${label}</span>
      <input data-number-path="${path}" type="number" step="${step}" />
    </label>
  `;
}

function axisSelect(label: string, outputAxis: AxisName) {
  return `
    <label>
      <span>${label}</span>
      <select data-remap-axis="${outputAxis}">
        <option value="x">input x</option>
        <option value="y">input y</option>
        <option value="z">input z</option>
      </select>
    </label>
  `;
}

function toggleInput(label: string, axis: AxisName) {
  return `
    <label>
      <input data-invert-axis="${axis}" type="checkbox" />
      <span>${label}</span>
    </label>
  `;
}

function getNumberValue(settings: PoseCalibrationSettings, path: NumberPath) {
  switch (path) {
    case 'positionScale':
      return settings.positionScale;
    case 'positionOffset.x':
      return settings.positionOffset.x;
    case 'positionOffset.y':
      return settings.positionOffset.y;
    case 'positionOffset.z':
      return settings.positionOffset.z;
    case 'rotationOffset.yaw':
      return settings.rotationOffset.yaw;
    case 'rotationOffset.pitch':
      return settings.rotationOffset.pitch;
    case 'rotationOffset.roll':
      return settings.rotationOffset.roll;
    case 'smoothingStrength':
      return settings.smoothingStrength;
    case 'latencyOffsetMs':
      return settings.latencyOffsetMs;
  }
}

function setNumberValue(settings: PoseCalibrationSettings, path: NumberPath, value: number) {
  switch (path) {
    case 'positionScale':
      settings.positionScale = value;
      break;
    case 'positionOffset.x':
      settings.positionOffset.x = value;
      break;
    case 'positionOffset.y':
      settings.positionOffset.y = value;
      break;
    case 'positionOffset.z':
      settings.positionOffset.z = value;
      break;
    case 'rotationOffset.yaw':
      settings.rotationOffset.yaw = value;
      break;
    case 'rotationOffset.pitch':
      settings.rotationOffset.pitch = value;
      break;
    case 'rotationOffset.roll':
      settings.rotationOffset.roll = value;
      break;
    case 'smoothingStrength':
      settings.smoothingStrength = value;
      break;
    case 'latencyOffsetMs':
      settings.latencyOffsetMs = value;
      break;
  }
}
