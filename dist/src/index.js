"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const logger_1 = __importDefault(require("./utils/logger"));
const app_1 = __importDefault(require("./app"));
const mqtt_config_1 = require("./config/mqtt.config");
const firebase_1 = require("./config/firebase");
const mqtt_1 = require("./mqtt");
const socket_server_1 = require("./socket/socket.server");
if (firebase_1.db) {
    logger_1.default.info('Firebase Firestore ready.');
}
else {
    logger_1.default.warn('Firebase services are bypassed or failed initialization.');
}
const server = app_1.default.listen(env_1.env.PORT, () => {
    logger_1.default.info(`🚀 Server running in [${env_1.env.NODE_ENV}] mode on port ${env_1.env.PORT}`);
});
(0, socket_server_1.initializeSocket)(server);
// ─── DEMO MODE vs REAL MODE ───────────────────────────────────────────────────
if (env_1.env.DEMO_MODE) {
    // DEMO: Start dummy telemetry simulator — no MQTT/HiveMQ connection
    Promise.resolve().then(() => __importStar(require('./simulator'))).then(({ startSimulator }) => {
        startSimulator();
    }).catch((err) => {
        logger_1.default.error('[DEMO MODE] Failed to start simulator', { err });
    });
}
else {
    // REAL: Connect to MQTT/HiveMQ and subscribe to topics
    if (mqtt_config_1.mqttClient && !env_1.env.DEMO_MODE) {
        logger_1.default.info('MQTT client instance instantiated.');
        (0, mqtt_1.initializeMQTT)();
    }
}
const notification_scheduler_1 = __importDefault(require("./scheduler/notification.scheduler"));
notification_scheduler_1.default.start();
const gracefulShutdown = (signal) => {
    logger_1.default.warn(`Received ${signal}. Shutting down server gracefully...`);
    server.close(() => {
        logger_1.default.info('HTTP server closed.');
        // Only close MQTT in REAL mode
        if (!env_1.env.DEMO_MODE && mqtt_config_1.mqttClient.connected) {
            logger_1.default.info('Closing MQTT Connection...');
            mqtt_config_1.mqttClient.end(false, {}, () => {
                logger_1.default.info('MQTT Connection closed.');
                process.exit(0);
            });
        }
        else {
            // DEMO MODE: also stop simulator
            if (env_1.env.DEMO_MODE) {
                Promise.resolve().then(() => __importStar(require('./simulator'))).then(({ stopSimulator }) => stopSimulator()).catch(() => { });
            }
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
