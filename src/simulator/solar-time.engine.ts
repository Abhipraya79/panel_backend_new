import { env } from '../config/env';
import logger from '../utils/logger';

export type SimulationTimeMode = 'REAL_TIME' | 'FIXED' | 'ACCELERATED';

export interface RefKeyframe {
  timeStr: string;
  hour: number;
  temp: number;
  pwm: number;
}

/**
 * Excel Reference Monitoring Data (11:00 WIB - 13:00 WIB)
 * Thesis Reference Dataset: Panel Temp (°C) & PWM
 */
export const EXCEL_REFERENCE_DATA: RefKeyframe[] = [
  { timeStr: '11:00', hour: 11.0,         temp: 57.8, pwm: 255 },
  { timeStr: '11:05', hour: 11.083333333, temp: 55.4, pwm: 255 },
  { timeStr: '11:10', hour: 11.166666667, temp: 52.6, pwm: 252 },
  { timeStr: '11:15', hour: 11.25,        temp: 49.7, pwm: 247 },
  { timeStr: '11:20', hour: 11.333333333, temp: 46.9, pwm: 240 },
  { timeStr: '11:25', hour: 11.416666667, temp: 44.3, pwm: 233 },
  { timeStr: '11:30', hour: 11.5,         temp: 42.1, pwm: 226 },
  { timeStr: '11:35', hour: 11.583333333, temp: 40.2, pwm: 220 },
  { timeStr: '11:40', hour: 11.666666667, temp: 38.4, pwm: 216 },
  { timeStr: '11:45', hour: 11.75,        temp: 37.0, pwm: 213 },
  { timeStr: '11:50', hour: 11.833333333, temp: 36.0, pwm: 211 },
  { timeStr: '11:55', hour: 11.916666667, temp: 35.4, pwm: 210 },
  { timeStr: '12:00', hour: 12.0,         temp: 35.1, pwm: 212 },
  { timeStr: '12:05', hour: 12.083333333, temp: 34.9, pwm: 208 },
  { timeStr: '12:10', hour: 12.166666667, temp: 35.2, pwm: 214 },
  { timeStr: '12:15', hour: 12.25,        temp: 34.8, pwm: 209 },
  { timeStr: '12:20', hour: 12.333333333, temp: 35.0, pwm: 212 },
  { timeStr: '12:25', hour: 12.416666667, temp: 35.2, pwm: 216 },
  { timeStr: '12:30', hour: 12.5,         temp: 34.9, pwm: 210 },
  { timeStr: '12:35', hour: 12.583333333, temp: 35.1, pwm: 215 },
  { timeStr: '12:40', hour: 12.666666667, temp: 35.3, pwm: 219 },
  { timeStr: '12:45', hour: 12.75,        temp: 35.0, pwm: 214 },
  { timeStr: '12:50', hour: 12.833333333, temp: 34.8, pwm: 211 },
  { timeStr: '12:55', hour: 12.916666667, temp: 35.1, pwm: 217 },
  { timeStr: '13:00', hour: 13.0,         temp: 35.3, pwm: 221 },
];

export class SolarTimeEngine {
  private mode: SimulationTimeMode = env.DEMO_MODE ? 'ACCELERATED' : env.SIMULATION_TIME_MODE;
  private fixedHour: number | null = null;
  private startSimHour: number = SolarTimeEngine.parseTimeStringToHour(env.SIMULATION_START_TIME || '11:00');
  private endSimHour: number = SolarTimeEngine.parseTimeStringToHour(env.SIMULATION_END_TIME || '13:00');
  private recordingDurationSeconds: number = env.RECORDING_DURATION_SECONDS || 600;
  private acceleratedStartRealMs: number = Date.now();

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

  public resetClock(): void {
    this.acceleratedStartRealMs = Date.now();
    logger.info(`[TIME ENGINE] Simulation clock reset to ${SolarTimeEngine.formatHourToString(this.startSimHour)}`);
  }

  public setRecordingDurationSeconds(durationSecs: number): void {
    this.recordingDurationSeconds = Math.max(10, durationSecs);
    this.acceleratedStartRealMs = Date.now();
    logger.info(`[TIME ENGINE] Recording duration set to: ${this.recordingDurationSeconds}s (${(this.recordingDurationSeconds / 60).toFixed(1)} mins)`);
  }

  public getRecordingDurationSeconds(): number {
    return this.recordingDurationSeconds;
  }

  public getSpeedMultiplier(): number {
    const totalSimSecs = (this.endSimHour - this.startSimHour) * 3600;
    return totalSimSecs / Math.max(1, this.recordingDurationSeconds);
  }

  public setMode(mode: SimulationTimeMode): void {
    this.mode = mode;
    logger.info(`[TIME ENGINE] Simulation mode changed to: ${mode}`);
  }

  public setFixedTimeString(timeStr: string | null): void {
    if (!timeStr) {
      this.fixedHour = null;
      logger.info('[TIME ENGINE] Cleared fixed simulation time override');
      return;
    }
    this.fixedHour = SolarTimeEngine.parseTimeStringToHour(timeStr);
    this.mode = 'FIXED';
    logger.info(`[TIME ENGINE] Set fixed simulation time: ${timeStr} (${this.fixedHour.toFixed(2)}h)`);
  }

  public setFixedHour(hour: number | null): void {
    this.fixedHour = hour;
    if (hour !== null) {
      this.mode = 'FIXED';
    }
  }

  public getConfig(): {
    mode: SimulationTimeMode;
    effectiveHour: number;
    formattedTime: string;
    speed: number;
    recordingDurationSeconds: number;
    fixedHour: number | null;
    startSimTime: string;
    endSimTime: string;
  } {
    const h = this.getEffectiveHour();
    return {
      mode: this.mode,
      effectiveHour: parseFloat(h.toFixed(4)),
      formattedTime: SolarTimeEngine.formatHourToString(h),
      speed: parseFloat(this.getSpeedMultiplier().toFixed(2)),
      recordingDurationSeconds: this.recordingDurationSeconds,
      fixedHour: this.fixedHour,
      startSimTime: env.SIMULATION_START_TIME,
      endSimTime: env.SIMULATION_END_TIME,
    };
  }

  /** Returns current fractional hour (0.0 to 23.999) based on configured mode */
  public getEffectiveHour(): number {
    if (this.fixedHour !== null && this.mode === 'FIXED') {
      return this.fixedHour;
    }

    if (this.mode === 'ACCELERATED' || env.DEMO_MODE) {
      const elapsedRealSecs = (Date.now() - this.acceleratedStartRealMs) / 1000.0;
      const speed = this.getSpeedMultiplier();
      const simElapsedSecs = elapsedRealSecs * speed;
      const totalSimSecs = this.startSimHour * 3600 + simElapsedSecs;
      const maxSimSecs = this.endSimHour * 3600;

      // Clamp at endSimHour if elapsed exceeds recording duration
      const clampedSimSecs = Math.min(maxSimSecs, totalSimSecs);
      return clampedSimSecs / 3600.0;
    }

    // REAL_TIME mode: UTC+7 (WIB)
    const now = new Date();
    const wibHours = (now.getUTCHours() + 7) % 24;
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();
    return wibHours + minutes / 60.0 + seconds / 3600.0;
  }

  /**
   * Linear Interpolation from the 25 Reference Keyframes (11:00 - 13:00 WIB)
   * Returns exact reference temperature (°C) and reference PWM (0-255) for fractional hour h.
   */
  public getRefDataAtHour(hour?: number): {
    refTemp: number;
    refPwm: number;
  } {
    const h = hour ?? this.getEffectiveHour();

    if (h <= EXCEL_REFERENCE_DATA[0].hour) {
      return {
        refTemp: EXCEL_REFERENCE_DATA[0].temp,
        refPwm: EXCEL_REFERENCE_DATA[0].pwm,
      };
    }

    const lastIdx = EXCEL_REFERENCE_DATA.length - 1;
    if (h >= EXCEL_REFERENCE_DATA[lastIdx].hour) {
      return {
        refTemp: EXCEL_REFERENCE_DATA[lastIdx].temp,
        refPwm: EXCEL_REFERENCE_DATA[lastIdx].pwm,
      };
    }

    let lower = EXCEL_REFERENCE_DATA[0];
    let upper = EXCEL_REFERENCE_DATA[lastIdx];

    for (let i = 0; i < EXCEL_REFERENCE_DATA.length - 1; i++) {
      if (h >= EXCEL_REFERENCE_DATA[i].hour && h <= EXCEL_REFERENCE_DATA[i + 1].hour) {
        lower = EXCEL_REFERENCE_DATA[i];
        upper = EXCEL_REFERENCE_DATA[i + 1];
        break;
      }
    }

    const fraction = upper.hour === lower.hour ? 0 : (h - lower.hour) / (upper.hour - lower.hour);
    const refTemp = lower.temp + fraction * (upper.temp - lower.temp);
    const refPwm = Math.round(lower.pwm + fraction * (upper.pwm - lower.pwm));

    return {
      refTemp: parseFloat(refTemp.toFixed(2)),
      refPwm,
    };
  }

  /**
   * Returns solar thermal target profile (used for voltage & current calculations)
   */
  public getTargetSolarProfile(hour?: number): {
    targetTemp: number;
    targetVoltage: number;
    targetCurrent: number;
  } {
    const h = hour ?? this.getEffectiveHour();
    const { refTemp } = this.getRefDataAtHour(h);

    // Voltage & Current curves tied smoothly to solar peak around 11:30 - 12:30
    const solarPeakNorm = Math.max(0, 1 - Math.pow((h - 12.0) / 2.0, 2));
    const targetVoltage = parseFloat((4.85 - (refTemp - 35.0) * 0.012).toFixed(2));
    const targetCurrent = parseFloat((3.60 + solarPeakNorm * 0.70).toFixed(2));

    return {
      targetTemp: refTemp,
      targetVoltage: Math.max(3.5, Math.min(5.0, targetVoltage)),
      targetCurrent: Math.max(1.0, Math.min(4.4, targetCurrent)),
    };
  }
}

export const solarTimeEngine = new SolarTimeEngine();

