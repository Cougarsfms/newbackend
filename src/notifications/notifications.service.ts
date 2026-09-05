import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
  private firebaseApp: admin.app.App;

  onModuleInit() {
    try {
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.app();
        console.log('[Notifications] Firebase Admin already initialized.');
        return;
      }

      const credential = this.getFirebaseCredential();

      if (credential) {
        this.firebaseApp = admin.initializeApp({
          credential,
        });
        console.log('[Notifications] Firebase Admin initialized successfully.');
      } else {
        console.warn(
          '[Notifications] WARNING: Firebase Admin SDK could not be initialized because no valid credentials were found.\n' +
          '  To enable FCM push notifications on your cloud backend, set one of the following:\n' +
          '  1. Environment variable FIREBASE_SERVICE_ACCOUNT (raw JSON string or base64 of service account file)\n' +
          '  2. Environment variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n' +
          '  3. Place a valid firebase-service-account.json in root directory\n' +
          '  Note: Expo Push Tokens (ExponentPushToken[...]) will still work via Expo Push API.'
        );
      }
    } catch (error) {
      console.error('[Notifications] Failed to initialize Firebase Admin:', error);
    }
  }

  private getFirebaseCredential(): admin.credential.Credential | null {
    // Source 1: Raw JSON string or base64 in environment variable FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_JSON
    const rawEnvJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (rawEnvJson) {
      try {
        let jsonStr = rawEnvJson.trim();
        if (!jsonStr.startsWith('{')) {
          // Attempt base64 decode if not plain JSON string
          jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8');
        }
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
          console.log('[Notifications] Using Firebase Service Account from environment variable JSON.');
          return admin.credential.cert(parsed);
        } else {
          console.warn('[Notifications] FIREBASE_SERVICE_ACCOUNT env var provided but missing project_id, client_email, or private_key.');
        }
      } catch (e) {
        console.error('[Notifications] Failed to parse FIREBASE_SERVICE_ACCOUNT env var as JSON:', e);
      }
    }

    // Source 2: Individual environment variables FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      console.log('[Notifications] Using Firebase Service Account from individual environment variables.');
      privateKey = privateKey.replace(/\\n/g, '\n');
      return admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      });
    }

    // Source 3: Google Application Credentials environment variable
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      console.log('[Notifications] Using GOOGLE_APPLICATION_CREDENTIALS file path:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      return admin.credential.applicationDefault();
    }

    // Source 4: Local firebase-service-account.json file on disk
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    console.log('[Notifications] Checking for service account file at:', serviceAccountPath);

    if (fs.existsSync(serviceAccountPath)) {
      try {
        const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed && typeof parsed === 'object' && parsed.project_id && parsed.client_email && parsed.private_key) {
          console.log('[Notifications] Using valid firebase-service-account.json from file system.');
          return admin.credential.cert(parsed);
        } else {
          console.warn(
            '[Notifications] INVALID FILE: firebase-service-account.json exists on disk but is missing required properties (project_id, client_email, or private_key).'
          );
        }
      } catch (e) {
        console.error('[Notifications] Error reading/parsing firebase-service-account.json file:', e);
      }
    }

    return null;
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
      channelId: 'default',
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
