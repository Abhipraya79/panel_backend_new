"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulatorState = void 0;
exports.startTelemetrySimulator = startTelemetrySimulator;
exports.stopTelemetrySimulator = stopTelemetrySimulator;
exports.setSimulatorMode = setSimulatorMode;
exports.setSimulatedHourOverride = setSimulatedHourOverride;
const logger_1 = __importDefault(require("../utils/logger"));
const telemetry_service_1 = require("../services/telemetry.service");
const temperature_monitoring_service_1 = __importDefault(require("../services/temperature-monitoring.service"));
const cleaning_simulator_1 = require("./cleaning.simulator");
const cooling_simulator_1 = require("./cooling.simulator");
const device_repository_1 = require("../repositories/device.repository");
const socket_server_1 = require("../socket/socket.server");
const socket_events_1 = require("../socket/socket.events");
const DEVICE_ID = 'panel001';
const TOPIC = 'solar/panel/telemetry';
const INTERVAL_MS = 3000; // 3 seconds — same as real system
const HOURLY_PROFILES = [
    { hour: 7, tempMin: 40, tempMax: 42, currentMin: 1.5, currentMax: 2.2, voltageMin: 4.5, voltageMax: 4.9, powerMin: 7, powerMax: 10 },
    { hour: 8, tempMin: 42, tempMax: 44, currentMin: 2.0, currentMax: 2.8, voltageMin: 4.7, voltageMax: 5.0, powerMin: 9, powerMax: 14 },
    { hour: 9, tempMin: 44, tempMax: 47, currentMin: 2.5, currentMax: 3.3, voltageMin: 4.8, voltageMax: 5.0, powerMin: 12, powerMax: 16 },
    { hour: 10, tempMin: 46, tempMax: 50, currentMin: 3.0, currentMax: 3.8, voltageMin: 4.8, voltageMax: 5.0, powerMin: 14, powerMax: 19 },
    { hour: 11, tempMin: 48, tempMax: 53, currentMin: 3.4, currentMax: 4.1, voltageMin: 4.8, voltageMax: 5.0, powerMin: 16, powerMax: 20 },
    { hour: 12, tempMin: 50, tempMax: 55, currentMin: 3.7, currentMax: 4.3, voltageMin: 4.8, voltageMax: 5.0, powerMin: 18, powerMax: 21 },
    { hour: 13, tempMin: 52, tempMax: 58, currentMin: 4.0, currentMax: 4.35, voltageMin: 4.9, voltageMax: 5.0, powerMin: 20, powerMax: 21.75 },
    { hour: 14, tempMin: 50, tempMax: 56, currentMin: 3.7, currentMax: 4.2, voltageMin: 4.8, voltageMax: 5.0, powerMin: 18, powerMax: 21 },
    { hour: 15, tempMin: 47, tempMax: 52, currentMin: 3.2, currentMax: 3.8, voltageMin: 4.7, voltageMax: 5.0, powerMin: 15, powerMax: 19 },
    { hour: 16, tempMin: 44, tempMax: 48, currentMin: 2.5, currentMax: 3.2, voltageMin: 4.6, voltageMax: 4.9, powerMin: 12, powerMax: 16 },
    { hour: 17, tempMin: 42, tempMax: 45, currentMin: 1.8, currentMax: 2.5, voltageMin: 4.5, voltageMax: 4.8, powerMin: 8, powerMax: 12 },
    { hour: 18, tempMin: 40, tempMax: 42, currentMin: 0.7, currentMax: 1.0, voltageMin: 3.5, voltageMax: 4.0, powerMin: 3, powerMax: 4 },
];
const state = {
    temperature: 41.0,
    voltage: 4.7,
    current: 1.85,
    power: 8.7,
    dust: 35.0,
    airTemp: 28.5,
    mode: 'MANUAL',
    simulatedHourOverride: null,
};
exports.simulatorState = state;
// ─── Time & Profile Interpolation Engine ──────────────────────────────────────
function getEffectiveHour() {
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
function getTargetProfile(hour) {
    const h = Math.max(0, Math.min(24, hour));
    if (h < 7) {
        const ratio = Math.max(0, (h - 5) / 2);
        return {
            tempTarget: 35.0 + ratio * 6.0,
            currentTarget: 0.3 + ratio * 1.35,
            voltageTarget: 3.0 + ratio * 1.6,
        };
    }
    if (h >= 18) {
        const ratio = Math.min(1, (h - 18) / 3);
        return {
            tempTarget: 41.0 - ratio * 6.0,
            currentTarget: 0.85 - ratio * 0.65,
            voltageTarget: 3.75 - ratio * 1.25,
        };
    }
    let lower = HOURLY_PROFILES[0];
    let upper = HOURLY_PROFILES[HOURLY_PROFILES.length - 1];
    for (let i = 0; i < HOURLY_PROFILES.length - 1; i++) {
        if (h >= HOURLY_PROFILES[i].hour && h <= HOURLY_PROFILES[i + 1].hour) {
            lower = HOURLY_PROFILES[i];
            upper = HOURLY_PROFILES[i + 1];
            break;
        }
    }
    const fraction = lower.hour === upper.hour ? 0 : (h - lower.hour) / (upper.hour - lower.hour);
    const lowerTempMid = (lower.tempMin + lower.tempMax) / 2;
    const upperTempMid = (upper.tempMin + upper.tempMax) / 2;
    const tempTarget = lowerTempMid + fraction * (upperTempMid - lowerTempMid);
    const lowerCurrentMid = (lower.currentMin + lower.currentMax) / 2;
    const upperCurrentMid = (upper.currentMin + upper.currentMax) / 2;
    const currentTarget = lowerCurrentMid + fraction * (upperCurrentMid - lowerCurrentMid);
    const lowerVoltageMid = (lower.voltageMin + lower.voltageMax) / 2;
    const upperVoltageMid = (upper.voltageMin + upper.voltageMax) / 2;
    const voltageTarget = lowerVoltageMid + fraction * (upperVoltageMid - lowerVoltageMid);
    return { tempTarget, currentTarget, voltageTarget };
}
// ─── Build Telemetry Payload ──────────────────────────────────────────────────
function buildPayload() {
    const currentHour = getEffectiveHour();
    const { tempTarget, currentTarget, voltageTarget } = getTargetProfile(currentHour);
    // 1. Air Temperature Model (27°C - 33°C)
    const normTime = Math.max(0, Math.min(1, (currentHour - 6) / 12));
    const targetAirTemp = 27.0 + 6.0 * Math.sin(Math.PI * normTime);
    state.airTemp += (targetAirTemp - state.airTemp) * 0.1 + (Math.random() - 0.5) * 0.1;
    state.airTemp = Math.min(36.0, Math.max(24.0, parseFloat(state.airTemp.toFixed(2))));
    // 2. Actuator States from Simulators
    const cleaningState = cleaning_simulator_1.cleaningSimulator.getState();
    const coolingState = cooling_simulator_1.coolingSimulator.getState();
    // 3. Panel Temperature Dynamics (Strictly following Hourly Specification)
    if (coolingState.isCooling) {
        // Cooling is ON: temperature drops gradually per tick towards ~38-42°C
        const coolDrop = 0.25 + Math.random() * 0.15;
        state.temperature = Math.max(38.0, state.temperature - coolDrop);
    }
    else {
        // Cooling is OFF: panel temperature smoothly approaches baseline thermal target
        const thermalDrift = (tempTarget - state.temperature) * 0.10 + (Math.random() - 0.5) * 0.20;
        state.temperature = state.temperature + thermalDrift;
    }
    state.temperature = parseFloat(state.temperature.toFixed(2));
    // 4. Dust Accumulation / Cleaning Model
    if (cleaningState.isRunning) {
        const dustDrop = 12.0 + Math.random() * 5.0;
        state.dust = Math.max(22.0, state.dust - dustDrop);
    }
    else {
        const dustGain = 0.10 + Math.random() * 0.08;
        state.dust = Math.min(125.0, state.dust + dustGain);
    }
    state.dust = parseFloat(state.dust.toFixed(2));
    // 5. Current (Arus) Model — correlated with solar profile & dust loss factor
    const dustLossFactor = Math.min(0.04, (state.dust / 100.0) * 0.03);
    let baseCurrent = currentTarget * (1.0 - dustLossFactor) + (Math.random() - 0.5) * 0.04;
    state.current = Math.min(4.38, Math.max(0.4, parseFloat(baseCurrent.toFixed(2))));
    // 6. Voltage (Tegangan) Model — correlated with solar profile
    let baseVoltage = voltageTarget + (Math.random() - 0.5) * 0.03;
    state.voltage = Math.min(5.0, Math.max(3.0, parseFloat(baseVoltage.toFixed(2))));
    // 7. Power (Daya) Model — strictly calculated P = V × I (rounded to 2 decimals)
    state.power = parseFloat((state.voltage * state.current).toFixed(2));
    // 8. PWM Calculation for Cooling Actuator
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
        pumpStatus: cleaningState.pumpStatus,
        wiperStatus: cleaningState.wiperStatus,
        mode: state.mode,
        timestamp: new Date().toISOString(),
        source: 'demo',
        isDemo: true,
    };
    return payload;
}
// ─── Timer ────────────────────────────────────────────────────────────────────
let _timer = null;
async function tick() {
    try {
        const payload = buildPayload();
        logger_1.default.info(`[DEMO MODE] Solar Profile Telemetry (${DEVICE_ID})\n` +
            `  Temperature : ${payload.temperature}°C (Air: ${payload.airTemp}°C)\n` +
            `  Voltage     : ${payload.voltage} V\n` +
            `  Current     : ${payload.current} A\n` +
            `  Power       : ${payload.power} W (V×I=${(payload.voltage * payload.current).toFixed(2)}W)\n` +
            `  Dust        : ${payload.dust} μg/m³\n` +
            `  PWM         : ${payload.pwm_value}\n` +
            `  Pump        : ${payload.pumpStatus ? 'ON' : 'OFF'}\n` +
            `  Wiper       : ${payload.wiperStatus ? 'ON' : 'OFF'}\n` +
            `  Mode        : ${payload.mode}\n` +
            `  Source      : demo (isDemo: true)`);
        // Route through EXACT same pipeline as real MQTT (saves to Firestore + emits Socket.IO)
        await telemetry_service_1.TelemetryService.saveTelemetry(payload, TOPIC);
        // Temperature monitoring alert check — same as real MQTT handler
        await temperature_monitoring_service_1.default.checkTemperature(DEVICE_ID, payload.temperature);
    }
    catch (err) {
        logger_1.default.error(`[DEMO MODE] Telemetry generation error: ${err.message}`);
    }
}
// ─── Device ONLINE Emitter ───────────────────────────────────────────────────
async function _emitDeviceOnline() {
    try {
        // 1. Update Firestore devices/panel001 → status: ONLINE
        await device_repository_1.DeviceRepository.updateStatus(DEVICE_ID, 'ONLINE');
        logger_1.default.info('[DEMO MODE] Device status set to ONLINE in Firestore');
        // 2. Emit Socket.IO status:update so Flutter sees ONLINE immediately
        const io = (0, socket_server_1.getSocketIO)();
        io.emit(socket_events_1.SOCKET_EVENTS.STATUS_UPDATE, {
            deviceId: DEVICE_ID,
            status: 'ONLINE',
            connectionType: 'DEMO',
            isDemo: true,
        });
        logger_1.default.info(`[DEMO MODE] Emitted ${socket_events_1.SOCKET_EVENTS.STATUS_UPDATE} — ONLINE (DEMO)`);
    }
    catch (err) {
        logger_1.default.error(`[DEMO MODE] Failed to emit device ONLINE: ${err.message}`);
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
function startTelemetrySimulator() {
    if (_timer !== null) {
        logger_1.default.warn('[DEMO MODE] Telemetry simulator already running — skipping duplicate start');
        return;
    }
    logger_1.default.warn(`[DEMO MODE] Solar Profile Telemetry Generator started`);
    logger_1.default.warn(`[DEMO MODE] Interval: ${INTERVAL_MS}ms (${INTERVAL_MS / 1000}s)`);
    logger_1.default.warn(`[DEMO MODE] Device  : ${DEVICE_ID}`);
    _emitDeviceOnline();
    // Re-emit ONLINE every 30s to keep heartbeat fresh
    const heartbeatInterval = setInterval(() => {
        if (_timer !== null) {
            _emitDeviceOnline();
        }
        else {
            clearInterval(heartbeatInterval);
        }
    }, 30_000);
    // Run first tick immediately
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
            logger_1.default.error(`[DEMO MODE] Failed to reset device status to OFFLINE: ${err.message}`);
        });
    }
}
function setSimulatorMode(mode) {
    state.mode = mode;
    logger_1.default.info(`[DEMO MODE] Mode changed to: ${mode}`);
}
function setSimulatedHourOverride(hour) {
    state.simulatedHourOverride = hour;
    logger_1.default.info(`[DEMO MODE] Simulated hour override set to: ${hour}`);
}
