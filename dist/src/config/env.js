"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
/* eslint-disable no-console */
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
// Load environment variables from .env file
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    PORT: zod_1.z
        .string()
        .transform((val) => parseInt(val, 10))
        .default('5000'),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    // MQTT Settings
    MQTT_HOST: zod_1.z.string().min(1, 'MQTT_HOST is required'),
    MQTT_PORT: zod_1.z
        .string()
        .transform((val) => parseInt(val, 10))
        .default('8883'),
    MQTT_PROTOCOL: zod_1.z.string().default('mqtts'),
    MQTT_USERNAME: zod_1.z.string().optional(),
    MQTT_PASSWORD: zod_1.z.string().optional(),
    MQTT_CLIENT_ID: zod_1.z.string().default('solar_backend'),
    // Firebase Settings
    FIREBASE_PROJECT_ID: zod_1.z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
    FIREBASE_CLIENT_EMAIL: zod_1.z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
    FIREBASE_PRIVATE_KEY: zod_1.z
        .string()
        .min(1, 'FIREBASE_PRIVATE_KEY is required')
        .transform((val) => {
        // Replace double escaped newlines (e.g. from JSON key or .env) with actual newlines and remove any quotes
        return val.replace(/"/g, '').replace(/\\n/g, '\n');
    }),
    // JWT Settings
    JWT_SECRET: zod_1.z.string().min(8, 'JWT_SECRET must be at least 8 characters long'),
    // Settings
    PANEL_OVERHEAT_TEMP: zod_1.z
        .string()
        .transform((val) => parseInt(val, 10))
        .default('45'),
    PANEL_RECOVERY_TEMP: zod_1.z
        .string()
        .transform((val) => parseInt(val, 10))
        .default('42'),
});
let env;
try {
    exports.env = env = envSchema.parse(process.env);
}
catch (error) {
    if (error instanceof zod_1.z.ZodError) {
        const missingOrInvalid = error.errors
            .map((err) => `${err.path.join('.')}: ${err.message}`)
            .join('\n');
        console.error('❌ Environment validation failed:\n', missingOrInvalid);
    }
    else {
        console.error('❌ Unknown error during environment validation:', error);
    }
    process.exit(1);
}
