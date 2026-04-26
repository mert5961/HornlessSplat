package com.hornlesssplat.tracker

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import java.util.Locale
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class MainActivity : Activity(), GLSurfaceView.Renderer {
    private lateinit var surfaceView: GLSurfaceView
    private lateinit var serverIpInput: EditText
    private lateinit var portInput: EditText
    private lateinit var connectionStatusText: TextView
    private lateinit var trackingStateText: TextView
    private lateinit var packetsSentText: TextView
    private lateinit var lastErrorText: TextView
    private lateinit var logsText: TextView
    private lateinit var webSocketClient: PoseWebSocketClient

    private val backgroundRenderer = BackgroundRenderer()
    private val logs = ArrayDeque<String>()

    private var arSession: Session? = null
    private var installRequested = false
    private var viewportChanged = false
    private var viewportWidth = 1
    private var viewportHeight = 1
    private var cameraTextureId = -1
    private var lastSendNs = 0L
    private var lastTrackingUiNs = 0L
    private var packetsSent = 0L
    private var lastTrackingState = "UNKNOWN"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webSocketClient = PoseWebSocketClient(
            onStatus = { status ->
                connectionStatusText.text = status
            },
            onLog = { message ->
                appendLog(message)
            },
            onPacketSent = {
                packetsSent += 1
                packetsSentText.text = packetsSent.toString()
            },
            onError = { error ->
                lastErrorText.text = error
            }
        )

        surfaceView = GLSurfaceView(this).apply {
            setEGLContextClientVersion(2)
            preserveEGLContextOnPause = true
            setRenderer(this@MainActivity)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }

        serverIpInput = EditText(this).apply {
            setSingleLine(true)
            setText("192.168.1.10")
            hint = "desktop IP"
            inputType = InputType.TYPE_CLASS_TEXT
            setTextColor(Color.WHITE)
            setHintTextColor(0x99ffffff.toInt())
        }
        portInput = EditText(this).apply {
            setSingleLine(true)
            setText("8787")
            hint = "port"
            inputType = InputType.TYPE_CLASS_NUMBER
            setTextColor(Color.WHITE)
            setHintTextColor(0x99ffffff.toInt())
        }
        connectionStatusText = valueText("disconnected")
        trackingStateText = valueText(lastTrackingState)
        packetsSentText = valueText("0")
        lastErrorText = valueText("--")
        logsText = valueText("")

        val connectButton = Button(this).apply {
            text = "Connect"
            setOnClickListener {
                webSocketClient.connect(buildServerUrl())
            }
        }
        val disconnectButton = Button(this).apply {
            text = "Disconnect"
            setOnClickListener {
                webSocketClient.disconnect()
            }
        }
        val testPacketButton = Button(this).apply {
            text = "Send Test Packet"
            setOnClickListener {
                val sent = webSocketClient.send(buildTestPosePacket())
                appendLog(if (sent) "test packet sent" else "test packet not sent: disconnected")
            }
        }

        val overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 20, 20, 20)
            setBackgroundColor(0x99000000.toInt())
            addView(label("Server IP"))
            addView(serverIpInput, matchWrap())
            addView(label("Port"))
            addView(portInput, matchWrap())
            addView(
                LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    addView(connectButton, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                    addView(disconnectButton, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                }
            )
            addView(testPacketButton, matchWrap())
            addView(statRow("Connection", connectionStatusText))
            addView(statRow("Tracking", trackingStateText))
            addView(statRow("Packets", packetsSentText))
            addView(statRow("Last error", lastErrorText))
            addView(label("Logs"))
            addView(
                ScrollView(this@MainActivity).apply {
                    addView(logsText)
                },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 220)
            )
        }

        setContentView(
            FrameLayout(this).apply {
                addView(surfaceView)
                addView(
                    overlay,
                    FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                        gravity = Gravity.TOP
                    }
                )
            }
        )
        appendLog("app started")
    }

    override fun onResume() {
        super.onResume()

        if (!hasCameraPermission()) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), cameraPermissionRequestCode)
            appendLog("camera permission requested")
            return
        }

        ensureSession()
        arSession?.resume()
        surfaceView.onResume()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode != cameraPermissionRequestCode) {
            return
        }

        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            appendLog("camera permission granted")
            ensureSession()
            arSession?.resume()
            surfaceView.onResume()
        } else {
            lastErrorText.text = "Camera permission denied"
            appendLog("camera permission denied")
        }
    }

    override fun onPause() {
        super.onPause()
        surfaceView.onPause()
        arSession?.pause()
    }

    override fun onDestroy() {
        webSocketClient.close()
        arSession?.close()
        super.onDestroy()
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        cameraTextureId = backgroundRenderer.createOnGlThread()
        arSession?.setCameraTextureName(cameraTextureId)
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height
        viewportChanged = true
        GLES20.glViewport(0, 0, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)

        val session = arSession ?: return

        if (viewportChanged) {
            session.setDisplayGeometry(windowManager.defaultDisplay.rotation, viewportWidth, viewportHeight)
            viewportChanged = false
        }

        try {
            val frame = session.update()
            backgroundRenderer.draw()

            val camera = frame.camera
            val pose = camera.pose
            val quaternion = pose.rotationQuaternion
            val trackingState = camera.trackingState
            val nowNs = System.nanoTime()
            lastTrackingState = trackingState.name

            if (nowNs - lastTrackingUiNs >= 250_000_000L) {
                lastTrackingUiNs = nowNs
                runOnUiThread {
                    trackingStateText.text = lastTrackingState
                }
            }

            if (nowNs - lastSendNs >= 16_000_000L) {
                lastSendNs = nowNs
                webSocketClient.send(
                    buildPosePacket(
                        timestamp = System.currentTimeMillis(),
                        tx = pose.tx(),
                        ty = pose.ty(),
                        tz = pose.tz(),
                        qx = quaternion[0],
                        qy = quaternion[1],
                        qz = quaternion[2],
                        qw = quaternion[3],
                        trackingState = trackingState.name
                    )
                )
            }
        } catch (error: Exception) {
            runOnUiThread {
                lastErrorText.text = error.message ?: error.javaClass.simpleName
            }
        }
    }

    private fun ensureSession() {
        if (arSession != null) {
            return
        }

        try {
            val installStatus = ArCoreApk.getInstance().requestInstall(this, !installRequested)
            installRequested = true

            if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                appendLog("ARCore install requested")
                return
            }

            arSession = Session(this).also { session ->
                if (cameraTextureId > 0) {
                    session.setCameraTextureName(cameraTextureId)
                }
            }
            appendLog("ARCore session ready")
        } catch (error: Exception) {
            lastErrorText.text = error.message ?: error.javaClass.simpleName
            appendLog("ARCore error: ${lastErrorText.text}")
        }
    }

    private fun buildServerUrl(): String {
        val ip = serverIpInput.text.toString().trim()
        val port = portInput.text.toString().trim().ifBlank { "8787" }
        return "ws://$ip:$port"
    }

    private fun buildTestPosePacket(): String {
        return buildPosePacket(
            timestamp = System.currentTimeMillis(),
            tx = 0f,
            ty = 0f,
            tz = 0f,
            qx = 0f,
            qy = 0f,
            qz = 0f,
            qw = 1f,
            trackingState = "TRACKING"
        )
    }

    private fun buildPosePacket(
        timestamp: Long,
        tx: Float,
        ty: Float,
        tz: Float,
        qx: Float,
        qy: Float,
        qz: Float,
        qw: Float,
        trackingState: String
    ): String {
        return String.format(
            Locale.US,
            """
                {
                  "source": "android-arcore",
                  "timestamp": %d,
                  "position": {
                    "x": %.6f,
                    "y": %.6f,
                    "z": %.6f
                  },
                  "rotation": {
                    "qx": %.6f,
                    "qy": %.6f,
                    "qz": %.6f,
                    "qw": %.6f
                  },
                  "trackingState": "%s"
                }
            """.trimIndent(),
            timestamp,
            tx,
            ty,
            tz,
            qx,
            qy,
            qz,
            qw,
            trackingState
        )
    }

    private fun hasCameraPermission(): Boolean {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }

    private fun label(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            setTextColor(0xffb7c3c4.toInt())
            textSize = 12f
        }
    }

    private fun valueText(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            setTextColor(Color.WHITE)
            textSize = 13f
        }
    }

    private fun statRow(label: String, value: TextView): LinearLayout {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(label(label), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.8f))
            addView(value, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.2f))
        }
    }

    private fun matchWrap(): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    private fun appendLog(message: String) {
        logs.addLast("${System.currentTimeMillis() % 100000}: $message")

        while (logs.size > 10) {
            logs.removeFirst()
        }

        logsText.text = logs.joinToString(separator = "\n")
    }

    companion object {
        private const val cameraPermissionRequestCode = 1001
    }
}
