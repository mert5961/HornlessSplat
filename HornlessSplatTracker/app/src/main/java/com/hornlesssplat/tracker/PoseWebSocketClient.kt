package com.hornlesssplat.tracker

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class PoseWebSocketClient(
    private val onStatus: (String) -> Unit,
    private val onLog: (String) -> Unit,
    private val onPacketSent: () -> Unit,
    private val onError: (String) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val reconnectRunnable = Runnable {
        val url = currentUrl
        if (shouldReconnect && url.isNotBlank()) {
            connect(url)
        }
    }
    private val clockSyncRunnable = object : Runnable {
        override fun run() {
            if (!connected) {
                return
            }

            sendClockSyncRequest()
            clockSyncRequestsSent += 1
            val delayMs = if (clockSyncRequestsSent < clockSyncBurstCount) clockSyncBurstDelayMs else clockSyncIntervalMs
            mainHandler.postDelayed(this, delayMs)
        }
    }
    private val client = OkHttpClient.Builder()
        .pingInterval(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var webSocket: WebSocket? = null
    private var currentUrl = ""
    private var shouldReconnect = false
    @Volatile
    private var connected = false

    // Clock sync: server time = local monotonic ms + offset. The offset comes from the
    // lowest-RTT sample in a rolling window (NTP-style, assumes symmetric network delay).
    private val clockSamples = ArrayDeque<ClockSample>()
    private var clockSyncRequestsSent = 0

    @Volatile
    private var clockOffsetMs: Double? = null

    @Volatile
    var clockRttMs: Long? = null
        private set

    fun connect(url: String) {
        currentUrl = url.trim()
        shouldReconnect = true
        connected = false
        mainHandler.removeCallbacks(reconnectRunnable)
        webSocket?.close(1000, "reconnecting")
        webSocket = null

        if (currentUrl.isBlank()) {
            setError("WebSocket URL is empty")
            return
        }

        setStatus("connecting")
        log("connecting to $currentUrl")

        val request = Request.Builder()
            .url(currentUrl)
            .build()

        webSocket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    connected = true
                    setStatus("connected")
                    log("connected")
                    mainHandler.post {
                        clockSyncRequestsSent = 0
                        clockSamples.clear()
                        clockOffsetMs = null
                        clockRttMs = null
                        mainHandler.removeCallbacks(clockSyncRunnable)
                        mainHandler.post(clockSyncRunnable)
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleMessage(text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    connected = false
                    val message = t.message ?: "unknown WebSocket error"
                    setStatus("error")
                    setError(message)
                    log("error: $message")
                    scheduleReconnect()
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    connected = false
                    setStatus("closed")
                    log("closed: $code $reason")
                    scheduleReconnect()
                }
            }
        )
    }

    fun disconnect() {
        shouldReconnect = false
        connected = false
        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.removeCallbacks(clockSyncRunnable)
        webSocket?.close(1000, "tracker disconnected")
        webSocket = null
        setStatus("disconnected")
        log("disconnected")
    }

    fun send(packetJson: String): Boolean {
        val socket = webSocket

        if (!connected || socket == null) {
            return false
        }

        val queued = socket.send(packetJson)

        if (queued) {
            mainHandler.post {
                onPacketSent()
            }
        }

        return queued
    }

    fun close() {
        disconnect()
    }

    /** Current time in the pose server's clock domain, or null until the first clock sync completes. */
    fun serverTimeMs(): Long? {
        val offset = clockOffsetMs ?: return null
        return (SystemClock.elapsedRealtime() + offset).toLong()
    }

    private fun sendClockSyncRequest() {
        val payload = JSONObject()
            .put("type", "clockSyncRequest")
            .put("clientSendMs", SystemClock.elapsedRealtime())
        webSocket?.send(payload.toString())
    }

    private fun handleMessage(text: String) {
        val receivedMs = SystemClock.elapsedRealtime()
        val message = try {
            JSONObject(text)
        } catch (error: Exception) {
            return
        }

        if (message.optString("type") != "clockSyncResponse") {
            return
        }

        val sentMs = message.optLong("clientSendMs", -1L)
        val serverMs = message.optLong("serverMs", -1L)
        if (sentMs < 0L || serverMs < 0L || receivedMs < sentMs) {
            return
        }

        val sample = ClockSample(
            rttMs = receivedMs - sentMs,
            offsetMs = serverMs - (sentMs + receivedMs) / 2.0
        )

        mainHandler.post {
            val firstSync = clockOffsetMs == null
            clockSamples.addLast(sample)
            while (clockSamples.size > clockSampleWindow) {
                clockSamples.removeFirst()
            }

            val best = clockSamples.minByOrNull { it.rttMs } ?: return@post
            clockOffsetMs = best.offsetMs
            clockRttMs = best.rttMs

            if (firstSync) {
                log("clock synced, rtt ${best.rttMs} ms")
            }
        }
    }

    private data class ClockSample(val rttMs: Long, val offsetMs: Double)

    private fun scheduleReconnect() {
        if (!shouldReconnect) {
            return
        }

        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.postDelayed(reconnectRunnable, reconnectDelayMs)
        log("reconnect scheduled")
    }

    private fun setStatus(status: String) {
        mainHandler.post {
            onStatus(status)
        }
    }

    private fun setError(error: String) {
        mainHandler.post {
            onError(error)
        }
    }

    private fun log(message: String) {
        mainHandler.post {
            onLog(message)
        }
    }

    companion object {
        private const val reconnectDelayMs = 2000L
        private const val clockSyncBurstCount = 8
        private const val clockSyncBurstDelayMs = 100L
        private const val clockSyncIntervalMs = 2000L
        private const val clockSampleWindow = 16
    }
}
