# MQTT Protocol Specification

Dokumen ini mendefinisikan spesifikasi komunikasi MQTT antara mikrokontroler (ESP32) dan Node.js Backend.

---

## 1. Broker Configuration
- **Protocol**: `mqtts` (Secure connection with TLS/SSL using HiveMQ Cloud)
- **Port**: `8883`
- **Quality of Service (QoS)**: `QoS 1` (At least once - menjamin pesan sampai minimal 1 kali)
- **Clean Session**: `true` (tidak menyimpan status session client ketika disconnect)
- **Keep Alive**: `60 seconds`

---

## 2. Topic Registry

| Topic | Publisher | Subscriber | Deskripsi |
| :--- | :--- | :--- | :--- |
| `solar/panel/telemetry` | ESP32 | Backend | Data sensor real-time panel surya |
| `solar/panel/status` | ESP32 | Backend | Status konektivitas hardware (LWT) |
| `solar/panel/control` | Backend | ESP32 | Perintah aksi ke relay pompa / wiper |
| `solar/panel/event` | ESP32 | Backend | Notifikasi instan dari hardware (misal: error sensor) |

---

## 3. Payload Format

Semua pesan yang ditransmisikan wajib berformat **JSON**.

### A. Telemetry (`solar/panel/telemetry`)
ESP32 mengirim data ini setiap interval waktu tertentu (misal: 10 detik sekali).

```json
{
  "deviceId": "panel001",
  "temperature": 42.5,
  "dust": 210,
  "voltage": 18.7,
  "current": 2.31,
  "power": 43.19,
  "pumpStatus": true,
  "wiperStatus": false,
  "mode": "AUTO",
  "timestamp": "2026-07-10T20:30:00Z"
}
```

**Spesifikasi data:**
- `deviceId` (string): Unique identifier untuk unit panel surya.
- `temperature` (float): Suhu panel surya (°C).
- `dust` (integer): Tingkat kekeruhan/debu panel (satuan sensor debu).
- `voltage` (float): Tegangan panel surya (Volt).
- `current` (float): Arus panel surya (Ampere).
- `power` (float): Daya yang dihasilkan (Watt) -> $P = V \times I$.
- `pumpStatus` (boolean): Status pompa air (`true` = ON, `false` = OFF).
- `wiperStatus` (boolean): Status pembersih debu (`true` = ON, `false` = OFF).
- `mode` (string): Mode kontrol aktif (`"AUTO"` atau `"MANUAL"`).
- `timestamp` (string): Waktu pembacaan sensor format ISO 8601 UTC.

### B. Device Connection Status (`solar/panel/status`)
Menggunakan fitur Last Will and Testament (LWT) MQTT untuk mendeteksi device offline.

**LWT Configuration:**
- Topic: `solar/panel/status`
- Payload: Offline
- Retain: `true`

Saat normal boot, ESP32 mempublikasikan:
```json
{
  "deviceId": "panel001",
  "status": "ONLINE",
  "timestamp": "2026-07-10T20:00:00Z"
}
```

Saat offline (koneksi terputus/LWT dipicu oleh broker):
```json
{
  "deviceId": "panel001",
  "status": "OFFLINE",
  "timestamp": "2026-07-10T20:15:00Z"
}
```

### C. Command Control (`solar/panel/control`)
Backend mengirimkan perintah untuk mengubah kondisi hardware atas request dari aplikasi Flutter.

```json
{
  "deviceId": "panel001",
  "command": "PUMP_ON"
}
```

**Daftar Command Valid (`command`):**
- `PUMP_ON` : Menyalakan pompa pendingin.
- `PUMP_OFF`: Mematikan pompa pendingin.
- `WIPER_ON` : Menyalakan wiper pembersih debu.
- `WIPER_OFF`: Mematikan wiper pembersih debu.
- `AUTO_MODE` : Mengubah mode kendali hardware ke Otomatis (ESP32 mengambil keputusan sendiri berdasarkan threshold).
- `MANUAL_MODE`: Mengubah mode kendali hardware ke Manual (hanya merespon perintah backend).
