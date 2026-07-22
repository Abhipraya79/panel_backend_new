export interface TelemetryEventPayload {
  deviceId: string;
  temperature: number;
  voltage: number;
  current?: number;
  power?: number;
  dust?: number;
  airTemp?: number;
  pumpStatus?: boolean;
  wiperStatus?: boolean;
  mode?: string;
  receivedAt: string;
}
