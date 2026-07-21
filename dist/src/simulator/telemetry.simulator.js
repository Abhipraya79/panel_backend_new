"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopTelemetrySimulator = exports.startTelemetrySimulator = void 0;
const mqtt_config_1 = require("../config/mqtt.config");
const logger_1 = __importDefault(require("../utils/logger"));
let intervalId = null;
/**
 * Generates a random number between min and max with the specified decimal places.
 */
const randomBetween = (min, max, decimals = 2) => {
    const rand = Math.random() * (max - min) + min;
    const powerVal = Math.pow(10, decimals);
    return Math.round(rand * powerVal) / powerVal;
};
/**
 * Starts the telemetry simulator, publishing to MQTT every 5 seconds.
 */
const startTelemetrySimulator = () => {
    if (intervalId) {
        logger_1.default.warn('[SIMULATOR] Simulator is already running.');
        return;
    }
    logger_1.default.info('[SIMULATOR] Starting telemetry simulator...');
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
        logger_1.default.info(`[SIMULATOR]\nPublishing telemetry\nTopic: ${topic}\nPayload:\n${JSON.stringify(payload, null, 2)}`);
        // Publish to the HiveMQ Cloud MQTT broker
        mqtt_config_1.mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
            if (err) {
                logger_1.default.error(`[SIMULATOR] Failed to publish telemetry: ${err.message}`, { err });
            }
        });
    }, 5000);
};
exports.startTelemetrySimulator = startTelemetrySimulator;
/**
 * Stops the telemetry simulator.
 */
const stopTelemetrySimulator = () => {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger_1.default.info('[SIMULATOR] Telemetry simulator stopped.');
    }
};
exports.stopTelemetrySimulator = stopTelemetrySimulator;
