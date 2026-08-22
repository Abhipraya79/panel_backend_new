import logger from '../utils/logger';
import { env } from '../config/env';
import { EventRepository } from '../repositories/event.repository';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';

const DEVICE_ID = 'panel001';

// ─── Cleaning State ───────────────────────────────────────────────────────────

interface CleaningState {
  pumpStatus: boolean;
  wiperStatus: boolean;
  isRunning: boolean;
}

const _state: CleaningState = {
  pumpStatus: false,
  wiperStatus: false,
  isRunning: false,
};

// Timer reference stored on module-level object to avoid TS6133 "declared but never read"
const _timerHolder = { ref: null as ReturnType<typeof setTimeout> | null };

// ─── Internal: finish cleaning ────────────────────────────────────────────────

async function _finishCleaning(): Promise<void> {
  _state.pumpStatus  = false;
  _state.wiperStatus = false;
  _state.isRunning   = false;
  _timerHolder.ref   = null;

  logger.warn('[DEMO MODE] Cleaning cycle completed — Pump OFF, Wiper OFF');

  const eventPayload = {
    deviceId:  DEVICE_ID,
    event:     'Cleaning cycle completed',
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Persist event to Firestore
    await EventRepository.save(eventPayload);

    // 2. Emit event:new — same as ESP real event
    const io = getSocketIO();
    io.emit(SOCKET_EVENTS.EVENT_NEW, eventPayload);
    logger.info(`[DEMO MODE] Emitted ${SOCKET_EVENTS.EVENT_NEW} — Cleaning cycle completed`);

    // 3. Emit cleaning:update { status: 'idle' } — Flutter listens to this
    io.emit(SOCKET_EVENTS.CLEANING_UPDATE, { status: 'idle' });
    logger.info(`[DEMO MODE] Emitted ${SOCKET_EVENTS.CLEANING_UPDATE} — idle`);
  } catch (err: any) {
    logger.error(`[DEMO MODE] Error finishing cleaning cycle: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a cleaning simulation cycle.
 * Duration is taken from env.DEMO_CLEANING_DURATION_MS (default 10s).
 * Calling this while already running will be ignored.
 */
export async function startCleaning(): Promise<void> {
  if (_state.isRunning) {
    logger.warn('[DEMO MODE] Cleaning already in progress — ignoring START command');
    return;
  }

  const durationMs = env.DEMO_CLEANING_DURATION_MS;

  _state.pumpStatus  = true;
  _state.wiperStatus = true;
  _state.isRunning   = true;

  logger.warn('[DEMO MODE] Cleaning cycle started');
  logger.warn(`[DEMO MODE] Pump: ON | Wiper: ON`);
  logger.warn(`[DEMO MODE] Duration: ${durationMs}ms (${durationMs / 1000}s)`);

  const startEventPayload = {
    deviceId:  DEVICE_ID,
    event:     'Cleaning cycle started',
    timestamp: new Date().toISOString(),
  };

  // 1. Save start event to Firestore & emit Socket event
  try {
    await EventRepository.save(startEventPayload);
    const io = getSocketIO();
    io.emit(SOCKET_EVENTS.EVENT_NEW, startEventPayload);
    io.emit(SOCKET_EVENTS.CLEANING_UPDATE, { status: 'running' });
    logger.info(`[DEMO MODE] Emitted ${SOCKET_EVENTS.CLEANING_UPDATE} — running`);
  } catch (err: any) {
    logger.error(`[DEMO MODE] Error emitting cleaning start: ${err.message}`);
  }

  // 2. Schedule completion
  _timerHolder.ref = setTimeout(() => {
    _finishCleaning().catch((err) => {
      logger.error(`[DEMO MODE] Error in cleaning finish: ${err.message}`);
    });
  }, durationMs);
}

export function getState(): CleaningState {
  return { ..._state };
}

export const cleaningSimulator = {
  startCleaning,
  getState,
};
