import logger from '../utils/logger';
import { TelemetryService } from '../services/telemetry.service';
import temperatureMonitoringService from '../services/temperature-monitoring.service';
import { TelemetryPayload } from '../validators/telemetry.validator';
import { cleaningSimulator } from './cleaning.simulator';
import { coolingSimulator } from './cooling.simulator';
import { solarTimeEngine } from './solar-time.engine';
import { DeviceRepository } from '../repositories/device.repository';
import { getSocketIO } from '../socket/socket.server';
import { SOCKET_EVENTS } from '../socket/socket.events';

const DEVICE_ID = 'panel001';
const TOPIC = 'solar/panel/telemetry';
const INTERVAL_MS = 3000; // 3 seconds interval

// ─── Stateful Telemetry Simulator State ────────────────────────────────────────

interface SimulatorState {
  temperature: number;
  voltage: number;
  current: number;
  power: number;
  dust: number;
  airTemp: number;
  mode: 'MANUAL' | 'AUTO';
}

const state: SimulatorState = {
  temperature: 42.5,
  voltage: 4.85,
  current: 3.60,
  power: 17.46,
  dust: 38.0,
  airTemp: 29.5,
  mode: 'MANUAL',
};

// ─── Telemetry Builder Engine ──────────────────────────────────────────────────

function buildPayload(): TelemetryPayload {
  const currentHour = solarTimeEngine.getEffectiveHour();
  const { targetTemp, targetVoltage, targetCurrent } = solarTimeEngine.getTargetSolarProfile(currentHour);

  // 1. Air Temperature Model (27°C - 34°C)
  const normTime = Math.max(0, Math.min(1, (currentHour - 6) / 12));
  const expectedAirTemp = 27.0 + 6.5 * Math.sin(Math.PI * normTime);
  state.airTemp += (expectedAirTemp - state.airTemp) * 0.05 + (Math.random() - 0.5) * 0.1;
  state.airTemp = parseFloat(Math.min(36.0, Math.max(24.0, state.airTemp)).toFixed(2));

  // 2. Actuator States from Simulators
  const cleaningState = cleaningSimulator.getState();
  const coolingState = coolingSimulator.getState();

  // 3. Panel Temperature Dynamics (Smooth, Stateful & Realistic, strictly > 40°C)
  if (coolingState.isCooling) {
    // Cooling ON: Gradual temperature drop (-0.4°C to -0.8°C per tick) towards ~40.5-42.0°C (always > 40°C)
    const coolDrop = 0.40 + Math.random() * 0.35;
    state.temperature = Math.max(40.5, state.temperature - coolDrop);
  } else {
    // Cooling OFF: Panel temperature smoothly warms up / drifts toward solar thermal target
    const thermalDrift = (targetTemp - state.temperature) * 0.08;
    // Small natural sensor fluctuation (e.g. ±0.15°C) to prevent flat numbers
    const naturalNoise = (Math.random() - 0.48) * 0.30;
    state.temperature = state.temperature + thermalDrift + naturalNoise;
  }
  // Clamp temperature strictly above 40°C (40.1°C - 65.0°C)
  state.temperature = parseFloat(Math.min(65.0, Math.max(40.1, state.temperature)).toFixed(2));

  // 4. Dust Accumulation / Cleaning Model
  if (cleaningState.isRunning) {
    // Cleaning ON: Dust drops gradually (-4.0 to -6.0 μg/m³ per tick)
    const dustDrop = 4.0 + Math.random() * 2.0;
    state.dust = Math.max(18.0, state.dust - dustDrop);
  } else {
    // Cleaning OFF: Dust accumulates slowly (+0.1 to +0.3 μg/m³ per tick)
    const dustGain = 0.10 + Math.random() * 0.20;
    state.dust = Math.min(120.0, state.dust + dustGain);
  }
  state.dust = parseFloat(state.dust.toFixed(2));

  // 5. Voltage (Tegangan) Model — slightly drops when panel overheats
  const thermalVoltageDrop = Math.max(0, (state.temperature - 35.0) * 0.008);
  let baseVoltage = targetVoltage - thermalVoltageDrop + (Math.random() - 0.5) * 0.02;
  state.voltage = parseFloat(Math.min(5.0, Math.max(3.5, baseVoltage)).toFixed(2));

  // 6. Current (Arus) Model — influenced by solar profile & dust attenuation
  const dustLossFactor = Math.min(0.08, (state.dust / 100.0) * 0.05);
  let baseCurrent = targetCurrent * (1.0 - dustLossFactor) + (Math.random() - 0.5) * 0.03;
  state.current = parseFloat(Math.min(4.4, Math.max(0.3, baseCurrent)).toFixed(2));

  // 7. Power (Daya) Model — strictly P = V × I (rounded to 2 decimal places)
  state.power = parseFloat((state.voltage * state.current).toFixed(2));

  // 8. Pump Status: Pump is ON if either cooling or cleaning is active
  const pumpActive = coolingState.isCooling || cleaningState.isRunning;

  // 9. PWM Calculation for Cooling Actuator
  const pwm = coolingState.isCooling
    ? coolingSimulator.calculatePwmForTemp(state.temperature)
    : 0;

  const payload: TelemetryPayload = {
    deviceId: DEVICE_ID,
    temperature: state.temperature,
    voltage: state.voltage,
    current: state.current,
    power: state.power,
    dust: state.dust,
    airTemp: state.airTemp,
    pwm_value: pwm,
    pumpStatus: pumpActive,
    wiperStatus: cleaningState.wiperStatus,
    mode: state.mode,
    timestamp: new Date().toISOString(),
    source: 'demo',
    isDemo: true,
  };

  return payload;
}

// ─── Simulator Loop Control ────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

async function tick(): Promise<void> {
  try {
    const payload = buildPayload();
    const timeInfo = solarTimeEngine.getConfig();

    logger.info(
      `[DEMO MODE] Telemetry (${DEVICE_ID} @ ${timeInfo.formattedTime})\n` +
      `  Temp    : ${payload.temperature}°C (Air: ${payload.airTemp}°C)\n` +
      `  Voltage : ${payload.voltage} V\n` +
      `  Current : ${payload.current} A\n` +
      `  Power   : ${payload.power} W (V×I=${(payload.voltage! * payload.current!).toFixed(2)}W)\n` +
      `  Dust    : ${payload.dust} μg/m³\n` +
      `  Pump    : ${payload.pumpStatus ? 'ON' : 'OFF'} | Wiper: ${payload.wiperStatus ? 'ON' : 'OFF'}\n` +
      `  Mode    : ${payload.mode} | TimeMode: ${timeInfo.mode}`,
    );

    // Save & emit via exact same telemetry service
    await TelemetryService.saveTelemetry(payload, TOPIC);

    // Temperature monitoring check (alerts)
    await temperatureMonitoringService.checkTemperature(DEVICE_ID, payload.temperature!);

  } catch (err: any) {
    logger.error(`[DEMO MODE] Telemetry tick error: ${err.message}`);
  }
}

// ─── Device ONLINE Emitter ───────────────────────────────────────────────────

async function emitDeviceOnline(): Promise<void> {
  try {
    await DeviceRepository.updateStatus(DEVICE_ID, 'ONLINE');
    const io = getSocketIO();
    io.emit(SOCKET_EVENTS.STATUS_UPDATE, {
      deviceId: DEVICE_ID,
      status: 'ONLINE',
      connectionType: 'DEMO',
      isDemo: true,
    });
  } catch (err: any) {
    logger.error(`[DEMO MODE] Failed to emit device ONLINE: ${err.message}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startTelemetrySimulator(): void {
  if (_timer !== null) {
    logger.warn('[DEMO MODE] Telemetry simulator already running');
    return;
  }

  logger.warn(`[DEMO MODE] Solar Profile Telemetry Generator started (Interval: ${INTERVAL_MS}ms)`);
  emitDeviceOnline();

  // Heartbeat status refresh every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (_timer !== null) {
      emitDeviceOnline();
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30_000);

  // Initial tick
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
      logger.error(`[DEMO MODE] Reset status error: ${err.message}`);
    });
  }
}

export function setSimulatorMode(mode: 'MANUAL' | 'AUTO'): void {
  state.mode = mode;
  logger.info(`[DEMO MODE] Mode set to: ${mode}`);
}

export { state as simulatorState };
