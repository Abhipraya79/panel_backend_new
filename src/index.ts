import { env } from './config/env';
import logger from './utils/logger';
import app from './app';
import { mqttClient } from './config/mqtt.config';
import { db } from './config/firebase';
import { initializeMQTT } from './mqtt';
import { initializeSocket } from './socket/socket.server';


if (db) {
  logger.info('Firebase Firestore ready.');
} else {
  logger.warn('Firebase services are bypassed or failed initialization.');
}

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
});

initializeSocket(server);

// ─── DEMO MODE vs REAL MODE ───────────────────────────────────────────────────
if (env.DEMO_MODE) {
  // DEMO: Start dummy telemetry simulator — no MQTT/HiveMQ connection
  import('./simulator').then(({ startSimulator }) => {
    startSimulator();
  }).catch((err) => {
    logger.error('[DEMO MODE] Failed to start simulator', { err });
  });
} else {
  // REAL: Connect to MQTT/HiveMQ and subscribe to topics
  if (mqttClient && !env.DEMO_MODE) {
    logger.info('MQTT client instance instantiated.');
    initializeMQTT();
  }
}

import notificationScheduler from './scheduler/notification.scheduler';
notificationScheduler.start();

const gracefulShutdown = (signal: string) => {
  logger.warn(`Received ${signal}. Shutting down server gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed.');

    // Only close MQTT in REAL mode
    if (!env.DEMO_MODE && mqttClient.connected) {
      logger.info('Closing MQTT Connection...');
      mqttClient.end(false, {}, () => {
        logger.info('MQTT Connection closed.');
        process.exit(0);
      });
    } else {
      // DEMO MODE: also stop simulator
      if (env.DEMO_MODE) {
        import('./simulator').then(({ stopSimulator }) => stopSimulator()).catch(() => {});
      }
      process.exit(0);
    }
  });

  // Force close after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Force shutdown initiated due to timeout.');
    process.exit(1);
  }, 10000);
};


process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception thrown!', error);
  logger.error('CRITICAL: Uncaught Exception thrown!', { error });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Promise Rejection!', reason);
  logger.error('CRITICAL: Unhandled Promise Rejection!', { reason: String(reason) });
  gracefulShutdown('unhandledRejection');
});

// Trigger restart comment to auto-boot user server
