"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventPayloadSchema = void 0;
const zod_1 = require("zod");
exports.eventPayloadSchema = zod_1.z.object({
    deviceId: zod_1.z
        .string({
        required_error: 'deviceId is required',
        invalid_type_error: 'deviceId must be string',
    })
        .min(1, 'deviceId is required'),
    event: zod_1.z
        .string({
        required_error: 'event description is required',
        invalid_type_error: 'event must be string',
    })
        .min(1, 'event description is required'),
    timestamp: zod_1.z
        .string({
        invalid_type_error: 'timestamp must be string',
    })
        .optional(),
    duration: zod_1.z
        .number({
        invalid_type_error: 'duration must be number',
    })
        .optional(),
});
