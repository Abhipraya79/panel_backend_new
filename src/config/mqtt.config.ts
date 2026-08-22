import mqtt from 'mqtt';
import { env } from './env';
import logger from '../utils/logger';

// ─── Mock MQTT Client (used when DEMO_MODE=true) ──────────────────────────────
// Returns a minimal object that satisfies the mqttClient interface
// so TypeScript and runtime don't error out when DEMO_MODE is active.

function createMockMqttClient() {
  return {
    connected: false,
    publish: (_topic: string, _message: string, _opts: any, cb?: (err?: Error) => void) => {
      logger.warn('[DEMO MODE] MQTT publish skipped — DEMO_MODE is active');
      if (cb) cb();
    },
    subscribe: (_topics: any, _opts: any, cb?: (err?: Error) => void) => {
      logger.warn('[DEMO MODE] MQTT subscribe skipped — DEMO_MODE is active');
      if (cb) cb();
    },
    end: (_force: boolean, _opts: any, cb?: () => void) => {
      if (cb) cb();
    },
    on: (_event: string, _listener: any) => {},
  } as unknown as ReturnType<typeof mqtt.connect>;
}

// ─── Real MQTT Client ─────────────────────────────────────────────────────────

let mqttClient: ReturnType<typeof mqtt.connect>;

if (env.DEMO_MODE) {
  logger.warn('[DEMO MODE] MQTT connection DISABLED — using mock client');
  mqttClient = createMockMqttClient();
} else {
  const brokerUrl = `${env.MQTT_PROTOCOL}://${env.MQTT_HOST}:${env.MQTT_PORT}`;

  const options: mqtt.IClientOptions = {
    clientId: env.MQTT_CLIENT_ID,
    clean: true,
    connectTimeout: 30000,
    reconnectPeriod: 5000,
    rejectUnauthorized: true,
  };

  if (env.MQTT_USERNAME) {
    options.username = env.MQTT_USERNAME;
  }

  if (env.MQTT_PASSWORD) {
    options.password = env.MQTT_PASSWORD;
  }

  logger.info(
    `Connecting to HiveMQ Cloud...\n` +
      `Host: ${env.MQTT_HOST}\n` +
      `Port: ${env.MQTT_PORT}\n` +
      `TLS: ${env.MQTT_PROTOCOL === 'mqtts' ? 'Enabled' : 'Disabled'}`,
  );

  mqttClient = mqtt.connect(brokerUrl, options);

  mqttClient.on('connect', () => {
    logger.info('[MQTT CONNECTED]');
  });

  mqttClient.on('reconnect', () => {
    logger.info('[MQTT RECONNECTING] Reconnecting to broker...');
  });

  mqttClient.on('offline', () => {
    logger.warn('[MQTT OFFLINE] Client is offline.');
  });

  mqttClient.on('close', () => {
    logger.warn('[MQTT CLOSED] Connection closed.');
  });

  mqttClient.on('disconnect', (packet) => {
    logger.warn('[MQTT DISCONNECTED] Disconnect packet received from broker.', { packet });
  });

  mqttClient.on('error', (err) => {
    logger.error(`[MQTT CONNECTION FAILED]\nError: ${err.stack || err.message}`, { err });
  });
}

export { mqttClient };
