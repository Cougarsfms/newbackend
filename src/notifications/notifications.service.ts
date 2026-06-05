import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  private firebaseApp: admin.app.App;

  onModuleInit() {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    console.log('[Notifications] Checking for service account at:', serviceAccountPath);

    if (fs.existsSync(serviceAccountPath)) {
      try {
        if (admin.apps.length === 0) {
          this.firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
          });
          console.log('[Notifications] Firebase Admin initialized successfully.');
        } else {
          this.firebaseApp = admin.app();
          console.log('[Notifications] Firebase Admin already initialized.');
        }
      } catch (error) {
        console.error('[Notifications] Failed to initialize Firebase Admin:', error);
      }
    } else {
      console.warn('[Notifications] CRITICAL: firebase-service-account.json not found! Direct FCM will not work.');
      // List files in current directory to help debug
      try {
        console.log('[Notifications] Files in CWD:', fs.readdirSync(process.cwd()));
      } catch (e) { }
    }
  }

  async sendPushNotification(token: string, title: string, body: string, data: any = {}) {
    console.log(`[Notifications] Attempting to send to token: ${token.substring(0, 20)}...`);
    if (!token) {
      console.warn('[Notifications] Abandoning send: Token is empty');
      return;
    }

    if (token.startsWith('ExponentPushToken')) {
      return this.sendViaExpo(token, title, body, data);
    } else {
      return this.sendViaFirebase(token, title, body, data);
    }
  }

  private async sendViaExpo(expoPushToken: string, title: string, body: string, data: any) {
    console.log('[Notifications] Sending via Expo:', expoPushToken);
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      categoryIdentifier: 'JOB_REQUEST',
      _displayInForeground: true,
    };

    try {
      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      return await response.json();
    } catch (error) {
      console.error('[Notifications] Expo Error:', error);
    }
  }

  private async sendViaFirebase(fcmToken: string, title: string, body: string, data: any) {
    if (!this.firebaseApp) {
      console.warn('[Notifications] Cannot send via Firebase: Admin SDK not initialized.');
      return;
    }

    console.log('[Notifications] Sending via Direct FCM:', fcmToken);
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        categoryIdentifier: 'JOB_REQUEST', // Required for expo-notifications to link categories
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
          clickAction: 'JOB_REQUEST',
        },
      },
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('[Notifications] FCM Success:', response);
      return response;
    } catch (error) {
      console.error('[Notifications] FCM Error:', error);
    }
  }

  async sendToMultiple(tokens: string[], title: string, body: string, data: any = {}) {
    // For simplicity, we loop through tokens. In production, use FCM batching if needed.
    const results = await Promise.all(
      tokens.map(token => this.sendPushNotification(token, title, body, data))
    );
    return results;
  }
}
