import logger from '../utils/logger';
import { telemetryPayloadSchema } from '../validators/telemetry.validator';
import { statusPayloadSchema } from '../validators/status.validator';
import { eventPayloadSchema } from '../validators/event.validator';
import { TelemetryService } from '../services/telemetry.service';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import { DeviceRepository } from '../repositories/device.repository';
import { EventRepository } from '../repositories/event.repository';

// ─── Telemetry transition tracking for cleaning completion detection ─────────
// When ESP finishes cleaning, pumpStatus and wiperStatus transition from true → false.
// We track the previous values to detect this transition.
let previousPumpStatus: boolean | null = null;
let previousWiperStatus: boolean | null = null;

export const handleMQTTMessage = async (topic: string, message: Buffer): Promise<void> => {
  const payloadStr = message.toString();

  try {
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(payloadStr);
    } catch {
      // If payload is not valid JSON, print invalid payload message with reason
      const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n- Payload is not a valid JSON string`;
      logger.info(logMessage);
      return;
    }

    if (topic === 'solar/panel/telemetry') {
      const result = telemetryPayloadSchema.safeParse(parsedPayload);
      if (result.success) {
        const logMessage = `[MQTT]

Payload Valid

Topic:
${topic}

Payload:
${JSON.stringify(result.data, null, 2)}`;
        logger.info(logMessage);

        // Forward to TelemetryService
        await TelemetryService.saveTelemetry(result.data, topic);

        // ─── Cleaning completion detection via telemetry transition ──────
        // Detect pump & wiper transitioning from ON → OFF after cleaning started.
        const currentPump = result.data.pumpStatus ?? null;
        const currentWiper = result.data.wiperStatus ?? null;

        if (
          previousPumpStatus === true &&
          previousWiperStatus === true &&
          currentPump === false &&
          currentWiper === false
        ) {
          logger.info(
            '[MQTT] Cleaning completion detected via telemetry transition (pump: ON→OFF, wiper: ON→OFF)',
          );

          try {
            const io = getSocketIO();
            io.emit(SOCKET_EVENTS.CLEANING_STATUS, { status: 'completed' });
            logger.info(
              `[SOCKET] Emitted ${SOCKET_EVENTS.CLEANING_STATUS} — cleaning completed (telemetry transition)`,
            );
          } catch (socketError: any) {
            logger.error(
              `[SOCKET] Failed to emit cleaning status: ${socketError.message || socketError}`,
            );
          }
        }

        // Update previous status tracking
        if (currentPump !== null) previousPumpStatus = currentPump;
        if (currentWiper !== null) previousWiperStatus = currentWiper;
      } else {
        const reasons = result.error.errors.map((err) => err.message);
        const logMessage = `[MQTT]

Payload Invalid

Reason:
${reasons.map((r) => `- ${r}`).join('\n')}`;
        logger.info(logMessage);
      }
    } else if (topic === 'solar/panel/status') {
      const result = statusPayloadSchema.safeParse(parsedPayload);
      if (result.success) {
        const logMessage = `[MQTT]

Payload Valid

Topic:
${topic}

Payload:
${JSON.stringify(result.data, null, 2)}`;
        logger.info(logMessage);

        try {
          const status = result.data.status.toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
          await DeviceRepository.updateStatus(result.data.deviceId, status);

          const io = getSocketIO();
          io.emit(SOCKET_EVENTS.TELEMETRY_NEW, { deviceStatus: status }); // Emit as part of telemetry or separate event
        } catch (error: any) {
          logger.error(`Error saving status: ${error.message}`);
        }
      } else {
        const reasons = result.error.errors.map((err) => err.message);
        const logMessage = `[MQTT]

Payload Invalid

Reason:
${reasons.map((r) => `- ${r}`).join('\n')}`;
        logger.info(logMessage);
      }
    } else if (topic === 'solar/panel/event') {
      const result = eventPayloadSchema.safeParse(parsedPayload);
      if (result.success) {
        const logMessage = `[MQTT]

Payload Valid

Topic:
${topic}

Payload:
${JSON.stringify(result.data, null, 2)}`;
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
        } catch (error: any) {
          logger.error(`Error saving event: ${error.message}`);
        }

        // ─── Cleaning completion detection via event feedback ────────────
        // ESP sends event "Cleaning completed" when cleaning cycle is done.
        if (
          typeof result.data.event === 'string' &&
          result.data.event.toLowerCase().includes('cleaning completed')
        ) {
          logger.info('[MQTT] Cleaning completion detected via event feedback from ESP');

          try {
            const io = getSocketIO();
            io.emit(SOCKET_EVENTS.CLEANING_STATUS, { status: 'completed' });
            logger.info(
              `[SOCKET] Emitted ${SOCKET_EVENTS.CLEANING_STATUS} — cleaning completed (event feedback)`,
            );
          } catch (socketError: any) {
            logger.error(
              `[SOCKET] Failed to emit cleaning status: ${socketError.message || socketError}`,
            );
          }
        }
      } else {
        const reasons = result.error.errors.map((err) => err.message);
        const logMessage = `[MQTT]

Payload Invalid

Reason:
${reasons.map((r) => `- ${r}`).join('\n')}`;
        logger.info(logMessage);
      }
    } else {
      logger.warn(`[MQTT] Received message on unknown topic: ${topic}`);
    }
  } catch (error: any) {
    logger.error(`Error processing MQTT message on topic ${topic}: ${error.message}`, { error });
  }
};
