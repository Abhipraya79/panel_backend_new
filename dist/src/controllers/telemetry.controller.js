"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlMode = exports.controlCleaning = exports.getDashboard = exports.getTelemetryHistory = exports.getLatestTelemetry = void 0;
const telemetry_service_1 = require("../services/telemetry.service");
const logger_1 = __importDefault(require("../utils/logger"));
const mqtt_test_1 = require("../mqtt/mqtt-test");
const socket_server_1 = require("../socket/socket.server");
const getLatestTelemetry = async (_req, res, _next) => {
    try {
        logger_1.default.info('[REST API] GET Latest Telemetry');
        const latest = await telemetry_service_1.TelemetryService.getLatestTelemetry();
        if (!latest) {
            res.status(404).json({
                success: false,
                message: 'No telemetry found',
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: 'Latest telemetry retrieved successfully',
            data: latest,
        });
    }
    catch (error) {
        logger_1.default.error('GET /api/telemetry/latest - Error retrieving telemetry', { error });
        res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};
exports.getLatestTelemetry = getLatestTelemetry;
const getTelemetryHistory = async (req, res, _next) => {
    try {
        logger_1.default.info('[REST API] GET History');
        // Parse query params
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const data = await telemetry_service_1.TelemetryService.getTelemetryHistory(page, limit);
        res.status(200).json({
            success: true,
            message: 'Telemetry history retrieved successfully',
            pagination: {
                page,
                limit,
            },
            data,
        });
    }
    catch (error) {
        logger_1.default.error('GET /api/telemetry/history - Error retrieving telemetry history', { error });
        res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};
exports.getTelemetryHistory = getTelemetryHistory;
const getDashboard = async (_req, res, _next) => {
    try {
        logger_1.default.info('[REST API] GET Dashboard');
        const data = await telemetry_service_1.TelemetryService.getDashboardData();
        if (!data) {
            res.status(404).json({
                success: false,
                message: 'No telemetry found',
            });
            return;
        }
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        logger_1.default.error('GET /api/dashboard - Error retrieving dashboard data', { error });
        res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};
exports.getDashboard = getDashboard;
const controlCleaning = async (req, res, _next) => {
    try {
        const { action, deviceId = 'panel001' } = req.body;
        if (action !== 'start' && action !== 'stop') {
            res.status(400).json({
                success: false,
                message: 'Invalid action. Action must be either "start" or "stop".',
            });
            return;
        }
        logger_1.default.info(`[REST API] POST /api/control/cleaning - Action: ${action}`);
        // 1. Get latest telemetry from Firestore
        let latest = await telemetry_service_1.TelemetryService.getLatestTelemetry();
        // Default if not found
        if (!latest) {
            latest = {
                deviceId,
                temperature: 30,
                voltage: 12,
                current: 0,
                power: 0,
                dust: 0,
                humidity: 50,
                pumpStatus: false,
                wiperStatus: false,
                mode: 'MANUAL',
            };
        }
        // 2. Update telemetry with new status
        const isStarting = action === 'start';
        const updatedPayload = {
            deviceId: latest.deviceId || deviceId,
            temperature: latest.temperature ?? 30,
            voltage: latest.voltage ?? 12,
            current: latest.current ?? 0,
            power: latest.power ?? 0,
            dust: latest.dust ?? 0,
            humidity: latest.humidity ?? 50,
            pumpStatus: isStarting,
            wiperStatus: isStarting,
            mode: 'MANUAL',
            timestamp: new Date().toISOString(),
        };
        // 3. Save telemetry (saves to Firestore and emits to Socket.IO)
        await telemetry_service_1.TelemetryService.saveTelemetry(updatedPayload, 'solar/panel/telemetry');
        // 4. Publish MQTT control commands using publishTest
        try {
            (0, mqtt_test_1.publishTest)('solar/panel/control', {
                deviceId: updatedPayload.deviceId,
                command: 'MANUAL_MODE',
            });
            (0, mqtt_test_1.publishTest)('solar/panel/control', {
                deviceId: updatedPayload.deviceId,
                command: isStarting ? 'PUMP_ON' : 'PUMP_OFF',
            });
            (0, mqtt_test_1.publishTest)('solar/panel/control', {
                deviceId: updatedPayload.deviceId,
                command: isStarting ? 'WIPER_ON' : 'WIPER_OFF',
            });
            logger_1.default.info(`[MQTT] Successfully published cleaning control commands to topic: solar/panel/control`);
        }
        catch (mqttError) {
            logger_1.default.error(`[MQTT] Failed to publish control commands: ${mqttError.message}`);
        }
        res.status(200).json({
            success: true,
            message: `Cleaning ${isStarting ? 'started' : 'stopped'} successfully.`,
            data: {
                pumpStatus: isStarting,
                wiperStatus: isStarting,
                mode: latest.mode || 'MANUAL',
            },
        });
    }
    catch (error) {
        logger_1.default.error('POST /api/control/cleaning - Error processing cleaning control', { error });
        res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};
exports.controlCleaning = controlCleaning;
const controlMode = async (req, res, _next) => {
    try {
        const { mode, deviceId = 'panel001' } = req.body;
        if (mode !== 'AUTO' && mode !== 'MANUAL') {
            res.status(400).json({
                success: false,
                message: 'Invalid mode. Mode must be either "AUTO" or "MANUAL".',
            });
            return;
        }
        logger_1.default.info(`[REST API] POST /api/control/mode - Mode: ${mode}`);
        // 1. Get latest telemetry from Firestore
        let latest = await telemetry_service_1.TelemetryService.getLatestTelemetry();
        // Default if not found
        if (!latest) {
            latest = {
                deviceId,
                temperature: 30,
                voltage: 12,
                current: 0,
                power: 0,
                dust: 0,
                humidity: 50,
                pumpStatus: false,
                wiperStatus: false,
                mode: 'MANUAL',
            };
        }
        // 2. Update telemetry with new mode.
        // If switching to AUTO, force turn off pump and wiper as required.
        const isAuto = mode === 'AUTO';
        const updatedPayload = {
            deviceId: latest.deviceId || deviceId,
            temperature: latest.temperature ?? 30,
            voltage: latest.voltage ?? 12,
            current: latest.current ?? 0,
            power: latest.power ?? 0,
            dust: latest.dust ?? 0,
            humidity: latest.humidity ?? 50,
            pumpStatus: isAuto ? false : (latest.pumpStatus ?? false),
            wiperStatus: isAuto ? false : (latest.wiperStatus ?? false),
            mode: mode,
            timestamp: new Date().toISOString(),
        };
        // 3. Save telemetry (saves to Firestore and emits to Socket.IO)
        await telemetry_service_1.TelemetryService.saveTelemetry(updatedPayload, 'solar/panel/telemetry');
        // Emit mode update event to socket.io
        try {
            const io = (0, socket_server_1.getSocketIO)();
            io.emit('mode:update', { mode: updatedPayload.mode });
            logger_1.default.info(`[SOCKET] Mode update emitted: ${updatedPayload.mode}`);
        }
        catch (socketError) {
            logger_1.default.error(`[SOCKET] Failed to emit mode update: ${socketError.message}`);
        }
        // 4. Publish MQTT control commands
        try {
            (0, mqtt_test_1.publishTest)('solar/panel/control', {
                deviceId: updatedPayload.deviceId,
                command: isAuto ? 'AUTO_MODE' : 'MANUAL_MODE',
            });
            if (isAuto) {
                // If switched to auto, turn off pump & wiper
                (0, mqtt_test_1.publishTest)('solar/panel/control', {
                    deviceId: updatedPayload.deviceId,
                    command: 'PUMP_OFF',
                });
                (0, mqtt_test_1.publishTest)('solar/panel/control', {
                    deviceId: updatedPayload.deviceId,
                    command: 'WIPER_OFF',
                });
            }
            logger_1.default.info(`[MQTT] Successfully published mode control commands to topic: solar/panel/control`);
        }
        catch (mqttError) {
            logger_1.default.error(`[MQTT] Failed to publish mode commands: ${mqttError.message}`);
        }
        res.status(200).json({
            success: true,
            message: `Mode updated to ${mode} successfully.`,
            data: {
                pumpStatus: updatedPayload.pumpStatus,
                wiperStatus: updatedPayload.wiperStatus,
                mode: updatedPayload.mode,
            },
        });
    }
    catch (error) {
        logger_1.default.error('POST /api/control/mode - Error processing mode control', { error });
        res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error',
        });
    }
};
exports.controlMode = controlMode;
