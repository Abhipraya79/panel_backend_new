# REST API Specification

Dokumen ini mendefinisikan API Endpoint untuk aplikasi mobile Flutter.

---

## 1. Base URL
- Development: `http://localhost:5000`
- Production: `http://panel-care.allvvnt.my.id/api`

---

## 2. Authentication
Seluruh endpoint API kecuali `/health` mewajibkan otorisasi menggunakan JWT (Bearer Token) pada headers:
```http
Authorization: Bearer <Firebase_ID_Token>
```

---

## 3. API Endpoints

### A. Health Check
* **Endpoint**: `/health`
* **Method**: `GET`
* **Auth**: None
* **Success Response (200)**:
```json
{
  "status": "ok",
  "service": "solar-backend",
  "time": "2026-07-10T20:30:00Z"
}
```

### B. Get Latest Telemetry
Mengambil status telemetry terupdate dari suatu device.
* **Endpoint**: `/api/telemetry/latest`
* **Method**: `GET`
* **Query Params**:
  - `deviceId` (string, required): ID perangkat panel surya.
* **Success Response (200)**:
```json
{
  "success": true,
  "message": "Latest telemetry retrieved successfully",
  "data": {
    "deviceId": "panel001",
    "temperature": 38.2,
    "dust": 120,
    "voltage": 19.1,
    "current": 2.1,
    "power": 40.11,
    "pumpStatus": false,
    "wiperStatus": false,
    "mode": "AUTO",
    "timestamp": "2026-07-10T20:30:00Z"
  }
}
```

### C. Get Telemetry History
Mengambil riwayat telemetry untuk grafik di Flutter.
* **Endpoint**: `/api/telemetry/history`
* **Method**: `GET`
* **Query Params**:
  - `deviceId` (string, required)
  - `limit` (number, optional, default: 50)
  - `startDate` (string, ISO Date, optional)
  - `endDate` (string, ISO Date, optional)
* **Success Response (200)**:
```json
{
  "success": true,
  "message": "Telemetry history retrieved successfully",
  "data": [
    {
      "temperature": 38.2,
      "voltage": 19.1,
      "current": 2.1,
      "power": 40.11,
      "timestamp": "2026-07-10T20:30:00Z"
    }
  ]
}
```

### D. Get Device List
Mengambil daftar seluruh device yang terdaftar.
* **Endpoint**: `/api/devices`
* **Method**: `GET`
* **Success Response (200)**:
```json
{
  "success": true,
  "message": "Device list retrieved successfully",
  "data": [
    {
      "deviceId": "panel001",
      "name": "Panel Surya Lab",
      "status": "ONLINE",
      "lastSeen": "2026-07-10T20:30:00Z"
    }
  ]
}
```

### E. Send Device Control Command
Mengontrol perangkat secara manual.
* **Endpoint**: `/api/control`
* **Method**: `POST`
* **Request Body**:
```json
{
  "deviceId": "panel001",
  "command": "PUMP_ON"
}
```
* **Success Response (200)**:
```json
{
  "success": true,
  "message": "Command PUMP_ON dispatched successfully",
  "data": {
    "commandId": "cmd-82a17cb2",
    "status": "SENT"
  }
}
```

---

## 4. Error Responses

Semua kegagalan sistem mengikuti format standarisasi berikut:

### Client Error (Contoh: Request Invalid) - HTTP 400
```json
{
  "success": false,
  "message": "Invalid payload format: command must be one of [PUMP_ON, PUMP_OFF, WIPER_ON, WIPER_OFF, AUTO_MODE, MANUAL_MODE]",
  "error": {
    "code": "VALIDATION_ERROR"
  }
}
```

### Unauthorized Request (Token Expired) - HTTP 401
```json
{
  "success": false,
  "message": "Firebase ID Token has expired or invalid credential",
  "error": {
    "code": "UNAUTHORIZED"
  }
}
```
