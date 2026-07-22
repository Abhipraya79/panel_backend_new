"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMQTTMessage = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
const telemetry_validator_1 = require("../validators/telemetry.validator");
const status_validator_1 = require("../validators/status.validator");
const event_validator_1 = require("../validators/event.validator");
const telemetry_service_1 = require("../services/telemetry.service");
const socket_server_1 = require("../socket/socket.server");
const socket_events_1 = require("../socket/socket.events");
const device_repository_1 = require("../repositories/device.repository");
const event_repository_1 = require("../repositories/event.repository");
const handleMQTTMessage = async (topic, message) => {
    const payloadStr = message.toString();
    try {
        let parsedPayload;
        try {
            parsedPayload = JSON.parse(payloadStr);
        }
        catch {
            const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n- Payload is not a valid JSON string`;
            logger_1.default.info(logMessage);
            return;
        }
        // ─── TELEMETRY ────────────────────────────────────────────────────────────
        if (topic === 'solar/panel/telemetry') {
            const result = telemetry_validator_1.telemetryPayloadSchema.safeParse(parsedPayload);
            if (result.success) {
                logger_1.default.info(`[MQTT] Valid telemetry received for device: ${result.data.deviceId}`);
                // Forward to TelemetryService (emits Socket.IO + persists to Firestore)
                await telemetry_service_1.TelemetryService.saveTelemetry(result.data, topic);
            }
            else {
                const reasons = result.error.errors.map((err) => err.message);
                logger_1.default.warn(`[MQTT] Invalid telemetry payload: ${reasons.join(', ')}`);
            }
            // ─── STATUS ───────────────────────────────────────────────────────────────
        }
        else if (topic === 'solar/panel/status') {
            const result = status_validator_1.statusPayloadSchema.safeParse(parsedPayload);
            if (result.success) {
                const logMessage = `[MQTT]\n\nPayload Valid\n\nTopic:\n${topic}\n\nPayload:\n${JSON.stringify(result.data, null, 2)}`;
                logger_1.default.info(logMessage);
                try {
                    const status = result.data.status.toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
                    await device_repository_1.DeviceRepository.updateStatus(result.data.deviceId, status);
                    const io = (0, socket_server_1.getSocketIO)();
                    io.emit(socket_events_1.SOCKET_EVENTS.STATUS_UPDATE, {
                        deviceId: result.data.deviceId,
                        status,
                    });
                    logger_1.default.info(`[SOCKET] Emitted ${socket_events_1.SOCKET_EVENTS.STATUS_UPDATE} — ${status}`);
                }
                catch (error) {
                    logger_1.default.error(`Error saving status: ${error.message}`);
                }
            }
            else {
                const reasons = result.error.errors.map((err) => err.message);
                const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n${reasons.map((r) => `- ${r}`).join('\n')}`;
                logger_1.default.info(logMessage);
            }
            // ─── EVENT ────────────────────────────────────────────────────────────────
        }
        else if (topic === 'solar/panel/event') {
            const result = event_validator_1.eventPayloadSchema.safeParse(parsedPayload);
            if (result.success) {
                const logMessage = `[MQTT]\n\nPayload Valid\n\nTopic:\n${topic}\n\nPayload:\n${JSON.stringify(result.data, null, 2)}`;
                logger_1.default.info(logMessage);
                try {
                    const eventObj = {
                        deviceId: result.data.deviceId,
                        event: result.data.event,
                        timestamp: result.data.timestamp,
                    };
                    await event_repository_1.EventRepository.save(eventObj);
                    const io = (0, socket_server_1.getSocketIO)();
                    io.emit(socket_events_1.SOCKET_EVENTS.EVENT_NEW, eventObj);
                    logger_1.default.info(`[SOCKET] Emitted ${socket_events_1.SOCKET_EVENTS.EVENT_NEW} — ${eventObj.event}`);
                }
                catch (error) {
                    logger_1.default.error(`Error saving event: ${error.message}`);
                }
                // ─── Cleaning completion detection (ESP is source of truth) ──────────
                // ESP sends event "Cleaning Finished" (or similar) when cleaning cycle is done.
                if (typeof result.data.event === 'string' &&
                    (result.data.event.toLowerCase().includes('cleaning finished') ||
                        result.data.event.toLowerCase().includes('cleaning completed'))) {
                    logger_1.default.info('[MQTT] Cleaning completion detected via event feedback from ESP');
                    try {
                        const io = (0, socket_server_1.getSocketIO)();
                        io.emit(socket_events_1.SOCKET_EVENTS.CLEANING_UPDATE, { status: 'idle' });
                        logger_1.default.info(`[SOCKET] Emitted ${socket_events_1.SOCKET_EVENTS.CLEANING_UPDATE} — cleaning idle (completed)`);
                    }
                    catch (socketError) {
                        logger_1.default.error(`[SOCKET] Failed to emit cleaning status: ${socketError.message || socketError}`);
                    }
                }
            }
            else {
                const reasons = result.error.errors.map((err) => err.message);
                const logMessage = `[MQTT]\n\nPayload Invalid\n\nReason:\n${reasons.map((r) => `- ${r}`).join('\n')}`;
                logger_1.default.info(logMessage);
            }
            // ─── UNKNOWN TOPIC ────────────────────────────────────────────────────────
        }
        else {
            logger_1.default.warn(`[MQTT] Received message on unknown topic: ${topic}`);
        }
    }
    catch (error) {
        logger_1.default.error(`Error processing MQTT message on topic ${topic}: ${error.message}`, { error });
    }
};
exports.handleMQTTMessage = handleMQTTMessage;
