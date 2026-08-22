"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryService = void 0;
const telemetry_repository_1 = require("../repositories/telemetry.repository");
const socket_server_1 = require("../socket/socket.server");
const socket_events_1 = require("../socket/socket.events");
const logger_1 = __importDefault(require("../utils/logger"));
const telemetry_dto_1 = require("../dto/telemetry.dto");
class TelemetryService {
    static latestTelemetryCache = new Map();
    static async saveTelemetry(payload, topic) {
        const receivedAt = new Date().toISOString();
        const emitPayload = {
            deviceId: payload.deviceId,
            temperature: payload.temperature,
            voltage: payload.voltage,
            current: payload.current,
            power: payload.power,
            dust: payload.dust,
            airTemp: payload.airTemp,
            pwm_value: payload.pwm_value,
            pumpStatus: payload.pumpStatus,
            wiperStatus: payload.wiperStatus,
            mode: payload.mode,
            timestamp: payload.timestamp || receivedAt,
            receivedAt,
        };
        // Update in-memory cache immediately for sub-millisecond REST API queries
        TelemetryService.latestTelemetryCache.set(payload.deviceId || 'panel001', emitPayload);
        // 1. Emit Socket.IO event IMMEDIATELY for zero latency delivery to Flutter
        try {
            const io = (0, socket_server_1.getSocketIO)();
            io.emit(socket_events_1.SOCKET_EVENTS.TELEMETRY_UPDATE, emitPayload);
            const clientCount = io.sockets.sockets.size;
            logger_1.default.info(`[SOCKET] Realtime telemetry emitted to ${clientCount} clients (${payload.deviceId})`);
        }
        catch (error) {
            logger_1.default.error(`[SOCKET] Failed to emit telemetry: ${error.message || error}`);
        }
        // 2. Persist to Firestore concurrently (non-blocking)
        try {
            await telemetry_repository_1.TelemetryRepository.save(payload, topic, 'mqtt');
        }
        catch (error) {
            logger_1.default.error(`[TELEMETRY] Firestore save error: ${error.message || error}`);
        }
    }
    static async getLatestTelemetry(deviceId = 'panel001') {
        if (TelemetryService.latestTelemetryCache.has(deviceId)) {
            return TelemetryService.latestTelemetryCache.get(deviceId);
        }
        const latestFromDb = await telemetry_repository_1.TelemetryRepository.getLatest();
        if (latestFromDb) {
            TelemetryService.latestTelemetryCache.set(deviceId, latestFromDb);
        }
        return latestFromDb;
    }
    /** Legacy — kept for backward compatibility */
    static async getTelemetryHistory(page, limit) {
        const result = await telemetry_repository_1.TelemetryRepository.getHistoryPaginated({ page, limit });
        return result.data;
    }
    /**
     * Paginated history with full filter support.
     */
    static async getHistoryPaginated(params) {
        return telemetry_repository_1.TelemetryRepository.getHistoryPaginated(params);
    }
    /**
     * Fetch ALL records matching filter — used for server-side export.
     */
    static async getAllForExport(params) {
        return telemetry_repository_1.TelemetryRepository.getAllForExport(params);
    }
    static async forEachExportRecord(params, onRecord, batchSize) {
        return telemetry_repository_1.TelemetryRepository.forEachExportRecord(params, onRecord, batchSize);
    }
    static async getDashboardData(deviceId = 'panel001') {
        const latest = await TelemetryService.getLatestTelemetry(deviceId);
        if (!latest) {
            return null;
        }
        return await (0, telemetry_dto_1.toDashboardDTO)(latest, latest.deviceId || deviceId);
    }
}
exports.TelemetryService = TelemetryService;
