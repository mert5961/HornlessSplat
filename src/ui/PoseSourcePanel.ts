import type { PoseSource } from '../types/pose';

export type PoseSourcePanelState = {
  source: PoseSource;
  androidConnected: boolean;
  androidTrackingState: string;
};

export type PoseSourcePanelOptions = PoseSourcePanelState & {
  onSourceChange: (source: PoseSource) => void;
};

export class PoseSourcePanel {
  private readonly element: HTMLElement;
  private readonly sourceSelect: HTMLSelectElement;
  private readonly androidStatusValue: HTMLElement;
  private readonly trackingValue: HTMLElement;
  private state: PoseSourcePanelState;

  constructor(root: HTMLElement, options: PoseSourcePanelOptions) {
    this.state = {
      source: options.source,
      androidConnected: options.androidConnected,
      androidTrackingState: options.androidTrackingState
    };
    this.element = document.createElement('section');
    this.element.className = 'pose-source-panel';
    this.element.innerHTML = `
      <div class="pose-source-panel__header">
        <h2>Pose Source</h2>
      </div>
      <div class="pose-source-panel__body">
        <label class="control-row">
          <span>Source</span>
          <select data-role="pose-source">
            <option value="fake">Fake Pose</option>
            <option value="android-arcore">Android ARCore</option>
          </select>
        </label>
        <dl>
          <dt>android</dt><dd data-stat="android">disconnected</dd>
          <dt>tracking</dt><dd data-stat="tracking">--</dd>
        </dl>
      </div>
    `;

    root.appendChild(this.element);
    this.sourceSelect = this.requireElement<HTMLSelectElement>('[data-role="pose-source"]');
    this.androidStatusValue = this.requireElement<HTMLElement>('[data-stat="android"]');
    this.trackingValue = this.requireElement<HTMLElement>('[data-stat="tracking"]');

    this.sourceSelect.addEventListener('change', () => {
      options.onSourceChange(this.sourceSelect.value as PoseSource);
    });

    this.setState(this.state);
  }

  setState(state: PoseSourcePanelState) {
    this.state = state;
    this.sourceSelect.value = state.source;
    this.androidStatusValue.textContent = state.androidConnected ? 'connected' : 'disconnected';
    this.trackingValue.textContent = state.androidTrackingState || '--';
  }

  private requireElement<T extends HTMLElement>(selector: string) {
    const element = this.element.querySelector<T>(selector);

    if (!element) {
      throw new Error(`Pose source panel element was not found: ${selector}`);
    }

    return element;
  }
}
