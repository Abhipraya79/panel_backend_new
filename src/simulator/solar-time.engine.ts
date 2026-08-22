import { env } from '../config/env';
import logger from '../utils/logger';

export type SimulationTimeMode = 'REAL_TIME' | 'FIXED' | 'ACCELERATED';

interface HourlyProfileKeyframe {
  hour: number;
  tempMin: number;
  tempMax: number;
  voltageMin: number;
  voltageMax: number;
  currentMin: number;
  currentMax: number;
}

/**
 * Midday Solar Thermal Profile (WIB / UTC+7)
 * Strictly matches requirement:
 *   10:00 - 11:00 -> ~38 - 45°C
 *   11:00 - 11:30 -> ~42 - 48°C
 *   11:30 - 12:00 -> ~45 - 52°C
 *   12:00 - 12:30 -> ~48 - 56°C
 *   12:30 - 13:00 -> ~50 - 60°C
 */
const MIDDAY_KEYFRAMES: HourlyProfileKeyframe[] = [
  { hour: 7.0,  tempMin: 41.0, tempMax: 43.0, voltageMin: 4.8, voltageMax: 5.0, currentMin: 1.5, currentMax: 2.0 },
  { hour: 9.0,  tempMin: 41.0, tempMax: 44.0, voltageMin: 4.8, voltageMax: 5.0, currentMin: 2.5, currentMax: 3.2 },
  { hour: 10.0, tempMin: 41.5, tempMax: 44.0, voltageMin: 4.8, voltageMax: 5.0, currentMin: 3.0, currentMax: 3.6 },
  { hour: 11.0, tempMin: 42.0, tempMax: 46.0, voltageMin: 4.75, voltageMax: 4.95, currentMin: 3.5, currentMax: 4.0 },
  { hour: 11.5, tempMin: 45.0, tempMax: 50.0, voltageMin: 4.70, voltageMax: 4.90, currentMin: 3.7, currentMax: 4.2 },
  { hour: 12.0, tempMin: 48.0, tempMax: 54.0, voltageMin: 4.65, voltageMax: 4.85, currentMin: 3.9, currentMax: 4.35 },
  { hour: 12.5, tempMin: 50.0, tempMax: 58.0, voltageMin: 4.60, voltageMax: 4.80, currentMin: 4.0, currentMax: 4.4 },
  { hour: 13.0, tempMin: 52.0, tempMax: 60.0, voltageMin: 4.65, voltageMax: 4.85, currentMin: 3.8, currentMax: 4.3 },
  { hour: 14.0, tempMin: 48.0, tempMax: 54.0, voltageMin: 4.70, voltageMax: 4.90, currentMin: 3.5, currentMax: 4.0 },
  { hour: 16.0, tempMin: 43.0, tempMax: 47.0, voltageMin: 4.75, voltageMax: 4.95, currentMin: 2.5, currentMax: 3.2 },
  { hour: 18.0, tempMin: 41.0, tempMax: 43.0, voltageMin: 4.2, voltageMax: 4.5, currentMin: 0.8, currentMax: 1.2 },
];

export class SolarTimeEngine {
  private mode: SimulationTimeMode = env.SIMULATION_TIME_MODE;
  private fixedHour: number | null = null;
  private acceleratedBaseSimTimeSeconds: number = 11 * 3600; // default 11:00 WIB
  private acceleratedStartRealMs: number = Date.now();
  private speed: number = env.SIMULATION_SPEED;

  constructor() {
    if (env.SIMULATION_TIME) {
      this.setFixedTimeString(env.SIMULATION_TIME);
    }
  }

  /** Parse string formatted as "HH:MM" into fractional hour */
  public static parseTimeStringToHour(timeStr: string): number {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours + minutes / 60.0;
  }

  /** Format fractional hour into HH:MM:SS */
  public static formatHourToString(fractionalHour: number): string {
    const totalSecs = Math.floor(fractionalHour * 3600) % 86400;
    const h = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSecs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  public setMode(mode: SimulationTimeMode): void {
    this.mode = mode;
    logger.info(`[TIME ENGINE] Simulation mode changed to: ${mode}`);
  }

  public setSpeed(speed: number): void {
    this.speed = Math.max(0.1, speed);
    logger.info(`[TIME ENGINE] Simulation speed set to: ${this.speed}x`);
  }

  public setFixedTimeString(timeStr: string | null): void {
    if (!timeStr) {
      this.fixedHour = null;
      logger.info('[TIME ENGINE] Cleared fixed simulation time override');
      return;
    }
    this.fixedHour = SolarTimeEngine.parseTimeStringToHour(timeStr);
    this.acceleratedBaseSimTimeSeconds = this.fixedHour * 3600;
    this.acceleratedStartRealMs = Date.now();
    logger.info(`[TIME ENGINE] Set fixed simulation time: ${timeStr} (${this.fixedHour.toFixed(2)}h)`);
  }

  public setFixedHour(hour: number | null): void {
    this.fixedHour = hour;
    if (hour !== null) {
      this.acceleratedBaseSimTimeSeconds = hour * 3600;
      this.acceleratedStartRealMs = Date.now();
    }
  }

  public getConfig(): {
    mode: SimulationTimeMode;
    effectiveHour: number;
    formattedTime: string;
    speed: number;
    fixedHour: number | null;
  } {
    const h = this.getEffectiveHour();
    return {
      mode: this.mode,
      effectiveHour: parseFloat(h.toFixed(2)),
      formattedTime: SolarTimeEngine.formatHourToString(h),
      speed: this.speed,
      fixedHour: this.fixedHour,
    };
  }

  /** Returns current fractional hour (0.0 to 23.999) based on configured mode */
  public getEffectiveHour(): number {
    if (this.fixedHour !== null && this.mode === 'FIXED') {
      return this.fixedHour;
    }

    if (this.mode === 'ACCELERATED') {
      const elapsedRealSecs = (Date.now() - this.acceleratedStartRealMs) / 1000.0;
      const simElapsedSecs = elapsedRealSecs * this.speed;
      const totalSimSecs = (this.acceleratedBaseSimTimeSeconds + simElapsedSecs) % 86400;
      return totalSimSecs / 3600.0;
    }

    // REAL_TIME mode: UTC+7 (WIB)
    const now = new Date();
    const wibHours = (now.getUTCHours() + 7) % 24;
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    return wibHours + minutes / 60.0 + seconds / 3600.0;
  }

  /**
   * Calculates baseline target solar heating temperature, voltage, and current
   * interpolated for the current effective hour.
   */
  public getTargetSolarProfile(hour?: number): {
    targetTemp: number;
    targetVoltage: number;
    targetCurrent: number;
  } {
    const h = hour ?? this.getEffectiveHour();

    if (h <= 6.0) {
      return { targetTemp: 41.0, targetVoltage: 4.5, targetCurrent: 0.5 };
    }
    if (h >= 19.0) {
      return { targetTemp: 41.0, targetVoltage: 4.0, targetCurrent: 0.3 };
    }

    let lower = MIDDAY_KEYFRAMES[0];
    let upper = MIDDAY_KEYFRAMES[MIDDAY_KEYFRAMES.length - 1];

    for (let i = 0; i < MIDDAY_KEYFRAMES.length - 1; i++) {
      if (h >= MIDDAY_KEYFRAMES[i].hour && h <= MIDDAY_KEYFRAMES[i + 1].hour) {
        lower = MIDDAY_KEYFRAMES[i];
        upper = MIDDAY_KEYFRAMES[i + 1];
        break;
      }
    }

    const fraction = lower.hour === upper.hour ? 0 : (h - lower.hour) / (upper.hour - lower.hour);

    const lowerTempMid = (lower.tempMin + lower.tempMax) / 2;
    const upperTempMid = (upper.tempMin + upper.tempMax) / 2;
    const targetTemp = lowerTempMid + fraction * (upperTempMid - lowerTempMid);

    const lowerVoltMid = (lower.voltageMin + lower.voltageMax) / 2;
    const upperVoltMid = (upper.voltageMin + upper.voltageMax) / 2;
    const targetVoltage = lowerVoltMid + fraction * (upperVoltMid - lowerVoltMid);

    const lowerCurrMid = (lower.currentMin + lower.currentMax) / 2;
    const upperCurrMid = (upper.currentMin + upper.currentMax) / 2;
    const targetCurrent = lowerCurrMid + fraction * (upperCurrMid - lowerCurrMid);

    return { targetTemp, targetVoltage, targetCurrent };
  }
}

export const solarTimeEngine = new SolarTimeEngine();
