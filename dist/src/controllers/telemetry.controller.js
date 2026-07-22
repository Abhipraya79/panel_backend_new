"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = exports.getTelemetryHistory = exports.getLatestTelemetry = void 0;
const telemetry_service_1 = require("../services/telemetry.service");
const logger_1 = __importDefault(require("../utils/logger"));
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
