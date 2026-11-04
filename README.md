# HornlessSplat

HornlessSplat is a Phase 3 local prototype for a browser-based Gaussian Splat virtual production preview. It combines the Gaussian Splat viewer with live browser webcam preview and can drive the virtual camera from either fake pose packets or an Android ARCore pose sender.

The pose path remains unchanged:

`external pose data -> WebSocket stream -> realtime splat camera movement`

Video input is intentionally modular. The current browser path uses `getUserMedia` and normal browser video devices, so NDI Virtual Input, USB cameras, WebRTC, or native phone streaming can remain separate from the pose pipeline.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL printed by the terminal, usually:

```text
http://127.0.0.1:5173
```

The local pose server runs on:

```text
ws://127.0.0.1:8787
```

Android phones on the same Wi-Fi should connect to the desktop machine's LAN IP, for example:

```text
ws://192.168.1.10:8787
```

## Controls

- `R` resets the camera origin to the current incoming pose.
- `S` toggles smoothing/interpolation.
- `D` toggles the debug panel.

## Live Video Preview

Use NDI Virtual Input, a USB camera, or any camera source that appears as a normal browser webcam.

1. Start the phone camera feed and expose it through NDI Virtual Input.
2. Open HornlessSplat in the browser.
3. In the Video panel, click **Refresh Devices** if the camera does not appear.
4. Select the NDI/webcam device.
5. Click **Start Video**.

The Video panel shows:

- Dynamic camera device selector
- Start, stop, and refresh controls
- Current stream resolution
- Estimated video FPS
- Stream active/inactive status
- Display mode selector
- Splat opacity slider for Overlay mode

Display modes:

- **Splat Only** renders only the Gaussian Splat scene.
- **Video Only** renders only the live camera feed.
- **Side by Side** shows the live video and splat render next to each other.
- **Overlay** keeps the live video as the background and renders the Gaussian Splat layer above it with adjustable opacity.

The live video element uses aspect-ratio-preserving display for low-latency preview. For best results, choose the NDI Virtual Input device directly in the Video panel after browser camera permission is granted.

## Calibration Panel

The on-screen Calibration panel lets you adjust tracking-space conversion at runtime without editing code:

- Position scale
- Position offset x/y/z
- Rotation offset yaw/pitch/roll
- Axis remap
- Invert x/y/z
- Smoothing strength
- Latency offset placeholder

The panel can set the current raw pose as origin, reset calibration, save to `localStorage`, and load from `localStorage`.
Rotation offsets are entered in radians. The latency offset field is stored for future transport work but does not delay or predict packets yet.

Calibration is applied in this order, entirely with quaternions:

1. **Axis remap / invert**: a change of basis applied to position *and* rotation, so the camera's forward and up directions follow the same remap as its motion. Mirrored remaps (an odd number of inverts) are supported. A remap that uses the same input axis twice only affects position, and the debug panel shows a warning.
2. **Origin**: the pose is made relative to the captured origin position and *heading* (yaw only), so the horizon stays level with gravity-aligned trackers like ARCore.
3. **Position scale**.
4. **Scene placement**: the rotation offset, then the position offset, place the tracking origin in the splat scene. By default, setting the origin puts the camera at the scene's home viewpoint `(0, 0.35, 4)`.

Saved calibrations use the `hornlesssplat.calibration.v2` key; v1 settings are not migrated.

## Android ARCore Pose Sender

`HornlessSplatTracker/` is a minimal native Android project for Phase 3. It does not stream video. It only sends ARCore camera pose packets over WebSocket to the desktop pose server.

Requirements:

- Android Studio
- ARCore-capable Android phone
- Phone and desktop on the same network

Run flow:

1. Start HornlessSplat on the desktop with `npm run dev`.
2. Open the browser app and use the **Pose Source** panel.
3. Choose **Android ARCore**.
4. Open `HornlessSplatTracker/` in Android Studio.
5. Install the app on an ARCore-capable phone.
6. In the Android app, enter the desktop WebSocket URL, such as `ws://192.168.1.10:8787`.
7. Tap **Connect**.
8. Move the phone and use the existing Calibration panel to set origin, remap axes, invert axes, adjust scale, and tune rotation offsets.

Android packet format:

```json
{
  "source": "android-arcore",
  "timestamp": 1777212000000,
  "clockSynced": true,
  "frameTimestampNs": 81234567890123,
  "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
  "rotation": { "qx": 0.0, "qy": 0.0, "qz": 0.0, "qw": 1.0 },
  "trackingState": "TRACKING",
  "intrinsics": { "fx": 1500.0, "fy": 1500.0, "cx": 960.0, "cy": 540.0, "width": 1920, "height": 1080 },
  "displayRotation": 0
}
```

- `rotation` is ARCore's **display-oriented** camera pose, so the virtual camera matches the phone's screen orientation.
- Only new ARCore camera frames are sent (deduplicated by `frameTimestampNs`), at the camera's native rate.
- `timestamp` is in the pose server's clock domain once `clockSynced` is true. The tracker does NTP-style `clockSyncRequest` / `clockSyncResponse` round trips with the server and uses the lowest-RTT sample.
- `intrinsics` are ARCore texture intrinsics. The server derives the vertical FOV for the current `displayRotation` from them, falling back to 58° when they're missing.

The Node pose server normalizes the quaternion and forwards each new pose to browser viewers once. It never re-sends stale poses, and it never echoes poses back to tracker sockets. The browser pipeline remains:

`raw pose -> calibration -> smoothing -> camera controller`

## Architecture

- `server/index.ts` starts a local Node.js WebSocket pose server.
- `server/fakePoseGenerator.ts` emits fake animated tracking packets at 60 Hz when Fake Pose is selected.
- `server/index.ts` also accepts Android ARCore pose packets, tracks the active pose source, and broadcasts normalized browser pose packets.
- `src/pose/PoseSocketClient.ts` owns browser WebSocket connection, reconnect behavior, pose source control messages, and pose server state messages.
- `src/pose/PoseCalibration.ts` converts raw tracking data into viewer-space pose data.
- `src/pose/PoseSmoother.ts` interpolates calibrated pose packets before they reach the camera.
- `src/video/VideoInput.ts` owns browser camera enumeration, `getUserMedia`, stream lifecycle, resolution, and FPS estimation.
- `src/video/displayModes.ts` defines preview display modes shared by the UI and debug overlay.
- `src/viewer/SplatViewer.ts` creates the Three.js renderer, camera, and Gaussian Splat viewer.
- `src/viewer/CameraPoseController.ts` maps calibrated pose packets to the virtual camera.
- `src/ui/CalibrationPanel.ts` owns runtime calibration controls.
- `src/ui/PoseSourcePanel.ts` owns Fake Pose vs Android ARCore source selection.
- `src/ui/VideoControlPanel.ts` owns runtime video controls.
- `src/ui/DebugOverlay.ts` renders connection, render FPS, pose source, Android tracking state, selected camera, video resolution, video FPS, display mode, raw pose, calibrated pose, camera pose, FOV, and packet timestamp state.
- `HornlessSplatTracker/` contains the native Kotlin ARCore WebSocket pose sender.
- `public/assets/sample-set.ply` is a small local binary PLY Gaussian Splat scene.

Pose packets are JSON:

```json
{
  "source": "fake",
  "timestamp": 1777212000000,
  "clockSynced": true,
  "position": { "x": 0, "y": 0.35, "z": 4 },
  "rotation": { "x": 0, "y": 0, "z": 0, "w": 1 },
  "fov": 58
}
```

Rotation is a unit quaternion in Three.js conventions (right-handed, +Y up, camera looks down -Z), the same as ARCore world space. FOV is vertical, in degrees. `timestamp` is in milliseconds in the pose server's clock; when the browser runs on the same machine, the debug panel shows the pose age.

## Replaceable Pieces

The server, fake generator, and Android sender are isolated so tracking sources can replace only the producer side while keeping the browser packet contract. The browser pose client, calibration layer, smoother, and camera controller are likewise separate so future ARKit, ARCore, FreeD, or other pose sources can use the same correction path.

The video path is also isolated behind the browser `VideoInput` module. Today it accepts any `getUserMedia` video device, including NDI Virtual Input. Later sources can feed the same visual layer from WebRTC, USB capture, or a native Android transport.

## Next Phases

1. Add a phone-to-lens mount offset for rigs where the phone is not the filming camera.
2. Add lens, sensor-offset, and video/splat alignment calibration.
3. Add recording/replay of pose and video timing metadata for repeatable virtual set tests.
4. Add WebRTC or native phone video transport after the ARCore pose loop is stable.
5. Add production scene loading workflow for larger `.ply`, `.splat`, or `.ksplat` assets.
