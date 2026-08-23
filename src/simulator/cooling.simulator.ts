import logger from '../utils/logger';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import { ControlRepository } from '../repositories/control.repository';
import { EventRepository } from '../repositories/event.repository';

const DEVICE_ID = 'panel001';

// ─── Cooling State ────────────────────────────────────────────────────────────

interface CoolingState {
  isCooling: boolean;
  pwm_value: number;
}

const _state: CoolingState = {
  isCooling: false,
  pwm_value: 0,
};

import { solarTimeEngine } from './solar-time.engine';

// ─── PWM Calculation ──────────────────────────────────────────────────────────
// STRICT LOGIC:
// If Cooling == OFF -> PWM = 0 strictly
// If Cooling == ON  -> PWM is dynamically controlled based on panel temperature and reference curve (255 down to ~208-212)

function calculatePwmForTemp(temperature: number, hour?: number): number {
  if (!_state.isCooling) {
    _state.pwm_value = 0;
    return 0;
  }

  // When Cooling is active, calculate PWM based on reference curve matching temperature
  const { refPwm } = solarTimeEngine.getRefDataAtHour(hour);

  // Proportional control calculation relative to target temperature (~35.0°C)
  const targetTemp = 35.0;
  if (temperature <= targetTemp) {
    _state.pwm_value = Math.min(refPwm, 210);
  } else {
    // Smoothly scale between 210 (at 35.0°C) and 255 (at 57.8°C)
    const norm = Math.min(1.0, Math.max(0, (temperature - targetTemp) / (57.8 - targetTemp)));
    const calculatedPwm = Math.round(210 + (255 - 210) * norm);
    // Blend with reference PWM to stay faithful to the reference dataset curve
    _state.pwm_value = Math.round((calculatedPwm + refPwm) / 2);
  }

  return _state.pwm_value;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Set cooling state. Called from CoolingService when DEMO_MODE=true.
 * Emits cooling:update Socket.IO event immediately so Flutter gets it,
 * and records event to Firestore.
 */
async function setCooling(start: boolean): Promise<void> {
  _state.isCooling = start;
  if (!start) {
    _state.pwm_value = 0;
  }

  const action = start ? 'START' : 'STOP';
  const eventName = start ? 'Cooling cycle started' : 'Cooling cycle stopped';

  if (start) {
    logger.warn('[DEMO COOLING] Cooling STARTED');
    logger.warn('[DEMO COOLING] Fan: ON | Peltier: ON');
  } else {
    logger.warn('[DEMO COOLING] Cooling STOPPED');
    logger.warn('[DEMO COOLING] PWM: 0');
  }

  // 1. Save command to Firestore control repository (same as real service)
  try {
    await ControlRepository.save({
      deviceId: DEVICE_ID,
      feature: 'cooling',
      action,
      topic: 'solar/panel/control/cooling',
      status: 'DEMO_SIMULATED',
      source: 'flutter',
    });
  } catch (err: any) {
    logger.error(`[DEMO COOLING] Firestore control save error: ${err.message}`);
  }

  // 2. Save event to Firestore events repository & emit event:new
  try {
    const eventPayload = {
      deviceId: DEVICE_ID,
      event: eventName,
      timestamp: new Date().toISOString(),
    };
    await EventRepository.save(eventPayload);

    const io = getSocketIO();
    io.emit(SOCKET_EVENTS.EVENT_NEW, eventPayload);
    logger.info(`[DEMO COOLING] Saved event & emitted ${SOCKET_EVENTS.EVENT_NEW} — ${eventName}`);
  } catch (err: any) {
    logger.error(`[DEMO COOLING] Firestore event save error: ${err.message}`);
  }

  // 3. Emit cooling:update — Flutter listens to this
  try {
    const io = getSocketIO();
    const socketPayload = {
      isCooling: start,
      peltier:   start,
      fan:       start,
    };
    io.emit(SOCKET_EVENTS.COOLING_UPDATE, socketPayload);
    logger.info(`[DEMO COOLING] Emitted ${SOCKET_EVENTS.COOLING_UPDATE} — isCooling: ${start}`);
  } catch (err: any) {
    logger.error(`[DEMO COOLING] Socket emit error: ${err.message}`);
  }
}

function getState(): CoolingState {
  return { ..._state };
}

export { calculatePwmForTemp };

export const coolingSimulator = {
  setCooling,
  getState,
  calculatePwmForTemp,
};
