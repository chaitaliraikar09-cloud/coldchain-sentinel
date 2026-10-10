# 🌡️ ColdChain Sentinel

**Real-Time Vaccine Cold-Chain Monitoring Platform**

A complete end-to-end hackathon prototype for monitoring vaccine logistics in real time. ESP32 sensor nodes send temperature readings via HTTP POST to a Node.js/Express backend, which detects excursions, computes demo risk scores, manages alerts, and streams live updates to a React dashboard via Socket.IO.

---

## ✨ Features

- **Real-Time Dashboard** — Live temperature charts, KPI cards, and alert panels via Socket.IO
- **5-Scenario Simulator** — Normal, high-temp excursion, low-temp, gradual drift, low battery
- **Excursion Detection** — Alerts with deduplication, severity escalation, and recovery
- **Demo Risk Score** — Transparent 0-100 scoring with contributing factors (not medically validated)
- **Checkpoint Recommendations** — Haversine nearest-checkpoint calculation
- **ESP32 Integration** — POST sensor readings to the same validated API pipeline
- **Interactive Map** — Leaflet + OpenStreetMap shipment and checkpoint positions
- **CSV Export** — Download raw sensor data
- **Alert Management** — Acknowledge and resolve alerts from the dashboard

---

## 🏗️ Architecture

```
ESP32 (DHT22 Sensor)
    │
    │ HTTP POST /api/readings (x-device-key header)
    ▼
Node.js + Express API
    │
    ├── Validate reading fields and ranges
    ├── Detect temperature excursions
    ├── Calculate risk score (demo)
    ├── Find nearest checkpoint (Haversine)
    ├── Persist to JSON files (atomic writes)
    └── Broadcast Socket.IO events
         │
         ▼
    React Dashboard
         │
         ├── Update KPIs, charts, maps, alerts
         └── Live monitoring interface
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS v3 |
| Routing | React Router v6 |
| Charts | Recharts |
| Maps | Leaflet + OpenStreetMap via react-leaflet |
| Icons | Lucide React |
| Real-time | Socket.IO Client |
| Backend | Node.js + Express.js |
| WebSocket | Socket.IO Server |
| Storage | JSON files (atomic writes) |
| Validation | express-validator |
| Hardware | ESP32 + DHT22 (ArduinoJson + HTTPClient) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js v18+** — [Download](https://nodejs.org/)
- **npm v9+** (bundled with Node.js)
- **Git** (optional)

### 1. Install Dependencies

```bash
# From the coldchain-sentinel/ root directory
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

Or use the shortcut (requires `concurrently` installed first):
```bash
npm install && npm run install:all
```

### 2. Set Up Environment Files

Server environment (already created with defaults):
```bash
# server/.env is already configured for development
# Edit if needed:
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
DEVICE_API_KEY=change-this-development-key
SIMULATOR_INTERVAL_MS=2000
```

Client environment (already created):
```bash
# client/.env is already configured
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### 3. Start the Application

**Option A: Start both together** (from root directory)
```bash
npm run dev
```

**Option B: Start separately**
```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend  
cd client && npm run dev
```

### 4. Access the Dashboard

1. Open [http://localhost:5173](http://localhost:5173)
2. Login with demo credentials:
   - **Email:** `admin@coldchain.demo`
   - **Password:** `Admin@123`

The simulator starts automatically and generates live readings every 2 seconds.

---

## 🔌 API Endpoints

### Health
```
GET  /api/health          — Server status, uptime, connected clients
GET  /api/status          — ESP32/simulator data source status
```

### Sensor Readings
```
POST /api/readings        — Accept reading from ESP32 (requires x-device-key header)
GET  /api/readings        — Paginated history (?shipmentId, ?deviceId, ?from, ?to, ?limit, ?page)
GET  /api/readings/latest — Latest reading per shipment (or ?shipmentId=SHP-1001)
GET  /api/readings/:id    — Single reading
```

### Shipments
```
GET   /api/shipments         — All shipments with current status
GET   /api/shipments/:id     — Shipment details
GET   /api/shipments/:id/history — Sensor history for charts
POST  /api/shipments         — Create shipment
PATCH /api/shipments/:id     — Update shipment
```

### Alerts
```
GET   /api/alerts                    — Alerts (?shipmentId, ?severity, ?status, ?type)
GET   /api/alerts/summary            — Counts by status/severity
PATCH /api/alerts/:id/acknowledge    — Acknowledge alert
PATCH /api/alerts/:id/resolve        — Resolve alert
```

### Checkpoints
```
GET  /api/checkpoints                — All checkpoints
GET  /api/checkpoints/nearest?shipmentId=SHP-1001 — Nearest available checkpoint
POST /api/checkpoints                — Create checkpoint
PATCH /api/checkpoints/:id           — Update checkpoint
```

### Analytics
```
GET /api/analytics/overview          — Dashboard KPIs
GET /api/analytics/temperature?shipmentId=SHP-1001&range=1h — Historical data
GET /api/analytics/excursions        — Excursion stats by shipment
GET /api/analytics/risk              — Demo risk scores
```

### Simulator
```
POST /api/simulator/start            — Start simulator
POST /api/simulator/stop             — Stop simulator
POST /api/simulator/reset            — Reset simulator state
POST /api/simulator/inject-excursion — Inject demo excursion event
GET  /api/simulator/status           — Simulator state
```

---

## 🧪 Testing the API with curl

```bash
# Health check
curl http://localhost:5000/api/health

# Get all shipments
curl http://localhost:5000/api/shipments

# Post a test reading (ESP32 endpoint)
curl -X POST http://localhost:5000/api/readings \
  -H "Content-Type: application/json" \
  -H "x-device-key: change-this-development-key" \
  -d '{"deviceId":"ESP32-001","shipmentId":"SHP-1001","sensorId":"TEMP-001","temperature":5.4,"humidity":58.2,"battery":87}'

# Start/stop simulator
curl -X POST http://localhost:5000/api/simulator/start
curl -X POST http://localhost:5000/api/simulator/stop

# Inject a high-temperature excursion
curl -X POST http://localhost:5000/api/simulator/inject-excursion \
  -H "Content-Type: application/json" \
  -d '{"shipmentId":"SHP-1001","type":"high_temp"}'

# Get alerts
curl http://localhost:5000/api/alerts?status=ACTIVE
```

---

## 📡 Real-Time Socket.IO Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `reading:new` | Server → Client | New accepted sensor reading |
| `shipment:updated` | Server → Client | Shipment monitoring state changed |
| `alert:new` | Server → Client | New alert created |
| `alert:updated` | Server → Client | Alert acknowledged/resolved |
| `excursion:started` | Server → Client | Temperature excursion detected |
| `excursion:updated` | Server → Client | Ongoing excursion update |
| `excursion:recovered` | Server → Client | Temperature back in range |
| `checkpoint:recommendation` | Server → Client | Updated nearest checkpoint |
| `simulator:status` | Server → Client | Simulator started/stopped |
| `system:status` | Server → Client | Overall system status |
| `join:shipment` | Client → Server | Subscribe to shipment room |
| `request:state` | Client → Server | Request full state snapshot |

---

## 🔌 ESP32 Integration

### Required Libraries
Install via Arduino Library Manager:
- **ArduinoJson** by Benoit Blanchon
- **DHT sensor library** by Adafruit
- **Adafruit Unified Sensor** by Adafruit

### Configuration in `esp32/esp32.ino`

```cpp
const char* WIFI_SSID       = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD   = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL    = "http://192.168.X.X:5000"; // YOUR LAN IP - NOT localhost
const char* DEVICE_API_KEY  = "change-this-development-key";
const char* DEVICE_ID       = "ESP32-001";
const char* SHIPMENT_ID     = "SHP-1001";
```

### Finding Your LAN IP

```bash
# Windows
ipconfig | findstr "IPv4"

# macOS/Linux
ifconfig | grep "inet "
```

### Firewall (Windows)

If ESP32 cannot reach the server, allow inbound TCP port 5000:
1. Open **Windows Defender Firewall**
2. **Advanced Settings** → **Inbound Rules** → **New Rule**
3. **Port** → **TCP** → **5000** → **Allow** → Name it `ColdChain`

---

## 🗃️ Project Structure

```
coldchain-sentinel/
├── server/
│   ├── src/
│   │   ├── config/index.js          — Environment config
│   │   ├── routes/                  — Express route handlers
│   │   ├── services/
│   │   │   ├── excursionService.js  — Alert detection & deduplication
│   │   │   ├── riskService.js       — Demo risk score computation
│   │   │   ├── readingPipeline.js   — Shared ESP32/simulator pipeline
│   │   │   └── simulatorService.js  — Backend data generator
│   │   ├── sockets/socketHandler.js — Socket.IO event setup
│   │   ├── utils/
│   │   │   ├── store.js             — Atomic JSON file store
│   │   │   ├── geo.js               — Haversine distance
│   │   │   └── socketEmitter.js     — Socket.IO singleton
│   │   ├── middleware/              — Auth, error handling
│   │   ├── app.js                   — Express app
│   │   └── server.js               — HTTP + Socket.IO server
│   ├── data/                        — JSON data files
│   └── .env                         — Environment variables
├── client/
│   └── src/
│       ├── context/
│       │   ├── AppContext.jsx        — Socket.IO + global state
│       │   └── AuthContext.jsx       — Demo auth
│       ├── pages/                   — Route page components
│       ├── components/              — Layout components
│       └── services/                — API + socket clients
├── esp32/esp32.ino                  — Arduino sketch
├── tests/backend.test.js            — Backend unit tests
└── package.json                     — Root with dev script
```

---

## 🧪 Running Tests

```bash
cd server
npm test
```

Tests cover:
- API reading validation (valid, invalid, missing fields)
- Temperature excursion detection (high, low, recovery, no duplicates)
- Alert deduplication
- Risk score computation
- Haversine distance calculation
- Nearest checkpoint finding

---

## ⚠️ Important Disclaimers

1. **Demo Risk Score**: The viability risk score is a **hackathon demonstration** metric. It is NOT a medically validated measure of vaccine potency or remaining shelf life. Actual viability assessment requires validated vaccine-specific stability data and expert/regulatory review.

2. **GPS Coordinates**: All GPS positions shown in the simulator are **simulated** and not actual device GPS readings.

3. **Device Authentication**: The `x-device-key` header is a **development-only** credential. It does not provide production-grade security. Replace with proper authentication (mTLS, signed JWTs, etc.) before any real deployment.

4. **JSON Storage**: The JSON file storage is appropriate for hackathon prototyping. Migrate to MongoDB (or another database) before production use.

5. **Straight-Line Distances**: Checkpoint distances are calculated using the **Haversine formula** (straight-line/as-the-crow-flies). They are NOT road distances and should not be used for routing.

---

## 🔄 Migrating to MongoDB

The `store.js` module is designed as a drop-in replaceable layer. To migrate:

1. Replace `readJSON/writeJSON` calls in `store.js` with mongoose/MongoDB queries
2. No frontend or route changes required
3. Schema matches the existing JSON structure

---

## 📝 License

MIT — Hackathon Prototype · 2026
