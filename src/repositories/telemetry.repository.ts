import { db, admin } from '../config/firebase';
import logger from '../utils/logger';
import { TelemetryPayload } from '../validators/telemetry.validator';

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  cursor?: string;
  date?: 'today' | 'yesterday' | string; // ISO date string for custom
  interval?: '3s' | '5m';
  search?: string; // searches mode field
  deviceId?: string;
}

export interface PaginatedHistoryResult {
  data: any[];
  totalData: number;
  totalPages: number;
  page: number;
  limit: number;
  nextCursor?: string | null;
}

export class TelemetryRepository {
  public static async save(
    payload: TelemetryPayload,
    topic: string,
    source: string = 'mqtt',
  ): Promise<string> {
    try {
      const collectionRef = db.collection('telemetry');

      const docData = {
        ...payload,
        topic,
        source,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await collectionRef.add(docData);

      const logOutput = `[FIRESTORE]\n\nTelemetry saved successfully\n\nDocument ID:\n${docRef.id}`;
      logger.info(logOutput);
      return docRef.id;
    } catch (error: any) {
      const logOutput = `[FIRESTORE]\n\nFailed to save telemetry\n\nReason:\n${error.message || error}`;
      logger.error(logOutput);
      throw error;
    }
  }

  public static async getLatest(): Promise<any | null> {
    try {
      const collectionRef = db.collection('telemetry');
      const snapshot = await collectionRef.orderBy('receivedAt', 'desc').limit(1).get();

      if (snapshot.empty) {
        logger.info('[REST API] Firestore Read Success');
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      if (data.receivedAt && typeof data.receivedAt.toDate === 'function') {
        data.receivedAt = data.receivedAt.toDate().toISOString();
      }

      logger.info('[REST API] Firestore Read Success');
      return { id: doc.id, ...data };
    } catch (error: any) {
      logger.error('[REST API] Firestore Read Failed', { error });
      throw error;
    }
  }

  /** Legacy method — kept for compatibility */
  public static async getHistory(page: number, limit: number): Promise<any[]> {
    const result = await TelemetryRepository.getHistoryPaginated({ page, limit });
    return result.data;
  }

  /**
   * Build start/end Date objects based on the "date" filter param.
   * date = 'today' | 'yesterday' | ISO date string
   */
  private static _resolveDateRange(date?: string): { startDate: Date; endDate: Date } | null {
    if (!date) return null;

    const timezoneOffsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? 420);
    const timezoneOffsetMs = timezoneOffsetMinutes * 60 * 1000;
    const nowInAppTimezone = new Date(Date.now() + timezoneOffsetMs);
    let localYear = nowInAppTimezone.getUTCFullYear();
    let localMonth = nowInAppTimezone.getUTCMonth();
    let localDate = nowInAppTimezone.getUTCDate();

    if (date === 'yesterday') {
      const yesterdayInAppTimezone = new Date(
        Date.UTC(localYear, localMonth, localDate) - 24 * 60 * 60 * 1000,
      );
      localYear = yesterdayInAppTimezone.getUTCFullYear();
      localMonth = yesterdayInAppTimezone.getUTCMonth();
      localDate = yesterdayInAppTimezone.getUTCDate();
    } else if (date !== 'today') {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) return null;
      const parsedInAppTimezone = new Date(parsed.getTime() + timezoneOffsetMs);
      localYear = parsedInAppTimezone.getUTCFullYear();
      localMonth = parsedInAppTimezone.getUTCMonth();
      localDate = parsedInAppTimezone.getUTCDate();
    }

    const startDate = new Date(
      Date.UTC(localYear, localMonth, localDate, 0, 0, 0, 0) - timezoneOffsetMs,
    );
    const endDate = new Date(
      Date.UTC(localYear, localMonth, localDate, 23, 59, 59, 999) - timezoneOffsetMs,
    );

    return { startDate, endDate };
  }

  /**
   * Down-sample records to one per N-minute bucket (first record in bucket).
   * Used for interval = '5m'.
   */
  private static _downsample5Min(records: any[]): any[] {
    const buckets = new Map<string, any>();
    for (const rec of records) {
      const ts: Date =
        rec.receivedAt instanceof Date ? rec.receivedAt : new Date(rec.receivedAt ?? rec.timestamp);
      const bucketMin = Math.floor(ts.getMinutes() / 5) * 5;
      const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}-${bucketMin}`;
      if (!buckets.has(key)) {
        buckets.set(key, rec);
      }
    }
    return Array.from(buckets.values());
  }

  /**
   * Formats a raw Firestore document into a clean record object.
   */
  private static _formatDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): any {
    const data = doc.data();
    if (data.receivedAt && typeof data.receivedAt.toDate === 'function') {
      data.receivedAt = data.receivedAt.toDate().toISOString();
    }
    if (data.timestamp && typeof data.timestamp.toDate === 'function') {
      data.timestamp = data.timestamp.toDate().toISOString();
    }
    return { id: doc.id, ...data };
  }

  /**
   * Get paginated telemetry history with date, interval, and search filters.
   * Uses cursor-based pagination for efficiency at scale.
   */
  public static async getHistoryPaginated(
    params: HistoryQueryParams,
  ): Promise<PaginatedHistoryResult> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(200, Math.max(1, params.limit ?? 50));
    const interval = params.interval ?? '3s';
    const deviceId = params.deviceId;
    const search = params.search?.toLowerCase();

    const dateRange = TelemetryRepository._resolveDateRange(params.date);

    try {
      let query: FirebaseFirestore.Query = db.collection('telemetry').orderBy('receivedAt', 'desc');

      // Date filter — applied at Firestore level
      if (dateRange) {
        query = query
          .where('receivedAt', '>=', admin.firestore.Timestamp.fromDate(dateRange.startDate))
          .where('receivedAt', '<=', admin.firestore.Timestamp.fromDate(dateRange.endDate));
      }

      // deviceId filter
      if (deviceId && deviceId !== 'all') {
        query = query.where('deviceId', '==', deviceId);
      }

      if (interval === '5m') {
        // For 5-min interval, fetch ALL records for the day and downsample server-side
        // (Firestore doesn't support time bucketing natively)
        const allSnapshot = await query.get();
        const allRecords = allSnapshot.docs.map(TelemetryRepository._formatDoc);

        // Apply search filter on mode field
        const filtered = search
          ? allRecords.filter(
              (r) =>
                (r.mode?.toLowerCase().includes(search) ?? false) ||
                (r.deviceId?.toLowerCase().includes(search) ?? false),
            )
          : allRecords;

        const downsampled = TelemetryRepository._downsample5Min(filtered);
        const totalData = downsampled.length;
        const totalPages = Math.ceil(totalData / limit);
        const startIdx = (page - 1) * limit;
        const pageData = downsampled.slice(startIdx, startIdx + limit);

        return { data: pageData, totalData, totalPages, page, limit, nextCursor: null };
      } else {
        // Interval = 3s: get all raw data, paginated efficiently
        // First: get total count for this date range (fetch count only)
        let countQuery: FirebaseFirestore.Query = db
          .collection('telemetry')
          .orderBy('receivedAt', 'desc');
        if (dateRange) {
          countQuery = countQuery
            .where('receivedAt', '>=', admin.firestore.Timestamp.fromDate(dateRange.startDate))
            .where('receivedAt', '<=', admin.firestore.Timestamp.fromDate(dateRange.endDate));
        }
        if (deviceId && deviceId !== 'all') {
          countQuery = countQuery.where('deviceId', '==', deviceId);
        }

        // Use aggregation count if available (Blaze plan), fallback to snapshot size
        let totalData = 0;
        try {
          const countSnap = await (countQuery as any).count().get();
          totalData = countSnap.data().count;
        } catch {
          // Fallback: fetch all docs to count (only on small datasets or Spark plan)
          const countSnap = await countQuery.get();
          totalData = countSnap.size;
        }

        const totalPages = Math.ceil(totalData / limit);

        let pageQuery = query;

        if (params.cursor) {
          const cursorDoc = await db.collection('telemetry').doc(params.cursor).get();
          if (cursorDoc.exists) {
            pageQuery = pageQuery.startAfter(cursorDoc);
          }
        } else if (page > 1) {
          const cursorOffset = (page - 1) * limit;
          const cursorSnap = await query.limit(cursorOffset).get();
          if (!cursorSnap.empty) {
            pageQuery = pageQuery.startAfter(cursorSnap.docs[cursorSnap.docs.length - 1]);
          }
        }

        const snapshot = await pageQuery.limit(limit + 1).get();
        const pageDocs = snapshot.docs.slice(0, limit);
        let data = pageDocs.map(TelemetryRepository._formatDoc);
        const nextCursor =
          snapshot.docs.length > limit ? (pageDocs[pageDocs.length - 1]?.id ?? null) : null;

        // Apply search filter post-fetch (mode/deviceId search)
        if (search) {
          data = data.filter(
            (r) =>
              (r.mode?.toLowerCase().includes(search) ?? false) ||
              (r.deviceId?.toLowerCase().includes(search) ?? false),
          );
        }

        logger.info(
          `[HISTORY] page=${page} limit=${limit} total=${totalData} returned=${data.length}`,
        );
        return { data, totalData, totalPages, page, limit, nextCursor };
      }
    } catch (error: any) {
      logger.error('[REST API] Firestore getHistoryPaginated Failed', { error });
      throw error;
    }
  }

  /**
   * Fetch ALL records for export (no pagination) — used by export endpoints.
   */
  public static async getAllForExport(
    params: Omit<HistoryQueryParams, 'page' | 'limit'>,
  ): Promise<any[]> {
    const records: any[] = [];
    await TelemetryRepository.forEachExportRecord(params, async (record) => {
      records.push(record);
    });
    return records;
  }

  public static async forEachExportRecord(
    params: Omit<HistoryQueryParams, 'page' | 'limit'>,
    onRecord: (record: any, index: number) => void | Promise<void>,
    batchSize: number = 500,
  ): Promise<number> {
    const interval = params.interval ?? '3s';
    const dateRange = TelemetryRepository._resolveDateRange(params.date);
    const search = params.search?.toLowerCase();
    const deviceId = params.deviceId;
    const seenBuckets = new Set<string>();
    let total = 0;

    try {
      let query: FirebaseFirestore.Query = db.collection('telemetry').orderBy('receivedAt', 'asc');

      if (dateRange) {
        query = query
          .where('receivedAt', '>=', admin.firestore.Timestamp.fromDate(dateRange.startDate))
          .where('receivedAt', '<=', admin.firestore.Timestamp.fromDate(dateRange.endDate));
      }

      if (deviceId && deviceId !== 'all') {
        query = query.where('deviceId', '==', deviceId);
      }

      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

      while (true) {
        let batchQuery = query.limit(batchSize);
        if (lastDoc) {
          batchQuery = batchQuery.startAfter(lastDoc);
        }

        const snapshot = await batchQuery.get();
        if (snapshot.empty) break;

        for (const doc of snapshot.docs) {
          const record = TelemetryRepository._formatDoc(doc);

          if (
            search &&
            !(record.mode?.toLowerCase().includes(search) ?? false) &&
            !(record.deviceId?.toLowerCase().includes(search) ?? false)
          ) {
            continue;
          }

          if (interval === '5m') {
            const ts = new Date(record.receivedAt ?? record.timestamp);
            const bucketMin = Math.floor(ts.getMinutes() / 5) * 5;
            const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}-${bucketMin}`;
            if (seenBuckets.has(key)) continue;
            seenBuckets.add(key);
          }

          await onRecord(record, total);
          total++;
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.size < batchSize) break;
      }

      logger.info(`[EXPORT] forEachExportRecord: ${total} records (interval=${interval})`);
      return total;
    } catch (error: any) {
      logger.error('[EXPORT] forEachExportRecord Failed', { error });
      throw error;
    }
  }
}
