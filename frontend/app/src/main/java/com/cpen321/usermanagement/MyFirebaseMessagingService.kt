package com.cpen321.usermanagement

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.cpen321.usermanagement.data.remote.api.UserInterface
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.cpen321.usermanagement.data.remote.models.UpdateProfileRequest
import com.cpen321.usermanagement.data.remote.api.RetrofitClient
import com.google.firebase.messaging.FirebaseMessaging


@AndroidEntryPoint
class MyFirebaseMessagingService : FirebaseMessagingService() {
    private val CHANNEL_ID = "default_channel"
    private val TAG = "MyFCM"
    private val userInterface: UserInterface = RetrofitClient.userInterface

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "FCM new token: $token")
        sendTokenToBackend(token)
    }

     fun fetchAndSendFcmToken(place: String) {
        Log.d("place", "fetchAndSendFcmToken called from: $place")
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d("ManualFCM", "Manual token: $token")
                sendTokenToBackend(token)
            } else {
                Log.w("MyFCM", "Fetching FCM token failed", task.exception)
            }
        }
    }
    
    /**
     * Clear FCM token from backend when user logs out
     * This prevents sending notifications to old tokens
     */
    public suspend fun clearFcmTokenFromBackend() {
        try {
            Log.d(TAG, "🧹 Clearing FCM token from backend...")
            val updateRequest = UpdateProfileRequest(name = "anon", fcmToken = null)
            val response = userInterface.updateProfile(updateRequest)
            
            if (response.isSuccessful) {
                Log.d(TAG, "✅ FCM token cleared successfully from backend")
            } else {
                val errorBody = response.errorBody()?.string()
                Log.e(TAG, "❌ Failed to clear FCM token - Status: ${response.code()}, Error: $errorBody")
            }
        } catch (e: java.io.IOException) {
            Log.e(TAG, "❌ Network error clearing FCM token", e)
            throw e
        } catch (e: retrofit2.HttpException) {
            Log.e(TAG, "❌ HTTP error clearing FCM token: ${e.code()}", e)
            throw e
        }
    }

    private fun sendTokenToBackend(token: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Log.d(TAG, "📤 Sending FCM token to backend: ${token.take(20)}...")
                val updateRequest = UpdateProfileRequest(name = "anon", fcmToken = token)
                val response = userInterface.updateProfile(updateRequest)

                if (response.isSuccessful) {
                    Log.d(TAG, "✅ FCM token updated successfully on backend")
                } else {
                    val errorBody = response.errorBody()?.string()
                    Log.e(TAG, "❌ Failed to update FCM token - Status: ${response.code()}, Error: $errorBody")
                }
            } catch (e: java.io.IOException) {
                Log.e(TAG, "❌ Network error while updating FCM token", e)
            } catch (e: retrofit2.HttpException) {
                Log.e(TAG, "❌ HTTP error while updating FCM token: ${e.code()}", e)
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "Message received from: ${remoteMessage.from}")
        Log.d(TAG, "Message type : ${remoteMessage.getMessageType()}")
        Log.d(TAG, "Notification title : ${remoteMessage.getNotification()?.title}")
        Log.d(TAG, "Notification body: ${remoteMessage.getNotification()?.body}")

        Log.d(TAG, "Remote Message object: ${remoteMessage}")

        if (remoteMessage.data.isNotEmpty()) {
            Log.d(TAG, "Message data payload: ${remoteMessage.data}")
        }

        // If the message contains notification payload, prefer it; otherwise build from data
        val title = remoteMessage.notification?.title ?: remoteMessage.data["title"] ?: "New message"
        val body = remoteMessage.notification?.body ?: remoteMessage.data["body"] ?: ""

        showNotification(title, body)
    }

    private fun showNotification(title: String, message: String) {
        // createChannelIfNeeded() TODO: Uncomment this if notifications are not showing on Android 8+

        // Launch main activity when tapping the notification
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Use a unique ID so notifications don't always replace each other
        val notificationId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground) // TODO: Replace with our own app icon later
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        with(NotificationManagerCompat.from(this)) {
            notify(notificationId, builder.build())
        }
    }

    private fun createChannelIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Firebase messages"
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = "Channel for Firebase messages"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
}
