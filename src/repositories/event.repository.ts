import { db, admin } from '../config/firebase';
import logger from '../utils/logger';

export interface DeviceEvent {
  deviceId: string;
  event: string;
  timestamp?: string;
}

export class EventRepository {
  public static async save(eventData: DeviceEvent): Promise<void> {
    try {
      const collectionRef = db.collection('events');
      await collectionRef.add({
        ...eventData,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`[FIRESTORE] Event saved successfully: ${eventData.event}`);
    } catch (error: any) {
      logger.error(`[FIRESTORE] Failed to save event: ${error.message || error}`);
      throw error;
    }
  }

  public static async getHistory(page: number, limit: number): Promise<any[]> {
    try {
      const collectionRef = db.collection('events');
      const offset = (page - 1) * limit;
      const snapshot = await collectionRef
        .orderBy('receivedAt', 'desc')
        .offset(offset)
        .limit(limit)
        .get();

      const history: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.receivedAt && typeof data.receivedAt.toDate === 'function') {
          data.receivedAt = data.receivedAt.toDate().toISOString();
        }
        history.push({
          id: doc.id,
          ...data,
        });
      });

      return history;
    } catch (error: any) {
      logger.error('[REST API] Firestore Event Read Failed', { error });
      throw error;
    }
  }
}
