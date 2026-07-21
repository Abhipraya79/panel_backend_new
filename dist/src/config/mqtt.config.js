"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mqttClient = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const env_1 = require("./env");
const logger_1 = __importDefault(require("../utils/logger"));
const brokerUrl = `${env_1.env.MQTT_PROTOCOL}://${env_1.env.MQTT_HOST}:${env_1.env.MQTT_PORT}`;
const options = {
    clientId: env_1.env.MQTT_CLIENT_ID,
    clean: true,
    connectTimeout: 30000,
    reconnectPeriod: 5000,
    rejectUnauthorized: true,
};
if (env_1.env.MQTT_USERNAME) {
    options.username = env_1.env.MQTT_USERNAME;
}
if (env_1.env.MQTT_PASSWORD) {
    options.password = env_1.env.MQTT_PASSWORD;
}
logger_1.default.info(`Connecting to HiveMQ Cloud...\n` +
    `Host: ${env_1.env.MQTT_HOST}\n` +
    `Port: ${env_1.env.MQTT_PORT}\n` +
    `TLS: ${env_1.env.MQTT_PROTOCOL === 'mqtts' ? 'Enabled' : 'Disabled'}`);
const mqttClient = mqtt_1.default.connect(brokerUrl, options);
exports.mqttClient = mqttClient;
mqttClient.on('connect', () => {
    logger_1.default.info('[MQTT CONNECTED]');
});
mqttClient.on('reconnect', () => {
    logger_1.default.info('[MQTT RECONNECTING] Reconnecting to broker...');
});
mqttClient.on('offline', () => {
    logger_1.default.warn('[MQTT OFFLINE] Client is offline.');
});
mqttClient.on('close', () => {
    logger_1.default.warn('[MQTT CLOSED] Connection closed.');
});
mqttClient.on('disconnect', (packet) => {
    logger_1.default.warn('[MQTT DISCONNECTED] Disconnect packet received from broker.', { packet });
});
mqttClient.on('error', (err) => {
    logger_1.default.error(`[MQTT CONNECTION FAILED]\nError: ${err.stack || err.message}`, { err });
});
