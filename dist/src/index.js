"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env"); // Must be first to validate env vars
const logger_1 = __importDefault(require("./utils/logger"));
const app_1 = __importDefault(require("./app"));
const mqtt_config_1 = require("./config/mqtt.config");
const firebase_1 = require("./config/firebase");
const mqtt_1 = require("./mqtt");
const socket_server_1 = require("./socket/socket.server");
const telemetry_simulator_1 = require("./simulator/telemetry.simulator");
// Log status of Firebase initialization
if (firebase_1.db) {
    logger_1.default.info('Firebase Firestore ready.');
}
else {
    logger_1.default.warn('Firebase services are bypassed or failed initialization.');
}
// Log status of MQTT connection attempt
if (mqtt_config_1.mqttClient) {
    logger_1.default.info('MQTT client instance instantiated.');
    (0, mqtt_1.initializeMQTT)();
    if (env_1.env.ENABLE_SIMULATOR) {
        (0, telemetry_simulator_1.startTelemetrySimulator)();
    }
}
const server = app_1.default.listen(env_1.env.PORT, () => {
    logger_1.default.info(`🚀 Server running in [${env_1.env.NODE_ENV}] mode on port ${env_1.env.PORT}`);
});
(0, socket_server_1.initializeSocket)(server);
// Handle graceful shutdown and unhandled promise/exception situations
const gracefulShutdown = (signal) => {
    logger_1.default.warn(`Received ${signal}. Shutting down server gracefully...`);
    if (env_1.env.ENABLE_SIMULATOR) {
        (0, telemetry_simulator_1.stopTelemetrySimulator)();
    }
    server.close(() => {
        logger_1.default.info('HTTP server closed.');
        // Close MQTT Client if connected
        if (mqtt_config_1.mqttClient.connected) {
            logger_1.default.info('Closing MQTT Connection...');
            mqtt_config_1.mqttClient.end(false, {}, () => {
                logger_1.default.info('MQTT Connection closed.');
                process.exit(0);
            });
        }
        else {
            process.exit(0);
        }
    });
    // Force close after 10s if graceful shutdown hangs
    setTimeout(() => {
        logger_1.default.error('Force shutdown initiated due to timeout.');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Uncaught Exception thrown!', error);
    logger_1.default.error('CRITICAL: Uncaught Exception thrown!', { error });
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    console.error('CRITICAL: Unhandled Promise Rejection!', reason);
    logger_1.default.error('CRITICAL: Unhandled Promise Rejection!', { reason: String(reason) });
    gracefulShutdown('unhandledRejection');
});
// Trigger restart comment to auto-boot user server
