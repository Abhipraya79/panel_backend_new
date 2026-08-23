/* eslint-disable no-console */
import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Demo Mode — set DEMO_MODE=true to use dummy telemetry (no ESP/MQTT required)
  DEMO_MODE: z
    .string()
    .transform((val) => val.toLowerCase() === 'true')
    .default('false'),

  // Simulation Time Configuration
  SIMULATION_TIME_MODE: z
    .enum(['REAL_TIME', 'FIXED', 'ACCELERATED'])
    .default('REAL_TIME'),
  SIMULATION_START_TIME: z.string().default('11:00'),
  SIMULATION_END_TIME: z.string().default('13:00'),
  RECORDING_DURATION_SECONDS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('600'),
  SIMULATION_TIME: z.string().optional(),
  SIMULATION_SPEED: z
    .string()
    .transform((val) => parseFloat(val))
    .default('1'),
  TEMPERATURE_MIN: z
    .string()
    .transform((val) => parseFloat(val))
    .default('40'),
  TEMPERATURE_MAX: z
    .string()
    .transform((val) => parseFloat(val))
    .default('60'),

  // Cleaning simulation duration in milliseconds (only used when DEMO_MODE=true)
  DEMO_CLEANING_DURATION_MS: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('10000'),

  // MQTT Settings (required only when DEMO_MODE=false)
  MQTT_HOST: z.string().default(''),
  MQTT_PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('8883'),
  MQTT_PROTOCOL: z.string().default('mqtts'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_CLIENT_ID: z.string().default('solar_backend'),

  // Firebase Settings
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .min(1, 'FIREBASE_PRIVATE_KEY is required')
    .transform((val) => {
      // Replace double escaped newlines (e.g. from JSON key or .env) with actual newlines and remove any quotes
      return val.replace(/"/g, '').replace(/\\n/g, '\n');
    }),

  // JWT Settings
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters long'),

  // Settings
  PANEL_OVERHEAT_TEMP: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('45'),
  PANEL_RECOVERY_TEMP: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('42'),
});

type EnvConfig = z.infer<typeof envSchema>;

let env: EnvConfig;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingOrInvalid = error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error('❌ Environment validation failed:\n', missingOrInvalid);
  } else {
    console.error('❌ Unknown error during environment validation:', error);
  }
  process.exit(1);
}

export { env };
