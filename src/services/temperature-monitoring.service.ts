import logger from '../utils/logger';
import notificationService from './notification.service';
import { env } from '../config/env';

class TemperatureMonitoringService {
  private isOverheated: Map<string, boolean> = new Map();
  private lastNotificationTime: Map<string, number> = new Map();

  /**
   * Mengecek temperature dari telemetry dan memicu FCM notification jika overheat
   */
  async checkTemperature(deviceId: string, temperature: number): Promise<void> {
    const overheatTemp = env.PANEL_OVERHEAT_TEMP;
    const recoveryTemp = env.PANEL_RECOVERY_TEMP;

    const currentOverheatStatus = this.isOverheated.get(deviceId) || false;
    const lastTime = this.lastNotificationTime.get(deviceId) || 0;
    const now = Date.now();
    const TEN_MINUTES_MS = 10 * 60 * 1000;

    if (temperature >= overheatTemp) {
      // Overheat detected
      if (!currentOverheatStatus || (now - lastTime >= TEN_MINUTES_MS)) {
        logger.info(`[OVERHEAT]\nDevice:\n${deviceId}\nTemperature:\n${temperature}°C\nNotification Sent`);
        
        await notificationService.sendOverheatNotification(temperature, deviceId);
        
        this.isOverheated.set(deviceId, true);
        this.lastNotificationTime.set(deviceId, now);
      }
    } else if (temperature <= recoveryTemp) {
      // Recovery detected
      if (currentOverheatStatus) {
        logger.info(`[TEMP NORMAL]\nDevice:\n${deviceId}\nTemperature:\n${temperature}°C\nNotification Sent`);
        
        await notificationService.sendRecoveryNotification(temperature, deviceId);
        
        this.isOverheated.set(deviceId, false);
      }
    }
  }
}

export default new TemperatureMonitoringService();
