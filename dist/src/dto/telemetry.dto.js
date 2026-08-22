"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDashboardDTO = toDashboardDTO;
const device_repository_1 = require("../repositories/device.repository");
const env_1 = require("../config/env");
/**
 * Transforms raw telemetry data from Firestore into DashboardDTO format.
 * Device status is resolved from the devices collection (set by MQTT solar/panel/status topic).
 */
async function toDashboardDTO(telemetry, deviceId = 'panel001') {
    // In DEMO_MODE, device is always ONLINE — bypass Firestore lookup
    let deviceStatus = 'OFFLINE';
    if (env_1.env.DEMO_MODE) {
        deviceStatus = 'ONLINE';
    }
    else {
        // Read device status from Firestore (source of truth: ESP solar/panel/status topic)
        try {
            deviceStatus = await device_repository_1.DeviceRepository.getStatus(deviceId);
        }
        catch {
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
