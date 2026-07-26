import { TelemetryRepository } from '../repositories/telemetry.repository';
import { TelemetryPayload } from '../validators/telemetry.validator';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import logger from '../utils/logger';
import { DashboardDTO, toDashboardDTO } from '../dto/telemetry.dto';

export class TelemetryService {
  private static latestTelemetryCache: Map<string, any> = new Map();

  public static async saveTelemetry(payload: TelemetryPayload, topic: string): Promise<void> {
    const receivedAt = new Date().toISOString();

    const emitPayload = {
      deviceId: payload.deviceId,
      temperature: payload.temperature,
      voltage: payload.voltage,
      current: payload.current,
      power: payload.power,
      dust: payload.dust,
      airTemp: payload.airTemp,
      pwm: payload.pwm,
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
      const io = getSocketIO();
      io.emit(SOCKET_EVENTS.TELEMETRY_UPDATE, emitPayload);
      const clientCount = io.sockets.sockets.size;
      logger.info(`[SOCKET] Realtime telemetry emitted to ${clientCount} clients (${payload.deviceId})`);
    } catch (error: any) {
      logger.error(`[SOCKET] Failed to emit telemetry: ${error.message || error}`);
    }

    // 2. Persist to Firestore concurrently (non-blocking)
    try {
      await TelemetryRepository.save(payload, topic, 'mqtt');
    } catch (error: any) {
      logger.error(`[TELEMETRY] Firestore save error: ${error.message || error}`);
    }
  }

  public static async getLatestTelemetry(deviceId: string = 'panel001'): Promise<any | null> {
    if (TelemetryService.latestTelemetryCache.has(deviceId)) {
      return TelemetryService.latestTelemetryCache.get(deviceId);
    }
    const latestFromDb = await TelemetryRepository.getLatest();
    if (latestFromDb) {
      TelemetryService.latestTelemetryCache.set(deviceId, latestFromDb);
    }
    return latestFromDb;
  }

  public static async getTelemetryHistory(page: number, limit: number): Promise<any[]> {
    return await TelemetryRepository.getHistory(page, limit);
  }

  public static async getDashboardData(deviceId: string = 'panel001'): Promise<DashboardDTO | null> {
    const latest = await TelemetryService.getLatestTelemetry(deviceId);
    if (!latest) {
      return null;
    }
    return await toDashboardDTO(latest, latest.deviceId || deviceId);
  }
}
