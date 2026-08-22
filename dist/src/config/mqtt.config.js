"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mqttClient = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const env_1 = require("./env");
const logger_1 = __importDefault(require("../utils/logger"));
// ─── Mock MQTT Client (used when DEMO_MODE=true) ──────────────────────────────
// Returns a minimal object that satisfies the mqttClient interface
// so TypeScript and runtime don't error out when DEMO_MODE is active.
function createMockMqttClient() {
    return {
        connected: false,
        publish: (_topic, _message, _opts, cb) => {
            logger_1.default.warn('[DEMO MODE] MQTT publish skipped — DEMO_MODE is active');
            if (cb)
                cb();
        },
        subscribe: (_topics, _opts, cb) => {
            logger_1.default.warn('[DEMO MODE] MQTT subscribe skipped — DEMO_MODE is active');
            if (cb)
                cb();
        },
        end: (_force, _opts, cb) => {
            if (cb)
                cb();
        },
        on: (_event, _listener) => { },
    };
}
// ─── Real MQTT Client ─────────────────────────────────────────────────────────
let mqttClient;
if (env_1.env.DEMO_MODE) {
    logger_1.default.warn('[DEMO MODE] MQTT connection DISABLED — using mock client');
    exports.mqttClient = mqttClient = createMockMqttClient();
}
else {
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
    exports.mqttClient = mqttClient = mqtt_1.default.connect(brokerUrl, options);
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
}
