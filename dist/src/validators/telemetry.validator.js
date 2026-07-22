"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.telemetryPayloadSchema = void 0;
const zod_1 = require("zod");
exports.telemetryPayloadSchema = zod_1.z.object({
    deviceId: zod_1.z
        .string({
        required_error: 'deviceId is required',
        invalid_type_error: 'deviceId must be string',
    })
        .min(1, 'deviceId is required'),
    temperature: zod_1.z.number({
        required_error: 'temperature is required',
        invalid_type_error: 'temperature must be number',
    }),
    voltage: zod_1.z.number({
        required_error: 'voltage is required',
        invalid_type_error: 'voltage must be number',
    }),
    current: zod_1.z
        .number({
        invalid_type_error: 'current must be number',
    })
        .optional(),
    power: zod_1.z
        .number({
        invalid_type_error: 'power must be number',
    })
        .optional(),
    dust: zod_1.z
        .number({
        invalid_type_error: 'dust must be number',
    })
        .optional(),
    airTemp: zod_1.z
        .number({
        invalid_type_error: 'airTemp must be number',
    })
        .optional(),
    pumpStatus: zod_1.z
        .boolean({
        invalid_type_error: 'pumpStatus must be boolean',
    })
        .optional(),
    wiperStatus: zod_1.z
        .boolean({
        invalid_type_error: 'wiperStatus must be boolean',
    })
        .optional(),
    mode: zod_1.z
        .string({
        invalid_type_error: 'mode must be string',
    })
        .optional(),
    timestamp: zod_1.z
        .string({
        invalid_type_error: 'timestamp must be string',
    })
        .optional(),
});
