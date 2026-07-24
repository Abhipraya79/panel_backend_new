import { messaging, db } from '../config/firebase';
import logger from '../utils/logger';

class NotificationService {
  /**
   * Mengirim notifikasi ke satu atau lebih token dengan mekanisme retry
   */
  async sendNotification(tokens: string[], payload: any, retryCount = 0): Promise<void> {
    const MAX_RETRIES = 3;

    if (!tokens || tokens.length === 0) {
      logger.warn('[FCM] No tokens provided for notification');
      return;
    }

    try {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: payload.notification,
        data: payload.data,
        android: payload.android || {
          priority: 'high',
          notification: {
            channelId: 'cleaning_channel',
            sound: 'default',
          },
        },
      });

      if (response.successCount > 0) {
        logger.info(`[FCM] Notification sent successfully to ${response.successCount} devices.`);
      }

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        
        response.responses.forEach(async (resp, idx) => {
          if (!resp.success) {
            const error = resp.error;
            logger.warn(`[FCM] Notification failed for token ${tokens[idx]}. Reason: ${error?.code}`);

            if (
              error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered'
            ) {
              await this.removeInvalidToken(tokens[idx]);
            } else {
              // Retry these tokens
              failedTokens.push(tokens[idx]);
            }
          }
        });

        if (failedTokens.length > 0 && retryCount < MAX_RETRIES) {
          logger.info(`[FCM] Retrying ${failedTokens.length} failed tokens. Attempt ${retryCount + 1} of ${MAX_RETRIES}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff like logic
          await this.sendNotification(failedTokens, payload, retryCount + 1);
        }
      }
    } catch (error: any) {
      logger.error(`[FCM] Failed to send notification: ${error.message}`);
      if (retryCount < MAX_RETRIES) {
          logger.info(`[FCM] Retrying all tokens due to fatal error. Attempt ${retryCount + 1} of ${MAX_RETRIES}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          await this.sendNotification(tokens, payload, retryCount + 1);
      }
    }
  }

  /**
   * Mengambil semua token aktif dari Firestore
   */
  async getActiveTokens(): Promise<string[]> {
    try {
      const snapshot = await db.collection('devices').where('isActive', '==', true).get();
      
      const tokens: string[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken) {
          tokens.push(data.fcmToken);
        }
      });
      
      return tokens;
    } catch (error: any) {
      logger.error(`[FCM] Error fetching active tokens: ${error.message}`);
      return [];
    }
  }

  /**
   * Menghapus token yang invalid dari Firestore
   */
  private async removeInvalidToken(token: string): Promise<void> {
    try {
      const snapshot = await db.collection('devices').where('fcmToken', '==', token).get();
      const batch = db.batch();
      
      snapshot.forEach(doc => {
        batch.update(doc.ref, { fcmToken: null, isActive: false });
      });
      
      await batch.commit();
      logger.info(`[FCM] Invalid token removed from Firestore`);
    } catch (error: any) {
      logger.error(`[FCM] Error removing invalid token: ${error.message}`);
    }
  }

  /**
   * Mengirim reminder auto cleaning 10 menit sebelumnya
   */
  async sendReminder10Minutes(): Promise<void> {
    const tokens = await this.getActiveTokens();
    
    if (tokens.length === 0) {
      logger.info('[FCM] No active devices found to send 10 minute cleaning reminder.');
      return;
    }

    const payload = {
      notification: {
        title: '⏰ Pembersihan Otomatis Akan Dimulai',
        body: 'Pembersihan panel surya akan dimulai dalam 10 menit.\n\nApakah Anda ingin menjalankan pembersihan sekarang secara manual?',
      },
      data: {
        type: 'AUTO_CLEANING_REMINDER',
        minutes: '10',
      },
    };

    await this.sendNotification(tokens, payload);
    logger.info('[FCM] Reminder 10 Minutes sent');
  }

  /**
   * Mengirim reminder auto cleaning 5 menit sebelumnya
   */
  async sendReminder5Minutes(): Promise<void> {
    const tokens = await this.getActiveTokens();
    
    if (tokens.length === 0) {
      logger.info('[FCM] No active devices found to send 5 minute cleaning warning.');
      return;
    }

    const payload = {
      notification: {
        title: '⚠️ Pengingat Pembersihan Panel',
        body: 'Sistem akan melakukan pembersihan otomatis dalam 5 menit. Pastikan area panel aman.',
      },
      data: {
        type: 'AUTO_CLEANING_WARNING',
        minutes: '5',
      },
    };

    await this.sendNotification(tokens, payload);
    logger.info('[FCM] Reminder 5 Minutes sent');
  }

  /**
   * Mengirim notifikasi pembersihan dimulai secara otomatis (Auto RTC)
   */
  async sendAutoCleaningStartedNotification(): Promise<void> {
    const tokens = await this.getActiveTokens();
    
    if (tokens.length === 0) {
      logger.info('[FCM]\nNo active devices found to send auto cleaning started notification.');
      return;
    }

    const payload = {
      notification: {
        title: '🧹 Pembersihan Dimulai',
        body: 'Sistem sedang membersihkan panel surya secara otomatis.',
      },
      data: {
        type: 'AUTO_CLEANING_STARTED',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'panel_care_notification',
          sound: 'default',
        },
      },
    };

    try {
      await this.sendNotification(tokens, payload);
      logger.info('[FCM]\nAuto Cleaning notification sent successfully.');
    } catch (error) {
      logger.error('[FCM]\nFailed to send Auto Cleaning notification.');
    }
  }

  /**
   * Mengirim notifikasi pembersihan selesai
   */
  async sendCleaningFinished(durationInSeconds: number, status: string): Promise<void> {
    const tokens = await this.getActiveTokens();
    
    if (tokens.length === 0) {
      logger.info('[FCM] No active devices found to send cleaning finished notification.');
      return;
    }

    const minutes = Math.floor(durationInSeconds / 60);
    const seconds = durationInSeconds % 60;
    
    let durationString = '';
    if (minutes > 0) {
      durationString += `${minutes} menit `;
    }
    durationString += `${seconds} detik`;

    const payload = {
      notification: {
        title: '✅ Pembersihan Selesai',
        body: `Panel surya berhasil dibersihkan.\n\nDurasi : ${durationString}\n\nStatus Panel : ${status}`,
      },
      data: {
        type: 'AUTO_CLEANING_FINISHED',
        duration: durationInSeconds.toString(),
        status: status,
      },
    };

    await this.sendNotification(tokens, payload);
    logger.info('[FCM] Cleaning Finished sent');
  }

  /**
   * Mengirim notifikasi suhu panel terlalu tinggi
   */
  async sendOverheatNotification(temperature: number, deviceId: string): Promise<void> {
    const tokens = await this.getActiveTokens();
    
    if (tokens.length === 0) {
      logger.info('[FCM] No active devices found to send overheat notification.');
      return;
    }

    const payload = {
      notification: {
        title: '🔥 Suhu Panel Terlalu Tinggi',
        body: `Suhu panel mencapai ${temperature}°C.\nSegera aktifkan sistem pendingin (Cooling) untuk menjaga performa panel surya.`,
      },
      data: {
        type: 'OVERHEAT',
        temperature: temperature.toString(),
        deviceId: deviceId,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'panelcare_alert',
          sound: 'default',
        },
      },
    };

    await this.sendNotification(tokens, payload);
  }

  /**
   * Mengirim notifikasi suhu panel kembali normal
   */
  async sendRecoveryNotification(_temperature: number, deviceId: string): Promise<void> {
    const tokens = await this.getActiveTokens();
    
    if (tokens.length === 0) {
      logger.info('[FCM] No active devices found to send recovery notification.');
      return;
    }

    const payload = {
      notification: {
        title: '✅ Suhu Panel Kembali Normal',
        body: 'Temperatur panel telah kembali ke kondisi aman.',
      },
      data: {
        type: 'TEMP_NORMAL',
        deviceId: deviceId,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'panelcare_alert',
          sound: 'default',
        },
      },
    };

    await this.sendNotification(tokens, payload);
  }
}

export default new NotificationService();
