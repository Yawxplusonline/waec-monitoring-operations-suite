# WAEC Sentinel — Real-Time Field Monitoring & Emergency Response System

**WAEC Sentinel** is a **$0/month operational cost**, low-latency mobile and web platform built to monitor West African Examinations Council (WAEC) field officers and question paper escort teams in real time.

---

## Monorepo Architecture (`Phase 0 Foundation`)

```text
WAEC Monitoring & Operations Suite/
├── firebase/
│   ├── database.rules.json      # Firebase RTDB Security Rules (Officer self-write isolation & schema checks)
│   ├── storage.rules            # Firebase Storage Rules (5GB Spark free tier size guardrails)
│   └── seed-data.json           # Pre-seeded Ghana WAEC Exam Centers, Escort Routes & Officers
├── web/                         # Unified Web Command Dashboard + Field Officer Mobile Simulator (React + Vite + Leaflet)
│   ├── src/
│   │   ├── components/
│   │   │   ├── CommandDashboard.tsx        # Head of Monitoring Leaflet + OSM Command Board & Siren
│   │   │   ├── MobileOfficerSimulator.tsx  # Interactive Android/iOS Field Handset & Telemetry Test Bench
│   │   │   └── ArchitectureBlueprintView.tsx
│   │   ├── services/
│   │   │   ├── realtimeSync.ts             # Dual-Mode Engine (Local BroadcastChannel + Firebase RTDB)
│   │   │   ├── geofenceEngine.ts           # Client-side 100m Exam Center Geofencing & 200m Escort Deviation Math
│   │   │   ├── sirenAndTelegram.ts         # Web Audio API Siren Synthesizer + Telegram Bot SOS Dispatcher
│   │   │   ├── watermarkEngine.ts          # HTML5 Canvas Forensic Watermark Burn-In Engine
│   │   │   └── seedData.ts
│   │   └── types/sentinel.ts
└── mobile_flutter/              # Native Flutter Mobile App Source (Android / iOS)
    ├── pubspec.yaml
    └── lib/
        ├── main.dart
        └── services/
            ├── anti_spoof_service.dart      # Module A: safe_device Root & Mock GPS blocker
            ├── background_gps_service.dart  # Module B: 1s moving / 30s stationary adaptive stream + Hive offline queue
            ├── sos_hardware_listener.dart   # Module C: 3x Volume-Down (<1.5s) Silent SOS + 15s ambient audio
            └── watermark_capture.dart       # Module E: Native Canvas pixel watermark burn-in
```

---

## Quick Start (Runs Out-of-the-Box at $0 Cost)

```bash
cd web
npm install
npm run dev
```

Open **`http://localhost:5173`** in your browser:
1. **Command Dashboard Mode**: View live WAEC officers across Accra exam centers (Achimota SHS, Presec Legon, Accra Academy, Labone SHS, Ridge HQ Vault) with 100m circular geofences and OSRM escort routes.
2. **Field Officer App Mode**: Test Phone + 4-digit PIN Whitelist login (`+233200000001` / PIN `1234`), hold the red panic button for 2 seconds, tap Volume-Down 3 times in `<1.5s` for a Silent SOS, or capture pixel-watermarked malpractice evidence.
3. **Split Command + Handset Mode**: Open both side-by-side (or across two browser tabs) to watch sub-15ms real-time synchronization.
