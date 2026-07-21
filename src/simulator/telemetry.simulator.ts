import { mqttClient } from '../config/mqtt.config';
import logger from '../utils/logger';

let intervalId: NodeJS.Timeout | null = null;

/**
 * Generates a random number between min and max with the specified decimal places.
 */
const randomBetween = (min: number, max: number, decimals = 2): number => {
  const rand = Math.random() * (max - min) + min;
  const powerVal = Math.pow(10, decimals);
  return Math.round(rand * powerVal) / powerVal;
};

/**
 * Starts the telemetry simulator, publishing to MQTT every 5 seconds.
 */
export const startTelemetrySimulator = (): void => {
  if (intervalId) {
    logger.warn('[SIMULATOR] Simulator is already running.');
    return;
  }

  logger.info('[SIMULATOR] Starting telemetry simulator...');

  intervalId = setInterval(() => {
    // Generate payload
    const voltage = randomBetween(17.5, 19);
    const current = randomBetween(2, 3);
    const power = Math.round(voltage * current * 100) / 100;

    const payload = {
      deviceId: 'panel001',
      temperature: randomBetween(35, 45),
      voltage,
      current,
      power,
      dust: randomBetween(0, 100),
      humidity: randomBetween(60, 90),
      pumpStatus: Math.random() > 0.5,
      wiperStatus: Math.random() > 0.5,
      mode: 'AUTO',
      timestamp: new Date().toISOString(),
    };

    const topic = 'solar/panel/telemetry';

    // Logging formatted per instructions
    logger.info(
      `[SIMULATOR]\nPublishing telemetry\nTopic: ${topic}\nPayload:\n${JSON.stringify(payload, null, 2)}`,
    );

    // Publish to the HiveMQ Cloud MQTT broker
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        logger.error(`[SIMULATOR] Failed to publish telemetry: ${err.message}`, { err });
      }
    });
  }, 5000);
};

/**
 * Stops the telemetry simulator.
 */
export const stopTelemetrySimulator = (): void => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[SIMULATOR] Telemetry simulator stopped.');
  }
};
