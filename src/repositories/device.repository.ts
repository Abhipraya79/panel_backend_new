import { db, admin } from '../config/firebase';
import logger from '../utils/logger';

export class DeviceRepository {
  public static async updateStatus(deviceId: string, status: 'ONLINE' | 'OFFLINE'): Promise<void> {
    try {
      const docRef = db.collection('devices').doc(deviceId);
      await docRef.set(
        {
          deviceId,
          status,
          lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      logger.info(`[FIRESTORE] Device ${deviceId} status updated to ${status}`);
    } catch (error: any) {
      logger.error(`[FIRESTORE] Failed to update device status: ${error.message || error}`);
      throw error;
    }
  }
}
