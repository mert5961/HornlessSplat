# HornlessSplatTracker

Minimal native Android ARCore pose sender for HornlessSplat Phase 3.1.

This app does not stream video. It only sends ARCore camera pose packets to the desktop pose server over WebSocket.

## Build

Open this folder in Android Studio:

```text
HornlessSplatTracker/
```

The project includes a Gradle wrapper:

```bash
./gradlew :app:assembleDebug
```

You need Android Studio or a local JDK plus Android SDK installed. Install on an ARCore-capable Android phone.

## Find Desktop IP

The phone must connect to the desktop machine's LAN IP, not `127.0.0.1`.

On macOS:

```bash
ipconfig getifaddr en0
```

If Ethernet is active, try:

```bash
ipconfig getifaddr en1
```

On Windows:

```cmd
ipconfig
```

Use the `IPv4 Address` for your active Wi-Fi or Ethernet adapter.

On Linux:

```bash
hostname -I
```

Example desktop IP:

```text
192.168.1.10
```

## Run Pose Server

From the HornlessSplat repo root:

```bash
npm install
npm run dev
```

The pose server listens on:

```text
ws://0.0.0.0:8787
```

In the browser app, choose `Android ARCore` in the Pose Source panel.

## Connect Phone

1. Make sure phone and desktop are on the same Wi-Fi/LAN.
2. Open HornlessSplatTracker on the phone.
3. Grant camera permission.
4. Enter the desktop IP, for example `192.168.1.10`.
5. Leave port as `8787`.
6. Tap `Connect`.
7. Watch connection status, ARCore tracking state, packets sent, last error, and logs on screen.
8. Use `Send Test Packet` to test WebSocket connectivity without relying on ARCore tracking.

The app builds the URL as:

```text
ws://<desktop-ip>:8787
```

## Common Firewall Issues

- macOS may ask whether Node.js can accept incoming network connections. Allow it.
- Windows Defender Firewall may block Node.js. Allow private network access.
- Corporate, guest, or public Wi-Fi can block device-to-device traffic.
- VPNs can route the phone and desktop onto different networks.
- `127.0.0.1` only points to the phone itself. Use the desktop LAN IP.
- If `Send Test Packet` works but tracking stays unavailable, check camera permission and whether the phone supports ARCore.

## Packet Format

The app sends:

```json
{
  "source": "android-arcore",
  "timestamp": 1777212000000,
  "position": { "x": 0.0, "y": 0.0, "z": 0.0 },
  "rotation": { "qx": 0.0, "qy": 0.0, "qz": 0.0, "qw": 1.0 },
  "trackingState": "TRACKING"
}
```
