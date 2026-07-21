import { env } from './config/env'; // Must be first to validate env vars
import logger from './utils/logger';
import app from './app';
import { mqttClient } from './config/mqtt.config';
import { db } from './config/firebase';
import { initializeMQTT } from './mqtt';
import { initializeSocket } from './socket/socket.server';

// Log status of Firebase initialization
if (db) {
  logger.info('Firebase Firestore ready.');
} else {
  logger.warn('Firebase services are bypassed or failed initialization.');
}

if (mqttClient) {
  logger.info('MQTT client instance instantiated.');
  initializeMQTT();
}

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
});

initializeSocket(server);

// Handle graceful shutdown and unhandled promise/exception situations
const gracefulShutdown = (signal: string) => {
  logger.warn(`Received ${signal}. Shutting down server gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed.');

    // Close MQTT Client if connected
    if (mqttClient.connected) {
      logger.info('Closing MQTT Connection...');
      mqttClient.end(false, {}, () => {
        logger.info('MQTT Connection closed.');
        process.exit(0);
      });
    } else {
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
