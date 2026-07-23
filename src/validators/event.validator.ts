import { z } from 'zod';

export const eventPayloadSchema = z.object({
  deviceId: z
    .string({
      required_error: 'deviceId is required',
      invalid_type_error: 'deviceId must be string',
    })
    .min(1, 'deviceId is required'),
  event: z
    .string({
      required_error: 'event description is required',
      invalid_type_error: 'event must be string',
    })
    .min(1, 'event description is required'),
  timestamp: z
    .string({
      invalid_type_error: 'timestamp must be string',
    })
    .optional(),
  duration: z
    .number({
      invalid_type_error: 'duration must be number',
    })
    .optional(),
});

export type EventPayload = z.infer<typeof eventPayloadSchema>;
