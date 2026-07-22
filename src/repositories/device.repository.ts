import { db, admin } from '../config/firebase';
import logger from '../utils/logger';

export class DeviceRepository {
  private static statusCache: Map<string, 'ONLINE' | 'OFFLINE'> = new Map();

  public static async updateStatus(deviceId: string, status: 'ONLINE' | 'OFFLINE'): Promise<void> {
    DeviceRepository.statusCache.set(deviceId, status);
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
   * Reads the current device status.
   * Returns cached status if available, otherwise reads from Firestore.
   */
  public static async getStatus(deviceId: string): Promise<'ONLINE' | 'OFFLINE'> {
    if (DeviceRepository.statusCache.has(deviceId)) {
      return DeviceRepository.statusCache.get(deviceId)!;
    }

    try {
      const docRef = db.collection('devices').doc(deviceId);
      const doc = await docRef.get();

      if (!doc.exists) {
        logger.info(`[FIRESTORE] Device ${deviceId} not found — defaulting to OFFLINE`);
        DeviceRepository.statusCache.set(deviceId, 'OFFLINE');
        return 'OFFLINE';
      }

      const data = doc.data();
      const status = data?.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
      DeviceRepository.statusCache.set(deviceId, status);
      return status;
    } catch (error: any) {
      logger.error(`[FIRESTORE] Failed to read device status: ${error.message || error}`);
      return 'OFFLINE';
    }
  }
}
