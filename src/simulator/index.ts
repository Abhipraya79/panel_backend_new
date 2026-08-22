/**
 * Simulator entry point.
 *
 * Starts all simulator modules when DEMO_MODE=true.
 * Only ONE instance is ever started (guarded inside each simulator).
 */
import logger from '../utils/logger';
import { startTelemetrySimulator, stopTelemetrySimulator } from './telemetry.simulator';

export function startSimulator(): void {
  logger.warn('═══════════════════════════════════════════════════════');
  logger.warn('[DEMO MODE] ⚠️  DEMO MODE IS ACTIVE');
  logger.warn('[DEMO MODE] Dummy Telemetry Generator started');
  logger.warn('[DEMO MODE] MQTT/HiveMQ is DISABLED in this mode');
  logger.warn('[DEMO MODE] All data is simulated — no ESP required');
  logger.warn('[DEMO MODE] To switch to real mode: set DEMO_MODE=false');
  logger.warn('═══════════════════════════════════════════════════════');

  startTelemetrySimulator();
}

export function stopSimulator(): void {
  stopTelemetrySimulator();
  logger.warn('[DEMO MODE] Simulator stopped');
}

// Re-export simulators so services can import them
export { cleaningSimulator } from './cleaning.simulator';
export { coolingSimulator }  from './cooling.simulator';
export { setSimulatorMode }  from './telemetry.simulator';
