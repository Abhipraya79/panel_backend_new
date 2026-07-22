import { z } from 'zod';

export const telemetryPayloadSchema = z.object({
  deviceId: z
    .string({
      required_error: 'deviceId is required',
      invalid_type_error: 'deviceId must be string',
    })
    .min(1, 'deviceId is required'),
  temperature: z.number({
    required_error: 'temperature is required',
    invalid_type_error: 'temperature must be number',
  }),
  voltage: z.number({
    required_error: 'voltage is required',
    invalid_type_error: 'voltage must be number',
  }),
  current: z
    .number({
      invalid_type_error: 'current must be number',
    })
    .optional(),
  power: z
    .number({
      invalid_type_error: 'power must be number',
    })
    .optional(),
  dust: z
    .number({
      invalid_type_error: 'dust must be number',
    })
    .optional(),
  airTemp: z
    .number({
      invalid_type_error: 'airTemp must be number',
    })
    .optional(),
  pumpStatus: z
    .boolean({
      invalid_type_error: 'pumpStatus must be boolean',
    })
    .optional(),
  wiperStatus: z
    .boolean({
      invalid_type_error: 'wiperStatus must be boolean',
    })
    .optional(),
  mode: z
    .string({
      invalid_type_error: 'mode must be string',
    })
    .optional(),
  timestamp: z
    .string({
      invalid_type_error: 'timestamp must be string',
    })
    .optional(),
});

export type TelemetryPayload = z.infer<typeof telemetryPayloadSchema>;
