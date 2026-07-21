"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toDashboardDTO = toDashboardDTO;
/**
 * Transforms raw telemetry data from Firestore into DashboardDTO format.
 * Determines deviceStatus based on receivedAt timestamp (ONLINE if < 15 seconds, otherwise OFFLINE).
 */
function toDashboardDTO(telemetry) {
    const receivedAtTime = telemetry.receivedAt ? new Date(telemetry.receivedAt).getTime() : 0;
    const now = new Date().getTime();
    // Calculate if the device is ONLINE (receivedAt is within 15 seconds)
    const deviceStatus = now - receivedAtTime < 15000 ? 'ONLINE' : 'OFFLINE';
    return {
        deviceStatus,
        temperature: telemetry.temperature ?? 0,
        humidity: telemetry.humidity ?? 0,
        dust: telemetry.dust ?? 0,
        voltage: telemetry.voltage ?? 0,
        current: telemetry.current ?? 0,
        power: telemetry.power ?? 0,
        pumpStatus: telemetry.pumpStatus ?? false,
        wiperStatus: telemetry.wiperStatus ?? false,
        mode: telemetry.mode ?? 'UNKNOWN',
        lastUpdate: telemetry.receivedAt || '',
    };
}
