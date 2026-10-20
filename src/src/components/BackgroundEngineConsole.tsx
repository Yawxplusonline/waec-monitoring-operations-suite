import React, { useEffect, useState } from 'react';
import {
  Cpu,
  BatteryCharging,
  Activity,
  Database,
  Wifi,
  WifiOff,
  ShieldAlert,
  ShieldCheck,
  Zap,
  RefreshCw,
  Clock,
  HardDrive,
  Radio,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { SentinelDatabaseSchema } from '../types/sentinel';
import { sentinelSync, HEARTBEAT_TIMEOUT_MS } from '../services/realtimeSync';

interface BackgroundEngineConsoleProps {
  dbState: SentinelDatabaseSchema;
  onSelectOfficerHandset: (officerId: string) => void;
}

export const BackgroundEngineConsole: React.FC<BackgroundEngineConsoleProps> = ({
  dbState,
  onSelectOfficerHandset,
}) => {
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('officer_001');
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [lastFlushedCount, setLastFlushedCount] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const officers = Object.values(dbState.officers);
  const selectedOfficer = dbState.officers[selectedOfficerId] || officers[0];
  const selectedLoc = dbState.live_locations[selectedOfficer.id];
  const offlineQueue = sentinelSync.getOfflineQueue();
  const isOffline = sentinelSync.isNetworkOffline();

  const totalPacketsSent = officers.reduce(
    (acc, o) => acc + (o.engine_metrics?.packets_transmitted || 0),
    0
  );
  const totalPacketsSaved = officers.reduce(
    (acc, o) => acc + (o.engine_metrics?.packets_throttled_saved || 0),
    0
  );
  const totalBandwidthSavedKb = officers
    .reduce((acc, o) => acc + (o.engine_metrics?.bandwidth_kb_saved || 0), 0)
    .toFixed(1);

  const avgBatteryDrain = (
    officers
      .filter((o) => o.on_shift && o.status !== 'OFFLINE')
      .reduce((acc, o) => acc + (o.engine_metrics?.estimated_battery_pct_per_hr || 3.5), 0) /
    Math.max(1, officers.filter((o) => o.on_shift && o.status !== 'OFFLINE').length)
  ).toFixed(1);

  const handleSimulateOfflineBurst = () => {
    if (!isOffline) {
      sentinelSync.setNetworkOfflineSimulation(true);
    }
    sentinelSync.enqueueSimulatedHiveBurst(selectedOfficer.id, 5);
  };

  const handleReconnectAndFlush = () => {
    const count = offlineQueue.length;
    sentinelSync.setNetworkOfflineSimulation(false);
    const flushed = sentinelSync.flushOfflineQueue();
    setLastFlushedCount(flushed || count);
    setTimeout(() => setLastFlushedCount(null), 5000);
  };

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* PHASE 2 HEADER BANNER */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-[11px] font-bold">
                PHASE 2: MOBILE BACKGROUND ENGINE
              </span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                BATTERY DRAIN: {avgBatteryDrain}% / HR (TARGET &lt; 6%/HR)
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white mt-1.5">
              Background GPS Isolate, Adaptive Throttler, 45s State Heartbeat &amp; Hive Offline Engine
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Real-time telemetry inspector for <code className="text-amber-300">flutter_background_service</code>, 1s/30s motion bandwidth throttling, 45-second <code className="text-sky-300">/officers/&#123;id&#125;/status</code> offline watchdog, and Hive NoSQL local packet buffering.
            </p>
          </div>

          {/* Global Bandwidth & Battery Efficiency KPIs */}
          <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">PACKETS SENT / SAVED</span>
              <strong className="text-emerald-400 text-sm">
                {totalPacketsSent} / <span className="text-amber-400">{totalPacketsSaved}</span>
              </strong>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">SPARK BANDWIDTH SAVED</span>
              <strong className="text-sky-400 text-sm">{totalBandwidthSavedKb} KB</strong>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">HIVE OFFLINE BUFFER</span>
              <strong className="text-amber-400 text-sm">{offlineQueue.length} PKTS</strong>
            </div>
          </div>
        </div>

        {/* TOP GRID: OFFICER BACKGROUND ISOLATES & 45-SECOND HEARTBEAT WATCHDOG */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 7 COLS: PER-OFFICER BACKGROUND ISOLATE & 45s HEARTBEAT MONITOR */}
          <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" /> Active <code className="text-sky-300">flutter_background_service</code> Isolates &amp; 45s Heartbeat Watchdog
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Timeout Threshold: 45.0s
              </span>
            </div>

            <div className="space-y-3">
              {officers.map((officer) => {
                const loc = dbState.live_locations[officer.id];
                const metrics = officer.engine_metrics || {
                  isolate_running: officer.on_shift,
                  screen_off_wakelock: officer.on_shift,
                  adaptive_interval_ms: loc && loc.speed > 5 ? 1000 : 30000,
                  packets_transmitted: 40,
                  packets_throttled_saved: 110,
                  bandwidth_kb_saved: 25.3,
                  estimated_battery_pct_per_hr: 3.9,
                  heartbeat_paused: false,
                };

                const heartbeatAgeMs = Math.max(
                  0,
                  nowTick - (officer.last_heartbeat || nowTick - 2000)
                );
                const heartbeatAgeSec = Math.min(99, Math.round(heartbeatAgeMs / 1000));
                const remainingBeforeOfflineSec = Math.max(
                  0,
                  Math.ceil((HEARTBEAT_TIMEOUT_MS - heartbeatAgeMs) / 1000)
                );
                const heartbeatPct = Math.min(
                  100,
                  Math.round((remainingBeforeOfflineSec / 45) * 100)
                );

                const isMoving = (loc?.speed || 0) > 5.0;

                return (
                  <div
                    key={officer.id}
                    onClick={() => setSelectedOfficerId(officer.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer text-xs ${
                      selectedOfficer.id === officer.id
                        ? 'bg-slate-950 border-amber-500/80'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            officer.status === 'OFFLINE'
                              ? 'bg-slate-500'
                              : officer.status === 'SOS'
                              ? 'bg-red-500 animate-ping'
                              : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-white">
                              {officer.name}
                            </span>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                              {officer.device_integrity.device_model}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Isolate: {metrics.isolate_running ? 'FOREGROUND_ACTIVE' : 'STOPPED'} • WakeLock:{' '}
                            {metrics.screen_off_wakelock ? 'ACQUIRED (Screen-Off Safe)' : 'RELEASED'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            isMoving
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          }`}
                        >
                          {isMoving ? '1.0s MOTION STREAM' : '30.0s IDLE THROTTLE'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            officer.status === 'OFFLINE'
                              ? 'bg-red-950 text-red-300 border border-red-700/50'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                          }`}
                        >
                          {officer.status}
                        </span>
                      </div>
                    </div>

                    {/* 45-Second State Heartbeat Countdown Bar */}
                    <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-sky-400" />
                          State Heartbeat (<code className="text-sky-300">/officers/{officer.id}/status</code>):
                        </span>
                        {officer.status === 'OFFLINE' ? (
                          <span className="text-red-400 font-bold">
                            OFFLINE (Heartbeat Lost &gt; 45s)
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-bold">
                            Last pulse {heartbeatAgeSec}s ago • Auto-OFFLINE in {remainingBeforeOfflineSec}s
                          </span>
                        )}
                      </div>

                      <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-500 ${
                            officer.status === 'OFFLINE' || remainingBeforeOfflineSec < 12
                              ? 'bg-red-500'
                              : remainingBeforeOfflineSec < 25
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${officer.status === 'OFFLINE' ? 0 : heartbeatPct}%`,
                          }}
                        />
                      </div>

                      {/* Telemetry & Action Row */}
                      <div className="pt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                        <div className="flex items-center gap-3 text-slate-300">
                          <span>
                            Speed: <strong className="text-white">{loc?.speed.toFixed(1)} km/h</strong>
                          </span>
                          <span>
                            Drain:{' '}
                            <strong className="text-emerald-400">
                              {metrics.estimated_battery_pct_per_hr}%/hr
                            </strong>
                          </span>
                          <span>
                            Saved: <strong className="text-amber-400">{metrics.packets_throttled_saved} pkts</strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              sentinelSync.sendOfficerHeartbeat(officer.id);
                            }}
                            className="px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold"
                          >
                            Pulse Heartbeat
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              sentinelSync.simulateHeartbeatTimeout45s(officer.id);
                            }}
                            className="px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-[10px] font-bold"
                            title="Fast-forward 45 seconds without heartbeat to trigger automatic OFFLINE state"
                          >
                            Simulate 45s Drop
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT 5 COLS: ADAPTIVE THROTTLER LAB & ANTI-SPOOFING SENSOR HEURISTICS */}
          <div className="lg:col-span-5 space-y-5">
            {/* Adaptive Throttler Interactive Tuner */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" /> Adaptive Bandwidth Throttler Lab ({selectedOfficer.name})
                </h3>
                <button
                  onClick={() => onSelectOfficerHandset(selectedOfficer.id)}
                  className="text-[11px] text-amber-400 underline font-semibold"
                >
                  Open Handset
                </button>
              </div>

              <p className="text-slate-400 text-[11px]">
                Drag the officer&apos;s ground speed across the <strong>5.0 km/h threshold</strong> to watch the background engine switch between <strong>1-second active streaming</strong> and <strong>30-second stationary conservation</strong>.
              </p>

              {selectedLoc && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">
                      Simulated GPS Ground Speed:
                    </span>
                    <span className="font-mono font-extrabold text-base text-amber-400">
                      {selectedLoc.speed.toFixed(1)} km/h
                    </span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={85}
                    step={0.5}
                    value={selectedLoc.speed}
                    onChange={(e) =>
                      sentinelSync.updateOfficerLocation(selectedOfficer.id, {
                        speed: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-amber-500"
                  />

                  <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px] pt-1">
                    <div
                      className={`p-2.5 rounded-lg border ${
                        selectedLoc.speed <= 5
                          ? 'bg-sky-950/60 border-sky-500 text-sky-200'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="font-bold">STATIONARY (&le; 5 km/h)</div>
                      <div className="text-[10px] mt-0.5">Sync Interval: Every 30s</div>
                      <div className="text-[10px]">Battery: ~1.9% / hr</div>
                    </div>

                    <div
                      className={`p-2.5 rounded-lg border ${
                        selectedLoc.speed > 5
                          ? 'bg-amber-950/60 border-amber-500 text-amber-200'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="font-bold">MOVING (&gt; 5 km/h)</div>
                      <div className="text-[10px] mt-0.5">Sync Interval: Every 1.0s</div>
                      <div className="text-[10px]">Battery: ~4.2% / hr</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mock GPS & Velocity Jump Anti-Spoofing Detector */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" /> Phase 2 Mock-GPS &amp; Velocity Jump Heuristics
                </h3>
                <span className="text-[10px] font-mono text-emerald-400">
                  safe_device + Kinematic Check
                </span>
              </div>

              <p className="text-slate-400 text-[11px]">
                Detects both Android/iOS <code className="text-amber-300">Position.isMocked</code> flags and impossible kinematic coordinate teleports (&gt;250 km/h instantaneous jump).
              </p>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Hardware Mock Location Flag:</span>
                  <span
                    className={
                      selectedOfficer.device_integrity.is_mock_location
                        ? 'text-red-400 font-bold'
                        : 'text-emerald-400 font-bold'
                    }
                  >
                    {selectedOfficer.device_integrity.is_mock_location
                      ? 'TRUE (SPOOF FLAGGED)'
                      : 'FALSE (AUTHENTIC GPS)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kinematic Velocity Anomaly:</span>
                  <span
                    className={
                      selectedOfficer.device_integrity.velocity_anomaly_kmh
                        ? 'text-red-400 font-bold'
                        : 'text-emerald-400 font-bold'
                    }
                  >
                    {selectedOfficer.device_integrity.velocity_anomaly_kmh
                      ? `${selectedOfficer.device_integrity.velocity_anomaly_kmh} km/h JUMP DETECTED`
                      : 'NONE (< 120 km/h)'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    sentinelSync.updateOfficerLocation(selectedOfficer.id, {
                      lat: (selectedLoc?.lat || 5.6212) + 0.085,
                      lng: (selectedLoc?.lng || -0.2223) - 0.065,
                      is_mock: true,
                    })
                  }
                  className="flex-1 py-2 px-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-200 font-bold text-xs transition"
                >
                  Inject Mock GPS Coordinate Teleport
                </button>
                {selectedOfficer.device_integrity.is_mock_location && (
                  <button
                    onClick={() =>
                      sentinelSync.adminResetOfficerPin(
                        selectedOfficer.id,
                        selectedOfficer.pin_demo
                      )
                    }
                    className="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    Clear Flag
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: HIVE NoSQL OFFLINE LOCAL BUFFERING INSPECTOR */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-amber-400" /> Hive NoSQL Local Offline Buffer Inspector (<code className="text-amber-300">waec_offline_telemetry_buffer</code>)
              </h3>
              <p className="text-slate-400 text-[11px] mt-0.5">
                During cellular blackouts in rural examination centers, telemetry packets, SOS triggers, and watermarked photos are cached in local Hive boxes and flushed FIFO as soon as WebSocket connectivity returns.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSimulateOfflineBurst}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold transition"
              >
                <WifiOff className="w-3.5 h-3.5" /> Simulate Network Drop + Queue 5 Hive Packets
              </button>

              <button
                onClick={handleReconnectAndFlush}
                disabled={!isOffline && offlineQueue.length === 0}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-extrabold transition ${
                  isOffline || offlineQueue.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" /> Restore Signal &amp; Auto-Sync Hive Queue ({offlineQueue.length})
              </button>
            </div>
          </div>

          {lastFlushedCount !== null && (
            <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-500 text-emerald-200 font-mono text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                HIVE FIFO SYNC COMPLETE: Sequentially transmitted {lastFlushedCount} buffered offline packets to Firebase RTDB!
              </span>
            </div>
          )}

          {offlineQueue.length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center text-slate-400">
              Hive box <code className="text-amber-300">waec_telemetry_box</code> is currently empty (All packets synchronized in real time). Click <strong>&quot;Simulate Network Drop + Queue 5 Hive Packets&quot;</strong> above to inspect local offline buffering.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto">
              {offlineQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 font-mono text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      #{idx + 1} • {item.box}
                    </span>
                    <span className="text-slate-500 text-[10px]">{item.size_bytes} bytes</span>
                  </div>
                  <div className="text-slate-200 font-bold">
                    {item.type} ({item.officer_id})
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {JSON.stringify(item.payload)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
