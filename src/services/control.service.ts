import { mqttClient } from '../config/mqtt.config';
import { ControlRepository } from '../repositories/control.repository';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import logger from '../utils/logger';
import { CleaningCommandPayload } from '../validators/cleaning.validator';

const CONTROL_TOPIC = 'solar/panel/control';
const DEVICE_ID = 'panel001';

export interface CleaningResult {
  mqtt: string;
  firestore: string;
}

export class ControlService {
  public static async publishCleaningCommand(
    payload: CleaningCommandPayload,
  ): Promise<CleaningResult> {
    const { action, mode } = payload;
    const pump = true;
    const wiper = true;
    const timestamp = new Date().toISOString();

    const mqttPayload = {
      deviceId: DEVICE_ID,
      action,
      mode,
      pump,
      wiper,
      timestamp,
    };

    // 1. Publish to MQTT — must succeed before continuing
    logger.info(
      `[CONTROL] MQTT publish started\n\nTopic: ${CONTROL_TOPIC}\n\nPayload:\n${JSON.stringify(mqttPayload, null, 2)}`,
    );

    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(CONTROL_TOPIC, JSON.stringify(mqttPayload), { qos: 1 }, (err) => {
        if (err) {
          logger.error(`[CONTROL] MQTT publish failed\n\nReason:\n${err.message}`, { err });
          reject(err);
        } else {
          logger.info(`[CONTROL] MQTT publish success\n\nTopic: ${CONTROL_TOPIC}`);
          resolve();
        }
      });
    });

    // 2. Save to Firestore
    await ControlRepository.save({
      deviceId: DEVICE_ID,
      action,
      mode,
      pump,
      wiper,
      topic: CONTROL_TOPIC,
      status: 'PUBLISHED',
      source: 'flutter',
    });

    logger.info(`[CONTROL] Firestore save success`);

    // 3. Emit Socket.IO event
    try {
      const io = getSocketIO();
      io.emit(SOCKET_EVENTS.CONTROL_NEW, {
        action,
        status: 'PUBLISHED',
      });

      const clientCount = io.sockets.sockets.size;
      logger.info(
        `[CONTROL] Socket emit success\n\nEvent: ${SOCKET_EVENTS.CONTROL_NEW}\n\nSocket Clients\n${clientCount}`,
      );
    } catch (socketError: any) {
      logger.error(
        `[CONTROL] Failed to emit socket event\n\nReason:\n${socketError.message || socketError}`,
      );
    }

    return {
      mqtt: 'PUBLISHED',
      firestore: 'SAVED',
    };
  }
}
