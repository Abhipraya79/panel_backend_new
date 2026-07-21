import { z } from 'zod';

export const cleaningCommandSchema = z.object({
  action: z.enum(['START'], {
    errorMap: () => ({
      message: 'action must be: START',
    }),
  }),
  mode: z.enum(['MANUAL', 'AUTO_RTC'], {
    errorMap: () => ({
      message: 'mode must be one of: MANUAL, AUTO_RTC',
    }),
  }),
});

export type CleaningCommandPayload = z.infer<typeof cleaningCommandSchema>;
