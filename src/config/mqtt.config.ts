import mqtt from 'mqtt';
import { env } from './env';
import logger from '../utils/logger';

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

const mqttClient = mqtt.connect(brokerUrl, options);

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

export { mqttClient };
