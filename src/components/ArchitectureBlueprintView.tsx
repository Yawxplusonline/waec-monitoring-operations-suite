import React from 'react';
import {
  Database,
  Shield,
  Cpu,
  Radio,
  DollarSign,
  CheckCircle2,
  FolderGit2,
  Lock,
} from 'lucide-react';
import { SentinelDatabaseSchema } from '../types/sentinel';
import { sentinelSync } from '../services/realtimeSync';

interface ArchitectureBlueprintViewProps {
  dbState: SentinelDatabaseSchema;
}

export const ArchitectureBlueprintView: React.FC<ArchitectureBlueprintViewProps> = ({
  dbState,
}) => {
  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-amber-400 font-bold">
              PHASE 0 FOUNDATION • $0 OPERATIONAL COST ARCHITECTURE
            </span>
            <h1 className="text-2xl font-extrabold text-white mt-1">
              WAEC Sentinel System Blueprint & Live RTDB Inspector
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Full monorepo uniting the React + Leaflet Command Dashboard, Interactive Field Handset Simulator, Native Flutter Background Engine (`mobile_flutter/`), and Firebase Spark RTDB Schema (`firebase/`).
            </p>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-xs">
            <div className="font-bold flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" /> Monthly Infra Cost: $0.00 / mo
            </div>
            <div className="text-[11px] text-emerald-400/80">
              Mode: {sentinelSync.getConnectionMode()}
            </div>
          </div>
        </div>

        {/* 4 Pillar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">Module A: Zero-SMS Auth</h3>
            <p className="text-slate-400">
              Phone + 4-digit PIN Whitelist combined with <code className="text-amber-300">safe_device</code> root, jailbreak, and mock-GPS detection.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Cpu className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">Module B: Adaptive GPS</h3>
            <p className="text-slate-400">
              Streams every <strong>1s</strong> when moving (&gt;5 km/h) and throttles to <strong>30s</strong> when stationary (&lt;6% battery/hr).
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <Radio className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">Module C: Dual Panic SOS</h3>
            <p className="text-slate-400">
              2-second visual hold OR 3x Volume-Down hardware trigger (&lt;1.5s) + Web Audio Siren + Telegram Bot + 15s mic clip.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">Module D & E: Geofence & Forensics</h3>
            <p className="text-slate-400">
              100m exam center auto check-in, 200m OSRM escort deviation alerts, pixel-watermarked photos, and Hive offline queue.
            </p>
          </div>
        </div>

        {/* Live Firebase RTDB JSON State Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-amber-400" /> Monorepo Structure (Phase 0 Deliverables)
            </h3>
            <ul className="space-y-2 font-mono text-[11px] text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>firebase/database.rules.json (Officer write isolation)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>firebase/storage.rules (5GB Spark quota protection)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>firebase/seed-data.json (Ghana WAEC Centers & Officers)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>web/src/components/CommandDashboard.tsx (Leaflet + OSM)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>web/src/components/MobileOfficerSimulator.tsx (Handset)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>mobile_flutter/lib/services/background_gps_service.dart</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>mobile_flutter/lib/services/sos_hardware_listener.dart</span>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-7 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-400" /> Live RTDB State Tree Inspector
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">
                Real-Time WebSocket Mirror
              </span>
            </div>
            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-sky-300 overflow-x-auto max-h-80">
              {JSON.stringify(
                {
                  officers: dbState.officers,
                  live_locations: dbState.live_locations,
                  alerts: dbState.alerts,
                  centers: dbState.centers,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
