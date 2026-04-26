declare module '@mkkellogg/gaussian-splats-3d' {
  export const Viewer: new (options?: Record<string, unknown>) => {
    addSplatScene: (path: string, options?: Record<string, unknown>) => Promise<void>;
    update: () => void;
    render: () => void;
    dispose?: () => void;
  };

  export const SceneFormat: {
    Ply: number;
    Splat: number;
    KSplat: number;
  };

  export const RenderMode: {
    Always: number;
    OnChange: number;
    Never: number;
  };

  export const SceneRevealMode: {
    Default: number;
    Gradual: number;
    Instant: number;
  };

  export const WebXRMode: {
    None: number;
    VR: number;
    AR: number;
  };

  export const LogLevel: {
    None: number;
    Error: number;
    Warning: number;
    Info: number;
    Debug: number;
  };
}
