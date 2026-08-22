"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryRepository = void 0;
const firebase_1 = require("../config/firebase");
const logger_1 = __importDefault(require("../utils/logger"));
class TelemetryRepository {
    static async save(payload, topic, source = 'mqtt') {
        try {
            const collectionRef = firebase_1.db.collection('telemetry');
            const docData = {
                ...payload,
                topic,
                source: payload.source || source,
                isDemo: payload.isDemo ?? (source === 'demo'),
                receivedAt: firebase_1.admin.firestore.FieldValue.serverTimestamp(),
            };
            const docRef = await collectionRef.add(docData);
            const logOutput = `[FIRESTORE]\n\nTelemetry saved successfully\n\nDocument ID:\n${docRef.id}`;
            logger_1.default.info(logOutput);
            return docRef.id;
        }
        catch (error) {
            const logOutput = `[FIRESTORE]\n\nFailed to save telemetry\n\nReason:\n${error.message || error}`;
            logger_1.default.error(logOutput);
            throw error;
        }
    }
    static async getLatest() {
        try {
            const collectionRef = firebase_1.db.collection('telemetry');
            const snapshot = await collectionRef.orderBy('receivedAt', 'desc').limit(1).get();
            if (snapshot.empty) {
                logger_1.default.info('[REST API] Firestore Read Success');
                return null;
            }
            const doc = snapshot.docs[0];
            const data = doc.data();
            if (data.receivedAt && typeof data.receivedAt.toDate === 'function') {
                data.receivedAt = data.receivedAt.toDate().toISOString();
            }
            logger_1.default.info('[REST API] Firestore Read Success');
            return { id: doc.id, ...data };
        }
        catch (error) {
            logger_1.default.error('[REST API] Firestore Read Failed', { error });
            throw error;
        }
    }
    /** Legacy method — kept for compatibility */
    static async getHistory(page, limit) {
        const result = await TelemetryRepository.getHistoryPaginated({ page, limit });
        return result.data;
    }
    /**
     * Build start/end Date objects based on the "date" filter param.
     * date = 'today' | 'yesterday' | ISO date string
     */
    static _resolveDateRange(date) {
        if (!date)
            return null;
        const timezoneOffsetMinutes = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES ?? 420);
        const timezoneOffsetMs = timezoneOffsetMinutes * 60 * 1000;
        const nowInAppTimezone = new Date(Date.now() + timezoneOffsetMs);
        let localYear = nowInAppTimezone.getUTCFullYear();
        let localMonth = nowInAppTimezone.getUTCMonth();
        let localDate = nowInAppTimezone.getUTCDate();
        if (date === 'yesterday') {
            const yesterdayInAppTimezone = new Date(Date.UTC(localYear, localMonth, localDate) - 24 * 60 * 60 * 1000);
            localYear = yesterdayInAppTimezone.getUTCFullYear();
            localMonth = yesterdayInAppTimezone.getUTCMonth();
            localDate = yesterdayInAppTimezone.getUTCDate();
        }
        else if (date !== 'today') {
            const parsed = new Date(date);
            if (isNaN(parsed.getTime()))
                return null;
            const parsedInAppTimezone = new Date(parsed.getTime() + timezoneOffsetMs);
            localYear = parsedInAppTimezone.getUTCFullYear();
            localMonth = parsedInAppTimezone.getUTCMonth();
            localDate = parsedInAppTimezone.getUTCDate();
        }
        const startDate = new Date(Date.UTC(localYear, localMonth, localDate, 0, 0, 0, 0) - timezoneOffsetMs);
        const endDate = new Date(Date.UTC(localYear, localMonth, localDate, 23, 59, 59, 999) - timezoneOffsetMs);
        return { startDate, endDate };
    }
    /**
     * Down-sample records to one per N-minute bucket (first record in bucket).
     * Used for interval = '5m'.
     */
    static _downsample5Min(records) {
        const buckets = new Map();
        for (const rec of records) {
            const ts = rec.receivedAt instanceof Date ? rec.receivedAt : new Date(rec.receivedAt ?? rec.timestamp);
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
    static _formatDoc(doc) {
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
    static async getHistoryPaginated(params) {
        const page = Math.max(1, params.page ?? 1);
        const limit = Math.min(200, Math.max(1, params.limit ?? 50));
        const interval = params.interval ?? '3s';
        const deviceId = params.deviceId;
        const search = params.search?.toLowerCase();
        const dateRange = TelemetryRepository._resolveDateRange(params.date);
        try {
            let query = firebase_1.db.collection('telemetry').orderBy('receivedAt', 'desc');
            // Date filter — applied at Firestore level
            if (dateRange) {
                query = query
                    .where('receivedAt', '>=', firebase_1.admin.firestore.Timestamp.fromDate(dateRange.startDate))
                    .where('receivedAt', '<=', firebase_1.admin.firestore.Timestamp.fromDate(dateRange.endDate));
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
                    ? allRecords.filter((r) => (r.mode?.toLowerCase().includes(search) ?? false) ||
                        (r.deviceId?.toLowerCase().includes(search) ?? false))
                    : allRecords;
                const downsampled = TelemetryRepository._downsample5Min(filtered);
                const totalData = downsampled.length;
                const totalPages = Math.ceil(totalData / limit);
                const startIdx = (page - 1) * limit;
                const pageData = downsampled.slice(startIdx, startIdx + limit);
                return { data: pageData, totalData, totalPages, page, limit, nextCursor: null };
            }
            else {
                // Interval = 3s: get all raw data, paginated efficiently
                // First: get total count for this date range (fetch count only)
                let countQuery = firebase_1.db
                    .collection('telemetry')
                    .orderBy('receivedAt', 'desc');
                if (dateRange) {
                    countQuery = countQuery
                        .where('receivedAt', '>=', firebase_1.admin.firestore.Timestamp.fromDate(dateRange.startDate))
                        .where('receivedAt', '<=', firebase_1.admin.firestore.Timestamp.fromDate(dateRange.endDate));
                }
                if (deviceId && deviceId !== 'all') {
                    countQuery = countQuery.where('deviceId', '==', deviceId);
                }
                // Use aggregation count if available (Blaze plan), fallback to snapshot size
                let totalData = 0;
                try {
                    const countSnap = await countQuery.count().get();
                    totalData = countSnap.data().count;
                }
                catch {
                    // Fallback: fetch all docs to count (only on small datasets or Spark plan)
                    const countSnap = await countQuery.get();
                    totalData = countSnap.size;
                }
                const totalPages = Math.ceil(totalData / limit);
                let pageQuery = query;
                if (params.cursor) {
                    const cursorDoc = await firebase_1.db.collection('telemetry').doc(params.cursor).get();
                    if (cursorDoc.exists) {
                        pageQuery = pageQuery.startAfter(cursorDoc);
                    }
                }
                else if (page > 1) {
                    const cursorOffset = (page - 1) * limit;
                    const cursorSnap = await query.limit(cursorOffset).get();
                    if (!cursorSnap.empty) {
                        pageQuery = pageQuery.startAfter(cursorSnap.docs[cursorSnap.docs.length - 1]);
                    }
                }
                const snapshot = await pageQuery.limit(limit + 1).get();
                const pageDocs = snapshot.docs.slice(0, limit);
                let data = pageDocs.map(TelemetryRepository._formatDoc);
                const nextCursor = snapshot.docs.length > limit ? (pageDocs[pageDocs.length - 1]?.id ?? null) : null;
                // Apply search filter post-fetch (mode/deviceId search)
                if (search) {
                    data = data.filter((r) => (r.mode?.toLowerCase().includes(search) ?? false) ||
                        (r.deviceId?.toLowerCase().includes(search) ?? false));
                }
                logger_1.default.info(`[HISTORY] page=${page} limit=${limit} total=${totalData} returned=${data.length}`);
                return { data, totalData, totalPages, page, limit, nextCursor };
            }
        }
        catch (error) {
            logger_1.default.error('[REST API] Firestore getHistoryPaginated Failed', { error });
            throw error;
        }
    }
    /**
     * Fetch ALL records for export (no pagination) — used by export endpoints.
     */
    static async getAllForExport(params) {
        const records = [];
        await TelemetryRepository.forEachExportRecord(params, async (record) => {
            records.push(record);
        });
        return records;
    }
    static async forEachExportRecord(params, onRecord, batchSize = 500) {
        const interval = params.interval ?? '3s';
        const dateRange = TelemetryRepository._resolveDateRange(params.date);
        const search = params.search?.toLowerCase();
        const deviceId = params.deviceId;
        const seenBuckets = new Set();
        let total = 0;
        try {
            let query = firebase_1.db.collection('telemetry').orderBy('receivedAt', 'asc');
            if (dateRange) {
                query = query
                    .where('receivedAt', '>=', firebase_1.admin.firestore.Timestamp.fromDate(dateRange.startDate))
                    .where('receivedAt', '<=', firebase_1.admin.firestore.Timestamp.fromDate(dateRange.endDate));
            }
            if (deviceId && deviceId !== 'all') {
                query = query.where('deviceId', '==', deviceId);
            }
            let lastDoc = null;
            while (true) {
                let batchQuery = query.limit(batchSize);
                if (lastDoc) {
                    batchQuery = batchQuery.startAfter(lastDoc);
                }
                const snapshot = await batchQuery.get();
                if (snapshot.empty)
                    break;
                for (const doc of snapshot.docs) {
                    const record = TelemetryRepository._formatDoc(doc);
                    if (search &&
                        !(record.mode?.toLowerCase().includes(search) ?? false) &&
                        !(record.deviceId?.toLowerCase().includes(search) ?? false)) {
                        continue;
                    }
                    if (interval === '5m') {
                        const ts = new Date(record.receivedAt ?? record.timestamp);
                        const bucketMin = Math.floor(ts.getMinutes() / 5) * 5;
                        const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}-${bucketMin}`;
                        if (seenBuckets.has(key))
                            continue;
                        seenBuckets.add(key);
                    }
                    await onRecord(record, total);
                    total++;
                }
                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                if (snapshot.size < batchSize)
                    break;
            }
            logger_1.default.info(`[EXPORT] forEachExportRecord: ${total} records (interval=${interval})`);
            return total;
        }
        catch (error) {
            logger_1.default.error('[EXPORT] forEachExportRecord Failed', { error });
            throw error;
        }
    }
}
exports.TelemetryRepository = TelemetryRepository;
