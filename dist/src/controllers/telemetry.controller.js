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
/**
 * GET /api/telemetry/history
 *
 * Query params:
 *   page     : number (default 1)
 *   limit    : number (default 50, max 200)
 *   cursor   : string returned by the previous response
 *   date     : 'today' | 'yesterday' | ISO date string (e.g. 2026-07-30) — defaults to 'today'
 *   interval : '3s' | '5m' (default '3s')
 *   search   : string — searches mode/deviceId
 *   deviceId : string
 *
 * Response:
 * {
 *   success: true,
 *   page, limit, totalPages, totalData,
 *   data: [...]
 * }
 */
const getTelemetryHistory = async (req, res, _next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const cursor = req.query.cursor || undefined;
        const date = req.query.date || 'today';
        const interval = (req.query.interval === '5m' ? '5m' : '3s');
        const search = req.query.search || undefined;
        const deviceId = req.query.deviceId || undefined;
        logger_1.default.info(`[REST API] GET History page=${page} limit=${limit} date=${date} interval=${interval}`);
        const result = await telemetry_service_1.TelemetryService.getHistoryPaginated({
            page,
            limit,
            cursor,
            date,
            interval,
            search,
            deviceId,
        });
        res.status(200).json({
            success: true,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
            totalData: result.totalData,
            nextCursor: result.nextCursor,
            data: result.data,
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
