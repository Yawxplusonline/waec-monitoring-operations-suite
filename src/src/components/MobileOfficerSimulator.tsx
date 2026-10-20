import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  Navigation,
  BatteryCharging,
  Wifi,
  WifiOff,
  Camera,
  Lock,
  Smartphone,
  MapPin,
  Route,
  Radio,
  Hash,
  Delete,
} from 'lucide-react';
import { SentinelDatabaseSchema, IncidentEvidence } from '../types/sentinel';
import { sentinelSync } from '../services/realtimeSync';
import { checkCenterGeofence } from '../services/geofenceEngine';
import { generateWatermarkedEvidenceImage } from '../services/watermarkEngine';
import { computePinHash, generateDefaultDeviceId } from '../services/authCrypto';

interface MobileOfficerSimulatorProps {
  dbState: SentinelDatabaseSchema;
  initialOfficerId?: string;
}

export const MobileOfficerSimulator: React.FC<MobileOfficerSimulatorProps> = ({
  dbState,
  initialOfficerId = 'officer_001',
}) => {
  const [authenticatedOfficerId, setAuthenticatedOfficerId] = useState<string | null>(
    null
  );
  const [loginPhone, setLoginPhone] = useState<string>('+233200000001');
  const [loginPin, setLoginPin] = useState<string>('1234');
  const [loginDeviceId, setLoginDeviceId] = useState<string>(
    generateDefaultDeviceId('officer_001')
  );
  const [simulateRooted, setSimulateRooted] = useState<boolean>(false);
  const [simulateMockGps, setSimulateMockGps] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Visual SOS Hold-for-2s state
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const holdIntervalRef = useRef<number | null>(null);
  const [sosFeedback, setSosFeedback] = useState<string | null>(null);

  // Hardware Silent SOS (3x Volume Down in < 1.5s) state
  const volDownTimestampsRef = useRef<number[]>([]);
  const [volTapCount, setVolTapCount] = useState<number>(0);

  // Watermarked Evidence Capture state
  const [evidenceCategory, setEvidenceCategory] =
    useState<IncidentEvidence['category']>('MALPRACTICE');
  const [evidenceNotes, setEvidenceNotes] = useState<string>(
    'Verified question paper packet seal intact at examination hall entry.'
  );
  const [lastWatermarkedPreview, setLastWatermarkedPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Offline Hive Buffer state
  const [isOffline, setIsOffline] = useState<boolean>(sentinelSync.isNetworkOffline());
  const offlineQueue = sentinelSync.getOfflineQueue();

  useEffect(() => {
    if (initialOfficerId && dbState.officers[initialOfficerId]) {
      const o = dbState.officers[initialOfficerId];
      setLoginPhone(o.phone);
      setLoginPin(o.pin_demo);
      setLoginDeviceId(
        o.device_integrity.bound_device_id || generateDefaultDeviceId(o.id)
      );
    }
  }, [initialOfficerId, dbState.officers]);

  // Listen for physical keyboard "-" as Volume Down shortcut in simulator
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'AudioVolumeDown' || e.key === '-') {
        handleHardwareVolumeDownTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const currentOfficer = authenticatedOfficerId
    ? dbState.officers[authenticatedOfficerId]
    : null;
  const currentLocation = authenticatedOfficerId
    ? dbState.live_locations[authenticatedOfficerId]
    : null;

  const liveComputedPinHash = computePinHash(loginPhone, loginPin);

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    const res = sentinelSync.authenticateOfficer(loginPhone, loginPin, {
      deviceId: loginDeviceId,
      simulateRooted,
      simulateMockGps,
    });
    if (!res.success || !res.officer) {
      setLoginError(res.error || 'Authentication failed');
      return;
    }
    setAuthenticatedOfficerId(res.officer.id);
  };

  const handleKeypadDigit = (digit: string) => {
    if (loginPin.length < 4) {
      setLoginPin((prev) => prev + digit);
    }
  };

  const handleKeypadBackspace = () => {
    setLoginPin((prev) => prev.slice(0, -1));
  };

  // Hold-for-2-Seconds Visual Panic Button Logic
  const startSosHold = () => {
    if (!authenticatedOfficerId) return;
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    const startTime = Date.now();

    holdIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / 2000) * 100));
      setHoldProgress(pct);
      if (pct >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        setHoldProgress(0);
        sentinelSync.triggerAlert({
          officerId: authenticatedOfficerId,
          type: 'VISUAL_SOS',
        });
        setSosFeedback(
          '🚨 VISUAL SOS DISPATCHED! Command Siren + Telegram Webhook + 15s Audio Active.'
        );
        setTimeout(() => setSosFeedback(null), 6000);
      }
    }, 40);
  };

  const cancelSosHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  // Hardware Silent SOS: 3x Volume Down in < 1.5 seconds
  const handleHardwareVolumeDownTap = () => {
    if (!authenticatedOfficerId) return;
    const now = Date.now();
    const recent = [...volDownTimestampsRef.current, now].filter((t) => now - t <= 1500);
    volDownTimestampsRef.current = recent;
    setVolTapCount(recent.length);

    if (recent.length >= 3) {
      volDownTimestampsRef.current = [];
      setVolTapCount(0);
      sentinelSync.triggerAlert({
        officerId: authenticatedOfficerId,
        type: 'SILENT_SOS',
      });
      setSosFeedback(
        '🔇 SILENT HARDWARE SOS TRIGGERED (3x Vol-Down < 1.5s)! Screen stays dark in field mode; Command Center alerted + 15s mic recording.'
      );
      setTimeout(() => setSosFeedback(null), 6000);
    }
  };

  const handleCaptureWatermarkedPhoto = async (file?: File) => {
    if (!currentOfficer || !currentLocation) return;
    setIsCapturing(true);
    try {
      const center =
        dbState.centers[currentOfficer.assigned_center_id] ||
        Object.values(dbState.centers)[0];

      const dataUrl = await generateWatermarkedEvidenceImage(
        {
          officerId: currentOfficer.id,
          officerName: currentOfficer.name,
          centerCode: center ? center.code : 'GH-042',
          category: evidenceCategory,
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          timestamp: Date.now(),
        },
        file
      );

      setLastWatermarkedPreview(dataUrl);
      sentinelSync.submitIncidentEvidence({
        officer_id: currentOfficer.id,
        officer_name: currentOfficer.name,
        center_id: center ? center.id : 'center_GH_042',
        center_code: center ? center.code : 'GH-042',
        category: evidenceCategory,
        notes: evidenceNotes,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        watermarked_image_data_url: dataUrl,
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const toggleOfflineMode = () => {
    const next = !isOffline;
    setIsOffline(next);
    sentinelSync.setNetworkOfflineSimulation(next);
  };

  const geofenceStatus = currentLocation
    ? checkCenterGeofence(currentLocation.lat, currentLocation.lng, dbState.centers)
    : { insideCenter: null, nearestCenter: null, nearestDistance: 0 };

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: ANDROID / iOS FIELD HANDSET FRAME */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[395px] rounded-[36px] border-[6px] border-slate-800 bg-slate-900 shadow-2xl overflow-hidden relative">
            {/* Phone Speaker Notch */}
            <div className="bg-slate-950 px-5 py-2.5 flex items-center justify-between border-b border-slate-800 text-[11px] font-mono text-slate-400">
              <span>WAEC-LTE {isOffline ? '(NO SIGNAL)' : '5G'}</span>
              <div className="w-16 h-1.5 rounded-full bg-slate-800" />
              <span className="text-emerald-400">{currentLocation?.battery ?? 90}% 🔋</span>
            </div>

            {!currentOfficer || !currentLocation ? (
              /* PHASE 1 (MODULE A): PHONE + 4-DIGIT PIN WHITELIST AUTH & ANTI-SPOOFING GATE */
              <div className="p-5 space-y-3.5 text-xs">
                <div className="text-center space-y-1">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h2 className="text-base font-extrabold text-white">
                    WAEC Sentinel Field Auth
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Phase 1 Whitelist + Salted PIN Hash + Hardware Binding
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold text-[11px]">
                      Select Whitelisted Officer Profile
                    </label>
                    <select
                      onChange={(e) => {
                        const o = dbState.officers[e.target.value];
                        if (o) {
                          setLoginPhone(o.phone);
                          setLoginPin(o.pin_demo);
                          setLoginDeviceId(
                            o.device_integrity.bound_device_id ||
                              generateDefaultDeviceId(o.id)
                          );
                          setLoginError(null);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs"
                    >
                      {Object.values(dbState.officers).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} ({o.phone} | PIN: {o.pin_demo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold text-[11px]">
                        Whitelisted Phone
                      </label>
                      <input
                        type="text"
                        value={loginPhone}
                        onChange={(e) => setLoginPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold text-[11px]">
                        Hardware Device ID
                      </label>
                      <input
                        type="text"
                        value={loginDeviceId}
                        onChange={(e) => setLoginDeviceId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sky-300 font-mono text-[10px]"
                      />
                    </div>
                  </div>

                  {/* 4-Digit PIN Display + Hash Preview */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1">
                    <div className="flex justify-center gap-3 py-1">
                      {[0, 1, 2, 3].map((idx) => {
                        const char = loginPin[idx];
                        return (
                          <div
                            key={idx}
                            className={`w-9 h-10 rounded-lg border flex items-center justify-center font-mono text-lg font-extrabold ${
                              char
                                ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                                : 'border-slate-800 bg-slate-900 text-slate-600'
                            }`}
                          >
                            {char ? '•' : ''}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 flex items-center justify-center gap-1">
                      <Hash className="w-3 h-3 text-amber-400" />
                      <span>SHA Digest: {liveComputedPinHash.slice(0, 20)}...</span>
                    </div>
                  </div>

                  {/* Interactive Tactical Numeric PIN Pad */}
                  <div className="grid grid-cols-3 gap-1.5 font-mono">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <button
                        type="button"
                        key={digit}
                        onClick={() => handleKeypadDigit(digit)}
                        className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-bold text-sm active:bg-amber-500 active:text-slate-950 transition"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLoginPin('')}
                      className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 text-[11px] font-bold"
                    >
                      CLR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadDigit('0')}
                      className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-bold text-sm"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleKeypadBackspace}
                      className="py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center"
                    >
                      <Delete className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Phase 1 Anti-Spoofing & Device Binding Test Toggles */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-[11px]">
                    <div className="font-bold text-slate-300 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> safe_device Pre-Flight Gate
                      </span>
                      <button
                        type="button"
                        onClick={() => setLoginDeviceId('HW-UNRECOGNIZED-ROGUE-99')}
                        className="text-[10px] text-sky-400 underline font-mono"
                      >
                        Test Rogue Handset ID
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simulateRooted}
                          onChange={(e) => setSimulateRooted(e.target.checked)}
                          className="accent-red-500"
                        />
                        <span>Simulate Root/Jailbreak</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={simulateMockGps}
                          onChange={(e) => setSimulateMockGps(e.target.checked)}
                          className="accent-red-500"
                        />
                        <span>Simulate Mock GPS App</span>
                      </label>
                    </div>
                  </div>

                  {loginError && (
                    <div className="p-2.5 rounded-lg bg-red-950/90 border border-red-500 text-red-200 text-[11px] flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition"
                  >
                    Verify PIN Hash &amp; Bind Handset
                  </button>
                </form>
              </div>
            ) : (
              /* ACTIVE FIELD OFFICER HANDSET SCREEN */
              <div className="p-4 space-y-3.5 text-xs">
                {/* Officer Identity & Shift Bar */}
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          currentOfficer.status === 'SOS'
                            ? 'bg-red-500 animate-ping'
                            : currentOfficer.on_shift
                            ? 'bg-emerald-400'
                            : 'bg-slate-500'
                        }`}
                      />
                      <span className="font-bold text-sm text-white">{currentOfficer.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Bound ID: {currentOfficer.device_integrity.bound_device_id || 'VERIFIED'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        sentinelSync.toggleOfficerShift(currentOfficer.id, !currentOfficer.on_shift)
                      }
                      className={`px-2.5 py-1 rounded font-bold text-[11px] transition ${
                        currentOfficer.on_shift
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {currentOfficer.on_shift ? 'ON SHIFT' : 'OFF SHIFT'}
                    </button>
                    <button
                      onClick={() => setAuthenticatedOfficerId(null)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                    >
                      Lock / Auth
                    </button>
                  </div>
                </div>

                {/* Adaptive GPS Stream & Geofence Status Card */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-emerald-400" /> Background GPS Service
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        currentLocation.speed > 5
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {currentLocation.speed > 5
                        ? 'ACTIVE STREAM (1.0s)'
                        : 'STATIONARY THROTTLE (30s)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">COORDINATES</span>
                      <span className="text-slate-200">
                        {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                      </span>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">SPEED / BATTERY</span>
                      <span className="text-slate-200">
                        {currentLocation.speed.toFixed(1)} km/h • {currentLocation.battery}%
                      </span>
                    </div>
                  </div>

                  {/* Automated 100m Center Geofence Indicator */}
                  <div
                    className={`p-2 rounded border flex items-center justify-between text-[11px] font-mono ${
                      geofenceStatus.insideCenter
                        ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {geofenceStatus.insideCenter
                        ? `AUTO CHECK-IN: ${geofenceStatus.insideCenter.code}`
                        : `Outside Center (${geofenceStatus.nearestDistance}m to ${geofenceStatus.nearestCenter?.code})`}
                    </span>
                    <span className="text-[10px] font-bold">100m GEOFENCE</span>
                  </div>
                </div>

                {/* Transit Escort Mode Toggle */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Route className="w-4 h-4 text-amber-400" /> Question Paper Transit Escort
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Enables 200m OSRM corridor deviation &amp; 3-min stop watch
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      sentinelSync.updateOfficerLocation(currentOfficer.id, {
                        transit_mode: !currentLocation.transit_mode,
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
                      currentLocation.transit_mode
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {currentLocation.transit_mode ? 'TRANSIT ON' : 'ENABLE'}
                  </button>
                </div>

                {/* MODULE C: DUAL EMERGENCY SOS TRIGGERS */}
                <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-red-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <AlertOctagon className="w-4 h-4 text-red-400" /> Emergency Panic Triggers
                    </span>
                    <span className="text-[10px] font-mono text-red-300">Zero SMS Cost</span>
                  </div>

                  {/* Visual Hold-for-2-Seconds Panic Button */}
                  <button
                    onMouseDown={startSosHold}
                    onMouseUp={cancelSosHold}
                    onMouseLeave={cancelSosHold}
                    onTouchStart={startSosHold}
                    onTouchEnd={cancelSosHold}
                    className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-extrabold text-sm shadow-lg relative overflow-hidden select-none transition"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-red-900/70 transition-all"
                      style={{ width: `${holdProgress}%` }}
                    />
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <AlertOctagon className="w-5 h-5" />
                      {holdProgress > 0
                        ? `HOLDING PANIC... ${holdProgress}%`
                        : 'HOLD 2 SECONDS FOR VISUAL SOS'}
                    </span>
                  </button>

                  {/* Hardware Silent SOS: Volume Down 3x in <1.5s */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="text-[10px] text-slate-300">
                      <strong className="text-amber-300 block">
                        Hardware Silent SOS (Screen Off)
                      </strong>
                      Tap Volume-Down 3 times in &lt; 1.5s ({volTapCount}/3 taps)
                    </div>
                    <button
                      onClick={handleHardwareVolumeDownTap}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-mono font-bold text-xs shrink-0 active:bg-amber-500 active:text-slate-950"
                    >
                      🔉 Vol Down ({volTapCount}/3)
                    </button>
                  </div>

                  {sosFeedback && (
                    <div className="p-2 rounded bg-red-600 text-white text-[11px] font-bold animate-pulse">
                      {sosFeedback}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: FIELD TELEMETRY CONTROLS, GEOFENCE JUMPS, WATERMARK CAMERA & OFFLINE HIVE BUFFER */}
        <div className="lg:col-span-7 space-y-5">
          {/* Phase 1 Authentication & Anti-Spoofing Quick Test Guide */}
          {!currentOfficer && (
            <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/40 space-y-2 text-xs">
              <div className="font-bold text-amber-400 flex items-center gap-2">
                <Lock className="w-4 h-4" /> Phase 1 Onboarding &amp; Security Test Scenarios
              </div>
              <p className="text-slate-300">
                The handset on the left is currently on the <strong>Phase 1 Authentication &amp; Anti-Spoofing Gate</strong>. You can test:
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 text-[11px]">
                <li>
                  <strong>Valid Whitelist Login:</strong> Enter PIN <code className="text-amber-300">1234</code> for Kwame Mensah and click Verify.
                </li>
                <li>
                  <strong>3-Strike Brute-Force Lockout:</strong> Enter an incorrect PIN 3 times in a row to trigger an automatic account lockout and fire a <code className="text-red-400">SECURITY_LOCKOUT</code> alert to the Command Dashboard.
                </li>
                <li>
                  <strong>Hardware Device Binding Violation:</strong> Click <em>&quot;Test Rogue Handset ID&quot;</em> to simulate someone logging in with a stolen PIN from an unauthorized phone.
                </li>
                <li>
                  <strong>safe_device Root / Mock GPS Block:</strong> Check <em>&quot;Simulate Root/Jailbreak&quot;</em> or <em>&quot;Simulate Mock GPS App&quot;</em> to verify immediate pre-flight rejection.
                </li>
              </ul>
            </div>
          )}

          {currentOfficer && currentLocation && (
            <>
              {/* 1. Interactive Field Hardware & Telemetry Simulator Controls */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      <Smartphone className="w-5 h-5 text-amber-400" /> Field Telemetry &amp; Geofence Test Bench
                    </h3>
                    <p className="text-xs text-slate-400">
                      Manipulate GPS coordinates, speed, route deviation, and network connectivity in real time.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAuthenticatedOfficerId(null)}
                      className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold"
                    >
                      Test Phase 1 PIN Login Gate
                    </button>
                    <select
                      value={currentOfficer.id}
                      onChange={(e) => setAuthenticatedOfficerId(e.target.value)}
                      className="px-3 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs font-bold text-amber-400"
                    >
                      {Object.values(dbState.officers).map((o) => (
                        <option key={o.id} value={o.id}>
                          Handset: {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Quick Teleport Buttons for 100m Geofence Entry/Exit & 200m Route Deviation */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    One-Click Tactical Location Scenarios (Tests Module D Geofencing &amp; Escort Deviation):
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <button
                      onClick={() =>
                        sentinelSync.updateOfficerLocation(currentOfficer.id, {
                          lat: 5.6212,
                          lng: -0.2223,
                          speed: 2.1,
                        })
                      }
                      className="p-2 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-200 font-semibold text-left"
                    >
                      🏫 Enter Achimota SHS
                      <span className="block text-[10px] text-emerald-400 font-mono">
                        Triggers ENTER_CENTER
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        sentinelSync.updateOfficerLocation(currentOfficer.id, {
                          lat: 5.6235,
                          lng: -0.2248,
                          speed: 19.5,
                        })
                      }
                      className="p-2 rounded bg-sky-950/80 hover:bg-sky-900 border border-sky-600/50 text-sky-200 font-semibold text-left"
                    >
                      🚶 Exit Center Perimeter
                      <span className="block text-[10px] text-sky-400 font-mono">
                        Triggers EXIT_CENTER (&gt;100m)
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        sentinelSync.updateOfficerLocation(currentOfficer.id, {
                          lat: 5.605,
                          lng: -0.245,
                          speed: 45.0,
                          transit_mode: true,
                        })
                      }
                      className="p-2 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 text-amber-200 font-semibold text-left"
                    >
                      ⚠️ Simulate Route Deviation
                      <span className="block text-[10px] text-amber-400 font-mono">
                        &gt;200m off Escort Route
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        sentinelSync.updateOfficerLocation(currentOfficer.id, {
                          is_mock: true,
                        })
                      }
                      className="p-2 rounded bg-red-950/80 hover:bg-red-900 border border-red-600/50 text-red-200 font-semibold text-left"
                    >
                      🕵️ Inject Mock GPS Spoof
                      <span className="block text-[10px] text-red-400 font-mono">
                        Triggers safe_device Flag
                      </span>
                    </button>
                  </div>
                </div>

                {/* Speed & Battery Sliders */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <Navigation className="w-3.5 h-3.5 text-sky-400" /> Ground Speed
                      </span>
                      <span className="font-mono text-amber-400 font-bold">
                        {currentLocation.speed.toFixed(1)} km/h (
                        {currentLocation.speed > 5 ? '1s Sync' : '30s Throttle'})
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={0.5}
                      value={currentLocation.speed}
                      onChange={(e) =>
                        sentinelSync.updateOfficerLocation(currentOfficer.id, {
                          speed: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex justify-between mb-1">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" /> Handset Battery
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {currentLocation.battery}% (&lt;6%/hr target)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={currentLocation.battery}
                      onChange={(e) =>
                        sentinelSync.updateOfficerLocation(currentOfficer.id, {
                          battery: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>

                {/* Module E: Hive NoSQL Offline Local Buffering Toggle */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    {isOffline ? (
                      <WifiOff className="w-5 h-5 text-amber-400" />
                    ) : (
                      <Wifi className="w-5 h-5 text-emerald-400" />
                    )}
                    <div>
                      <div className="font-bold text-slate-200 flex items-center gap-2">
                        <span>Hive NoSQL Offline Resilience Buffer</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-400 font-mono text-[10px]">
                          {offlineQueue.length} Queued Packets
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        When cellular signal drops in remote centers, GPS pings, SOS alerts, and photos queue locally and auto-sync sequentially on reconnect.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={toggleOfflineMode}
                    className={`px-3 py-1.5 rounded font-bold transition ${
                      isOffline
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {isOffline ? 'Restore Network & Auto-Sync' : 'Simulate Network Dropout'}
                  </button>
                </div>
              </div>

              {/* 2. Module E: Watermarked Evidence Capture Studio */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-amber-400" /> Watermarked Evidence Capture (HTML5 / Flutter Canvas Burn-In)
                  </h3>
                  <span className="text-[10px] font-mono text-emerald-400">
                    Firebase Cloud Storage (&lt;800KB JPEG)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Incident Category
                    </label>
                    <select
                      value={evidenceCategory}
                      onChange={(e) =>
                        setEvidenceCategory(e.target.value as IncidentEvidence['category'])
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                    >
                      <option value="MALPRACTICE">Exam Malpractice</option>
                      <option value="SEAL_TAMPERING">Question Packet Seal Tampering</option>
                      <option value="HOSTILITY">Center Hostility / Security Breach</option>
                      <option value="LATE_ARRIVAL">Escort Material Late Arrival</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1 font-semibold">
                      Field Officer Notes
                    </label>
                    <input
                      type="text"
                      value={evidenceNotes}
                      onChange={(e) => setEvidenceNotes(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={() => handleCaptureWatermarkedPhoto()}
                    disabled={isCapturing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold transition"
                  >
                    <Camera className="w-4 h-4" />
                    {isCapturing
                      ? 'Burning Forensic Watermark...'
                      : 'Capture & Burn-In Watermarked Evidence'}
                  </button>

                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer font-semibold">
                    <span>Or Upload Local Photo to Watermark</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleCaptureWatermarkedPhoto(f);
                      }}
                    />
                  </label>
                </div>

                {lastWatermarkedPreview && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
                    <img
                      src={lastWatermarkedPreview}
                      alt="Watermarked Forensic Preview"
                      className="w-full max-h-64 object-contain"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
