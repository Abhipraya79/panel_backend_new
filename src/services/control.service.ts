import { mqttClient } from '../config/mqtt.config';
import { ControlRepository } from '../repositories/control.repository';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import logger from '../utils/logger';
import { CleaningCommandPayload } from '../validators/cleaning.validator';
import { env } from '../config/env';


const CONTROL_TOPIC = 'solar/panel/control';
const DEVICE_ID = 'panel001';

export interface CleaningResult {
  mqtt: string;
  firestore: string;
}

export interface ModeResult {
  mqtt: string;
  firestore: string;
}

export class ControlService {
  /**
   * Publishes a cleaning START command to ESP via MQTT.
   * Backend only sends START — never STOP.
   * Cleaning completion is determined by ESP sending an event on solar/panel/event.
   */
  public static async publishCleaningCommand(
    payload: CleaningCommandPayload,
  ): Promise<CleaningResult> {
    const { action, mode } = payload;

    // ─── DEMO MODE: skip MQTT, use simulator directly ──────────────────────
    if (env.DEMO_MODE) {
      logger.warn(`[DEMO MODE] Cleaning command received — action: ${action}, mode: ${mode}`);

      if (action === 'START') {
        // Lazy-import to avoid circular dependency issues
        const { cleaningSimulator } = await import('../simulator');
        await cleaningSimulator.startCleaning();
      }

      // Still save to Firestore
      await ControlRepository.save({
        deviceId: DEVICE_ID,
        action,
        mode,
        topic: CONTROL_TOPIC,
        status: 'DEMO_SIMULATED',
        source: 'flutter',
      });

      // Emit cleaning:update { status: 'running' } — already done in cleaningSimulator
      return { mqtt: 'DEMO_SKIP', firestore: 'SAVED' };
    }

    // ─── REAL MODE: publish to MQTT ───────────────────────────────────────────
    const mqttPayload = {
      action,
      mode,
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
          
          if (action === 'START' && mode === 'AUTO_RTC') {
            import('./notification.service').then((ns) => {
              ns.default.sendAutoCleaningStartedNotification().catch((e) => {
                logger.error(`[FCM] Failed to send auto cleaning started notification: ${e.message}`);
              });
            });
          }

          resolve();
        }
      });
    });

    // 2. Save to Firestore
    await ControlRepository.save({
      deviceId: DEVICE_ID,
      action,
      mode,
      topic: CONTROL_TOPIC,
      status: 'PUBLISHED',
      source: 'flutter',
    });

    logger.info(`[CONTROL] Firestore save success`);

    // 3. Emit Socket.IO event — cleaning is now running
    try {
      const io = getSocketIO();
      io.emit(SOCKET_EVENTS.CLEANING_UPDATE, {
        status: 'running',
      });

      const clientCount = io.sockets.sockets.size;
      logger.info(
        `[CONTROL] Socket emit success\n\nEvent: ${SOCKET_EVENTS.CLEANING_UPDATE}\n\nSocket Clients\n${clientCount}`,
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

  /**
   * Publishes a mode change command to ESP via MQTT.
   */
  public static async publishModeCommand(mode: string): Promise<ModeResult> {
    const mqttPayload = {
      action: 'SET_MODE',
      mode,
    };

    // ─── DEMO MODE: skip MQTT, update simulator state ─────────────────────────
    if (env.DEMO_MODE) {
      logger.warn(`[DEMO MODE] Mode command received — mode: ${mode}`);

      const { setSimulatorMode } = await import('../simulator');
      setSimulatorMode(mode as 'MANUAL' | 'AUTO');

      await ControlRepository.save({
        deviceId: DEVICE_ID,
        action: 'SET_MODE',
        mode,
        topic: CONTROL_TOPIC,
        status: 'DEMO_SIMULATED',
        source: 'flutter',
      });

      return { mqtt: 'DEMO_SKIP', firestore: 'SAVED' };
    }

    // ─── REAL MODE: publish to MQTT ───────────────────────────────────────────
    // 1. Publish to MQTT
    logger.info(
      `[CONTROL] Mode MQTT publish started\n\nTopic: ${CONTROL_TOPIC}\n\nPayload:\n${JSON.stringify(mqttPayload, null, 2)}`,
    );

    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(CONTROL_TOPIC, JSON.stringify(mqttPayload), { qos: 1 }, (err) => {
        if (err) {
          logger.error(`[CONTROL] Mode MQTT publish failed\n\nReason:\n${err.message}`, { err });
          reject(err);
        } else {
          logger.info(`[CONTROL] Mode MQTT publish success\n\nTopic: ${CONTROL_TOPIC}`);
          resolve();
        }
      });
    });

    // 2. Save to Firestore
    await ControlRepository.save({
      deviceId: DEVICE_ID,
      action: 'SET_MODE',
      mode,
      topic: CONTROL_TOPIC,
      status: 'PUBLISHED',
      source: 'flutter',
    });

    logger.info(`[CONTROL] Mode Firestore save success`);

    return {
      mqtt: 'PUBLISHED',
      firestore: 'SAVED',
    };
  }
}
