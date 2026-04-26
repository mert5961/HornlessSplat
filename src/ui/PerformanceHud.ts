export type PerformanceHudState = {
  renderFps: number;
  videoFps: number;
  droppedFrames: number;
};

export class PerformanceHud {
  private readonly element: HTMLElement;

  constructor(root: HTMLElement) {
    this.element = document.createElement('aside');
    this.element.className = 'performance-hud';
    root.appendChild(this.element);
  }

  render(state: PerformanceHudState) {
    this.element.innerHTML = `
      <dl>
        <dt>render</dt><dd>${state.renderFps.toFixed(0)} fps</dd>
        <dt>video</dt><dd>${state.videoFps > 0 ? state.videoFps.toFixed(1) : '--'} fps</dd>
        <dt>dropped</dt><dd>${state.droppedFrames}</dd>
      </dl>
    `;
  }
}
