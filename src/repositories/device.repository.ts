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

  /**
   * Reads the current device status from Firestore.
   * Returns 'ONLINE' or 'OFFLINE'. Defaults to 'OFFLINE' if device document doesn't exist.
   */
  public static async getStatus(deviceId: string): Promise<'ONLINE' | 'OFFLINE'> {
    try {
      const docRef = db.collection('devices').doc(deviceId);
      const doc = await docRef.get();

      if (!doc.exists) {
        logger.info(`[FIRESTORE] Device ${deviceId} not found — defaulting to OFFLINE`);
        return 'OFFLINE';
      }

      const data = doc.data();
      const status = data?.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
      return status;
    } catch (error: any) {
      logger.error(`[FIRESTORE] Failed to read device status: ${error.message || error}`);
      return 'OFFLINE';
    }
  }
}
