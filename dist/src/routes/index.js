"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const health_routes_1 = __importDefault(require("./health.routes"));
const telemetry_routes_1 = __importDefault(require("./telemetry.routes"));
const control_routes_1 = __importDefault(require("./control.routes"));
const event_routes_1 = __importDefault(require("./event.routes"));
const telemetry_controller_1 = require("../controllers/telemetry.controller");
const router = (0, express_1.Router)();
// Mount core routes
router.use('/health', health_routes_1.default);
router.use('/api/telemetry', telemetry_routes_1.default);
router.use('/api/control', control_routes_1.default);
router.use('/api/events', event_routes_1.default);
router.get('/api/dashboard', telemetry_controller_1.getDashboard);
exports.default = router;
