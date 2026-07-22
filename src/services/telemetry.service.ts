import { TelemetryRepository } from '../repositories/telemetry.repository';
import { TelemetryPayload } from '../validators/telemetry.validator';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import logger from '../utils/logger';
import { DashboardDTO, toDashboardDTO } from '../dto/telemetry.dto';

export class TelemetryService {
  public static async saveTelemetry(payload: TelemetryPayload, topic: string): Promise<void> {
    // 1. Save to Firestore
    await TelemetryRepository.save(payload, topic, 'mqtt');

    // 2. Emit Socket.IO event (wrapped in try/catch to avoid crash)
    try {
      const io = getSocketIO();

      const emitPayload = {
        deviceId: payload.deviceId,
        temperature: payload.temperature,
        voltage: payload.voltage,
        current: payload.current,
        power: payload.power,
        dust: payload.dust,
        airTemp: payload.airTemp,
        pumpStatus: payload.pumpStatus,
        wiperStatus: payload.wiperStatus,
        mode: payload.mode,
        receivedAt: new Date().toISOString(),
      };

      io.emit(SOCKET_EVENTS.TELEMETRY_UPDATE, emitPayload);

      const clientCount = io.sockets.sockets.size;
      logger.info(`[SOCKET]\n\nTelemetry emitted\n\nSocket Clients\n${clientCount}`);
    } catch (error: any) {
      logger.error(`[SOCKET]\n\nFailed to emit telemetry\n\nReason:\n${error.message || error}`);
    }
  }

  public static async getLatestTelemetry(): Promise<any | null> {
    return await TelemetryRepository.getLatest();
  }

  public static async getTelemetryHistory(page: number, limit: number): Promise<any[]> {
    return await TelemetryRepository.getHistory(page, limit);
  }

  public static async getDashboardData(): Promise<DashboardDTO | null> {
    const latest = await TelemetryRepository.getLatest();
    if (!latest) {
      return null;
    }
    // toDashboardDTO is now async — reads device status from Firestore
    return await toDashboardDTO(latest, latest.deviceId || 'panel001');
  }
}
