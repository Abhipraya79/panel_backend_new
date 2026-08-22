"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulatorState = void 0;
exports.startTelemetrySimulator = startTelemetrySimulator;
exports.stopTelemetrySimulator = stopTelemetrySimulator;
exports.setSimulatorMode = setSimulatorMode;
const logger_1 = __importDefault(require("../utils/logger"));
const telemetry_service_1 = require("../services/telemetry.service");
const temperature_monitoring_service_1 = __importDefault(require("../services/temperature-monitoring.service"));
const cleaning_simulator_1 = require("./cleaning.simulator");
const cooling_simulator_1 = require("./cooling.simulator");
const solar_time_engine_1 = require("./solar-time.engine");
const device_repository_1 = require("../repositories/device.repository");
const socket_server_1 = require("../socket/socket.server");
const socket_events_1 = require("../socket/socket.events");
const DEVICE_ID = 'panel001';
const TOPIC = 'solar/panel/telemetry';
const INTERVAL_MS = 3000; // 3 seconds interval
const state = {
    temperature: 42.5,
    voltage: 4.85,
    current: 3.60,
    power: 17.46,
    dust: 38.0,
    airTemp: 29.5,
    mode: 'MANUAL',
};
exports.simulatorState = state;
// ─── Telemetry Builder Engine ──────────────────────────────────────────────────
function buildPayload() {
    const currentHour = solar_time_engine_1.solarTimeEngine.getEffectiveHour();
    const { targetTemp, targetVoltage, targetCurrent } = solar_time_engine_1.solarTimeEngine.getTargetSolarProfile(currentHour);
    // 1. Air Temperature Model (27°C - 34°C)
    const normTime = Math.max(0, Math.min(1, (currentHour - 6) / 12));
    const expectedAirTemp = 27.0 + 6.5 * Math.sin(Math.PI * normTime);
    state.airTemp += (expectedAirTemp - state.airTemp) * 0.05 + (Math.random() - 0.5) * 0.1;
    state.airTemp = parseFloat(Math.min(36.0, Math.max(24.0, state.airTemp)).toFixed(2));
    // 2. Actuator States from Simulators
    const cleaningState = cleaning_simulator_1.cleaningSimulator.getState();
    const coolingState = cooling_simulator_1.coolingSimulator.getState();
    // 3. Panel Temperature Dynamics (Smooth, Stateful & Realistic, strictly > 40°C)
    if (coolingState.isCooling) {
        // Cooling ON: Gradual temperature drop (-0.4°C to -0.8°C per tick) towards ~40.5-42.0°C (always > 40°C)
        const coolDrop = 0.40 + Math.random() * 0.35;
        state.temperature = Math.max(40.5, state.temperature - coolDrop);
    }
    else {
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
    }
    else {
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
        ? cooling_simulator_1.coolingSimulator.calculatePwmForTemp(state.temperature)
        : 0;
    const payload = {
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
let _timer = null;
async function tick() {
    try {
        const payload = buildPayload();
        const timeInfo = solar_time_engine_1.solarTimeEngine.getConfig();
        logger_1.default.info(`[DEMO MODE] Telemetry (${DEVICE_ID} @ ${timeInfo.formattedTime})\n` +
            `  Temp    : ${payload.temperature}°C (Air: ${payload.airTemp}°C)\n` +
            `  Voltage : ${payload.voltage} V\n` +
            `  Current : ${payload.current} A\n` +
            `  Power   : ${payload.power} W (V×I=${(payload.voltage * payload.current).toFixed(2)}W)\n` +
            `  Dust    : ${payload.dust} μg/m³\n` +
            `  Pump    : ${payload.pumpStatus ? 'ON' : 'OFF'} | Wiper: ${payload.wiperStatus ? 'ON' : 'OFF'}\n` +
            `  Mode    : ${payload.mode} | TimeMode: ${timeInfo.mode}`);
        // Save & emit via exact same telemetry service
        await telemetry_service_1.TelemetryService.saveTelemetry(payload, TOPIC);
        // Temperature monitoring check (alerts)
        await temperature_monitoring_service_1.default.checkTemperature(DEVICE_ID, payload.temperature);
    }
    catch (err) {
        logger_1.default.error(`[DEMO MODE] Telemetry tick error: ${err.message}`);
    }
}
// ─── Device ONLINE Emitter ───────────────────────────────────────────────────
async function emitDeviceOnline() {
    try {
        await device_repository_1.DeviceRepository.updateStatus(DEVICE_ID, 'ONLINE');
        const io = (0, socket_server_1.getSocketIO)();
        io.emit(socket_events_1.SOCKET_EVENTS.STATUS_UPDATE, {
            deviceId: DEVICE_ID,
            status: 'ONLINE',
            connectionType: 'DEMO',
            isDemo: true,
        });
    }
    catch (err) {
        logger_1.default.error(`[DEMO MODE] Failed to emit device ONLINE: ${err.message}`);
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
function startTelemetrySimulator() {
    if (_timer !== null) {
        logger_1.default.warn('[DEMO MODE] Telemetry simulator already running');
        return;
    }
    logger_1.default.warn(`[DEMO MODE] Solar Profile Telemetry Generator started (Interval: ${INTERVAL_MS}ms)`);
    emitDeviceOnline();
    // Heartbeat status refresh every 30 seconds
    const heartbeatInterval = setInterval(() => {
        if (_timer !== null) {
            emitDeviceOnline();
        }
        else {
            clearInterval(heartbeatInterval);
        }
    }, 30_000);
    // Initial tick
    tick();
    _timer = setInterval(() => {
        tick();
    }, INTERVAL_MS);
}
function stopTelemetrySimulator() {
    if (_timer !== null) {
        clearInterval(_timer);
        _timer = null;
        logger_1.default.warn('[DEMO MODE] Telemetry simulator stopped');
        device_repository_1.DeviceRepository.updateStatus(DEVICE_ID, 'OFFLINE').catch((err) => {
            logger_1.default.error(`[DEMO MODE] Reset status error: ${err.message}`);
        });
    }
}
function setSimulatorMode(mode) {
    state.mode = mode;
    logger_1.default.info(`[DEMO MODE] Mode set to: ${mode}`);
}
