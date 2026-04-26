package com.hornlesssplat.tracker

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
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
    private val client = OkHttpClient.Builder()
        .pingInterval(5, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var webSocket: WebSocket? = null
    private var currentUrl = ""
    private var shouldReconnect = false
    private var connected = false

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
    }
}
