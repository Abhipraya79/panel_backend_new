import logger from '../utils/logger';
import { TelemetryService } from '../services/telemetry.service';
import temperatureMonitoringService from '../services/temperature-monitoring.service';
import { TelemetryPayload } from '../validators/telemetry.validator';
import { cleaningSimulator } from './cleaning.simulator';
import { coolingSimulator } from './cooling.simulator';
import { DeviceRepository } from '../repositories/device.repository';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';

const DEVICE_ID = 'panel001';
const TOPIC = 'solar/panel/telemetry';
const INTERVAL_MS = 3000; // 3 seconds — same as real system

// ─── Time-Based Solar Simulator State ─────────────────────────────────────────

interface SimulatorState {
  temperature: number;
  voltage: number;
  current: number;
  power: number;
  dust: number;
  airTemp: number;
  mode: 'MANUAL' | 'AUTO';
  // Optional simulated time override for demo/sidang presentations
  simulatedHourOverride: number | null; // null = use real time (WIB UTC+7)
}

const state: SimulatorState = {
  temperature: 38.5,
  voltage: 4.85,
  current: 2.5,
  power: 12.12,
  dust: 35.0,
  airTemp: 28.5,
  mode: 'MANUAL',
  simulatedHourOverride: null,
};

// ─── Time & Solar Radiation Model ─────────────────────────────────────────────

/**
 * Calculates current effective hour (0.0 to 23.99) in WIB (UTC+7)
 * or returns simulatedHourOverride if set.
 */
function getEffectiveHour(): number {
  if (state.simulatedHourOverride !== null) {
    return state.simulatedHourOverride;
  }
  const now = new Date();
  // WIB is UTC+7
  const wibHours = (now.getUTCHours() + 7) % 24;
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  return wibHours + minutes / 60.0 + seconds / 3600.0;
}

/**
 * Calculates solar radiation intensity factor [0.0 to 1.0] based on time of day.
 * Solar peak occurs at ~13:00 WIB.
 */
function calculateSolarIntensity(hour: number): number {
  if (hour < 6.0 || hour > 18.0) {
    return 0.0;
  }
  // Map 6.0..18.0 to 0.0..1.0
  const normalizedTime = (hour - 6.0) / 12.0;
  // Smooth sine curve peaking at 12:00 - 13:00
  return Math.pow(Math.sin(Math.PI * normalizedTime), 1.1);
}

// ─── Build Telemetry Payload ──────────────────────────────────────────────────

function buildPayload(): TelemetryPayload {
  const currentHour = getEffectiveHour();
  const solarIntensity = calculateSolarIntensity(currentHour);

  // 1. Ambient Air Temperature Model (27°C morning/evening to ~34°C noon)
  const targetAirTemp = 27.2 + 6.3 * solarIntensity;
  state.airTemp += (targetAirTemp - state.airTemp) * 0.1 + (Math.random() - 0.5) * 0.1;
  state.airTemp = Math.min(36.0, Math.max(24.0, parseFloat(state.airTemp.toFixed(2))));

  // 2. Actuator States from Simulators
  const cleaningState = cleaningSimulator.getState();
  const coolingState  = coolingSimulator.getState();

  // 3. Panel Temperature Model (40°C - 60°C target on daytime)
  const targetPanelTemp = state.airTemp + 26.5 * solarIntensity;

  if (coolingState.isCooling) {
    // Cooling is ON: smooth drop towards ambient + offset
    const minCoolingTemp = state.airTemp + 3.5;
    const coolDrop = 0.2 + Math.random() * 0.15;
    state.temperature = Math.max(minCoolingTemp, state.temperature - coolDrop);
  } else {
    // Cooling is OFF: smooth drift towards thermal equilibrium with solar heat gain
    const thermalDrift = (targetPanelTemp - state.temperature) * 0.08 + (Math.random() - 0.5) * 0.25;
    state.temperature = Math.min(65.0, Math.max(25.0, state.temperature + thermalDrift));
  }
  state.temperature = parseFloat(state.temperature.toFixed(2));

  // 4. Dust Accumulation / Cleaning Model
  if (cleaningState.isRunning) {
    // Cleaning is ON: dust drops rapidly and smoothly
    const dustDrop = 12.0 + Math.random() * 5.0;
    state.dust = Math.max(22.0, state.dust - dustDrop);
  } else {
    // Cleaning is OFF: dust slowly accumulates
    const dustGain = 0.10 + Math.random() * 0.08;
    state.dust = Math.min(125.0, state.dust + dustGain);
  }
  state.dust = parseFloat(state.dust.toFixed(2));

  // 5. Current (Arus) Model — correlated with solar intensity & dust loss
  // Targets: 07:00 (1.5-2.2A), 10:00 (3.0-3.8A), 13:00 (4.0-4.35A), 18:00 (0.7-1.0A)
  let baseCurrent = 0.75 + 3.55 * Math.pow(solarIntensity, 0.95);
  // High dust slightly reduces efficiency (up to 3.5% loss)
  const dustLossFactor = Math.min(0.04, (state.dust / 100.0) * 0.035);
  baseCurrent = baseCurrent * (1.0 - dustLossFactor) + (Math.random() - 0.5) * 0.04;
  state.current = Math.min(4.38, Math.max(0.4, parseFloat(baseCurrent.toFixed(2))));

  // 6. Voltage (Tegangan) Model — correlated with solar condition
  // Targets: 07:00 (4.5-4.9V), 09:00-15:00 (4.7-5.0V), 18:00 (3.5-4.0V)
  let baseVoltage = 3.65 + 1.30 * Math.pow(solarIntensity, 0.25) + (Math.random() - 0.5) * 0.03;
  state.voltage = Math.min(5.0, Math.max(3.0, parseFloat(baseVoltage.toFixed(2))));

  // 7. Power (Daya) Model — strictly calculated P = V × I
  state.power = parseFloat((state.voltage * state.current).toFixed(2));

  // 8. PWM Calculation for Cooling Actuator
  const pwm = coolingState.isCooling
    ? coolingSimulator.calculatePwmForTemp(state.temperature)
    : 0;

  const payload: TelemetryPayload = {
    deviceId:    DEVICE_ID,
    temperature: state.temperature,
    voltage:     state.voltage,
    current:     state.current,
    power:       state.power,
    dust:        state.dust,
    airTemp:     state.airTemp,
    pwm_value:   pwm,
    pumpStatus:  cleaningState.pumpStatus,
    wiperStatus: cleaningState.wiperStatus,
    mode:        state.mode,
    timestamp:   new Date().toISOString(),
    source:      'demo',
    isDemo:      true,
  };

  return payload;
}

// ─── Timer ────────────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const payload = buildPayload();

    logger.info(
      `[DEMO MODE] Solar Profile Telemetry (${DEVICE_ID})\n` +
      `  Temperature : ${payload.temperature}°C (Air: ${payload.airTemp}°C)\n` +
      `  Voltage     : ${payload.voltage} V\n` +
      `  Current     : ${payload.current} A\n` +
      `  Power       : ${payload.power} W (V×I=${(payload.voltage! * payload.current!).toFixed(2)}W)\n` +
      `  Dust        : ${payload.dust} μg/m³\n` +
      `  PWM         : ${payload.pwm_value}\n` +
      `  Pump        : ${payload.pumpStatus ? 'ON' : 'OFF'}\n` +
      `  Wiper       : ${payload.wiperStatus ? 'ON' : 'OFF'}\n` +
      `  Mode        : ${payload.mode}\n` +
      `  Source      : demo (isDemo: true)`,
    );

    // Route through EXACT same pipeline as real MQTT (saves to Firestore + emits Socket.IO)
    await TelemetryService.saveTelemetry(payload, TOPIC);

    // Temperature monitoring alert check — same as real MQTT handler
    await temperatureMonitoringService.checkTemperature(DEVICE_ID, payload.temperature!);

  } catch (err: any) {
    logger.error(`[DEMO MODE] Telemetry generation error: ${err.message}`);
  }
}

// ─── Device ONLINE Emitter ───────────────────────────────────────────────────

async function _emitDeviceOnline(): Promise<void> {
  try {
    // 1. Update Firestore devices/panel001 → status: ONLINE
    await DeviceRepository.updateStatus(DEVICE_ID, 'ONLINE');
    logger.info('[DEMO MODE] Device status set to ONLINE in Firestore');

    // 2. Emit Socket.IO status:update so Flutter sees ONLINE immediately
    const io = getSocketIO();
    io.emit(SOCKET_EVENTS.STATUS_UPDATE, {
      deviceId: DEVICE_ID,
      status: 'ONLINE',
      connectionType: 'DEMO',
      isDemo: true,
    });
    logger.info(`[DEMO MODE] Emitted ${SOCKET_EVENTS.STATUS_UPDATE} — ONLINE (DEMO)`);
  } catch (err: any) {
    logger.error(`[DEMO MODE] Failed to emit device ONLINE: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startTelemetrySimulator(): void {
  if (_timer !== null) {
    logger.warn('[DEMO MODE] Telemetry simulator already running — skipping duplicate start');
    return;
  }

  logger.warn(`[DEMO MODE] Solar Profile Telemetry Generator started`);
  logger.warn(`[DEMO MODE] Interval: ${INTERVAL_MS}ms (${INTERVAL_MS / 1000}s)`);
  logger.warn(`[DEMO MODE] Device  : ${DEVICE_ID}`);

  _emitDeviceOnline();

  // Re-emit ONLINE every 30s to keep heartbeat fresh
  const heartbeatInterval = setInterval(() => {
    if (_timer !== null) {
      _emitDeviceOnline();
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30_000);

  // Run first tick immediately
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

    DeviceRepository.updateStatus(DEVICE_ID, 'OFFLINE').catch((err: any) => {
      logger.error(`[DEMO MODE] Failed to reset device status to OFFLINE: ${err.message}`);
    });
  }
}

export function setSimulatorMode(mode: 'MANUAL' | 'AUTO'): void {
  state.mode = mode;
  logger.info(`[DEMO MODE] Mode changed to: ${mode}`);
}

export function setSimulatedHourOverride(hour: number | null): void {
  state.simulatedHourOverride = hour;
  logger.info(`[DEMO MODE] Simulated hour override set to: ${hour}`);
}

export { state as simulatorState };
