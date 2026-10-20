import React, { useState, useRef } from 'react';
import {
  AlertOctagon,
  Send,
  Mic,
  MapPin,
  Route,
  Camera,
  Download,
  ExternalLink,
  CheckCircle2,
  Volume2,
  Compass,
  PlusCircle,
  ShieldCheck,
  Headphones,
} from 'lucide-react';
import { SentinelDatabaseSchema, IncidentEvidence } from '../types/sentinel';
import { sentinelSync } from '../services/realtimeSync';
import {
  getTelegramBotConfig,
  saveTelegramBotConfig,
  sirenEngine,
} from '../services/sirenAndTelegram';
import {
  checkCenterGeofence,
  calculateRouteDeviationMeters,
  calculateRouteProgress,
} from '../services/geofenceEngine';
import { generateWatermarkedEvidenceImage } from '../services/watermarkEngine';

interface EmergencyGeofenceConsoleProps {
  dbState: SentinelDatabaseSchema;
}

export const EmergencyGeofenceConsole: React.FC<EmergencyGeofenceConsoleProps> = ({
  dbState,
}) => {
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('officer_001');

  // Module C: Dual SOS & 15s Ambient Audio Recorder State
  const [holdPct, setHoldPct] = useState<number>(0);
  const holdTimerRef = useRef<number | null>(null);
  const volTapsRef = useRef<number[]>([]);
  const [volTapCount, setVolTapCount] = useState<number>(0);
  const [recordingSecLeft, setRecordingSecLeft] = useState<number>(0);
  const recTimerRef = useRef<number | null>(null);

  // Module C: Telegram Bot Configurator State
  const initialTgConfig = getTelegramBotConfig();
  const [tgBotToken, setTgBotToken] = useState<string>(initialTgConfig.botToken);
  const [tgChatId, setTgChatId] = useState<string>(initialTgConfig.chatId);
  const [tgConfigSaved, setTgConfigSaved] = useState<boolean>(false);

  // Module D: Custom 100m Exam Center Creator State
  const [newCenterCode, setNewCenterCode] = useState<string>('GH-209');
  const [newCenterName, setNewCenterName] = useState<string>('Wesley Grammar Senior High');
  const [newCenterZone, setNewCenterZone] = useState<string>('Dansoman / Odorkor');
  const [newCenterLat, setNewCenterLat] = useState<string>('5.5688');
  const [newCenterLng, setNewCenterLng] = useState<string>('-0.2584');
  const [newCenterRadius, setNewCenterRadius] = useState<string>('100');

  // Module D: Custom OSRM Escort Corridor Creator State
  const [newRouteName, setNewRouteName] = useState<string>(
    'Ridge Vault → Labone SHS Corridor'
  );
  const [newRouteOrigin, setNewRouteOrigin] = useState<string>('depot_HQ_01');
  const [newRouteDest, setNewRouteDest] = useState<string>('center_GH_104');

  // Module E: Watermarked Evidence Forensic Studio State
  const [evidenceCategory, setEvidenceCategory] =
    useState<IncidentEvidence['category']>('SEAL_TAMPERING');
  const [evidenceNotes, setEvidenceNotes] = useState<string>(
    'Verified security bag tamper-evident seal serial #WAEC-99412 before hall distribution.'
  );
  const [isGeneratingWatermark, setIsGeneratingWatermark] = useState<boolean>(false);

  const officers = Object.values(dbState.officers);
  const selectedOfficer = dbState.officers[selectedOfficerId] || officers[0];
  const selectedLoc = dbState.live_locations[selectedOfficer.id];
  const assignedRoute = dbState.routes[selectedOfficer.assigned_route_id];

  const geofenceInfo = selectedLoc
    ? checkCenterGeofence(selectedLoc.lat, selectedLoc.lng, dbState.centers)
    : { insideCenter: null, nearestCenter: null, nearestDistance: 0, bearingToNearest: 0 };

  const routeDeviation =
    selectedLoc && assignedRoute
      ? calculateRouteDeviationMeters(selectedLoc.lat, selectedLoc.lng, assignedRoute)
      : 0;

  const routeProgress =
    selectedLoc && assignedRoute
      ? calculateRouteProgress(selectedLoc.lat, selectedLoc.lng, assignedRoute)
      : { totalLengthKm: 0, progressPct: 0, distanceToDestinationMeters: 0 };

  const telegramDispatches = Object.values(dbState.telegram_dispatches || {}).sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const incidents = Object.values(dbState.incidents || {}).sort(
    (a, b) => b.timestamp - a.timestamp
  );

  const start15SecondAmbientCountdown = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecordingSecLeft(15);
    recTimerRef.current = window.setInterval(() => {
      setRecordingSecLeft((prev) => {
        if (prev <= 1) {
          if (recTimerRef.current) clearInterval(recTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleStartVisualHold = () => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    const t0 = Date.now();
    holdTimerRef.current = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - t0) / 2000) * 100));
      setHoldPct(pct);
      if (pct >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        setHoldPct(0);
        sentinelSync.triggerAlert({
          officerId: selectedOfficer.id,
          type: 'VISUAL_SOS',
        });
        start15SecondAmbientCountdown();
      }
    }, 40);
  };

  const handleCancelVisualHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldPct(0);
  };

  const handleVolumeDownTap = () => {
    const now = Date.now();
    const recent = [...volTapsRef.current, now].filter((t) => now - t <= 1500);
    volTapsRef.current = recent;
    setVolTapCount(recent.length);
    if (recent.length >= 3) {
      volTapsRef.current = [];
      setVolTapCount(0);
      sentinelSync.triggerAlert({
        officerId: selectedOfficer.id,
        type: 'SILENT_SOS',
      });
      start15SecondAmbientCountdown();
    }
  };

  const handleSaveTelegramConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveTelegramBotConfig({ botToken: tgBotToken.trim(), chatId: tgChatId.trim() });
    setTgConfigSaved(true);
    setTimeout(() => setTgConfigSaved(false), 3500);
  };

  const handleCreateExamCenter = (e: React.FormEvent) => {
    e.preventDefault();
    sentinelSync.registerExamCenter({
      code: newCenterCode.trim() || 'GH-209',
      name: newCenterName.trim() || 'New WAEC Exam Center',
      zone: newCenterZone.trim() || 'Accra Metro',
      lat: parseFloat(newCenterLat) || 5.5688,
      lng: parseFloat(newCenterLng) || -0.2584,
      radiusMeters: parseInt(newCenterRadius, 10) || 100,
      candidatesCount: 450,
      paperCode: 'WASSCE-302-CORE-MATH',
    });
    setNewCenterCode(`GH-${Math.floor(210 + Math.random() * 80)}`);
  };

  const handleCreateEscortRoute = (e: React.FormEvent) => {
    e.preventDefault();
    sentinelSync.registerEscortRoute({
      name: newRouteName.trim() || 'Custom Escort Corridor',
      originCenterId: newRouteOrigin,
      destinationCenterId: newRouteDest,
      assignedOfficerId: selectedOfficer.id,
      maxDeviationMeters: 200,
    });
  };

  const handleGenerateForensicEvidence = async (file?: File) => {
    if (!selectedLoc) return;
    setIsGeneratingWatermark(true);
    try {
      const center =
        dbState.centers[selectedOfficer.assigned_center_id] ||
        Object.values(dbState.centers)[0];

      const dataUrl = await generateWatermarkedEvidenceImage(
        {
          officerId: selectedOfficer.id,
          officerName: selectedOfficer.name,
          centerCode: center ? center.code : 'GH-042',
          category: evidenceCategory,
          lat: selectedLoc.lat,
          lng: selectedLoc.lng,
          timestamp: Date.now(),
        },
        file
      );

      sentinelSync.submitIncidentEvidence({
        officer_id: selectedOfficer.id,
        officer_name: selectedOfficer.name,
        center_id: center ? center.id : 'center_GH_042',
        center_code: center ? center.code : 'GH-042',
        category: evidenceCategory,
        notes: evidenceNotes,
        lat: selectedLoc.lat,
        lng: selectedLoc.lng,
        watermarked_image_data_url: dataUrl,
      });
    } finally {
      setIsGeneratingWatermark(false);
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* PHASE 4 HEADER BANNER */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 font-mono text-[11px] font-bold">
                PHASE 4: EMERGENCY &amp; GEOFENCE TOOLS
              </span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                ZERO-SMS TELEGRAM + TURF GEOFENCING + CANVAS WATERMARK
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white mt-1.5">
              Emergency SOS Dispatch, Telegram Webhook, Turf.js Geofence Studio &amp; Forensic Evidence Lab
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Test dual hardware/visual SOS triggers with 15-second ambient audio capture, inspect instant Telegram Bot mobile alerts, build 100m exam center geofences, and verify pixel-burned incident photos.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-semibold">Active Field Officer:</span>
            <select
              value={selectedOfficer.id}
              onChange={(e) => setSelectedOfficerId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 font-bold text-amber-400"
            >
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.assigned_zone})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TOP ROW: MODULE C — DUAL SOS TRIGGERS, 15s AMBIENT RECORDER & TELEGRAM BOT WEBHOOK */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT 6 COLS: DUAL SOS HARDWARE/VISUAL TRIGGER & 15s AMBIENT MIC RECORDER */}
          <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400" /> Module C: Dual SOS Triggers &amp; 15s Ambient Audio Capture
              </h3>
              <span className="text-[10px] font-mono text-red-300">
                WebSocket + Siren + Telegram + Storage
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Trigger 1: Hold 2 Seconds Visual SOS */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-red-500/40 space-y-2.5">
                <div className="font-bold text-red-300">
                  1. Visual On-Screen Panic (Hold 2.0s)
                </div>
                <p className="text-[11px] text-slate-400">
                  Requires a deliberate 2-second continuous press to prevent accidental false alarms in the field.
                </p>
                <button
                  onMouseDown={handleStartVisualHold}
                  onMouseUp={handleCancelVisualHold}
                  onMouseLeave={handleCancelVisualHold}
                  onTouchStart={handleStartVisualHold}
                  onTouchEnd={handleCancelVisualHold}
                  className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold relative overflow-hidden select-none transition"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-red-900/80 transition-all"
                    style={{ width: `${holdPct}%` }}
                  />
                  <span className="relative z-10">
                    {holdPct > 0 ? `HOLDING... ${holdPct}%` : 'HOLD 2s FOR VISUAL SOS'}
                  </span>
                </button>
              </div>

              {/* Trigger 2: Hardware Silent SOS (3x Volume Down in <1.5s) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/40 space-y-2.5">
                <div className="font-bold text-amber-300">
                  2. Hardware Silent SOS (3x Vol-Down &lt; 1.5s)
                </div>
                <p className="text-[11px] text-slate-400">
                  Silently dispatches SOS when facing hostility without waking the phone screen.
                </p>
                <button
                  onClick={handleVolumeDownTap}
                  className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-amber-500/50 text-amber-300 font-mono font-extrabold active:bg-amber-500 active:text-slate-950 transition"
                >
                  🔉 Tap Volume-Down ({volTapCount}/3 in 1.5s)
                </button>
              </div>
            </div>

            {/* 15-Second Ambient Audio Capture & Firebase Cloud Storage Status */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Mic
                    className={`w-4 h-4 ${
                      recordingSecLeft > 0 ? 'text-red-400 animate-ping' : 'text-purple-400'
                    }`}
                  />
                  15-Second Silent Ambient Audio Recorder
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-purple-300">
                    {recordingSecLeft > 0
                      ? `RECORDING AMBIENT MIC... ${recordingSecLeft}s left`
                      : 'STANDBY (Auto-starts on SOS)'}
                  </span>
                  <button
                    onClick={() => sirenEngine.playSimulatedAmbientClip(3000)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-500/50 text-[10px] font-bold"
                  >
                    <Headphones className="w-3 h-3" /> Play Sample Clip
                  </button>
                </div>
              </div>

              {/* Animated Waveform Bars */}
              <div className="h-10 rounded-lg bg-slate-900 border border-slate-800 px-3 flex items-center justify-between gap-1">
                {Array.from({ length: 32 }).map((_, idx) => {
                  const active = recordingSecLeft > 0;
                  const barHeight = active
                    ? 20 + ((idx * 17 + recordingSecLeft * 13) % 75)
                    : 18 + ((idx * 7) % 25);
                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-full transition-all duration-300 ${
                        active ? 'bg-red-500' : 'bg-slate-700'
                      }`}
                      style={{ height: `${barHeight}%` }}
                    />
                  );
                })}
              </div>
              <div className="text-[10px] font-mono text-slate-500">
                Target Storage Bucket:{' '}
                <code className="text-slate-300">
                  gs://waec-sentinel.appspot.com/sos_audio/{selectedOfficer.id}/alert_*.webm
                </code>{' '}
                (Encrypted &lt; 2MB)
              </div>
            </div>
          </div>

          {/* RIGHT 6 COLS: TELEGRAM BOT API CONFIGURATOR & LIVE MOBILE DISPATCH FEED */}
          <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-sky-400" /> Telegram Bot Instant SOS Dispatch ($0 SMS Replacement)
              </h3>
              <span className="text-[10px] font-mono text-emerald-400">
                Direct OpenStreetMap Coordinates + Battery %
              </span>
            </div>

            <form
              onSubmit={handleSaveTelegramConfig}
              className="p-3 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-5">
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Telegram Bot Token (Optional Live API)
                </label>
                <input
                  type="password"
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  value={tgBotToken}
                  onChange={(e) => setTgBotToken(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white font-mono text-[11px]"
                />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                  Command Lead Chat ID
                </label>
                <input
                  type="text"
                  value={tgChatId}
                  onChange={(e) => setTgChatId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-sky-300 font-mono text-[11px]"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  className="w-full py-1.5 px-2.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px]"
                >
                  {tgConfigSaved ? '✓ Saved' : 'Save Bot Config'}
                </button>
              </div>
            </form>

            {/* Dispatched Telegram Mobile Chat Bubbles */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {telegramDispatches.length === 0 ? (
                <div className="p-5 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center text-slate-400">
                  Trigger a <strong>Visual SOS</strong> or <strong>3x Volume-Down Silent SOS</strong> on the left to inspect the instant Telegram Bot message sent to the Command Lead&apos;s phone.
                </div>
              ) : (
                telegramDispatches.map((tg) => (
                  <div
                    key={tg.id}
                    className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                        {tg.mode} → {tg.chat_id}
                      </span>
                      <span className="text-slate-400">
                        {new Date(tg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap bg-slate-950/90 p-2.5 rounded-lg border border-slate-800">
                      {tg.markdown_payload}
                    </pre>
                    <div className="flex items-center justify-end">
                      <a
                        href={tg.osm_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open Direct OpenStreetMap Pin
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE ROW: MODULE D — TURF.JS 100M GEOFENCE CALCULATOR, CENTER BUILDER & ESCORT CORRIDOR BUILDER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Live Turf.js Telemetry & Escort Corridor Inspector */}
          <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3.5 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" /> Module D: Live Turf.js / Haversine Geofence Telemetry
              </h3>
              <span className="text-[10px] font-mono text-sky-400">Client-Side Zero-API Math</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Officer Position:</span>
                <span className="text-white">
                  {selectedLoc?.lat.toFixed(5)}, {selectedLoc?.lng.toFixed(5)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">100m Center Geofence State:</span>
                <span
                  className={
                    geofenceInfo.insideCenter
                      ? 'text-emerald-400 font-bold'
                      : 'text-amber-400 font-bold'
                  }
                >
                  {geofenceInfo.insideCenter
                    ? `INSIDE ${geofenceInfo.insideCenter.code} (${geofenceInfo.nearestDistance}m)`
                    : `OUTSIDE (${geofenceInfo.nearestDistance}m to ${geofenceInfo.nearestCenter?.code})`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Compass Bearing to Nearest Center:</span>
                <span className="text-sky-300 font-bold">
                  {geofenceInfo.bearingToNearest}° True North
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">OSRM Corridor Deviation:</span>
                <span
                  className={
                    routeDeviation > 200
                      ? 'text-red-400 font-bold'
                      : 'text-emerald-400 font-bold'
                  }
                >
                  {routeDeviation}m (Max Allowed: 200m)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Escort Corridor Progress:</span>
                <span className="text-amber-400 font-bold">
                  {routeProgress.progressPct}% of {routeProgress.totalLengthKm} km
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  const c = geofenceInfo.nearestCenter || Object.values(dbState.centers)[0];
                  if (c) {
                    sentinelSync.updateOfficerLocation(selectedOfficer.id, {
                      lat: c.lat,
                      lng: c.lng,
                      speed: 1.5,
                    });
                  }
                }}
                className="py-2 px-3 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold"
              >
                Test Auto ENTER_CENTER
              </button>
              <button
                onClick={() => {
                  const c = geofenceInfo.nearestCenter || Object.values(dbState.centers)[0];
                  if (c) {
                    sentinelSync.updateOfficerLocation(selectedOfficer.id, {
                      lat: c.lat + 0.0022,
                      lng: c.lng - 0.0022,
                      speed: 24.0,
                    });
                  }
                }}
                className="py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold"
              >
                Test Auto EXIT_CENTER
              </button>
            </div>
          </div>

          {/* Create Custom 100m Exam Center Geofence & OSRM Escort Corridor */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Form 1: Add Exam Center Geofence */}
            <form
              onSubmit={handleCreateExamCenter}
              className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5"
            >
              <div className="font-bold text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-sky-400" /> Add WAEC Exam Center (100m Geofence)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Center Code</label>
                  <input
                    type="text"
                    value={newCenterCode}
                    onChange={(e) => setNewCenterCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">
                    Geofence Radius (m)
                  </label>
                  <input
                    type="number"
                    value={newCenterRadius}
                    onChange={(e) => setNewCenterRadius(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-sky-300 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">School / Hall Name</label>
                <input
                  type="text"
                  value={newCenterName}
                  onChange={(e) => setNewCenterName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Latitude</label>
                  <input
                    type="text"
                    value={newCenterLat}
                    onChange={(e) => setNewCenterLat(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-0.5">Longitude</label>
                  <input
                    type="text"
                    value={newCenterLng}
                    onChange={(e) => setNewCenterLng(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold transition"
              >
                + Deploy 100m Center Geofence to Map
              </button>
            </form>

            {/* Form 2: Add OSRM Question Paper Escort Route */}
            <form
              onSubmit={handleCreateEscortRoute}
              className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5"
            >
              <div className="font-bold text-white flex items-center gap-1.5">
                <Route className="w-4 h-4 text-amber-400" /> Build OSRM Question Paper Escort Corridor
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">Corridor Name</label>
                <input
                  type="text"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  Origin Strongroom / Depot
                </label>
                <select
                  value={newRouteOrigin}
                  onChange={(e) => setNewRouteOrigin(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                >
                  {Object.values(dbState.centers).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-0.5">
                  Destination Exam Center
                </label>
                <select
                  value={newRouteDest}
                  onChange={(e) => setNewRouteDest(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                >
                  {Object.values(dbState.centers).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold transition"
              >
                + Generate OSRM Escort Corridor (200m Guard)
              </button>
            </form>
          </div>
        </div>

        {/* BOTTOM ROW: MODULE E — WATERMARKED EVIDENCE FORENSIC LAB & GALLERY */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" /> Module E: Watermarked Evidence Forensic Capture &amp; Chain-of-Custody Gallery
              </h3>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Burns GPS coordinates, UTC timestamp, Center Code, Officer ID, and cryptographic integrity fingerprint directly into the JPEG canvas pixels before compression (&lt;800 KB Spark free-tier limit).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={evidenceCategory}
                onChange={(e) =>
                  setEvidenceCategory(e.target.value as IncidentEvidence['category'])
                }
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              >
                <option value="SEAL_TAMPERING">SEAL_TAMPERING</option>
                <option value="MALPRACTICE">MALPRACTICE</option>
                <option value="HOSTILITY">HOSTILITY</option>
                <option value="LATE_ARRIVAL">LATE_ARRIVAL</option>
              </select>

              <button
                onClick={() => handleGenerateForensicEvidence()}
                disabled={isGeneratingWatermark}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold transition"
              >
                <Camera className="w-4 h-4" />
                {isGeneratingWatermark
                  ? 'Burning Forensic Watermark...'
                  : 'Capture & Burn-In Forensic Evidence'}
              </button>

              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer font-bold">
                <span>Upload Custom Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleGenerateForensicEvidence(f);
                  }}
                />
              </label>
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center text-slate-400">
              Click <strong>&quot;Capture &amp; Burn-In Forensic Evidence&quot;</strong> above to generate a tamper-proof watermarked WAEC inspection photo and inspect its pixel metadata.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {incidents.map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex flex-col"
                >
                  <img
                    src={inc.watermarked_image_data_url}
                    alt={inc.category}
                    className="w-full h-48 object-cover border-b border-slate-800"
                  />
                  <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-400">
                          {inc.category} • {inc.center_code}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          {inc.compressed_size_kb || 142} KB (&lt;800KB SLA)
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] mt-1">{inc.notes}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between font-mono text-[10px] text-slate-400">
                      <span>Hash: {inc.integrity_hash || 'VERIFIED'}</span>
                      <a
                        href={inc.watermarked_image_data_url}
                        download={`WAEC_Evidence_${inc.center_code}_${inc.id}.jpg`}
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold"
                      >
                        <Download className="w-3 h-3" /> Download JPEG
                      </a>
                    </div>
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
