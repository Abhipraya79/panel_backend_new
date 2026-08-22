import { DeviceRepository } from '../repositories/device.repository';
import { env } from '../config/env';


export interface DashboardDTO {
  deviceStatus: 'ONLINE' | 'OFFLINE';
  temperature: number;
  airTemp: number;
  dust: number;
  voltage: number;
  current: number;
  power: number;
  pwm_value: number;
  pumpStatus: boolean;
  wiperStatus: boolean;
  mode: string;
  lastUpdate: string;
}

/**
 * Transforms raw telemetry data from Firestore into DashboardDTO format.
 * Device status is resolved from the devices collection (set by MQTT solar/panel/status topic).
 */
export async function toDashboardDTO(
  telemetry: any,
  deviceId: string = 'panel001',
): Promise<DashboardDTO> {
  // In DEMO_MODE, device is always ONLINE — bypass Firestore lookup
  let deviceStatus: 'ONLINE' | 'OFFLINE' = 'OFFLINE';
  if (env.DEMO_MODE) {
    deviceStatus = 'ONLINE';
  } else {
    // Read device status from Firestore (source of truth: ESP solar/panel/status topic)
    try {
      deviceStatus = await DeviceRepository.getStatus(deviceId);
    } catch {
      // If device doc doesn't exist yet, default to OFFLINE
      deviceStatus = 'OFFLINE';
    }
  }

  return {
    deviceStatus,
    temperature: telemetry.temperature ?? 0,
    airTemp: telemetry.airTemp ?? 0,
    dust: telemetry.dust ?? 0,
    voltage: telemetry.voltage ?? 0,
    current: telemetry.current ?? 0,
    power: telemetry.power ?? 0,
    pwm_value: telemetry.pwm_value ?? telemetry.pwm ?? 0,
    pumpStatus: telemetry.pumpStatus ?? false,
    wiperStatus: telemetry.wiperStatus ?? false,
    mode: telemetry.mode ?? 'UNKNOWN',
    lastUpdate: telemetry.receivedAt || '',
  };
}
