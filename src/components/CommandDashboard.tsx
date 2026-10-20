import React, { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  ShieldAlert,
  Radio,
  Battery,
  Navigation,
  MapPin,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  FileWarning,
  RefreshCw,
  Send,
  Smartphone,
  Activity,
  Layers,
  Route,
  Headphones,
  Clock,
  BellRing,
} from 'lucide-react';
import {
  SentinelDatabaseSchema,
  OfficerProfile,
  SentinelAlert,
} from '../types/sentinel';
import { sentinelSync } from '../services/realtimeSync';
import { sirenEngine } from '../services/sirenAndTelegram';
import {
  checkCenterGeofence,
  calculateRouteDeviationMeters,
} from '../services/geofenceEngine';

interface CommandDashboardProps {
  dbState: SentinelDatabaseSchema;
  latencyMs: number;
  onOpenMobileSimulator: (officerId?: string) => void;
}

function MapFlyToController({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 15, { duration: 1.1 });
    }
  }, [target, map]);
  return null;
}

/**
 * Phase 3 Enhanced Officer Marker:
 * Includes rotating directional SVG heading cone (`heading` 0°–360°),
 * SOS ping ring, transit badge, and live velocity tag.
 */
function createOfficerIcon(
  officer: OfficerProfile,
  transitMode: boolean,
  speed: number,
  heading: number
) {
  const isSOS = officer.status === 'SOS';
  const isOnline = officer.status === 'ONLINE';

  const bgColor = isSOS
    ? '#ef4444'
    : !isOnline
    ? '#64748b'
    : transitMode
    ? '#f59e0b'
    : '#10b981';

  const pulseRing = isSOS
    ? `<span style="position:absolute;inset:-10px;border-radius:9999px;background:rgba(239,68,68,0.48);animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;"></span>`
    : '';

  const headingPointer =
    isOnline && speed > 1
      ? `<div style="position:absolute;inset:-7px;transform:rotate(${heading}deg);pointer-events:none;">
           <div style="width:0;height:0;margin:0 auto;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid ${bgColor};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.8));"></div>
         </div>`
      : '';

  const initials = officer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return L.divIcon({
    className: 'custom-officer-marker',
    html: `
      <div style="position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;transition:all 0.35s ease-out;">
        ${pulseRing}
        ${headingPointer}
        <div style="position:relative;z-index:10;width:34px;height:34px;border-radius:9999px;background:${bgColor};border:2.5px solid #0f172a;box-shadow:0 4px 12px rgba(0,0,0,0.7);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#090d16;font-weight:800;font-size:11px;font-family:monospace;">
          <span>${initials}</span>
        </div>
        ${
          speed > 5
            ? `<div style="position:absolute;bottom:-14px;background:#0f172a;color:#f8fafc;border:1px solid ${bgColor};border-radius:4px;padding:0px 4px;font-size:9px;font-family:monospace;white-space:nowrap;z-index:20;">${Math.round(
                speed
              )}km/h • ${Math.round(heading)}°</div>`
            : ''
        }
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function createCenterIcon(code: string, isDepot: boolean) {
  const border = isDepot ? '#a855f7' : '#38bdf8';
  return L.divIcon({
    className: 'custom-center-marker',
    html: `
      <div style="background:#0f172a;color:#f8fafc;border:2px solid ${border};border-radius:6px;padding:2px 6px;font-size:10px;font-weight:700;font-family:monospace;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.6);">
        ${isDepot ? '🏛️ ' : '🏫 '}${code}
      </div>
    `,
    iconSize: [84, 24],
    iconAnchor: [42, 12],
  });
}

export const CommandDashboard: React.FC<CommandDashboardProps> = ({
  dbState,
  latencyMs,
  onOpenMobileSimulator,
}) => {
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('officer_001');
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [sirenMuted, setSirenMuted] = useState<boolean>(false);
  const [sirenVolume, setSirenVolume] = useState<number>(sirenEngine.getMasterVolume());
  const [playingAmbientAlertId, setPlayingAmbientAlertId] = useState<string | null>(null);
  const [isSimulatingPatrol, setIsSimulatingPatrol] = useState<boolean>(false);
  const [activeSideTab, setActiveSideTab] = useState<
    'ROSTER' | 'ALERTS_SIREN' | 'ESCORT_ASSIGN' | 'GEOFENCE' | 'EVIDENCE'
  >('ROSTER');

  // Phase 3 Map Layer Toggles
  const [showCenterGeofences, setShowCenterGeofences] = useState<boolean>(true);
  const [showEscortRoutes, setShowEscortRoutes] = useState<boolean>(true);
  const [showBreadcrumbTrails, setShowBreadcrumbTrails] = useState<boolean>(true);
  const [darkTacticalTiles, setDarkTacticalTiles] = useState<boolean>(false);

  const allAlerts = Object.values(dbState.alerts).sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const activeAlerts = allAlerts.filter((a) => a.status === 'ACTIVE');

  const hasActiveEmergencySOS = activeAlerts.some(
    (a) => a.type === 'SILENT_SOS' || a.type === 'VISUAL_SOS'
  );
  const hasActiveEscortWarning = activeAlerts.some(
    (a) =>
      a.type === 'ROUTE_DEVIATION' ||
      a.type === 'UNSCHEDULED_STOP' ||
      a.type === 'HEARTBEAT_TIMEOUT'
  );

  // Phase 3 Multi-Mode Web Audio API Siren Controller
  useEffect(() => {
    if (sirenMuted) {
      sirenEngine.stopSiren();
      return;
    }
    if (hasActiveEmergencySOS) {
      sirenEngine.startSiren('EMERGENCY_SOS');
    } else if (hasActiveEscortWarning) {
      sirenEngine.startSiren('ESCORT_WARNING');
    } else {
      sirenEngine.stopSiren();
    }
    return () => {
      sirenEngine.stopSiren();
    };
  }, [hasActiveEmergencySOS, hasActiveEscortWarning, sirenMuted]);

  // Live Multi-Officer Patrol & Escort Simulation Loop
  useEffect(() => {
    if (!isSimulatingPatrol) return;
    let stepIndex = 0;
    const timer = window.setInterval(() => {
      stepIndex++;
      const state = sentinelSync.getState();
      for (const officer of Object.values(state.officers)) {
        if (!officer.on_shift || officer.status === 'OFFLINE') continue;
        const loc = state.live_locations[officer.id];
        if (!loc) continue;

        const route = state.routes[officer.assigned_route_id];
        if (loc.transit_mode && route && route.waypoints.length > 1) {
          const wpIdx = stepIndex % route.waypoints.length;
          const targetWp = route.waypoints[wpIdx];
          const dLat = (targetWp[0] - loc.lat) * 0.35 + (Math.random() - 0.5) * 0.0004;
          const dLng = (targetWp[1] - loc.lng) * 0.35 + (Math.random() - 0.5) * 0.0004;
          const computedHeading =
            ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;

          sentinelSync.updateOfficerLocation(officer.id, {
            lat: loc.lat + dLat,
            lng: loc.lng + dLng,
            speed: Math.round((26 + Math.random() * 16) * 10) / 10,
            heading: Math.round(computedHeading),
          });
        } else {
          sentinelSync.updateOfficerLocation(officer.id, {
            lat: loc.lat + (Math.random() - 0.5) * 0.00018,
            lng: loc.lng + (Math.random() - 0.5) * 0.00018,
            speed: Math.round((1.4 + Math.random() * 2.2) * 10) / 10,
            heading: (loc.heading + 22) % 360,
          });
        }
      }
    }, 1100);

    return () => clearInterval(timer);
  }, [isSimulatingPatrol]);

  const handleFocusOfficer = (officerId: string) => {
    setSelectedOfficerId(officerId);
    const loc = dbState.live_locations[officerId];
    if (loc) {
      setFlyTarget([loc.lat, loc.lng]);
    }
  };

  const handlePlay15sSosAudio = (alert: SentinelAlert) => {
    setPlayingAmbientAlertId(alert.id);
    sirenEngine.playSimulatedAmbientClip(3200);
    window.setTimeout(() => {
      setPlayingAmbientAlertId(null);
    }, 3200);
  };

  const officersList = Object.values(dbState.officers);
  const geofenceLogs = Object.values(dbState.geofence_logs).sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const incidentsList = Object.values(dbState.incidents).sort(
    (a, b) => b.timestamp - a.timestamp
  );

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* ACTIVE EMERGENCY SOS OR ESCORT WARNING BANNER OVERLAY */}
      {activeAlerts.length > 0 && (
        <div
          className={`px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 transition-all ${
            hasActiveEmergencySOS
              ? 'bg-red-950/95 border-red-500 animate-pulse'
              : 'bg-amber-950/95 border-amber-500'
          }`}
        >
          <div className="flex items-center gap-3">
            {hasActiveEmergencySOS ? (
              <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 animate-bounce" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 animate-bounce" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded text-white ${
                    hasActiveEmergencySOS ? 'bg-red-600' : 'bg-amber-600'
                  }`}
                >
                  {activeAlerts[0].type}
                </span>
                <span className="font-bold text-sm text-white">
                  {activeAlerts[0].officer_name} (
                  {activeAlerts[0].officer_phone || activeAlerts[0].officer_id})
                </span>
                <span className="text-xs text-slate-200 font-mono">
                  [{activeAlerts[0].lat.toFixed(4)}, {activeAlerts[0].lng.toFixed(4)}] • Battery:{' '}
                  {activeAlerts[0].battery}%
                </span>
              </div>
              <p className="text-xs text-slate-100 mt-0.5">{activeAlerts[0].message}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeAlerts[0].telegram_dispatched && (
              <span className="inline-flex items-center gap-1 text-xs bg-sky-950/90 border border-sky-500/50 text-sky-300 px-2.5 py-1 rounded font-mono">
                <Send className="w-3.5 h-3.5" /> Telegram Dispatched
              </span>
            )}
            {activeAlerts[0].audio_url && (
              <button
                onClick={() => handlePlay15sSosAudio(activeAlerts[0])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-500/60"
              >
                <Headphones className="w-3.5 h-3.5" />
                {playingAmbientAlertId === activeAlerts[0].id
                  ? 'Playing 15s Clip...'
                  : 'Listen 15s Audio'}
              </button>
            )}
            <button
              onClick={() => setSirenMuted((m) => !m)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700"
            >
              {sirenMuted ? (
                <VolumeX className="w-4 h-4 text-amber-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-red-400" />
              )}
              {sirenMuted ? 'Unmute Siren' : 'Mute Siren'}
            </button>
            <button
              onClick={() => setFlyTarget([activeAlerts[0].lat, activeAlerts[0].lng])}
              className="px-3 py-1.5 rounded text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950"
            >
              Locate on Map
            </button>
            <button
              onClick={() =>
                sentinelSync.updateAlertStatus(activeAlerts[0].id, 'ACKNOWLEDGED')
              }
              className="px-2.5 py-1.5 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600"
            >
              Acknowledge
            </button>
            <button
              onClick={() => sentinelSync.updateAlertStatus(activeAlerts[0].id, 'RESOLVED')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
            </button>
          </div>
        </div>
      )}

      {/* TOP TACTICAL KPI & LAYER CONTROL BAR */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono text-slate-300">
              WEBSOCKET LATENCY: <strong className="text-emerald-400">{latencyMs} ms</strong> (&lt;1.5s SLA)
            </span>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="font-mono text-slate-300">
            ONLINE:{' '}
            <strong className="text-white">
              {officersList.filter((o) => o.status !== 'OFFLINE').length} / {officersList.length}
            </strong>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="font-mono text-slate-300">
            TRANSIT ESCORTS:{' '}
            <strong className="text-amber-400">
              {Object.values(dbState.live_locations).filter((l) => l.transit_mode).length} ACTIVE
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsSimulatingPatrol((p) => !p)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-semibold transition ${
              isSimulatingPatrol
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isSimulatingPatrol ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" /> Stop Live Escort Stream
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-emerald-400" /> Stream Live Escorts
              </>
            )}
          </button>

          <button
            onClick={() => sentinelSync.simulateUnscheduledEscortStop(selectedOfficerId)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-semibold"
            title="Simulate >3-minute unscheduled escort stop outside an exam center"
          >
            <Clock className="w-3.5 h-3.5" /> Test &gt;3m Escort Stop
          </button>

          <button
            onClick={() => sentinelSync.resetToSeedData()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Reset Seed Data"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE: LEFT SIDEBAR + CENTER LEAFLET MAP */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* LEFT COMMAND PANEL */}
        <div className="lg:col-span-4 xl:col-span-3 bg-slate-900 border-r border-slate-800 flex flex-col min-h-0">
          {/* Sidebar Navigation Tabs */}
          <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950/60 text-[10px] font-bold">
            <button
              onClick={() => setActiveSideTab('ROSTER')}
              className={`py-2.5 border-b-2 transition ${
                activeSideTab === 'ROSTER'
                  ? 'border-amber-500 text-amber-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              UNITS ({officersList.length})
            </button>
            <button
              onClick={() => setActiveSideTab('ALERTS_SIREN')}
              className={`py-2.5 border-b-2 transition ${
                activeSideTab === 'ALERTS_SIREN'
                  ? 'border-amber-500 text-amber-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              SIREN ({allAlerts.length})
            </button>
            <button
              onClick={() => setActiveSideTab('ESCORT_ASSIGN')}
              className={`py-2.5 border-b-2 transition ${
                activeSideTab === 'ESCORT_ASSIGN'
                  ? 'border-amber-500 text-amber-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              ROUTES
            </button>
            <button
              onClick={() => setActiveSideTab('GEOFENCE')}
              className={`py-2.5 border-b-2 transition ${
                activeSideTab === 'GEOFENCE'
                  ? 'border-amber-500 text-amber-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              CHECK-IN
            </button>
            <button
              onClick={() => setActiveSideTab('EVIDENCE')}
              className={`py-2.5 border-b-2 transition ${
                activeSideTab === 'EVIDENCE'
                  ? 'border-amber-500 text-amber-400 bg-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              PHOTOS ({incidentsList.length})
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {activeSideTab === 'ROSTER' &&
              officersList.map((officer) => {
                const loc = dbState.live_locations[officer.id];
                const { insideCenter, nearestCenter, nearestDistance } = loc
                  ? checkCenterGeofence(loc.lat, loc.lng, dbState.centers)
                  : { insideCenter: null, nearestCenter: null, nearestDistance: 0 };

                const assignedRoute = dbState.routes[officer.assigned_route_id];
                const routeDeviation =
                  loc && loc.transit_mode && assignedRoute
                    ? calculateRouteDeviationMeters(loc.lat, loc.lng, assignedRoute)
                    : 0;

                const isSelected = selectedOfficerId === officer.id;

                return (
                  <div
                    key={officer.id}
                    onClick={() => handleFocusOfficer(officer.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      officer.status === 'SOS'
                        ? 'bg-red-950/40 border-red-500'
                        : isSelected
                        ? 'bg-slate-800/90 border-amber-500/80'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              officer.status === 'SOS'
                                ? 'bg-red-500 animate-ping'
                                : officer.status === 'ONLINE'
                                ? 'bg-emerald-400'
                                : 'bg-slate-500'
                            }`}
                          />
                          <h4 className="font-bold text-sm text-white">{officer.name}</h4>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {officer.role} • <span className="font-mono">{officer.phone}</span>
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          officer.status === 'SOS'
                            ? 'bg-red-600 text-white'
                            : officer.status === 'ONLINE'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {officer.status}
                      </span>
                    </div>

                    {loc && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px] font-mono">
                        <div className="flex items-center gap-1 text-slate-300">
                          <Navigation
                            className="w-3.5 h-3.5 text-sky-400"
                            style={{ transform: `rotate(${loc.heading}deg)` }}
                          />
                          <span>{loc.speed.toFixed(1)} km/h</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-300">
                          <Battery
                            className={`w-3.5 h-3.5 ${
                              loc.battery < 25 ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          />
                          <span>{loc.battery}%</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-300">
                          <Activity className="w-3.5 h-3.5 text-amber-400" />
                          <span>{loc.speed > 5 ? '1s Sync' : '30s Idle'}</span>
                        </div>
                      </div>
                    )}

                    {/* Geofence & Escort Status Pills */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {insideCenter ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-600/40 px-2 py-0.5 rounded font-mono">
                          <MapPin className="w-3 h-3" /> INSIDE: {insideCenter.code} ({nearestDistance}m)
                        </span>
                      ) : (
                        nearestCenter && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono">
                            Nearest: {nearestCenter.code} ({nearestDistance}m)
                          </span>
                        )
                      )}

                      {loc?.transit_mode && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                            routeDeviation > 200
                              ? 'bg-red-950 text-red-300 border border-red-500'
                              : 'bg-amber-950/80 text-amber-300 border border-amber-600/40'
                          }`}
                        >
                          <Radio className="w-3 h-3" />
                          {routeDeviation > 200
                            ? `DEVIATED ${routeDeviation}m!`
                            : `ESCORT (${routeDeviation}m dev)`}
                        </span>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Heading: {Math.round(loc?.heading || 0)}° |{' '}
                        {officer.device_integrity.is_mock_location ? (
                          <span className="text-red-400 font-bold">MOCK GPS FLAG</span>
                        ) : (
                          <span className="text-emerald-400">SAFE_DEVICE OK</span>
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMobileSimulator(officer.id);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300"
                      >
                        <Smartphone className="w-3.5 h-3.5" /> Handset
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* PHASE 3 TAB: WEB AUDIO SIREN DECK & ALERT DISPATCH LOG */}
            {activeSideTab === 'ALERTS_SIREN' && (
              <div className="space-y-3 text-xs">
                {/* Web Audio Synthesizer Control Deck */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-400 flex items-center gap-1.5">
                      <BellRing className="w-4 h-4" /> Web Audio Siren Synthesizer
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">$0 Browser Audio</span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>Master Siren Gain</span>
                      <span className="font-mono text-white">
                        {Math.round((sirenVolume / 0.6) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.55}
                      step={0.05}
                      value={sirenVolume}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setSirenVolume(v);
                        sirenEngine.setMasterVolume(v);
                      }}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => sirenEngine.playTestChime('EMERGENCY_SOS', 1800)}
                      className="py-1.5 px-2 rounded bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-300 font-bold text-[11px]"
                    >
                      🔊 Test SOS Wail
                    </button>
                    <button
                      onClick={() => sirenEngine.playTestChime('ESCORT_WARNING', 1800)}
                      className="py-1.5 px-2 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-bold text-[11px]"
                    >
                      ⚠️ Test Escort Pulse
                    </button>
                  </div>
                </div>

                {/* Alert Feed */}
                {allAlerts.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 text-slate-400">
                    No SOS or Route Deviation alerts triggered yet. Click{' '}
                    <strong>Test Silent SOS</strong> in the top header or{' '}
                    <strong>Test &gt;3m Escort Stop</strong> to test the acoustic command board.
                  </div>
                ) : (
                  allAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 rounded-xl border space-y-2 ${
                        alert.status === 'ACTIVE'
                          ? 'bg-red-950/40 border-red-500'
                          : alert.status === 'ACKNOWLEDGED'
                          ? 'bg-amber-950/30 border-amber-500/60'
                          : 'bg-slate-950 border-slate-800 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-red-600 text-white">
                          {alert.type}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {alert.status}
                        </span>
                      </div>
                      <div className="font-bold text-white">{alert.officer_name}</div>
                      <p className="text-[11px] text-slate-300">{alert.message}</p>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          onClick={() => setFlyTarget([alert.lat, alert.lng])}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold"
                        >
                          Focus Map
                        </button>
                        {alert.audio_url && (
                          <button
                            onClick={() => handlePlay15sSosAudio(alert)}
                            className="px-2 py-1 rounded bg-purple-950 text-purple-200 border border-purple-600/40 text-[10px] font-bold"
                          >
                            {playingAmbientAlertId === alert.id
                              ? 'Playing 15s Audio...'
                              : 'Play 15s Audio'}
                          </button>
                        )}
                        {alert.status !== 'RESOLVED' && (
                          <button
                            onClick={() =>
                              sentinelSync.updateAlertStatus(alert.id, 'RESOLVED')
                            }
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold ml-auto"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PHASE 3 TAB: DEPOT / ESCORT ROUTE ASSIGNMENT */}
            {activeSideTab === 'ESCORT_ASSIGN' && (
              <div className="space-y-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-[11px]">
                  Assign question paper escort corridors (<strong className="text-amber-400">200m max deviation</strong>,{' '}
                  <strong className="text-amber-400">3-min max unscheduled stop</strong>) and toggle Transit Mode remotely.
                </div>
                {officersList.map((officer) => {
                  const loc = dbState.live_locations[officer.id];
                  return (
                    <div
                      key={officer.id}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-white">{officer.name}</strong>
                        <span className="text-[10px] font-mono text-amber-400">
                          {loc?.transit_mode ? 'TRANSIT ACTIVE' : 'STANDARD PATROL'}
                        </span>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Assigned OSRM Escort Corridor
                        </label>
                        <select
                          value={officer.assigned_route_id}
                          onChange={(e) =>
                            sentinelSync.assignOfficerRouteAndCenter({
                              officerId: officer.id,
                              routeId: e.target.value,
                              centerId: officer.assigned_center_id,
                              authorizeTransitMode: Boolean(loc?.transit_mode),
                            })
                          }
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-[11px]"
                        >
                          {Object.values(dbState.routes).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          Destination WAEC Exam Center
                        </label>
                        <select
                          value={officer.assigned_center_id}
                          onChange={(e) =>
                            sentinelSync.assignOfficerRouteAndCenter({
                              officerId: officer.id,
                              routeId: officer.assigned_route_id,
                              centerId: e.target.value,
                              authorizeTransitMode: Boolean(loc?.transit_mode),
                            })
                          }
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white text-[11px]"
                        >
                          {Object.values(dbState.centers).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() =>
                          sentinelSync.assignOfficerRouteAndCenter({
                            officerId: officer.id,
                            routeId: officer.assigned_route_id,
                            centerId: officer.assigned_center_id,
                            authorizeTransitMode: !loc?.transit_mode,
                          })
                        }
                        className={`w-full py-1.5 rounded font-bold text-[11px] transition ${
                          loc?.transit_mode
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        }`}
                      >
                        {loc?.transit_mode
                          ? 'End Question Paper Transit Mode'
                          : 'Authorize Question Paper Transit Mode'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeSideTab === 'GEOFENCE' && (
              <div className="space-y-2">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs text-slate-400">
                  Automated <strong className="text-slate-200">100m circular geofence</strong> logs via client-side Haversine / Turf math. Zero manual check-in required.
                </div>
                {geofenceLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span
                        className={`inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded mr-2 ${
                          log.event_type === 'ENTER_CENTER'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                            : 'bg-amber-950 text-amber-300 border border-amber-700/50'
                        }`}
                      >
                        {log.event_type}
                      </span>
                      <strong className="text-slate-200">{log.officer_name}</strong>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {log.center_name} ({log.distance_meters}m from center pin)
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeSideTab === 'EVIDENCE' && (
              <div className="space-y-3">
                {incidentsList.length === 0 ? (
                  <div className="p-6 text-center rounded-lg border border-dashed border-slate-800 text-slate-400 text-xs">
                    <FileWarning className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    No watermarked field evidence photos submitted yet. Use the{' '}
                    <button
                      onClick={() => onOpenMobileSimulator(selectedOfficerId)}
                      className="text-amber-400 underline font-semibold"
                    >
                      Field Officer Handset
                    </button>{' '}
                    to capture a watermarked malpractice or seal-tampering photo.
                  </div>
                ) : (
                  incidentsList.map((inc) => (
                    <div
                      key={inc.id}
                      className="rounded-lg overflow-hidden bg-slate-950 border border-slate-800"
                    >
                      <img
                        src={inc.watermarked_image_data_url}
                        alt={inc.category}
                        className="w-full h-44 object-cover border-b border-slate-800"
                      />
                      <div className="p-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-400 font-mono">
                            {inc.category} • {inc.center_code}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-400">
                            ✓ PIXEL WATERMARKED
                          </span>
                        </div>
                        <p className="text-slate-300 mt-1">{inc.notes}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">
                          By {inc.officer_name} • {new Date(inc.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* CENTER INTERACTIVE LEAFLET + OPENSTREETMAP COMMAND BOARD */}
        <div className="lg:col-span-8 xl:col-span-9 relative h-full min-h-[420px]">
          {/* FLOATING MAP LAYER SWITCHER PILL BAR (TOP RIGHT) */}
          <div className="absolute top-3 right-3 z-[400] bg-slate-950/90 backdrop-blur border border-slate-800 rounded-xl p-1.5 flex flex-wrap items-center gap-1.5 text-[11px] shadow-xl">
            <span className="px-2 py-1 text-slate-400 font-bold flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-amber-400" /> Layers:
            </span>
            <button
              onClick={() => setShowCenterGeofences((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                showCenterGeofences
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              100m Geofences
            </button>
            <button
              onClick={() => setShowEscortRoutes((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                showEscortRoutes
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              OSRM Routes
            </button>
            <button
              onClick={() => setShowBreadcrumbTrails((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                showBreadcrumbTrails
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              GPS Trails
            </button>
            <button
              onClick={() => setDarkTacticalTiles((v) => !v)}
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                darkTacticalTiles
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {darkTacticalTiles ? 'Dark Radar Map' : 'Standard OSM'}
            </button>
          </div>

          <MapContainer
            center={[5.605, -0.202]}
            zoom={12}
            className={`w-full h-full z-0 ${
              darkTacticalTiles ? 'waec-dark-map-tiles' : ''
            }`}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | WAEC Sentinel $0 Tile Engine'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFlyToController target={flyTarget} />

            {/* OSRM Pre-Drawn Escort Transit Route Corridors */}
            {showEscortRoutes &&
              Object.values(dbState.routes).map((route) => (
                <Polyline
                  key={route.id}
                  positions={route.waypoints}
                  pathOptions={{
                    color: '#f59e0b',
                    weight: 4,
                    dashArray: '8, 8',
                    opacity: 0.85,
                  }}
                >
                  <Popup>
                    <div className="text-xs font-sans">
                      <strong className="block text-slate-900">{route.name}</strong>
                      <span className="text-slate-600">
                        Max Allowed Deviation: {route.max_deviation_meters}m | Max Stop:{' '}
                        {route.max_stop_seconds}s
                      </span>
                    </div>
                  </Popup>
                </Polyline>
              ))}

            {/* Phase 3 Officer Live GPS Breadcrumb Trails */}
            {showBreadcrumbTrails &&
              Object.entries(dbState.location_trails || {}).map(([officerId, coords]) => {
                if (!coords || coords.length < 2) return null;
                const officer = dbState.officers[officerId];
                const isSOS = officer?.status === 'SOS';
                return (
                  <Polyline
                    key={`trail_${officerId}`}
                    positions={coords}
                    pathOptions={{
                      color: isSOS ? '#ef4444' : '#10b981',
                      weight: 3,
                      opacity: 0.65,
                    }}
                  />
                );
              })}

            {/* 100-Meter Circular Geofences for WAEC Exam Centers */}
            {showCenterGeofences &&
              Object.values(dbState.centers).map((center) => {
                const isDepot = center.id.startsWith('depot_');
                return (
                  <React.Fragment key={center.id}>
                    <Circle
                      center={[center.lat, center.lng]}
                      radius={center.radius_meters}
                      pathOptions={{
                        color: isDepot ? '#a855f7' : '#0ea5e9',
                        fillColor: isDepot ? '#a855f7' : '#0ea5e9',
                        fillOpacity: 0.18,
                        weight: 2,
                      }}
                    />
                    <Marker
                      position={[center.lat, center.lng]}
                      icon={createCenterIcon(center.code, isDepot)}
                    >
                      <Popup>
                        <div className="text-xs space-y-1 font-sans">
                          <div className="font-bold text-slate-900">{center.name}</div>
                          <div className="text-slate-600">
                            Code: <strong>{center.code}</strong> • Geofence:{' '}
                            <strong>{center.radius_meters}m</strong>
                          </div>
                          <div className="text-slate-600">
                            Paper: <strong>{center.paper_code}</strong> ({center.candidates_count}{' '}
                            candidates)
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  </React.Fragment>
                );
              })}

            {/* Live Field Officer Markers with Directional Heading Vectors */}
            {officersList.map((officer) => {
              const loc = dbState.live_locations[officer.id];
              if (!loc) return null;
              return (
                <Marker
                  key={officer.id}
                  position={[loc.lat, loc.lng]}
                  icon={createOfficerIcon(
                    officer,
                    loc.transit_mode,
                    loc.speed,
                    loc.heading
                  )}
                >
                  <Popup>
                    <div className="text-xs space-y-1 font-sans min-w-[205px]">
                      <div className="font-bold text-slate-900 flex items-center justify-between">
                        <span>{officer.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono">
                          {officer.status}
                        </span>
                      </div>
                      <div className="text-slate-600">{officer.role}</div>
                      <div className="font-mono text-[11px] text-slate-700">
                        Speed: {loc.speed.toFixed(1)} km/h | Heading: {Math.round(loc.heading)}°
                      </div>
                      <div className="font-mono text-[11px] text-slate-700">
                        Battery: {loc.battery}% | Transit: {loc.transit_mode ? 'ON' : 'OFF'}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">
                        Coords: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                      </div>
                      <div className="pt-1 flex gap-1.5">
                        <button
                          onClick={() => onOpenMobileSimulator(officer.id)}
                          className="w-full py-1 px-2 rounded bg-slate-900 text-amber-400 font-semibold text-[11px]"
                        >
                          Open Officer Handset View
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* FLOATING MAP LEGEND OVERLAY */}
          <div className="absolute bottom-4 right-4 z-[400] bg-slate-950/90 backdrop-blur border border-slate-800 rounded-lg p-3 text-[11px] space-y-1.5 shadow-xl">
            <div className="font-bold text-slate-200 uppercase tracking-wider text-[10px]">
              WAEC Sentinel Phase 3 Command Legend
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Field Officer + Heading Cone
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Escort Transit Mode (1s Stream)
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block animate-pulse" /> Active SOS / Unscheduled Stop
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Live GPS Breadcrumb Trail
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
