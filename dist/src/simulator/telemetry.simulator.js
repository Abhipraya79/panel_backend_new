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
const device_repository_1 = require("../repositories/device.repository");
const socket_server_1 = require("../socket/socket.server");
const socket_events_1 = require("../socket/socket.events");
const DEVICE_ID = 'panel001';
const TOPIC = 'solar/panel/telemetry';
const INTERVAL_MS = 3000; // 3 seconds — same as real system
const state = {
    temperature: 30.81,
    voltage: 12.0,
    current: 2.0,
    dust: 13.2,
    airTemp: 30.31,
    mode: 'MANUAL',
};
exports.simulatorState = state;
// ─── Tiny random drift helper ─────────────────────────────────────────────────
// Returns a small delta that keeps value realistic (no wild jumps)
function drift(value, max, min, step) {
    const delta = (Math.random() - 0.5) * 2 * step;
    return Math.min(max, Math.max(min, parseFloat((value + delta).toFixed(2))));
}
// ─── Build Telemetry Payload ──────────────────────────────────────────────────
function buildPayload() {
    // Drift all sensor values realistically
    state.temperature = drift(state.temperature, 50.0, 25.0, 0.08);
    state.voltage = drift(state.voltage, 14.0, 10.5, 0.03);
    state.current = drift(state.current, 4.0, 0.5, 0.03);
    state.dust = drift(state.dust, 120.0, 5.0, 0.15);
    state.airTemp = drift(state.airTemp, 40.0, 20.0, 0.05);
    // Power must be consistent: P ≈ V × I (rounded to 2 decimal)
    const power = parseFloat((state.voltage * state.current).toFixed(2));
    // Get actuator states from simulators
    const cleaningState = cleaning_simulator_1.cleaningSimulator.getState();
    const coolingState = cooling_simulator_1.coolingSimulator.getState();
    // PWM is driven by cooling simulator
    // If manually cooling is OFF, PWM reflects temperature-based auto calculation
    const pwm = coolingState.isCooling
        ? cooling_simulator_1.coolingSimulator.calculatePwmForTemp(state.temperature)
        : 0;
    const payload = {
        deviceId: DEVICE_ID,
        temperature: state.temperature,
        voltage: state.voltage,
        current: state.current,
        power,
        dust: state.dust,
        airTemp: state.airTemp,
        pwm_value: pwm,
        pumpStatus: cleaningState.pumpStatus,
        wiperStatus: cleaningState.wiperStatus,
        mode: state.mode,
        timestamp: new Date().toISOString(),
    };
    return payload;
}
// ─── Timer ────────────────────────────────────────────────────────────────────
let _timer = null;
async function tick() {
    try {
        const payload = buildPayload();
        logger_1.default.info(`[DEMO MODE] Generating telemetry for ${DEVICE_ID}\n` +
            `  Temperature : ${payload.temperature}°C\n` +
            `  Voltage     : ${payload.voltage} V\n` +
            `  Current     : ${payload.current} A\n` +
            `  Power       : ${payload.power} W\n` +
            `  Dust        : ${payload.dust} μg/m³\n` +
            `  Air Temp    : ${payload.airTemp}°C\n` +
            `  PWM         : ${payload.pwm_value}\n` +
            `  Pump        : ${payload.pumpStatus ? 'ON' : 'OFF'}\n` +
            `  Wiper       : ${payload.wiperStatus ? 'ON' : 'OFF'}\n` +
            `  Mode        : ${payload.mode}`);
        // Route through EXACT same pipeline as real MQTT
        await telemetry_service_1.TelemetryService.saveTelemetry(payload, TOPIC);
        // Temperature monitoring — same as real MQTT handler
        await temperature_monitoring_service_1.default.checkTemperature(DEVICE_ID, payload.temperature);
    }
    catch (err) {
        logger_1.default.error(`[DEMO MODE] Telemetry generation error: ${err.message}`);
    }
}
// ─── Device ONLINE Emitter ───────────────────────────────────────────────────
// Called on simulator start and every 30s to keep device status fresh
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
    logger_1.default.warn(`[DEMO MODE] Dummy telemetry generator started`);
    logger_1.default.warn(`[DEMO MODE] Interval: ${INTERVAL_MS}ms (${INTERVAL_MS / 1000}s)`);
    logger_1.default.warn(`[DEMO MODE] Device  : ${DEVICE_ID}`);
    // ─── Immediately set device status to ONLINE ──────────────────────────────────
    // This sets Firestore devices/panel001.status = 'ONLINE'
    // and emits status:update Socket.IO event so Flutter sees ONLINE immediately
    _emitDeviceOnline();
    // Re-emit ONLINE every 30s to prevent stale status (ESP heartbeat equivalent)
    const heartbeatInterval = setInterval(() => {
        if (_timer !== null) {
            _emitDeviceOnline();
        }
        else {
            clearInterval(heartbeatInterval);
        }
    }, 30_000);
    // Run first tick immediately so dashboard isn't blank on startup
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
        // Reset device to OFFLINE when simulator stops
        device_repository_1.DeviceRepository.updateStatus(DEVICE_ID, 'OFFLINE').catch((err) => {
            logger_1.default.error(`[DEMO MODE] Failed to reset device status to OFFLINE: ${err.message}`);
        });
    }
}
function setSimulatorMode(mode) {
    state.mode = mode;
    logger_1.default.info(`[DEMO MODE] Mode changed to: ${mode}`);
}
