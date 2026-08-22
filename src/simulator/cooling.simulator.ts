import logger from '../utils/logger';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';
import { ControlRepository } from '../repositories/control.repository';

const DEVICE_ID = 'panel001';

// ─── Cooling State ────────────────────────────────────────────────────────────

interface CoolingState {
  isCooling: boolean;
  pwm_value: number;
}

let _state: CoolingState = {
  isCooling: false,
  pwm_value: 0,
};

// ─── PWM Calculation ──────────────────────────────────────────────────────────
// Threshold based on env.PANEL_OVERHEAT_TEMP = 45°C
// Cooling ramps up well before overheat for demo visibility

function calculatePwmForTemp(temperature: number): number {
  if (temperature < 30)  return 0;
  if (temperature < 32)  return 80;
  if (temperature < 34)  return 140;
  if (temperature < 36)  return 200;
  return 255;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Set cooling state. Called from CoolingService when DEMO_MODE=true.
 * Emits cooling:update Socket.IO event immediately so Flutter gets it.
 */
async function setCooling(start: boolean): Promise<void> {
  _state.isCooling = start;
  _state.pwm_value = start ? 128 : 0; // start at midpoint, will drift with temperature

  const action = start ? 'START' : 'STOP';

  if (start) {
    logger.warn('[DEMO COOLING] Cooling STARTED');
    logger.warn(`[DEMO COOLING] PWM: ${_state.pwm_value}`);
    logger.warn('[DEMO COOLING] Fan: ON | Peltier: ON');
  } else {
    logger.warn('[DEMO COOLING] Cooling STOPPED');
    logger.warn('[DEMO COOLING] PWM: 0');
  }

  // Save to Firestore (same as real service)
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
    logger.error(`[DEMO COOLING] Firestore save error: ${err.message}`);
  }

  // Emit cooling:update — Flutter listens to this
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
