import logger from '../utils/logger';
import { telemetryPayloadSchema } from '../validators/telemetry.validator';
import { statusPayloadSchema } from '../validators/status.validator';
import { eventPayloadSchema } from '../validators/event.validator';
import { TelemetryService } from '../services/telemetry.service';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import { DeviceRepository } from '../repositories/device.repository';
import { EventRepository } from '../repositories/event.repository';
import temperatureMonitoringService from '../services/temperature-monitoring.service';

export const handleMQTTMessage = async (topic: string, message: Buffer): Promise<void> => {
  const payloadStr = message.toString();

  try {
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch {
      const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n- Payload is not a valid JSON string`;
      logger.info(logMessage);
      return;
    }

    // ─── TELEMETRY ────────────────────────────────────────────────────────────
    if (topic === 'solar/panel/telemetry') {
      const result = telemetryPayloadSchema.safeParse(parsedPayload);
      if (result.success) {
        logger.info(`[MQTT] Valid telemetry received for device: ${result.data.deviceId}`);
        // Forward to TelemetryService (emits Socket.IO + persists to Firestore)
        await TelemetryService.saveTelemetry(result.data, topic);
        // Check for overheat
        await temperatureMonitoringService.checkTemperature(result.data.deviceId, result.data.temperature);
      } else {
        const reasons = result.error.errors.map((err) => err.message);
        logger.warn(`[MQTT] Invalid telemetry payload: ${reasons.join(', ')}`);
      }

    // ─── STATUS ───────────────────────────────────────────────────────────────
    } else if (topic === 'solar/panel/status') {
      const result = statusPayloadSchema.safeParse(parsedPayload);
      if (result.success) {
        const logMessage = `[MQTT]\n\nPayload Valid\n\nTopic:\n${topic}\n\nPayload:\n${JSON.stringify(result.data, null, 2)}`;
        logger.info(logMessage);

        try {
          const status = result.data.status.toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
          await DeviceRepository.updateStatus(result.data.deviceId, status);

          const io = getSocketIO();
          io.emit(SOCKET_EVENTS.STATUS_UPDATE, {
            deviceId: result.data.deviceId,
            status,
          });

          logger.info(`[SOCKET] Emitted ${SOCKET_EVENTS.STATUS_UPDATE} — ${status}`);
        } catch (error: any) {
          logger.error(`Error saving status: ${error.message}`);
        }
      } else {
        const reasons = result.error.errors.map((err) => err.message);
        const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n${reasons.map((r) => `- ${r}`).join('\n')}`;
        logger.info(logMessage);
      }

    // ─── EVENT ────────────────────────────────────────────────────────────────
    } else if (topic === 'solar/panel/event') {
      const result = eventPayloadSchema.safeParse(parsedPayload);
      if (result.success) {
        const logMessage = `[MQTT]\n\nPayload Valid\n\nTopic:\n${topic}\n\nPayload:\n${JSON.stringify(result.data, null, 2)}`;
        logger.info(logMessage);

        try {
          const eventObj = {
            deviceId: result.data.deviceId,
            event: result.data.event,
            timestamp: result.data.timestamp,
          };
          await EventRepository.save(eventObj);

          const io = getSocketIO();
          io.emit(SOCKET_EVENTS.EVENT_NEW, eventObj);

          logger.info(`[SOCKET] Emitted ${SOCKET_EVENTS.EVENT_NEW} — ${eventObj.event}`);
        } catch (error: any) {
          logger.error(`Error saving event: ${error.message}`);
        }

        // ─── Cleaning completion detection (ESP is source of truth) ──────────
        // ESP sends event "Cleaning Finished" (or similar) when cleaning cycle is done.
        if (
          typeof result.data.event === 'string' &&
          (result.data.event.toLowerCase().includes('cleaning finished') ||
           result.data.event.toLowerCase().includes('cleaning completed') ||
           result.data.event.toLowerCase().includes('cleaning cycle completed'))
        ) {
          logger.info('[MQTT] Cleaning completion detected via event feedback from ESP');

          try {
            const io = getSocketIO();
            io.emit(SOCKET_EVENTS.CLEANING_UPDATE, { status: 'idle' });
            logger.info(
              `[SOCKET] Emitted ${SOCKET_EVENTS.CLEANING_UPDATE} — cleaning idle (completed)`,
            );
          } catch (socketError: any) {
            logger.error(
              `[SOCKET] Failed to emit cleaning status: ${socketError.message || socketError}`,
            );
          }
          
          import('../services/notification.service').then((ns) => {
            const duration = result.data.duration ?? 0; // Use duration if sent, else 0
            ns.default.sendCleaningFinished(duration, 'BERSIH');
          }).catch((err) => {
             logger.error(`[FCM] Failed to trigger notification service: ${err.message}`);
          });

        } else if (
          typeof result.data.event === 'string' &&
          result.data.event.toLowerCase().includes('cleaning started')
        ) {
           import('../services/notification.service').then((ns) => {
            ns.default.sendAutoCleaningStartedNotification();
          }).catch((err) => {
             logger.error(`[FCM] Failed to trigger notification service: ${err.message}`);
          });
        }
      } else {
        const reasons = result.error.errors.map((err) => err.message);
        const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n${reasons.map((r) => `- ${r}`).join('\n')}`;
        logger.info(logMessage);
      }

    // ─── UNKNOWN TOPIC ────────────────────────────────────────────────────────
    } else {
      logger.warn(`[MQTT] Received message on unknown topic: ${topic}`);
    }
  } catch (error: any) {
    logger.error(`Error processing MQTT message on topic ${topic}: ${error.message}`, { error });
  }
};
