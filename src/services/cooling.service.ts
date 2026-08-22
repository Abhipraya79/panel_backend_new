import { mqttClient } from '../config/mqtt.config';
import { ControlRepository } from '../repositories/control.repository';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import logger from '../utils/logger';
import { CoolingCommandPayload } from '../validators/cooling.validator';
import { env } from '../config/env';


const COOLING_TOPIC = 'solar/panel/control/cooling';
const DEVICE_ID = 'panel001';

export interface CoolingResult {
  mqtt: string;
  firestore: string;
}

export class CoolingService {
  public static async publishCoolingCommand(
    payload: CoolingCommandPayload,
  ): Promise<CoolingResult> {
    const { action } = payload;
    const isStart = action === 'START';

    // ─── DEMO MODE: skip MQTT, use cooling simulator directly ────────────────
    if (env.DEMO_MODE) {
      logger.warn(`[DEMO MODE] Cooling command received — action: ${action}`);

      const { coolingSimulator } = await import('../simulator');
      await coolingSimulator.setCooling(isStart);

      return { mqtt: 'DEMO_SKIP', firestore: 'SAVED' };
    }

    // ─── REAL MODE: publish to MQTT ───────────────────────────────────────────
    // MQTT payload — only action as per ESP spec
    const mqttPayload = {
      action,
    };

    // 1. Publish to MQTT — must succeed before continuing
    logger.info(
      `[COOLING] MQTT publish started\n\nTopic: ${COOLING_TOPIC}\n\nPayload:\n${JSON.stringify(mqttPayload, null, 2)}`,
    );

    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(COOLING_TOPIC, JSON.stringify(mqttPayload), { qos: 1 }, (err) => {
        if (err) {
          logger.error(`[COOLING] MQTT publish failed\n\nReason:\n${err.message}`, { err });
          reject(err);
        } else {
          logger.info(`[COOLING] MQTT publish success\n\nTopic: ${COOLING_TOPIC}`);
          resolve();
        }
      });
    });

    // 2. Save to Firestore
    await ControlRepository.save({
      deviceId: DEVICE_ID,
      feature: 'cooling',
      action,
      topic: COOLING_TOPIC,
      status: 'PUBLISHED',
      source: 'flutter',
    });

    logger.info(`[COOLING] Firestore save success`);

    // 3. Emit Socket.IO event
    try {
      const io = getSocketIO();
      const socketPayload = {
        isCooling: isStart,
      };

      io.emit(SOCKET_EVENTS.COOLING_UPDATE, socketPayload);

      const clientCount = io.sockets.sockets.size;
      logger.info(
        `[COOLING] Socket emit success\n\nEvent: ${SOCKET_EVENTS.COOLING_UPDATE}\n\nPayload:\n${JSON.stringify(socketPayload, null, 2)}\n\nSocket Clients\n${clientCount}`,
      );
    } catch (socketError: any) {
      logger.error(
        `[COOLING] Failed to emit socket event\n\nReason:\n${socketError.message || socketError}`,
      );
    }

    return {
      mqtt: 'PUBLISHED',
      firestore: 'SAVED',
    };
  }
}
