import logger from '../utils/logger';
import { TelemetryService } from '../services/telemetry.service';
import temperatureMonitoringService from '../services/temperature-monitoring.service';
import { TelemetryPayload } from '../validators/telemetry.validator';
import { cleaningSimulator } from './cleaning.simulator';
import { coolingSimulator } from './cooling.simulator';


const DEVICE_ID = 'panel001';
const TOPIC = 'solar/panel/telemetry';
const INTERVAL_MS = 3000; // 3 seconds — same as real system

// ─── Realistic Base Values ────────────────────────────────────────────────────
// These will drift gradually, simulating real sensor behavior

interface SimulatorState {
  temperature: number;
  voltage: number;
  current: number;
  dust: number;
  airTemp: number;
  mode: 'MANUAL' | 'AUTO';
}

const state: SimulatorState = {
  temperature: 30.81,
  voltage: 12.0,
  current: 2.0,
  dust: 13.2,
  airTemp: 30.31,
  mode: 'MANUAL',
};

// ─── Tiny random drift helper ─────────────────────────────────────────────────
// Returns a small delta that keeps value realistic (no wild jumps)

function drift(value: number, max: number, min: number, step: number): number {
  const delta = (Math.random() - 0.5) * 2 * step;
  return Math.min(max, Math.max(min, parseFloat((value + delta).toFixed(2))));
}

// ─── Build Telemetry Payload ──────────────────────────────────────────────────

function buildPayload(): TelemetryPayload {
  // Drift all sensor values realistically
  state.temperature = drift(state.temperature, 50.0, 25.0, 0.08);
  state.voltage     = drift(state.voltage, 14.0, 10.5, 0.03);
  state.current     = drift(state.current, 4.0, 0.5, 0.03);
  state.dust        = drift(state.dust, 120.0, 5.0, 0.15);
  state.airTemp     = drift(state.airTemp, 40.0, 20.0, 0.05);

  // Power must be consistent: P ≈ V × I (rounded to 2 decimal)
  const power = parseFloat((state.voltage * state.current).toFixed(2));

  // Get actuator states from simulators
  const cleaningState = cleaningSimulator.getState();
  const coolingState  = coolingSimulator.getState();

  // PWM is driven by cooling simulator
  // If manually cooling is OFF, PWM reflects temperature-based auto calculation
  const pwm = coolingState.isCooling
    ? coolingSimulator.calculatePwmForTemp(state.temperature)
    : 0;

  const payload: TelemetryPayload = {
    deviceId:    DEVICE_ID,
    temperature: state.temperature,
    voltage:     state.voltage,
    current:     state.current,
    power,
    dust:        state.dust,
    airTemp:     state.airTemp,
    pwm_value:   pwm,
    pumpStatus:  cleaningState.pumpStatus,
    wiperStatus: cleaningState.wiperStatus,
    mode:        state.mode,
    timestamp:   new Date().toISOString(),
  };

  return payload;
}

// ─── Timer ────────────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const payload = buildPayload();

    logger.info(
      `[DEMO MODE] Generating telemetry for ${DEVICE_ID}\n` +
      `  Temperature : ${payload.temperature}°C\n` +
      `  Voltage     : ${payload.voltage} V\n` +
      `  Current     : ${payload.current} A\n` +
      `  Power       : ${payload.power} W\n` +
      `  Dust        : ${payload.dust} μg/m³\n` +
      `  Air Temp    : ${payload.airTemp}°C\n` +
      `  PWM         : ${payload.pwm_value}\n` +
      `  Pump        : ${payload.pumpStatus ? 'ON' : 'OFF'}\n` +
      `  Wiper       : ${payload.wiperStatus ? 'ON' : 'OFF'}\n` +
      `  Mode        : ${payload.mode}`,
    );

    // Route through EXACT same pipeline as real MQTT
    await TelemetryService.saveTelemetry(payload, TOPIC);

    // Temperature monitoring — same as real MQTT handler
    await temperatureMonitoringService.checkTemperature(DEVICE_ID, payload.temperature!);

  } catch (err: any) {
    logger.error(`[DEMO MODE] Telemetry generation error: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startTelemetrySimulator(): void {
  if (_timer !== null) {
    logger.warn('[DEMO MODE] Telemetry simulator already running — skipping duplicate start');
    return;
  }

  logger.warn(`[DEMO MODE] Dummy telemetry generator started`);
  logger.warn(`[DEMO MODE] Interval: ${INTERVAL_MS}ms (${INTERVAL_MS / 1000}s)`);
  logger.warn(`[DEMO MODE] Device  : ${DEVICE_ID}`);

  // Run first tick immediately so dashboard isn't blank on startup
  tick();

  _timer = setInterval(() => {
    tick();
  }, INTERVAL_MS);
}

export function stopTelemetrySimulator(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
    logger.warn('[DEMO MODE] Telemetry simulator stopped');
  }
}

export function setSimulatorMode(mode: 'MANUAL' | 'AUTO'): void {
  state.mode = mode;
  logger.info(`[DEMO MODE] Mode changed to: ${mode}`);
}

export { state as simulatorState };
