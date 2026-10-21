import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertOctagon,
  Navigation,
  Wifi,
  WifiOff,
  Camera,
  MapPin,
  Route,
  Radio,
  Hash,
  Delete,
  LogOut,
  Mic,
  CheckCircle2,
  Clock,
  Download,
  PhoneCall,
  Users,
  Volume2,
  VolumeX,
  UserPlus,
  KeyRound,
  Smartphone,
  Send,
  Activity,
  ClipboardCheck,
  Calendar,
  UserCheck,
  Award,
  ImagePlus,
  FileText,
  Sparkles,
  Pencil,
  Trash2,
  X,
  Save,
  Building2,
  Plus,
  Search,
  Filter,
} from 'lucide-react';
import {
  SentinelDatabaseSchema,
  IncidentEvidence,
  OfficerProfile,
  UserRole,
  WaecOffice,
  ExamCenter,
} from './types/sentinel';
import { sentinelSync } from './services/realtimeSync';
import {
  checkCenterGeofence,
  calculateRouteDeviationMeters,
  calculateRouteProgress,
  calculateDistanceMeters,
} from './services/geofenceEngine';
import { generateWatermarkedEvidenceImage } from './services/watermarkEngine';
import { computePinHash, generateDefaultDeviceId } from './services/authCrypto';
import { sirenEngine } from './services/sirenAndTelegram';

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);
  return null;
}

const officerPinIcon = L.divIcon({
  className: 'custom-officer-marker',
  html: `
    <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
      <span style="position:absolute;inset:-6px;border-radius:9999px;background:rgba(255,215,0,0.4);animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></span>
      <div style="width:30px;height:30px;border-radius:9999px;background:#FFD700;border:3px solid #002147;box-shadow:0 4px 12px rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;color:#002147;font-weight:900;font-size:11px;font-family:monospace;">
        ME
      </div>
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
});

function createOfficeMarkerIcon(office: WaecOffice) {
  const isHead = Boolean(office.is_head_office);
  return L.divIcon({
    className: 'custom-office-marker',
    html: `
      <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <span style="position:absolute;inset:-4px;border-radius:12px;background:${
          isHead ? 'rgba(255,215,0,0.6)' : 'rgba(0,33,71,0.45)'
        };animation:${isHead ? 'pulse 2s infinite' : 'none'};"></span>
        <div style="width:32px;height:32px;border-radius:10px;background:#002147;border:2.5px solid #FFD700;box-shadow:0 4px 14px rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FFD700;font-weight:900;font-size:8px;font-family:Outfit,sans-serif;line-height:1;">
          <span style="font-size:11px;">🏛️</span>
          <span style="letter-spacing:-0.5px;font-weight:900;">${isHead ? 'HQ' : 'WAEC'}</span>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function createFleetMarkerIcon(
  officer: OfficerProfile,
  transitMode: boolean,
  isRealPhoneGps = false
) {
  const isSos = officer.status === 'SOS';
  const isOffline = officer.status === 'OFFLINE' || !officer.on_shift;
  const bg = isSos
    ? '#ef4444'
    : isOffline
    ? '#64748b'
    : isRealPhoneGps
    ? '#10b981'
    : transitMode
    ? '#FFD700'
    : '#0284c7';
  const ring = isSos
    ? 'rgba(239,68,68,0.55)'
    : isRealPhoneGps
    ? 'rgba(16,185,129,0.50)'
    : transitMode
    ? 'rgba(255,215,0,0.40)'
    : 'rgba(2,132,199,0.35)';
  const initials = officer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return L.divIcon({
    className: 'custom-fleet-marker',
    html: `
      <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        ${
          !isOffline
            ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${ring};animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></span>`
            : ''
        }
        <div style="width:32px;height:32px;border-radius:9999px;background:${bg};border:3px solid #002147;box-shadow:0 4px 12px rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:900;font-size:11px;font-family:monospace;position:relative;">
          ${initials}
          ${
            isRealPhoneGps
              ? `<span title="Hardware Phone GPS" style="position:absolute;-top:6px;-right:6px;background:#FFD700;color:#002147;font-size:8px;padding:1px 3px;border-radius:6px;border:1px solid #002147;font-weight:900;line-height:1;">GPS</span>`
              : ''
          }
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

type LoginPortalSection = 'FIELD_MONITOR' | 'HEAD_OF_DEPARTMENT';
type OfficerTab =
  | 'PATROL'
  | 'WORK_RECORDS'
  | 'MAP_CORRIDOR'
  | 'CAMERA_EVIDENCE'
  | 'SOS_EMERGENCY';
type HeadTab =
  | 'HOD_WORK_RECORDS'
  | 'COMMAND_MAP'
  | 'COMMAND_SOS'
  | 'COMMAND_WHITELIST'
  | 'COMMAND_EVIDENCE';

export function App() {
  const [dbState, setDbState] = useState<SentinelDatabaseSchema>(sentinelSync.getState());
  const [authenticatedOfficerId, setAuthenticatedOfficerId] = useState<string | null>(null);

  // 2-Section Login Portal Switcher: Field Monitor vs Head of Department
  const [loginSection, setLoginSection] = useState<LoginPortalSection>('FIELD_MONITOR');
  const [activeTab, setActiveTab] = useState<OfficerTab>('PATROL');
  const [headTab, setHeadTab] = useState<HeadTab>('HOD_WORK_RECORDS');

  // Phone + 4-Digit PIN Login State
  const [loginPhone, setLoginPhone] = useState<string>('+233200000001');
  const [loginPin, setLoginPin] = useState<string>('1234');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Field Monitor Profile Photo Upload State
  const [photoUploadFeedback, setPhotoUploadFeedback] = useState<string | null>(null);

  // Field Monitor Daily Work Record Form State
  const [workDate, setWorkDate] = useState<string>('2026-10-20');
  const [workCheckIn, setWorkCheckIn] = useState<string>('07:10 AM');
  const [workCheckOut, setWorkCheckOut] = useState<string>('02:50 PM');
  const [workPaperCode, setWorkPaperCode] = useState<string>('WASSCE-302-CORE-MATH');
  const [workPouches, setWorkPouches] = useState<number>(12);
  const [workCandidates, setWorkCandidates] = useState<number>(480);
  const [workSummary, setWorkSummary] = useState<string>(
    'Arrived at assigned examination center within 100m geofence. Question paper security pouches inspected and verified intact with Center Supervisor.'
  );
  const [workSaveFeedback, setWorkSaveFeedback] = useState<string | null>(null);

  // Head of Department Daily Work Record Filter & Approval State
  const [hodDateFilter, setHodDateFilter] = useState<string>('ALL');
  const [hodOfficerFilter, setHodOfficerFilter] = useState<string>('ALL');
  const [hodRemarksInput, setHodRemarksInput] = useState<Record<string, string>>({});

  // Hold-for-2-Seconds Visual Panic Button State (Field Monitor)
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const holdIntervalRef = useRef<number | null>(null);
  const [sosFeedback, setSosFeedback] = useState<string | null>(null);
  const [recordingSecLeft, setRecordingSecLeft] = useState<number>(0);
  const recTimerRef = useRef<number | null>(null);

  // Hardware Silent SOS (3x Volume-Down in < 1.5s) State
  const volDownTimestampsRef = useRef<number[]>([]);
  const [volTapCount, setVolTapCount] = useState<number>(0);

  // Watermarked Evidence Camera State
  const [evidenceCategory, setEvidenceCategory] =
    useState<IncidentEvidence['category']>('MALPRACTICE');
  const [evidenceNotes, setEvidenceNotes] = useState<string>(
    'Question paper security packet inspected and verified intact at examination hall entry.'
  );
  const [lastWatermarkedPreview, setLastWatermarkedPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Offline Hive Buffer & Real-Time Phone Geolocation Watch State
  const [isOffline, setIsOffline] = useState<boolean>(sentinelSync.isNetworkOffline());
  const [usingRealBrowserGps, setUsingRealBrowserGps] = useState<boolean>(() => {
    try {
      return localStorage.getItem('waec_real_gps_active') === 'true';
    } catch {
      return false;
    }
  });
  const [gpsPermissionState, setGpsPermissionState] = useState<
    'idle' | 'prompt' | 'granted' | 'denied' | 'unsupported' | 'error'
  >('idle');
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [lastGpsTimestamp, setLastGpsTimestamp] = useState<number | null>(null);
  const gpsWakeLockRef = useRef<any>(null);

  const handleToggleRealGps = () => {
    const next = !usingRealBrowserGps;
    setUsingRealBrowserGps(next);
    try {
      localStorage.setItem('waec_real_gps_active', String(next));
    } catch (_) {}
    if (!next) {
      setGpsPermissionState('idle');
      setGpsErrorMessage(null);
    }
  };

  // Head of Department Dashboard State
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('officer_001');
  const [sirenMuted, setSirenMuted] = useState<boolean>(false);
  const [playingAudioAlertId, setPlayingAudioAlertId] = useState<string | null>(null);

  // Head of Department: New Officer Provisioning Form State
  const [newOfficerName, setNewOfficerName] = useState<string>('');
  const [newOfficerPhone, setNewOfficerPhone] = useState<string>('+23324');
  const [newOfficerPin, setNewOfficerPin] = useState<string>('1234');
  const [newOfficerRole, setNewOfficerRole] = useState<UserRole>('Field Monitoring Officer');
  const [newOfficerOfficeId, setNewOfficerOfficeId] = useState<string>('office_WAEC_ACC');
  const [newOfficerZone, setNewOfficerZone] = useState<string>('Accra — WAEC Head Office, Ghana');
  const [newOfficerCenterId, setNewOfficerCenterId] = useState<string>('');
  const [newOfficerRouteId, setNewOfficerRouteId] = useState<string>('route_ACC_KOF');
  const [provisionFeedback, setProvisionFeedback] = useState<string | null>(null);

  // Head of Department: Edit & Delete Field Monitor State
  const [editingOfficerId, setEditingOfficerId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editPin, setEditPin] = useState<string>('');
  const [editRole, setEditRole] = useState<UserRole>('Field Monitoring Officer');
  const [editOfficeId, setEditOfficeId] = useState<string>('office_WAEC_ACC');
  const [editZone, setEditZone] = useState<string>('');
  const [editCenterId, setEditCenterId] = useState<string>('');
  const [editRouteId, setEditRouteId] = useState<string>('route_ACC_KOF');
  const [editBadgeNo, setEditBadgeNo] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [directoryFeedback, setDirectoryFeedback] = useState<string | null>(null);
  const [mapFocusCoords, setMapFocusCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );

  // Examination Centers Creation Modal State
  const [isAddCenterModalOpen, setIsAddCenterModalOpen] = useState<boolean>(false);
  const [newCenterName, setNewCenterName] = useState<string>('');
  const [newCenterCode, setNewCenterCode] = useState<string>('');
  const [newCenterZone, setNewCenterZone] = useState<string>('Greater Accra');
  const [newCenterLat, setNewCenterLat] = useState<number>(5.6037);
  const [newCenterLng, setNewCenterLng] = useState<number>(-0.187);
  const [newCenterRadius, setNewCenterRadius] = useState<number>(100);
  const [newCenterCandidates, setNewCenterCandidates] = useState<number>(450);
  const [newCenterPaper, setNewCenterPaper] = useState<string>('WASSCE-302-CORE-MATH');
  const [centerModalFeedback, setCenterModalFeedback] = useState<string | null>(null);

  // Examination Centers Search & Regional Filter State (305 Centers Registry)
  const [centerSearchQuery, setCenterSearchQuery] = useState<string>('');
  const [centerRegionFilter, setCenterRegionFilter] = useState<string>('ALL');

  // Centers Registry Derived State (305 Official Exam Centers)
  const allCentersList = useMemo(
    () => Object.values(dbState.centers || {}),
    [dbState.centers]
  );

  const uniqueCenterRegions = useMemo(() => {
    const set = new Set<string>();
    allCentersList.forEach((c) => {
      const match = c.zone?.match(/^(.*?)\s*\(/);
      const reg = match ? match[1].trim() : c.zone?.trim() || 'Other';
      if (reg) set.add(reg);
    });
    return Array.from(set).sort();
  }, [allCentersList]);

  const filteredExamCenters = useMemo(() => {
    const q = centerSearchQuery.trim().toLowerCase();
    return allCentersList.filter((ctr) => {
      const matchesSearch =
        !q ||
        ctr.name.toLowerCase().includes(q) ||
        ctr.code.toLowerCase().includes(q) ||
        ctr.zone.toLowerCase().includes(q);
      const matchesRegion =
        centerRegionFilter === 'ALL' ||
        ctr.zone.toLowerCase().startsWith(centerRegionFilter.toLowerCase());
      return matchesSearch && matchesRegion;
    });
  }, [allCentersList, centerSearchQuery, centerRegionFilter]);

  const centersGroupedByRegion = useMemo(() => {
    const grouped: Record<string, ExamCenter[]> = {};
    allCentersList.forEach((c) => {
      const match = c.zone?.match(/^(.*?)\s*\(/);
      const reg = match ? match[1].trim() : c.zone?.trim() || 'General';
      if (!grouped[reg]) grouped[reg] = [];
      grouped[reg].push(c);
    });
    Object.keys(grouped).forEach((r) => {
      grouped[r].sort((a, b) => a.name.localeCompare(b.name));
    });
    return grouped;
  }, [allCentersList]);

  useEffect(() => {
    const unsubscribe = sentinelSync.subscribe((newState) => {
      setDbState({ ...newState });
    });
    return unsubscribe;
  }, []);

  const currentOfficer = authenticatedOfficerId
    ? dbState.officers[authenticatedOfficerId]
    : null;
  const currentLocation = authenticatedOfficerId
    ? dbState.live_locations[authenticatedOfficerId]
    : null;

  const isHeadOfDepartment = currentOfficer?.role === 'Head of Monitoring Team';

  // Auto-trigger 880Hz Siren on Head of Department Dashboard when an ACTIVE SOS exists
  const activeAlerts = Object.values(dbState.alerts)
    .filter((a) => a.status === 'ACTIVE')
    .sort((a, b) => b.timestamp - a.timestamp);
  const activeEmergencySosCount = activeAlerts.filter(
    (a) => a.type === 'SILENT_SOS' || a.type === 'VISUAL_SOS'
  ).length;

  useEffect(() => {
    if (isHeadOfDepartment && activeEmergencySosCount > 0 && !sirenMuted) {
      sirenEngine.startSiren('EMERGENCY_SOS');
    } else {
      sirenEngine.stopSiren();
    }
    return () => {
      sirenEngine.stopSiren();
    };
  }, [isHeadOfDepartment, activeEmergencySosCount, sirenMuted]);

  // Listen for physical keyboard Volume-Down or "-" key for Silent SOS when logged in as Field Monitor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!authenticatedOfficerId || isHeadOfDepartment) return;
      if (e.key === 'AudioVolumeDown' || e.key === '-') {
        handleHardwareVolumeDownTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Real HTML5 Geolocation API watcher with high-accuracy live tracking
  useEffect(() => {
    if (!usingRealBrowserGps || !authenticatedOfficerId) {
      if (gpsWakeLockRef.current) {
        try {
          gpsWakeLockRef.current.release();
        } catch (_) {}
        gpsWakeLockRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setGpsPermissionState('unsupported');
      setGpsErrorMessage('Hardware GPS is not supported by your phone browser.');
      setUsingRealBrowserGps(false);
      return;
    }

    // Request Screen WakeLock so phone screen standby doesn't throttle or freeze GPS
    if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      (navigator as any).wakeLock
        .request('screen')
        .then((lock: any) => {
          gpsWakeLockRef.current = lock;
        })
        .catch(() => {});
    }

    // Query physical device battery if supported by browser
    let currentBattery = 90;
    if ('getBattery' in navigator && typeof (navigator as any).getBattery === 'function') {
      (navigator as any).getBattery().then((batt: any) => {
        currentBattery = Math.round(batt.level * 100);
      }).catch(() => {});
    }

    setGpsPermissionState('prompt');
    setGpsErrorMessage(null);

    let prevLat: number | null = null;
    let prevLng: number | null = null;
    let prevTime: number | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsPermissionState('granted');
        setGpsErrorMessage(null);
        setGpsAccuracyMeters(Math.round(pos.coords.accuracy));
        setLastGpsTimestamp(Date.now());

        const curLat = pos.coords.latitude;
        const curLng = pos.coords.longitude;
        const curTime = Date.now();

        // Calculate speed (km/h): hardware GPS speed or calculated displacement over time
        let speedKmh = 0;
        if (pos.coords.speed !== null && !isNaN(pos.coords.speed) && pos.coords.speed >= 0) {
          speedKmh = pos.coords.speed * 3.6;
        } else if (prevLat !== null && prevLng !== null && prevTime !== null) {
          const dtHours = (curTime - prevTime) / 3600000;
          if (dtHours > 0) {
            const distKm = calculateDistanceMeters(prevLat, prevLng, curLat, curLng) / 1000;
            speedKmh = Math.min(180, distKm / dtHours);
          }
        }

        prevLat = curLat;
        prevLng = curLng;
        prevTime = curTime;

        sentinelSync.updateOfficerLocation(authenticatedOfficerId, {
          lat: curLat,
          lng: curLng,
          heading: pos.coords.heading || 0,
          speed: Number(speedKmh.toFixed(1)),
          battery: currentBattery,
          is_real_device_gps: true,
          accuracy_meters: Math.round(pos.coords.accuracy),
          is_mock: false,
        });
      },
      (err) => {
        setGpsPermissionState(err.code === 1 ? 'denied' : 'error');
        if (err.code === 1) {
          setGpsErrorMessage(
            'Location permission denied. Please allow location access in your phone/browser settings so your live monitoring info can stream to WAEC Command.'
          );
        } else if (err.code === 2) {
          setGpsErrorMessage(
            'GPS position unavailable. Please ensure your phone Location/GPS is turned ON in quick settings.'
          );
        } else if (err.code === 3) {
          setGpsErrorMessage('GPS signal acquisition timed out. Retrying...');
        } else {
          setGpsErrorMessage(`GPS error: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (gpsWakeLockRef.current) {
        try {
          gpsWakeLockRef.current.release();
        } catch (_) {}
        gpsWakeLockRef.current = null;
      }
    };
  }, [usingRealBrowserGps, authenticatedOfficerId]);

  const livePinHashPreview = computePinHash(loginPhone, loginPin);
  const offlineQueue = sentinelSync.getOfflineQueue();

  const handleSwitchLoginSection = (section: LoginPortalSection) => {
    setLoginSection(section);
    setLoginError(null);
    if (section === 'FIELD_MONITOR') {
      setLoginPhone('+233200000001');
      setLoginPin('1234');
    } else {
      setLoginPhone('+233200000000');
      setLoginPin('0000');
    }
  };

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);

    const matchedOfficer = Object.values(dbState.officers).find(
      (o) => o.phone.replace(/\s+/g, '') === loginPhone.replace(/\s+/g, '')
    );

    if (matchedOfficer) {
      const isOfficerHod = matchedOfficer.role === 'Head of Monitoring Team';
      if (loginSection === 'FIELD_MONITOR' && isOfficerHod) {
        setLoginError(
          'This phone number belongs to the Head of Department. Please switch to the "Sign In as Head of Department" section above.'
        );
        return;
      }
      if (loginSection === 'HEAD_OF_DEPARTMENT' && !isOfficerHod) {
        setLoginError(
          'Access Denied: Field Monitoring Officers cannot sign in to the Head of Department portal. Please use "Sign In as Field Monitor".'
        );
        return;
      }
    }

    const deviceId = matchedOfficer
      ? matchedOfficer.device_integrity.bound_device_id ||
        generateDefaultDeviceId(matchedOfficer.id)
      : 'HW-WAEC-FIELD-HANDSET';

    const res = sentinelSync.authenticateOfficer(loginPhone, loginPin, {
      deviceId,
    });
    if (!res.success || !res.officer) {
      setLoginError(res.error || 'Invalid Phone Number or 4-digit PIN.');
      return;
    }
    setAuthenticatedOfficerId(res.officer.id);
    setLoginPin('');
  };

  const handleProfilePictureUpload = (file: File) => {
    if (!currentOfficer) return;
    const reader = new FileReader();
    reader.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        if (ctx) {
          // Center-crop square officer ID portrait
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 240, 240);
          // Official WAEC Gold bottom ribbon
          ctx.fillStyle = 'rgba(0, 33, 71, 0.85)';
          ctx.fillRect(0, 198, 240, 42);
          ctx.fillStyle = '#FFD700';
          ctx.font = 'bold 13px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('WAEC VERIFIED MONITOR', 120, 224);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          sentinelSync.updateOfficerProfilePicture(currentOfficer.id, dataUrl);
          setPhotoUploadFeedback(
            '✅ Official Profile Picture updated! Now visible on your ID badge & to the Head of Department.'
          );
          setTimeout(() => setPhotoUploadFeedback(null), 6000);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateInstantCameraPortrait = () => {
    if (!currentOfficer) return;
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 240, 240);
    grad.addColorStop(0, '#002147');
    grad.addColorStop(1, '#0C3B78');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 240, 240);

    // Gold halo ring
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(120, 102, 64, 0, Math.PI * 2);
    ctx.stroke();

    // Stylized silhouette + initials
    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(120, 86, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(120, 152, 44, Math.PI, 0, false);
    ctx.fill();

    const initials = currentOfficer.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 44px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials, 120, 114);

    // Official WAEC Gold Verified Banner
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(0, 194, 240, 46);
    ctx.fillStyle = '#002147';
    ctx.font = '900 13px Outfit, sans-serif';
    ctx.fillText(
      `${currentOfficer.staff_badge_no || 'WAEC-FM'} • VERIFIED`,
      120,
      222
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    sentinelSync.updateOfficerProfilePicture(currentOfficer.id, dataUrl);
    setPhotoUploadFeedback(
      '📸 Official WAEC Stamped ID Portrait generated and synced to Head of Department!'
    );
    setTimeout(() => setPhotoUploadFeedback(null), 6000);
  };

  const handleSaveDailyWorkLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOfficer) return;
    sentinelSync.saveDailyWorkRecord({
      officerId: currentOfficer.id,
      date: workDate,
      checkInTime: workCheckIn,
      checkOutTime: workCheckOut,
      paperCode: workPaperCode,
      pouchesVerified: Number(workPouches) || 0,
      candidatesPresent: Number(workCandidates) || 0,
      summaryNotes: workSummary,
    });
    setWorkSaveFeedback(
      `✅ Daily Work Record for ${workDate} saved & transmitted to Head of Department!`
    );
    setTimeout(() => setWorkSaveFeedback(null), 6000);
  };

  const handleKeypadDigit = (digit: string) => {
    if (loginPin.length < 4) {
      const nextPin = loginPin + digit;
      setLoginPin(nextPin);
      setLoginError(null);
    }
  };

  const handleKeypadBackspace = () => {
    setLoginPin((prev) => prev.slice(0, -1));
    setLoginError(null);
  };

  const start15sAudioCountdown = () => {
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

  // Hold-for-2-Seconds Visual Panic Button
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
        start15sAudioCountdown();
        setSosFeedback(
          '🚨 EMERGENCY SOS SENT! Head of Department & Telegram Bot notified + 15s ambient audio recording active.'
        );
        setTimeout(() => setSosFeedback(null), 8000);
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
      start15sAudioCountdown();
      setSosFeedback(
        '🔇 SILENT DURESS SOS DISPATCHED (3x Vol-Down < 1.5s)! 15-second covert microphone recording uploading...'
      );
      setTimeout(() => setSosFeedback(null), 8000);
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

  const handleProvisionOfficer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOfficerName.trim() || !newOfficerPhone.trim() || !/^\d{4}$/.test(newOfficerPin)) {
      return;
    }
    sentinelSync.registerWhitelistedOfficer({
      name: newOfficerName.trim(),
      phone: newOfficerPhone.trim(),
      pin: newOfficerPin,
      role: newOfficerRole,
      officeId: newOfficerOfficeId,
      zone: newOfficerZone,
      centerId: newOfficerCenterId,
      routeId: newOfficerRouteId,
    });
    setProvisionFeedback(
      `Provisioned ${newOfficerName} (${newOfficerRole}) — Phone: ${newOfficerPhone} / PIN: ${newOfficerPin}`
    );
    setNewOfficerName('');
    setTimeout(() => setProvisionFeedback(null), 6000);
  };

  const handleStartEditOfficer = (officer: OfficerProfile) => {
    setEditingOfficerId(officer.id);
    setEditName(officer.name);
    setEditPhone(officer.phone);
    setEditPin(officer.pin_demo);
    setEditRole(officer.role);
    setEditOfficeId(officer.assigned_office_id || 'office_WAEC_ACC');
    setEditZone(officer.assigned_zone);
    setEditCenterId(officer.assigned_center_id);
    setEditRouteId(officer.assigned_route_id);
    setEditBadgeNo(officer.staff_badge_no || '');
    setConfirmDeleteId(null);
    setHeadTab('COMMAND_WHITELIST');
  };

  const handleSaveEditOfficer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOfficerId || !editName.trim() || !editPhone.trim()) return;
    sentinelSync.adminUpdateOfficer({
      officerId: editingOfficerId,
      name: editName.trim(),
      phone: editPhone.trim(),
      pin: editPin,
      role: editRole,
      officeId: editOfficeId,
      zone: editZone.trim(),
      centerId: editCenterId,
      routeId: editRouteId,
      staffBadgeNo: editBadgeNo.trim(),
    });
    setDirectoryFeedback(
      `✅ Updated ${editName} (${editRole}) — Phone: ${editPhone} / PIN: ${editPin}`
    );
    setEditingOfficerId(null);
    setTimeout(() => setDirectoryFeedback(null), 6000);
  };

  const handleCreateExamCenter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCenterName.trim() || !newCenterCode.trim()) return;
    const added = sentinelSync.registerExamCenter({
      code: newCenterCode.trim().toUpperCase(),
      name: newCenterName.trim(),
      zone: newCenterZone.trim(),
      lat: Number(newCenterLat),
      lng: Number(newCenterLng),
      radiusMeters: Number(newCenterRadius) || 100,
      candidatesCount: Number(newCenterCandidates) || 400,
      paperCode: newCenterPaper.trim() || 'WASSCE-302-CORE-MATH',
    });
    setCenterModalFeedback(
      `✅ Registered Examination Center: ${added.name} [${added.code}] with 100m geofence!`
    );
    setNewCenterName('');
    setNewCenterCode('');
    setTimeout(() => {
      setCenterModalFeedback(null);
      setIsAddCenterModalOpen(false);
    }, 2500);
  };

  const handleDeleteOfficer = (officer: OfficerProfile) => {
    if (officer.id === currentOfficer?.id) {
      setDirectoryFeedback('⚠️ You cannot delete your own active Head of Department account.');
      setTimeout(() => setDirectoryFeedback(null), 5000);
      return;
    }
    sentinelSync.adminDeleteOfficer(officer.id);
    setConfirmDeleteId(null);
    if (editingOfficerId === officer.id) {
      setEditingOfficerId(null);
    }
    setDirectoryFeedback(
      `🗑️ Deleted ${officer.name} (${officer.phone}) from the WAEC Monitoring System.`
    );
    setTimeout(() => setDirectoryFeedback(null), 6000);
  };

  // ==========================================================================
  // SCREEN 1: WAEC OFFICIAL 2-SECTION ROLE-BASED SIGN-IN PORTAL
  // ("SIGN IN AS FIELD MONITOR" vs "SIGN IN AS HEAD OF DEPARTMENT")
  // ==========================================================================
  if (!currentOfficer || !currentLocation) {
    const headAccounts = Object.values(dbState.officers).filter(
      (o) => o.role === 'Head of Monitoring Team'
    );
    const fieldMonitorAccounts = Object.values(dbState.officers)
      .filter((o) => o.role !== 'Head of Monitoring Team')
      .slice(0, 6);

    const activeSectionAccounts =
      loginSection === 'FIELD_MONITOR' ? fieldMonitorAccounts : headAccounts;

    return (
      <div className="min-h-screen bg-gradient-to-b from-[#030F26] via-[#002147] to-[#020B1C] text-white flex flex-col justify-center items-center p-4">
        {/* WAEC Official Crest Banner */}
        <div className="w-full max-w-xl mb-4 text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FFD700]/15 border border-[#FFD700]/50 text-[#FFD700] text-xs font-extrabold tracking-widest uppercase shadow-md">
            <Award className="w-4 h-4" /> The West African Examinations Council
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-white">
            WAEC <span className="text-[#FFD700]">SENTINEL</span> OPERATIONS SUITE
          </h1>
          <p className="text-xs sm:text-sm text-blue-200/80 font-medium">
            Examination Security, Real-Time Field Monitoring &amp; Daily Operations Registry
          </p>
        </div>

        {/* Main Official WAEC Navy & Gold Card */}
        <div className="w-full max-w-xl rounded-3xl bg-[#061A3A] border-2 border-[#FFD700]/40 shadow-[0_20px_60px_rgba(0,0,0,0.75)] overflow-hidden">
          {/* 2 DISTINCT ROLE SECTIONS AT TOP OF UI */}
          <div className="grid grid-cols-2 bg-[#030F26] p-2 gap-2 border-b border-[#FFD700]/30">
            <button
              type="button"
              onClick={() => handleSwitchLoginSection('FIELD_MONITOR')}
              className={`py-3.5 px-4 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                loginSection === 'FIELD_MONITOR'
                  ? 'bg-gradient-to-r from-[#FFD700] to-[#F4C430] text-[#002147] shadow-lg scale-[1.01]'
                  : 'bg-[#071B3E]/70 text-blue-200 hover:bg-[#0C2757] border border-blue-900/60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                <span>Sign In as Field Monitor</span>
              </div>
              <span
                className={`text-[10px] font-sans font-semibold ${
                  loginSection === 'FIELD_MONITOR' ? 'text-[#002147]/80' : 'text-blue-300/60'
                }`}
              >
                Field Officers &amp; Paper Escorts
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchLoginSection('HEAD_OF_DEPARTMENT')}
              className={`py-3.5 px-4 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                loginSection === 'HEAD_OF_DEPARTMENT'
                  ? 'bg-gradient-to-r from-[#FFD700] to-[#F4C430] text-[#002147] shadow-lg scale-[1.01]'
                  : 'bg-[#071B3E]/70 text-blue-200 hover:bg-[#0C2757] border border-blue-900/60'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                <span>Sign In as Head of Department</span>
              </div>
              <span
                className={`text-[10px] font-sans font-semibold ${
                  loginSection === 'HEAD_OF_DEPARTMENT'
                    ? 'text-[#002147]/80'
                    : 'text-blue-300/60'
                }`}
              >
                Command Lead &amp; Records Approval
              </span>
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Active Section Header Banner */}
            <div className="p-4 rounded-2xl bg-[#002147] border border-[#FFD700]/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FFD700] text-[#002147] flex items-center justify-center font-display font-black shadow-md shrink-0">
                  {loginSection === 'FIELD_MONITOR' ? (
                    <Shield className="w-6 h-6" />
                  ) : (
                    <Award className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD700] block">
                    {loginSection === 'FIELD_MONITOR'
                      ? 'SECTION 1 • FIELD OPERATIONS PORTAL'
                      : 'SECTION 2 • DEPARTMENT COMMAND PORTAL'}
                  </span>
                  <h2 className="font-display text-lg font-extrabold text-white">
                    {loginSection === 'FIELD_MONITOR'
                      ? 'Field Monitoring Officer Sign-In'
                      : 'Head of Monitoring Department Sign-In'}
                  </h2>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" /> WHITELIST VERIFIED
              </span>
            </div>

            {/* Quick Account Cards for Selected Role Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#FFD700]">
                  {loginSection === 'FIELD_MONITOR'
                    ? 'Select Registered Field Monitor Account:'
                    : 'Select Registered Head of Department Account:'}
                </span>
                <span className="text-[11px] text-blue-200/70">Tap to auto-fill credentials</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {activeSectionAccounts.slice(0, 3).map((acc) => {
                  const isSelected = loginPhone === acc.phone;
                  return (
                    <button
                      type="button"
                      key={acc.id}
                      onClick={() => {
                        setLoginPhone(acc.phone);
                        setLoginPin(acc.pin_demo);
                        setLoginError(null);
                      }}
                      className={`p-2.5 rounded-2xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0C2757] border-[#FFD700] shadow-md'
                          : 'bg-[#030F26]/90 border-blue-900/70 hover:border-[#FFD700]/50'
                      }`}
                    >
                      <img
                        src={acc.avatar_url}
                        alt={acc.name}
                        className="w-10 h-10 rounded-full border-2 border-[#FFD700] object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs text-white truncate">
                          {acc.name}
                        </div>
                        <div className="font-mono text-[10px] text-[#FFD700] truncate">
                          {acc.phone}
                        </div>
                        <div className="font-mono text-[10px] text-blue-200">
                          PIN: <strong>{acc.pin_demo}</strong>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Phone Number Input */}
              <div>
                <label className="block text-xs font-bold text-blue-100 mb-1.5">
                  WAEC Whitelisted Phone Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+233200000001"
                  value={loginPhone}
                  onChange={(e) => {
                    setLoginPhone(e.target.value);
                    setLoginError(null);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono text-sm focus:border-[#FFD700] focus:outline-none"
                />
              </div>

              {/* 4-Digit Security PIN Display */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-blue-100">
                    4-Digit Security PIN
                  </label>
                  <span className="text-[10px] font-mono text-[#FFD700] flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    {loginPin ? `SHA-256: ${livePinHashPreview.slice(0, 12)}...` : 'Encrypted'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((idx) => {
                    const char = loginPin[idx];
                    return (
                      <div
                        key={idx}
                        className={`h-12 rounded-xl border-2 flex items-center justify-center font-mono text-2xl font-black transition ${
                          char
                            ? 'border-[#FFD700] bg-[#FFD700]/15 text-[#FFD700]'
                            : 'border-blue-900 bg-[#030F26] text-blue-700'
                        }`}
                      >
                        {char ? '•' : ''}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2 font-mono">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    type="button"
                    key={digit}
                    onClick={() => handleKeypadDigit(digit)}
                    className="py-2.5 rounded-xl bg-[#030F26] hover:bg-[#0C2757] border border-blue-900/80 text-white font-extrabold text-base active:bg-[#FFD700] active:text-[#002147] transition cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setLoginPin('')}
                  className="py-2.5 rounded-xl bg-[#030F26] hover:bg-[#0C2757] border border-blue-900/80 text-blue-300 text-xs font-bold cursor-pointer"
                >
                  CLEAR
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadDigit('0')}
                  className="py-2.5 rounded-xl bg-[#030F26] hover:bg-[#0C2757] border border-blue-900/80 text-white font-extrabold text-base active:bg-[#FFD700] active:text-[#002147] transition cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="py-2.5 rounded-xl bg-[#030F26] hover:bg-[#0C2757] border border-blue-900/80 text-blue-200 flex items-center justify-center active:bg-[#FFD700] active:text-[#002147] transition cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {loginError && (
                <div className="p-3.5 rounded-xl bg-red-950/90 border border-red-500 text-red-200 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loginPin.length !== 4}
                className={`w-full py-4 rounded-2xl font-display font-black text-sm tracking-wide uppercase transition shadow-xl ${
                  loginPin.length === 4
                    ? 'bg-gradient-to-r from-[#FFD700] to-[#F4C430] hover:brightness-105 text-[#002147] cursor-pointer'
                    : 'bg-blue-950 text-blue-500 cursor-not-allowed'
                }`}
              >
                {loginSection === 'FIELD_MONITOR'
                  ? '🛡️ Sign In as Field Monitor →'
                  : '🏛️ Sign In as Head of Department →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // SCREEN 2A: HEAD OF DEPARTMENT COMMAND & DAILY WORK RECORDS PORTAL
  // ==========================================================================
  if (isHeadOfDepartment) {
    const allOfficers = Object.values(dbState.officers);
    const fieldMonitors = allOfficers.filter(
      (o) => o.role !== 'Head of Monitoring Team'
    );
    const onlineMonitors = fieldMonitors.filter(
      (o) => o.on_shift && o.status !== 'OFFLINE'
    );
    const transitMonitors = fieldMonitors.filter(
      (o) => dbState.live_locations[o.id]?.transit_mode
    );
    const focusedMonitor =
      dbState.officers[selectedMonitorId] || fieldMonitors[0] || currentOfficer;
    const focusedLocation = dbState.live_locations[focusedMonitor.id] || {
      lat: 5.6037,
      lng: -0.187,
      heading: 0,
      speed: 0,
      battery: 90,
      transit_mode: false,
      updated_at: Date.now(),
    };

    const allWorkRecords = Object.values(dbState.daily_work_records || {}).sort(
      (a, b) => b.date.localeCompare(a.date) || b.updated_at - a.updated_at
    );
    const filteredWorkRecords = allWorkRecords.filter((rec) => {
      const matchDate = hodDateFilter === 'ALL' || rec.date === hodDateFilter;
      const matchOfficer =
        hodOfficerFilter === 'ALL' || rec.officer_id === hodOfficerFilter;
      return matchDate && matchOfficer;
    });
    const availableDates = Array.from(new Set(allWorkRecords.map((r) => r.date))).sort(
      (a, b) => b.localeCompare(a)
    );

    const allGeofenceLogs = Object.values(dbState.geofence_logs).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const allIncidents = Object.values(dbState.incidents).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const allAuditLogs = Object.values(dbState.auth_audit_logs || {}).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const allTelegramLogs = Object.values(dbState.telegram_dispatches || {}).sort(
      (a, b) => b.timestamp - a.timestamp
    );

    return (
      <div className="min-h-screen bg-[#030F26] text-white flex flex-col">
        {/* WAEC OFFICIAL NAVY & GOLD HEADER FOR HEAD OF DEPARTMENT */}
        <header className="bg-gradient-to-r from-[#002147] via-[#052958] to-[#002147] border-b-2 border-[#FFD700]/50 px-6 py-4 sticky top-0 z-50 shadow-xl">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src={currentOfficer.avatar_url}
                alt={currentOfficer.name}
                className="w-12 h-12 rounded-full border-2 border-[#FFD700] object-cover shadow-md"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-[#FFD700] text-[#002147]">
                    HEAD OF MONITORING DEPARTMENT
                  </span>
                  <span className="text-xs font-mono text-blue-200">
                    {currentOfficer.staff_badge_no || 'WAEC-HOD-001'}
                  </span>
                </div>
                <h1 className="font-display font-black text-lg sm:text-xl text-white mt-0.5">
                  {currentOfficer.name} — WAEC Monitoring Command
                </h1>
              </div>
            </div>

            {/* Department Summary Pills & Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="px-3.5 py-2 rounded-xl bg-[#030F26] border border-[#FFD700]/30 text-xs font-mono">
                <span className="text-blue-200">Field Monitors: </span>
                <strong className="text-[#FFD700]">
                  {onlineMonitors.length}/{fieldMonitors.length} Active
                </strong>
              </div>

              <div className="px-3.5 py-2 rounded-xl bg-[#030F26] border border-[#FFD700]/30 text-xs font-mono">
                <span className="text-blue-200">Daily Work Logs: </span>
                <strong className="text-emerald-400">{allWorkRecords.length} Filed</strong>
              </div>

              <button
                onClick={() => setHeadTab('COMMAND_SOS')}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                  activeAlerts.length > 0
                    ? 'bg-red-600 text-white border-red-300 animate-pulse'
                    : 'bg-[#030F26] text-blue-200 border-blue-800'
                }`}
              >
                🚨 {activeAlerts.length} SOS Alert{activeAlerts.length === 1 ? '' : 's'}
              </button>

              <button
                onClick={() => setSirenMuted((m) => !m)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  sirenMuted
                    ? 'bg-[#030F26] border-blue-900 text-blue-400'
                    : 'bg-[#FFD700]/15 border-[#FFD700]/50 text-[#FFD700]'
                }`}
              >
                {sirenMuted ? (
                  <>
                    <VolumeX className="w-4 h-4" /> Siren Muted
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" /> 880Hz Siren Ready
                  </>
                )}
              </button>

              <button
                onClick={() => setAuthenticatedOfficerId(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] text-xs font-display font-black shadow-md cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          </div>

          {/* HEAD OF DEPARTMENT NAVIGATION TABS */}
          <div className="max-w-7xl mx-auto flex flex-wrap gap-2 mt-4 pt-3 border-t border-blue-800/80">
            <button
              onClick={() => setHeadTab('HOD_WORK_RECORDS')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                headTab === 'HOD_WORK_RECORDS'
                  ? 'bg-[#FFD700] text-[#002147] shadow-lg'
                  : 'bg-[#030F26] text-blue-200 hover:text-white border border-blue-900'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" /> Everyday Field Work Records (
              {allWorkRecords.length})
            </button>

            <button
              onClick={() => setHeadTab('COMMAND_MAP')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                headTab === 'COMMAND_MAP'
                  ? 'bg-[#FFD700] text-[#002147] shadow-lg'
                  : 'bg-[#030F26] text-blue-200 hover:text-white border border-blue-900'
              }`}
            >
              <Navigation className="w-4 h-4" /> Live Field Monitors Map (
              {fieldMonitors.length})
            </button>

            <button
              onClick={() => setHeadTab('COMMAND_SOS')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                headTab === 'COMMAND_SOS'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'bg-[#030F26] text-blue-200 hover:text-white border border-blue-900'
              }`}
            >
              <AlertOctagon className="w-4 h-4" /> SOS Emergency &amp; Audio Feed (
              {activeAlerts.length})
            </button>

            <button
              onClick={() => setHeadTab('COMMAND_WHITELIST')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                headTab === 'COMMAND_WHITELIST'
                  ? 'bg-[#FFD700] text-[#002147] shadow-lg'
                  : 'bg-[#030F26] text-blue-200 hover:text-white border border-blue-900'
              }`}
            >
              <Users className="w-4 h-4" /> Team Directory &amp; Photos ({allOfficers.length})
            </button>

            <button
              onClick={() => setHeadTab('COMMAND_EVIDENCE')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-display font-extrabold transition cursor-pointer ${
                headTab === 'COMMAND_EVIDENCE'
                  ? 'bg-[#FFD700] text-[#002147] shadow-lg'
                  : 'bg-[#030F26] text-blue-200 hover:text-white border border-blue-900'
              }`}
            >
              <Camera className="w-4 h-4" /> Center Check-Ins &amp; Evidence (
              {allIncidents.length})
            </button>
          </div>
        </header>

        {/* MAIN CONTENT AREA FOR HEAD OF DEPARTMENT */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
          {/* ============================================================== */}
          {/* HOD TAB 1: EVERYDAY WORK RECORDS & FIELD MONITOR LOGBOOK       */}
          {/* ============================================================== */}
          {headTab === 'HOD_WORK_RECORDS' && (
            <div className="space-y-6">
              {/* Top Filter & Overview Bar */}
              <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 flex flex-wrap items-center justify-between gap-4 shadow-xl">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD700] block">
                    WAEC DAILY FIELD OPERATIONS REGISTER
                  </span>
                  <h2 className="font-display text-xl font-black text-white flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-[#FFD700]" /> Field Monitors&apos;
                    Everyday Work Records
                  </h2>
                  <p className="text-xs text-blue-200">
                    Review daily check-in/out times, question paper pouches verified, candidate counts, and approve field monitors&apos; daily logs.
                  </p>
                </div>

                {/* Filters by Date and Field Monitor */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-blue-300 mb-1">
                      Filter by Date
                    </label>
                    <select
                      aria-label="Filter by Date"
                      value={hodDateFilter}
                      onChange={(e) => setHodDateFilter(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-[#030F26] border border-[#FFD700]/40 text-white font-mono font-bold"
                    >
                      <option value="ALL">All Dates ({availableDates.length} Days)</option>
                      {availableDates.map((d) => (
                        <option key={d} value={d}>
                          📅 {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-blue-300 mb-1">
                      Filter by Field Monitor
                    </label>
                    <select
                      aria-label="Filter by Field Monitor"
                      value={hodOfficerFilter}
                      onChange={(e) => setHodOfficerFilter(e.target.value)}
                      className="px-3.5 py-2 rounded-xl bg-[#030F26] border border-[#FFD700]/40 text-white font-bold"
                    >
                      <option value="ALL">All Field Monitors ({fieldMonitors.length})</option>
                      {fieldMonitors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.phone})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Daily Work Record Cards */}
              <div className="grid grid-cols-1 gap-4">
                {filteredWorkRecords.map((rec) => {
                  const liveOfficer = dbState.officers[rec.officer_id];
                  const avatarSrc =
                    liveOfficer?.avatar_url || rec.officer_avatar_url;
                  const isApproved = rec.status === 'APPROVED_BY_HOD';

                  return (
                    <div
                      key={rec.id}
                      className="p-5 rounded-3xl bg-[#071B3E] border border-blue-800/90 hover:border-[#FFD700]/50 transition shadow-lg space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-900/80 pb-3.5">
                        <div className="flex items-center gap-3.5">
                          <img
                            src={avatarSrc}
                            alt={rec.officer_name}
                            className="w-14 h-14 rounded-2xl border-2 border-[#FFD700] object-cover shadow-md"
                          />
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display font-black text-base text-white">
                                {rec.officer_name}
                              </span>
                              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#002147] border border-[#FFD700]/40 text-[#FFD700] font-bold">
                                {rec.officer_role}
                              </span>
                              <span className="text-xs font-mono text-blue-300">
                                {rec.officer_phone}
                              </span>
                            </div>
                            <div className="text-xs text-blue-200 mt-0.5 flex flex-wrap items-center gap-3 font-mono">
                              <span className="flex items-center gap-1 text-[#FFD700] font-bold">
                                <Calendar className="w-3.5 h-3.5" /> Date: {rec.date}
                              </span>
                              <span>
                                🏫 Center: <strong>{rec.center_code}</strong> ({rec.center_name})
                              </span>
                              <span>
                                📄 Paper: <strong>{rec.paper_code}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full font-mono text-xs font-extrabold ${
                              isApproved
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                                : 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/50'
                            }`}
                          >
                            {isApproved
                              ? '✓ APPROVED BY HEAD OF DEPT'
                              : '⏳ PENDING HOD APPROVAL'}
                          </span>
                        </div>
                      </div>

                      {/* Daily Shift Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                        <div className="p-3 rounded-2xl bg-[#030F26] border border-blue-900/70">
                          <span className="text-[10px] text-blue-300 block">
                            SHIFT CHECK-IN
                          </span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {rec.check_in_time}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#030F26] border border-blue-900/70">
                          <span className="text-[10px] text-blue-300 block">
                            SHIFT SIGN-OUT
                          </span>
                          <span className="text-[#FFD700] font-bold text-sm">
                            {rec.check_out_time}
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#030F26] border border-blue-900/70">
                          <span className="text-[10px] text-blue-300 block">
                            POUCHES VERIFIED
                          </span>
                          <span className="text-white font-bold text-sm">
                            {rec.pouches_verified} Pouches
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#030F26] border border-blue-900/70">
                          <span className="text-[10px] text-blue-300 block">
                            CANDIDATES PRESENT
                          </span>
                          <span className="text-white font-bold text-sm">
                            {rec.candidates_present} Candidates
                          </span>
                        </div>
                        <div className="p-3 rounded-2xl bg-[#030F26] border border-blue-900/70">
                          <span className="text-[10px] text-blue-300 block">
                            100m GEOFENCE
                          </span>
                          <span className="text-emerald-400 font-bold text-sm">
                            {rec.geofence_verified ? 'VERIFIED (<100m)' : 'LOGGED'}
                          </span>
                        </div>
                      </div>

                      {/* Officer's Daily Summary Report */}
                      <div className="p-3.5 rounded-2xl bg-[#030F26]/90 border border-blue-900/60 text-xs space-y-1">
                        <div className="font-bold text-[#FFD700] uppercase text-[10px] font-mono">
                          Field Monitor&apos;s Daily Shift Report:
                        </div>
                        <p className="text-blue-100 leading-relaxed">{rec.summary_notes}</p>
                      </div>

                      {/* Head of Department Approval & Remarks Bar */}
                      {isApproved ? (
                        <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-bold text-emerald-300">
                              HOD Remarks ({rec.approved_by}):{' '}
                            </span>
                            <span className="text-emerald-100">{rec.hod_remarks}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="Add Head of Department remarks (optional)..."
                            value={hodRemarksInput[rec.id] || ''}
                            onChange={(e) =>
                              setHodRemarksInput((prev) => ({
                                ...prev,
                                [rec.id]: e.target.value,
                              }))
                            }
                            className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl bg-[#030F26] border border-blue-800 text-xs text-white"
                          />
                          <button
                            onClick={() =>
                              sentinelSync.approveDailyWorkRecord(
                                rec.id,
                                currentOfficer.name,
                                hodRemarksInput[rec.id] ||
                                  'Verified and approved by Head of Department.'
                              )
                            }
                            className="px-4 py-2.5 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black text-xs cursor-pointer shadow-md"
                          >
                            ✓ Approve Daily Work Record
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* HOD TAB 2: LIVE FIELD MONITORS MAP & ROSTER                    */}
          {/* ============================================================== */}
          {headTab === 'COMMAND_MAP' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-3xl overflow-hidden border-2 border-[#FFD700]/40 bg-[#071B3E] shadow-2xl h-[500px] relative">
                  <MapContainer
                    center={[
                      mapFocusCoords ? mapFocusCoords.lat : focusedLocation.lat,
                      mapFocusCoords ? mapFocusCoords.lng : focusedLocation.lng,
                    ]}
                    zoom={7}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapRecenter
                      lat={mapFocusCoords ? mapFocusCoords.lat : focusedLocation.lat}
                      lng={mapFocusCoords ? mapFocusCoords.lng : focusedLocation.lng}
                    />

                    {/* 10 OFFICIAL WAEC REGIONAL OFFICES & HEAD OFFICE MARKERS */}
                    {dbState.waec_offices &&
                      Object.values(dbState.waec_offices).map((office) => (
                        <Marker
                          key={office.id}
                          position={[office.lat, office.lng]}
                          icon={createOfficeMarkerIcon(office)}
                        >
                          <Popup>
                            <div className="text-xs font-sans space-y-1.5 min-w-[220px]">
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-[#FFD700] text-[#002147] font-extrabold text-[10px]">
                                  {office.is_head_office ? 'WAEC HEAD OFFICE (GHANA)' : 'WAEC REGIONAL OFFICE'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">
                                  {office.code}
                                </span>
                              </div>
                              <strong className="text-[#002147] block text-sm font-display font-extrabold">
                                {office.name}
                              </strong>
                              <div className="text-slate-600 text-[11px]">{office.description}</div>
                              <div className="font-mono text-[10px] text-blue-900 bg-blue-50 p-1.5 rounded border border-blue-200 break-all">
                                WKT: {office.wkt}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Region: <strong>{office.region}</strong> | Coords: {office.lat.toFixed(6)},{' '}
                                {office.lng.toFixed(6)}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      ))}

                    {/* EXAMINATION CENTERS WITH 100M CIRCULAR GEOFENCES (KEPT SEPARATE) */}
                    {filteredExamCenters.map((center) => (
                      <React.Fragment key={center.id}>
                        <Circle
                          center={[center.lat, center.lng]}
                          radius={center.radius_meters}
                          pathOptions={{
                            color: '#FFD700',
                            fillColor: '#002147',
                            fillOpacity: 0.3,
                            weight: 2,
                          }}
                        />
                        <Marker position={[center.lat, center.lng]}>
                          <Popup>
                            <div className="text-xs font-sans space-y-1">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-800 font-bold text-[10px]">
                                EXAM CENTER
                              </span>
                              <strong className="text-[#002147] block">
                                {center.code}: {center.name}
                              </strong>
                              <div className="text-slate-600 text-[11px] font-semibold">{center.zone}</div>
                              {center.wkt && (
                                <div className="font-mono text-[10px] text-slate-600">
                                  WKT: {center.wkt}
                                </div>
                              )}
                              <div>
                                Geofence Radius: {center.radius_meters}m | Candidates:{' '}
                                {center.candidates_count}
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      </React.Fragment>
                    ))}

                    {Object.values(dbState.routes).map((route) => (
                      <Polyline
                        key={route.id}
                        positions={route.waypoints}
                        pathOptions={{
                          color: '#FFD700',
                          weight: 4,
                          dashArray: '8, 6',
                        }}
                      />
                    ))}

                    {fieldMonitors.map((monitor) => {
                      const loc = dbState.live_locations[monitor.id];
                      if (!loc) return null;
                      const trail = dbState.location_trails?.[monitor.id] || [];
                      return (
                        <React.Fragment key={monitor.id}>
                          {trail.length > 1 && (
                            <Polyline
                              positions={trail}
                              pathOptions={{
                                color:
                                  monitor.status === 'SOS' ? '#ef4444' : '#10b981',
                                weight: 3,
                                opacity: 0.65,
                              }}
                            />
                          )}
                          <Marker
                            position={[loc.lat, loc.lng]}
                            icon={createFleetMarkerIcon(monitor, loc.transit_mode, !!loc.is_real_device_gps)}
                            eventHandlers={{
                              click: () => setSelectedMonitorId(monitor.id),
                            }}
                          >
                            <Popup>
                              <div className="text-xs font-sans space-y-1">
                                <div className="font-bold text-slate-900 flex items-center justify-between gap-1">
                                  <span>{monitor.name}</span>
                                  {loc.is_real_device_gps && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-mono font-bold">
                                      📱 PHONE GPS
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-600 text-[11px]">{monitor.role} • {monitor.phone}</div>
                                <div className="font-mono text-[10px] text-blue-900 bg-blue-50 p-1 rounded border border-blue-200">
                                  Coords: {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                                  {loc.accuracy_meters ? ` (±${loc.accuracy_meters}m)` : ''}
                                </div>
                                <div className="text-[11px]">
                                  Speed: <strong>{loc.speed.toFixed(1)} km/h</strong> | Battery:{' '}
                                  <strong>{loc.battery}%</strong>
                                </div>
                                {monitor.assigned_center_id && dbState.centers[monitor.assigned_center_id] && (
                                  <div className="text-[10px] text-slate-700 pt-1 border-t border-slate-200">
                                    Target Center: <strong>{dbState.centers[monitor.assigned_center_id].name}</strong> ({dbState.centers[monitor.assigned_center_id].code})
                                  </div>
                                )}
                              </div>
                            </Popup>
                          </Marker>
                        </React.Fragment>
                      );
                    })}
                  </MapContainer>
                </div>

                {/* Command Simulation Bar */}
                <div className="p-4 rounded-2xl bg-[#071B3E] border border-[#FFD700]/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#FFD700] flex items-center gap-1.5">
                    <Activity className="w-4 h-4" /> Department Drill Controls:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        sentinelSync.triggerAlert({
                          officerId: focusedMonitor.id,
                          type: 'SILENT_SOS',
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-red-600/25 border border-red-500/50 text-red-200 font-bold cursor-pointer"
                    >
                      🚨 Simulate Silent SOS ({focusedMonitor.name.split(' ')[0]})
                    </button>
                    <button
                      onClick={() => sentinelSync.stepFleetStressSimulation(0)}
                      className="px-3 py-1.5 rounded-xl bg-[#FFD700]/20 border border-[#FFD700]/50 text-[#FFD700] font-bold cursor-pointer"
                    >
                      📡 Step Live Fleet GPS Tick
                    </button>
                  </div>
                </div>

                {/* 10 OFFICIAL WAEC REGIONAL OFFICES & DEPOTS NETWORK */}
                <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/40 space-y-3 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD700] block">
                        OFFICIAL WAEC REGIONAL OFFICES &amp; DEPOTS (10 WKT GEOLOCATIONS)
                      </span>
                      <h3 className="font-display font-black text-base text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#FFD700]" /> WAEC Regional Branch Offices &amp; Depots
                      </h3>
                      <p className="text-[11px] text-blue-200">
                        Official administrative offices and depot centers across Ghana&apos;s regions (kept strictly separate from exam centers).
                      </p>
                    </div>
                    <span className="text-xs font-mono text-blue-200">
                      Selected Monitor:{' '}
                      <strong className="text-[#FFD700]">{focusedMonitor.name}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[290px] overflow-y-auto pr-1">
                    {dbState.waec_offices &&
                      Object.values(dbState.waec_offices).map((off) => {
                        const assignedOfficersCount = fieldMonitors.filter(
                          (m) => m.assigned_office_id === off.id
                        ).length;
                        return (
                          <div
                            key={off.id}
                            className={`p-3 rounded-2xl bg-[#030F26] border transition text-xs space-y-2 ${
                              off.is_head_office
                                ? 'border-[#FFD700]/60 bg-gradient-to-br from-[#061A3A] to-[#030F26]'
                                : 'border-blue-900 hover:border-[#FFD700]/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span
                                  className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded ${
                                    off.is_head_office
                                      ? 'bg-[#FFD700] text-[#002147] font-extrabold'
                                      : 'bg-[#002147] text-[#FFD700] border border-[#FFD700]/40'
                                  }`}
                                >
                                  {off.code}
                                </span>
                                <div className="font-display font-bold text-white mt-1">
                                  {off.name}
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                                {assignedOfficersCount} Base Monitor{assignedOfficersCount === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="font-mono text-[10px] text-blue-300 truncate">
                              {off.wkt}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setMapFocusCoords({ lat: off.lat, lng: off.lng })
                                }
                                className="px-2.5 py-1 rounded-xl bg-[#071B3E] hover:bg-[#0C2757] border border-blue-800 text-blue-200 font-bold text-[11px] cursor-pointer"
                              >
                                🔍 Focus on Map
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  sentinelSync.assignOfficerOffice(focusedMonitor.id, off.id);
                                  setMapFocusCoords({ lat: off.lat, lng: off.lng });
                                }}
                                className="px-2.5 py-1 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black text-[11px] cursor-pointer"
                              >
                                🏢 Assign Base to {focusedMonitor.name.split(' ')[0]}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* EXAMINATION CENTERS HUB (KEPT STRICTLY SEPARATE) */}
                <div className="p-5 rounded-3xl bg-[#071B3E] border border-blue-800/80 space-y-3.5 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD700] block">
                        EXAMINATION CENTERS REGISTRY (KEPT SEPARATE FROM OFFICES)
                      </span>
                      <h3 className="font-display font-black text-base text-white flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#FFD700]" /> Examination Centers &amp; Geofences ({allCentersList.length})
                      </h3>
                      <p className="text-[11px] text-blue-200">
                        Official Ghana High Schools &amp; Technical Institutes deployed with 100m geofencing.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddCenterModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black text-xs cursor-pointer shadow-md transition"
                    >
                      <Plus className="w-4 h-4" /> Add Examination Center
                    </button>
                  </div>

                  {/* Instant Search & Regional Filter Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                    <div className="sm:col-span-7 relative">
                      <Search className="w-4 h-4 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search 305 examination centers (e.g. Achimota, Kumasi, Accra Academy)..."
                        value={centerSearchQuery}
                        onChange={(e) => setCenterSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white placeholder-blue-300 text-xs focus:outline-none focus:border-[#FFD700]"
                      />
                      {centerSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCenterSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="sm:col-span-5 relative">
                      <Filter className="w-4 h-4 text-[#FFD700] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        aria-label="Filter Centers by Region"
                        value={centerRegionFilter}
                        onChange={(e) => setCenterRegionFilter(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white text-xs font-bold focus:outline-none focus:border-[#FFD700]"
                      >
                        <option value="ALL">All Ghana Regions ({allCentersList.length})</option>
                        {uniqueCenterRegions.map((reg) => {
                          const countInReg = allCentersList.filter((c) =>
                            c.zone.toLowerCase().startsWith(reg.toLowerCase())
                          ).length;
                          return (
                            <option key={reg} value={reg}>
                              {reg} ({countInReg})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-blue-200 px-0.5">
                    <span>
                      Showing <strong className="text-[#FFD700] font-mono">{filteredExamCenters.length}</strong> of{' '}
                      <strong className="text-white font-mono">{allCentersList.length}</strong> Centers
                      {centerRegionFilter !== 'ALL' && (
                        <span className="ml-1 text-slate-300 font-semibold">in {centerRegionFilter}</span>
                      )}
                    </span>
                    {(centerSearchQuery || centerRegionFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setCenterSearchQuery('');
                          setCenterRegionFilter('ALL');
                        }}
                        className="text-[#FFD700] hover:underline text-[10px] font-bold cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>

                  {allCentersList.length === 0 ? (
                    <div className="p-5 rounded-2xl bg-[#030F26] border-2 border-dashed border-[#FFD700]/30 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-[#FFD700]/15 text-[#FFD700] flex items-center justify-center mx-auto">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="font-display font-bold text-white text-sm">
                        0 Examination Centers Loaded (Awaiting Centers Data)
                      </div>
                      <p className="text-xs text-blue-200 max-w-md mx-auto leading-relaxed">
                        WAEC Offices and branch depots are kept strictly separate above.
                      </p>
                    </div>
                  ) : filteredExamCenters.length === 0 ? (
                    <div className="p-6 rounded-2xl bg-[#030F26] border border-blue-900 text-center space-y-2">
                      <div className="text-amber-400 font-bold text-xs">
                        No examination centers match your search &quot;{centerSearchQuery}&quot; {centerRegionFilter !== 'ALL' ? `in ${centerRegionFilter}` : ''}
                      </div>
                      <p className="text-[11px] text-blue-200">
                        Try modifying your search term or select another region filter.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCenterSearchQuery('');
                          setCenterRegionFilter('ALL');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-[#071B3E] hover:bg-[#0C2757] border border-[#FFD700]/50 text-[#FFD700] text-xs font-bold cursor-pointer inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> Clear Filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                      {filteredExamCenters.map((ctr) => {
                        const assignedCount = fieldMonitors.filter(
                          (m) => m.assigned_center_id === ctr.id
                        ).length;
                        return (
                          <div
                            key={ctr.id}
                            className="p-3 rounded-2xl bg-[#030F26] border border-blue-900 hover:border-[#FFD700]/50 transition text-xs space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-[#FFD700] text-[#002147]">
                                  {ctr.code}
                                </span>
                                <div className="font-display font-bold text-white mt-1 leading-snug">
                                  {ctr.name}
                                </div>
                                <div className="text-[11px] text-blue-200 font-medium">
                                  {ctr.zone}
                                </div>
                              </div>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${assignedCount > 0 ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'bg-blue-900/40 text-blue-300'}`}>
                                {assignedCount} Monitor{assignedCount === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between font-mono text-[10px] text-blue-300 bg-[#071B3E] px-2 py-1 rounded-lg">
                              <span>Candidates: <strong className="text-white">{ctr.candidates_count}</strong></span>
                              <span>Radius: <strong className="text-[#FFD700]">{ctr.radius_meters}m</strong></span>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setMapFocusCoords({ lat: ctr.lat, lng: ctr.lng })
                                }
                                className="px-2.5 py-1 rounded-xl bg-[#071B3E] hover:bg-[#0C2757] border border-blue-800 text-blue-200 font-bold text-[11px] cursor-pointer flex-1 text-center"
                              >
                                🔍 View on Map
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  sentinelSync.deployMonitorToExamCenter(
                                    focusedMonitor.id,
                                    ctr.id
                                  );
                                  setMapFocusCoords({ lat: ctr.lat, lng: ctr.lng });
                                }}
                                className="px-2.5 py-1 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black text-[11px] cursor-pointer flex-1 text-center"
                              >
                                📍 Deploy {focusedMonitor.name.split(' ')[0]}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Field Monitors Live Roster with Profile Pictures */}
              <div className="space-y-4">
                <div className="p-4 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-3">
                  <h2 className="font-display font-extrabold text-sm text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#FFD700]" /> Field Monitors Live Roster (
                    {fieldMonitors.length})
                  </h2>

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {fieldMonitors.map((monitor) => {
                      const loc = dbState.live_locations[monitor.id];
                      const center = dbState.centers[monitor.assigned_center_id];
                      const isSelected = monitor.id === focusedMonitor.id;
                      return (
                        <button
                          key={monitor.id}
                          onClick={() => setSelectedMonitorId(monitor.id)}
                          className={`w-full p-3 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
                            isSelected
                              ? 'bg-[#0C2757] border-[#FFD700] shadow-md'
                              : 'bg-[#030F26] border-blue-900 hover:border-[#FFD700]/50'
                          }`}
                        >
                          <img
                            src={monitor.avatar_url}
                            alt={monitor.name}
                            className="w-12 h-12 rounded-full border-2 border-[#FFD700] object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-display font-extrabold text-xs text-white truncate">
                                {monitor.name}
                              </span>
                              <span
                                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  monitor.status === 'SOS'
                                    ? 'bg-red-600 text-white animate-pulse'
                                    : monitor.on_shift && monitor.status === 'ONLINE'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {monitor.status}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-blue-200 truncate">
                              {monitor.phone} • {center?.code || 'GH-042'}
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-[#FFD700] mt-1">
                              <span>🚗 {loc ? `${loc.speed.toFixed(1)} km/h` : '0 km/h'}</span>
                              <span>🔋 {loc ? `${loc.battery}%` : '100%'}</span>
                            </div>
                            {loc?.is_real_device_gps && (
                              <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-300 font-bold mt-1 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                <span>STREAMING LIVE PHONE GPS {loc.accuracy_meters ? `(±${loc.accuracy_meters}m)` : ''}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-blue-900/60">
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditOfficer(monitor);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FFD700]/20 hover:bg-[#FFD700] text-[#FFD700] hover:text-[#002147] text-[10px] font-bold transition"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(monitor.id);
                                  setHeadTab('COMMAND_WHITELIST');
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-[10px] font-bold transition"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* HOD TAB 3: SOS EMERGENCY & AUDIO FEED                          */}
          {/* ============================================================== */}
          {headTab === 'COMMAND_SOS' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-black text-white flex items-center gap-2">
                        <AlertOctagon className="w-5 h-5 text-red-400" /> Field SOS &amp;
                        Emergency Alert Queue
                      </h2>
                      <p className="text-xs text-blue-200">
                        Real-time 3x Volume-Down Silent SOS, 2s Hold Visual Panic, and Route Deviations
                      </p>
                    </div>
                    <button
                      onClick={() => sirenEngine.playTestChime('EMERGENCY_SOS', 1800)}
                      className="px-3.5 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-red-200 text-xs font-bold cursor-pointer"
                    >
                      🔊 Test 880Hz Siren
                    </button>
                  </div>

                  {Object.values(dbState.alerts).length === 0 ? (
                    <div className="p-8 rounded-2xl bg-[#030F26] border border-blue-900 text-center text-xs text-blue-300">
                      No emergency SOS or route deviation alerts recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.values(dbState.alerts)
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((alert) => (
                          <div
                            key={alert.id}
                            className={`p-4 rounded-2xl border space-y-2.5 ${
                              alert.status === 'ACTIVE'
                                ? 'bg-red-950/50 border-red-500'
                                : 'bg-[#030F26] border-blue-900'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded font-mono text-[10px] font-black bg-red-600 text-white">
                                  {alert.type}
                                </span>
                                <span className="font-display font-extrabold text-sm text-white">
                                  {alert.officer_name}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono text-blue-200">
                                {new Date(alert.timestamp).toLocaleTimeString()} •{' '}
                                <strong className="text-[#FFD700]">{alert.status}</strong>
                              </span>
                            </div>

                            <p className="text-xs text-white">{alert.message}</p>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-900 text-xs">
                              <span className="font-mono text-[11px] text-blue-200">
                                📍 {alert.lat.toFixed(5)}, {alert.lng.toFixed(5)} • 🔋{' '}
                                {alert.battery}%
                              </span>

                              <div className="flex flex-wrap items-center gap-2">
                                {alert.audio_url && (
                                  <button
                                    onClick={() => {
                                      setPlayingAudioAlertId(alert.id);
                                      sirenEngine.playSimulatedAmbientClip(3500);
                                      setTimeout(() => setPlayingAudioAlertId(null), 3500);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFD700]/20 border border-[#FFD700]/50 text-[#FFD700] font-bold cursor-pointer"
                                  >
                                    <Mic className="w-3.5 h-3.5" />
                                    {playingAudioAlertId === alert.id
                                      ? 'Playing 15s Audio...'
                                      : 'Play 15s Covert Audio'}
                                  </button>
                                )}

                                {alert.status !== 'RESOLVED' && (
                                  <button
                                    onClick={() =>
                                      sentinelSync.updateAlertStatus(alert.id, 'RESOLVED')
                                    }
                                    className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-extrabold cursor-pointer"
                                  >
                                    Resolve Alert
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-3">
                <h3 className="font-display font-extrabold text-sm text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#FFD700]" /> Telegram Bot Dispatches
                </h3>
                {allTelegramLogs.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#030F26] border border-blue-900 text-xs text-blue-300 text-center">
                    No Telegram dispatches triggered yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto">
                    {allTelegramLogs.map((tg) => (
                      <div
                        key={tg.id}
                        className="p-3 rounded-2xl bg-[#030F26] border border-blue-900 text-xs space-y-1"
                      >
                        <div className="font-bold text-[#FFD700]">{tg.officer_name}</div>
                        <pre className="text-[10px] font-mono text-blue-200 whitespace-pre-wrap">
                          {tg.markdown_payload}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* HOD TAB 4: TEAM WHITELIST & OFFICER PHOTOS DIRECTORY           */}
          {/* ============================================================== */}
          {headTab === 'COMMAND_WHITELIST' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-4">
                <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#FFD700]" /> Provision New Team Member
                </h2>
                <form onSubmit={handleProvisionOfficer} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nana Yaw Mensah"
                      value={newOfficerName}
                      onChange={(e) => setNewOfficerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-blue-100 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        required
                        value={newOfficerPhone}
                        onChange={(e) => setNewOfficerPhone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-blue-100 mb-1">
                        4-Digit PIN
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={newOfficerPin}
                        onChange={(e) =>
                          setNewOfficerPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-[#FFD700] font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Role</label>
                    <select
                      aria-label="Role"
                      value={newOfficerRole}
                      onChange={(e) => setNewOfficerRole(e.target.value as UserRole)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-bold"
                    >
                      <option value="Field Monitoring Officer">
                        Field Monitoring Officer
                      </option>
                      <option value="Paper Escort Lead">Paper Escort Lead</option>
                      <option value="Head of Monitoring Team">
                        Head of Monitoring Team (HOD)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Reporting WAEC Regional Base (10 Official Offices)
                    </label>
                    <select
                      aria-label="Assign Reporting WAEC Office"
                      value={newOfficerOfficeId}
                      onChange={(e) => {
                        setNewOfficerOfficeId(e.target.value);
                        const off = dbState.waec_offices?.[e.target.value];
                        if (off) setNewOfficerZone(off.name);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-[#FFD700] font-bold"
                    >
                      {Object.values(dbState.waec_offices || {}).map((off) => (
                        <option key={off.id} value={off.id}>
                          {off.name} ({off.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Assigned Examination Center (Optional / Pending)
                    </label>
                    <select
                      aria-label="Deploy to Examination Center"
                      value={newOfficerCenterId}
                      onChange={(e) => {
                        const ctr = dbState.centers[e.target.value];
                        setNewOfficerCenterId(e.target.value);
                        if (ctr) setNewOfficerZone(ctr.zone);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-bold text-xs"
                    >
                      <option value="">-- Select Exam Center ({allCentersList.length} Available) --</option>
                      {Object.entries(centersGroupedByRegion)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([region, centersInRegion]) => (
                          <optgroup key={region} label={`${region} (${centersInRegion.length})`}>
                            {centersInRegion.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} — {c.code}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </select>
                  </div>

                  {provisionFeedback && (
                    <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-500 text-emerald-200 text-[11px]">
                      {provisionFeedback}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black transition cursor-pointer"
                  >
                    + Add to WAEC Whitelist
                  </button>
                </form>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                      <KeyRound className="w-5 h-5 text-[#FFD700]" /> Registered Monitoring
                      Personnel — Edit &amp; Delete ({allOfficers.length})
                    </h2>
                    <span className="text-[11px] text-blue-200">
                      Click <strong className="text-[#FFD700]">Edit</strong> to modify details or{' '}
                      <strong className="text-red-400">Delete</strong> to remove from system
                    </span>
                  </div>

                  {directoryFeedback && (
                    <div className="p-3 rounded-2xl bg-emerald-950/90 border border-emerald-400 text-emerald-200 text-xs font-bold flex items-center justify-between">
                      <span>{directoryFeedback}</span>
                      <button
                        onClick={() => setDirectoryFeedback(null)}
                        className="text-emerald-300 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* INLINE EDIT FIELD MONITOR FORM MODAL/DRAWER */}
                  {editingOfficerId && (
                    <form
                      onSubmit={handleSaveEditOfficer}
                      className="p-4 rounded-2xl bg-[#030F26] border-2 border-[#FFD700] space-y-3 text-xs shadow-2xl"
                    >
                      <div className="flex items-center justify-between border-b border-blue-900 pb-2">
                        <span className="font-display font-black text-sm text-[#FFD700] flex items-center gap-1.5">
                          <Pencil className="w-4 h-4" /> Editing Field Monitor Profile (
                          {editName})
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingOfficerId(null)}
                          className="p-1 rounded-lg bg-[#071B3E] text-blue-200 hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            Full Name
                          </label>
                          <input
                            type="text"
                            required
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-white font-bold"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            required
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            4-Digit Security PIN
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={4}
                            value={editPin}
                            onChange={(e) =>
                              setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                            }
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-[#FFD700] font-mono font-bold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            Role
                          </label>
                          <select
                            aria-label="Edit Role"
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as UserRole)}
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-white font-bold"
                          >
                            <option value="Field Monitoring Officer">
                              Field Monitoring Officer
                            </option>
                            <option value="Paper Escort Lead">Paper Escort Lead</option>
                            <option value="Head of Monitoring Team">
                              Head of Monitoring Team (HOD)
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            Reporting WAEC Base
                          </label>
                          <select
                            aria-label="Edit Reporting WAEC Base"
                            value={editOfficeId}
                            onChange={(e) => {
                              setEditOfficeId(e.target.value);
                              const off = dbState.waec_offices?.[e.target.value];
                              if (off) setEditZone(off.name);
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-[#FFD700] font-bold"
                          >
                            {Object.values(dbState.waec_offices || {}).map((off) => (
                              <option key={off.id} value={off.id}>
                                {off.name} ({off.code})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            Assigned Exam Center
                          </label>
                          <select
                            aria-label="Edit Assigned Center"
                            value={editCenterId}
                            onChange={(e) => {
                              setEditCenterId(e.target.value);
                              const ctr = dbState.centers[e.target.value];
                              if (ctr) setEditZone(ctr.zone);
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-white text-xs font-bold"
                          >
                            <option value="">-- Select Exam Center ({allCentersList.length} Available) --</option>
                            {Object.entries(centersGroupedByRegion)
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([region, centersInRegion]) => (
                                <optgroup key={region} label={`${region} (${centersInRegion.length})`}>
                                  {centersInRegion.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} — {c.code}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-blue-200 mb-1">
                            Assigned Zone / Notes
                          </label>
                          <input
                            type="text"
                            value={editZone}
                            onChange={(e) => setEditZone(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-[#071B3E] border border-blue-700 text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setEditingOfficerId(null)}
                          className="px-4 py-2 rounded-xl bg-[#071B3E] border border-blue-800 text-blue-200 font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black cursor-pointer shadow-lg"
                        >
                          <Save className="w-3.5 h-3.5" /> Save Updated Monitor
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {allOfficers.map((o) => {
                      const assignedCtr = dbState.centers[o.assigned_center_id];
                      const isConfirmingDelete = confirmDeleteId === o.id;
                      return (
                        <div
                          key={o.id}
                          className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs transition ${
                            editingOfficerId === o.id
                              ? 'bg-[#0C2757] border-[#FFD700]'
                              : 'bg-[#030F26] border-blue-900'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={o.avatar_url}
                              alt={o.name}
                              className="w-12 h-12 rounded-full border-2 border-[#FFD700] object-cover"
                            />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display font-extrabold text-white text-sm">
                                  {o.name}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#071B3E] text-[#FFD700] border border-[#FFD700]/40 font-bold">
                                  {o.role}
                                </span>
                                {!o.whitelisted && (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-600 text-white font-bold">
                                    SUSPENDED
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-blue-200 mt-0.5">
                                Phone: <strong>{o.phone}</strong> • PIN:{' '}
                                <strong className="text-[#FFD700]">{o.pin_demo}</strong>
                                {o.assigned_office_id && dbState.waec_offices?.[o.assigned_office_id] && (
                                  <> • Base: <strong className="text-white">{dbState.waec_offices[o.assigned_office_id].name.split('—')[0]}</strong></>
                                )}
                                • Center: <strong className="text-[#FFD700]">{assignedCtr ? assignedCtr.code : 'Awaiting List'}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Edit Field Monitor Button */}
                            <button
                              type="button"
                              onClick={() => handleStartEditOfficer(o)}
                              className="px-3 py-1.5 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black inline-flex items-center gap-1 cursor-pointer shadow"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>

                            {/* Suspend / Restore Whitelist */}
                            <button
                              type="button"
                              onClick={() =>
                                sentinelSync.adminToggleOfficerWhitelist(
                                  o.id,
                                  !o.whitelisted
                                )
                              }
                              className={`px-3 py-1.5 rounded-xl font-bold border cursor-pointer ${
                                o.whitelisted
                                  ? 'bg-amber-950/50 border-amber-500/40 text-amber-300'
                                  : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                              }`}
                            >
                              {o.whitelisted ? 'Suspend' : 'Restore'}
                            </button>

                            {/* Unbind Handset */}
                            <button
                              type="button"
                              onClick={() => sentinelSync.adminUnbindOfficerDevice(o.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-[#071B3E] border border-blue-800 text-blue-200 font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Smartphone className="w-3.5 h-3.5" /> Unbind
                            </button>

                            {/* Delete Field Monitor Button with Inline Confirmation */}
                            {o.id !== currentOfficer.id && (
                              <>
                                {isConfirmingDelete ? (
                                  <div className="inline-flex items-center gap-1.5 bg-red-950 border border-red-500 px-2.5 py-1 rounded-xl">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteOfficer(o)}
                                      className="px-2 py-0.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display font-black text-[11px] cursor-pointer"
                                    >
                                      Confirm Delete
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="text-blue-200 hover:text-white text-[11px] font-bold px-1 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(o.id)}
                                    className="px-3 py-1.5 rounded-xl bg-red-600/25 hover:bg-red-600 border border-red-500/50 text-red-200 hover:text-white font-display font-extrabold inline-flex items-center gap-1 cursor-pointer transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-2">
                  <h3 className="text-xs font-display font-extrabold uppercase tracking-wider text-[#FFD700]">
                    Recent Authentication Audit Trail
                  </h3>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto text-[11px] font-mono">
                    {allAuditLogs.slice(0, 6).map((log) => (
                      <div
                        key={log.id}
                        className="p-2 rounded-xl bg-[#030F26] border border-blue-900 flex items-center justify-between gap-2"
                      >
                        <span className="text-blue-100 truncate">
                          <strong className="text-[#FFD700]">[{log.event_type}]</strong>{' '}
                          {log.officer_name}: {log.details}
                        </span>
                        <span className="text-blue-400 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* HOD TAB 5: CENTER CHECK-INS & WATERMARKED EVIDENCE VAULT       */}
          {/* ============================================================== */}
          {headTab === 'COMMAND_EVIDENCE' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-3">
                <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#FFD700]" /> Automated 100m Exam Center
                  Check-In Log
                </h2>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {allGeofenceLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-2xl bg-[#030F26] border border-blue-900 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded mr-2 bg-emerald-500/20 text-emerald-300">
                          {log.event_type}
                        </span>
                        <strong className="text-white">{log.officer_name}</strong>
                        <div className="text-blue-200 text-[11px] mt-1">
                          {log.center_name} ({log.distance_meters}m from center)
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-[#FFD700]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-5 rounded-3xl bg-[#071B3E] border border-[#FFD700]/30 space-y-3">
                <h2 className="font-display text-base font-extrabold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-[#FFD700]" /> Watermarked Field Evidence
                  Vault ({allIncidents.length})
                </h2>
                {allIncidents.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-[#030F26] border border-blue-900 text-center text-xs text-blue-300">
                    No watermarked evidence photos submitted by Field Monitors yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {allIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        className="p-3.5 rounded-2xl bg-[#030F26] border border-blue-900 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#FFD700] font-mono">
                            [{inc.category}] • {inc.center_code}
                          </span>
                          <span className="font-mono text-[11px] text-blue-200">
                            By {inc.officer_name}
                          </span>
                        </div>
                        <img
                          src={inc.watermarked_image_data_url}
                          alt={inc.category}
                          className="w-full rounded-xl border border-blue-800"
                        />
                        <p className="text-blue-100">{inc.notes}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* MODAL: ADD EXAMINATION CENTER (HEAD OF DEPARTMENT ONLY) */}
        {isAddCenterModalOpen && (
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-3xl bg-[#061A3A] border-2 border-[#FFD700] p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-blue-900 pb-3">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#FFD700]">
                    WAEC CENTERS REGISTRY
                  </span>
                  <h3 className="font-display font-black text-lg text-white flex items-center gap-2">
                    <Plus className="w-5 h-5 text-[#FFD700]" /> Add Examination Center
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddCenterModalOpen(false)}
                  className="p-1.5 rounded-xl bg-[#030F26] text-blue-200 hover:text-white border border-blue-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-blue-200 leading-relaxed">
                Register an official WAEC Examination Center with automated 100m circular geofencing for Field Monitor deployments.
              </p>

              <form onSubmit={handleCreateExamCenter} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Center Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Achimota Senior High School"
                      value={newCenterName}
                      onChange={(e) => setNewCenterName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Center Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. GH-042"
                      value={newCenterCode}
                      onChange={(e) => setNewCenterCode(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-[#FFD700] font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Region / Zone</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Greater Accra"
                      value={newCenterZone}
                      onChange={(e) => setNewCenterZone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newCenterLat}
                      onChange={(e) => setNewCenterLat(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newCenterLng}
                      onChange={(e) => setNewCenterLng(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Geofence Radius (m)</label>
                    <input
                      type="number"
                      value={newCenterRadius}
                      onChange={(e) => setNewCenterRadius(parseInt(e.target.value) || 100)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-emerald-300 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Candidates Count</label>
                    <input
                      type="number"
                      value={newCenterCandidates}
                      onChange={(e) => setNewCenterCandidates(parseInt(e.target.value) || 400)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">Subject / Paper</label>
                    <input
                      type="text"
                      value={newCenterPaper}
                      onChange={(e) => setNewCenterPaper(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono"
                    />
                  </div>
                </div>

                {centerModalFeedback && (
                  <div className="p-3 rounded-xl bg-emerald-950 border border-emerald-400 text-emerald-200 text-xs font-bold text-center">
                    {centerModalFeedback}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-blue-900">
                  <button
                    type="button"
                    onClick={() => setIsAddCenterModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#071B3E] hover:bg-[#0C2757] border border-blue-800 text-blue-200 font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black cursor-pointer shadow-lg"
                  >
                    ✓ Save Examination Center
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================================================
  // SCREEN 2B: AUTHENTICATED FIELD MONITORING OFFICER MOBILE APP
  // (WITH PROFILE PICTURE UPLOAD & EVERYDAY WORK RECORDS LOGBOOK)
  // ==========================================================================
  const assignedOffice =
    (currentOfficer.assigned_office_id && dbState.waec_offices?.[currentOfficer.assigned_office_id]) ||
    (dbState.waec_offices ? Object.values(dbState.waec_offices)[0] : null);
  const assignedCenter =
    (currentOfficer.assigned_center_id && dbState.centers[currentOfficer.assigned_center_id]) ||
    (Object.keys(dbState.centers).length > 0 ? Object.values(dbState.centers)[0] : undefined);
  const assignedRoute = dbState.routes[currentOfficer.assigned_route_id];

  const geofenceStatus = checkCenterGeofence(
    currentLocation.lat,
    currentLocation.lng,
    dbState.centers
  );
  const routeDeviation = assignedRoute
    ? calculateRouteDeviationMeters(
        currentLocation.lat,
        currentLocation.lng,
        assignedRoute
      )
    : 0;
  const routeProgress = assignedRoute
    ? calculateRouteProgress(currentLocation.lat, currentLocation.lng, assignedRoute)
    : { totalLengthKm: 0, progressPct: 0, distanceToDestinationMeters: 0 };

  const officerGeofenceLogs = Object.values(dbState.geofence_logs)
    .filter((l) => l.officer_id === currentOfficer.id)
    .sort((a, b) => b.timestamp - a.timestamp);

  const officerIncidents = Object.values(dbState.incidents)
    .filter((inc) => inc.officer_id === currentOfficer.id)
    .sort((a, b) => b.timestamp - a.timestamp);

  const myDailyWorkRecords = Object.values(dbState.daily_work_records || {})
    .filter((r) => r.officer_id === currentOfficer.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updated_at - a.updated_at);

  return (
    <div className="min-h-screen bg-[#030F26] text-white flex flex-col max-w-lg mx-auto border-x border-[#FFD700]/25 shadow-2xl">
      {/* OFFICIAL WAEC NAVY & GOLD TOP HANDSET HEADER */}
      <header className="bg-gradient-to-r from-[#002147] via-[#07295A] to-[#002147] border-b-2 border-[#FFD700]/50 px-4 py-3.5 sticky top-0 z-50 space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between text-[11px] font-mono text-blue-200">
          <span className="flex items-center gap-1.5 text-[#FFD700] font-bold">
            <span
              className={`w-2 h-2 rounded-full ${
                isOffline
                  ? 'bg-amber-400'
                  : currentOfficer.on_shift
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-slate-500'
              }`}
            />
            {isOffline
              ? `OFFLINE HIVE (${offlineQueue.length} QUEUED)`
              : currentLocation.speed > 5
              ? 'WAEC GPS: 1.0s ACTIVE'
              : 'WAEC GPS: 30s SAVER'}
          </span>
          <span className="text-[#FFD700] font-bold">
            {currentLocation.battery}% 🔋
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={currentOfficer.avatar_url}
              alt={currentOfficer.name}
              className="w-12 h-12 rounded-full border-2 border-[#FFD700] object-cover shrink-0 shadow-md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-display font-black text-base text-white truncate">
                  {currentOfficer.name}
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FFD700] text-[#002147] font-extrabold shrink-0">
                  FIELD MONITOR
                </span>
              </div>
              <p className="text-xs text-blue-200 font-mono truncate">
                {currentOfficer.phone} • {assignedOffice ? assignedOffice.name.split('—')[0].trim() : 'WAEC Ghana'}{assignedCenter ? ` • ${assignedCenter.code}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={() => setAuthenticatedOfficerId(null)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] text-xs font-display font-black shrink-0 cursor-pointer shadow"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </header>

      {/* ACTIVE SOS FEEDBACK BANNER */}
      {(sosFeedback || recordingSecLeft > 0) && (
        <div className="bg-red-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2 animate-pulse">
          <span>
            {sosFeedback ||
              `🎙️ Recording 15s Covert Ambient Audio (${recordingSecLeft}s remaining)...`}
          </span>
        </div>
      )}

      {/* MAIN FIELD OFFICER CONTENT AREA */}
      <main className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        {/* ================================================================ */}
        {/* TAB 1: OFFICER PROFILE PICTURE CARD, SHIFT & GPS PATROL          */}
        {/* ================================================================ */}
        {activeTab === 'PATROL' && (
          <>
            {/* OFFICIAL WAEC FIELD MONITOR PROFILE PICTURE & DIGITAL ID SECTION */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-[#071B3E] via-[#002147] to-[#04122C] border-2 border-[#FFD700]/45 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-[#FFD700] flex items-center gap-1.5">
                  <Award className="w-4 h-4" /> Official WAEC Field Monitor Digital ID
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold">
                  {currentOfficer.staff_badge_no || 'WAEC-FM-101'}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <img
                    src={currentOfficer.avatar_url}
                    alt={currentOfficer.name}
                    className="w-20 h-20 rounded-2xl border-2 border-[#FFD700] object-cover shadow-lg"
                  />
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#FFD700] text-[#002147] flex items-center justify-center shadow">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                </div>

                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="font-display font-black text-base text-white truncate">
                    {currentOfficer.name}
                  </div>
                  <div className="text-xs text-blue-200 font-mono space-y-0.5">
                    <div>
                      Base: <strong className="text-white">{assignedOffice ? assignedOffice.name : currentOfficer.assigned_zone}</strong>
                    </div>
                    <div>
                      Exam Center:{' '}
                      {assignedCenter ? (
                        <>
                          <strong className="text-[#FFD700]">{assignedCenter.code}</strong> ({assignedCenter.name})
                        </>
                      ) : (
                        <span className="text-amber-300 font-bold">Awaiting Centers List</span>
                      )}
                    </div>
                  </div>

                  {/* Upload / Capture Profile Picture Buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-extrabold text-xs cursor-pointer shadow">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Upload My Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleProfilePictureUpload(file);
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleGenerateInstantCameraPortrait}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#030F26] hover:bg-[#0C2757] border border-[#FFD700]/40 text-[#FFD700] font-bold text-xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Stamp ID Portrait
                    </button>
                  </div>
                </div>
              </div>

              {photoUploadFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-950/90 border border-emerald-400 text-emerald-200 text-xs font-medium">
                  {photoUploadFeedback}
                </div>
              )}
            </div>

            {/* PROMINENT REAL-TIME PHONE LOCATION SWITCH CARD */}
            <div
              className={`p-4 rounded-3xl border-2 transition-all shadow-xl space-y-3.5 ${
                usingRealBrowserGps
                  ? 'bg-gradient-to-br from-[#012820] via-[#002147] to-[#04122C] border-emerald-400/90 ring-2 ring-emerald-500/20'
                  : 'bg-gradient-to-br from-[#071B3E] via-[#04122C] to-[#002147] border-[#FFD700]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shadow-md shrink-0 transition-colors ${
                      usingRealBrowserGps
                        ? 'bg-emerald-500 text-[#002147]'
                        : 'bg-[#FFD700] text-[#002147]'
                    }`}
                  >
                    <Navigation
                      className={`w-6 h-6 ${usingRealBrowserGps ? 'animate-pulse' : ''}`}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-extrabold uppercase tracking-widest text-[#FFD700] block">
                      MONITOR LIVE POSITION
                    </span>
                    <h3 className="font-display font-black text-base text-white leading-tight">
                      Real-Time Phone GPS
                    </h3>
                    <p className="text-[11px] text-blue-200">
                      {usingRealBrowserGps
                        ? 'Broadcasting live device coordinates to Head of Dept'
                        : 'Switch ON to stream live GPS from your phone'}
                    </p>
                  </div>
                </div>

                {/* Primary High-Impact Toggle Switch */}
                <button
                  type="button"
                  onClick={handleToggleRealGps}
                  className={`px-4 py-2.5 rounded-2xl font-display font-black text-xs cursor-pointer shadow-lg transition-all shrink-0 flex items-center gap-2 ${
                    usingRealBrowserGps
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-[#002147] ring-2 ring-emerald-300/50'
                      : 'bg-[#FFD700] hover:bg-[#F4C430] text-[#002147]'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      usingRealBrowserGps ? 'bg-red-600 animate-ping' : 'bg-[#002147]'
                    }`}
                  />
                  <span>{usingRealBrowserGps ? 'Location: ACTIVE' : 'Switch Location ON'}</span>
                </button>
              </div>

              {/* Live Streaming Diagnostics when ON */}
              {usingRealBrowserGps ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-xs bg-[#030F26] p-2.5 rounded-xl border border-emerald-500/40">
                    <span className="flex items-center gap-2 text-emerald-300 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                      Live GPS Stream Active (High Accuracy Mode)
                    </span>
                    {gpsAccuracyMeters !== null && (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold shrink-0">
                        ±{gpsAccuracyMeters}m Accuracy
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900">
                      <span className="text-[10px] text-blue-300 block">CURRENT PHONE COORDS</span>
                      <span className="text-white font-bold">
                        {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900">
                      <span className="text-[10px] text-blue-300 block">SPEED &amp; STATUS</span>
                      <span className="text-[#FFD700] font-bold">
                        {currentLocation.speed > 2
                          ? `${currentLocation.speed.toFixed(1)} km/h (Moving)`
                          : 'Stationary (0.0 km/h)'}
                      </span>
                    </div>
                  </div>

                  {assignedCenter && (
                    <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900 flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] font-mono text-blue-300 block">
                          ASSIGNED EXAMINATION CENTER
                        </span>
                        <span className="font-bold text-white truncate block">
                          {assignedCenter.name} ({assignedCenter.code})
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        {calculateDistanceMeters(
                          currentLocation.lat,
                          currentLocation.lng,
                          assignedCenter.lat,
                          assignedCenter.lng
                        ) <= assignedCenter.radius_meters ? (
                          <span className="font-mono font-bold text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Inside Center (100m)
                          </span>
                        ) : (
                          <span className="font-mono font-bold text-[11px] text-[#FFD700]">
                            {Math.round(
                              calculateDistanceMeters(
                                currentLocation.lat,
                                currentLocation.lng,
                                assignedCenter.lat,
                                assignedCenter.lng
                              )
                            )}{' '}
                            meters away
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-[#030F26] border border-blue-900 text-xs text-blue-200 space-y-1">
                  <p className="leading-relaxed">
                    Tap <strong className="text-[#FFD700]">&quot;Switch Location ON&quot;</strong> above. The app will read your phone&apos;s real-time GPS hardware, stream your live position directly to the Head of Monitoring Team, and automatically log your arrival when you enter the 100m perimeter of your assigned examination center.
                  </p>
                </div>
              )}

              {/* Location Permission / Error Alert with Retry */}
              {gpsErrorMessage && (
                <div className="p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-200 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block text-red-100 font-bold">Location Access Notice:</strong>
                      <span>{gpsErrorMessage}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setGpsErrorMessage(null);
                        handleToggleRealGps();
                      }}
                      className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] cursor-pointer"
                    >
                      Retry GPS Access
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Shift Privacy & Escort Mode Toggles */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() =>
                  sentinelSync.toggleOfficerShift(
                    currentOfficer.id,
                    !currentOfficer.on_shift
                  )
                }
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  currentOfficer.on_shift
                    ? 'bg-[#071B3E] border-emerald-400/70 text-emerald-200'
                    : 'bg-[#071B3E]/60 border-blue-900 text-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Radio className="w-5 h-5 text-emerald-400" />
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[#030F26]">
                    {currentOfficer.on_shift ? 'ACTIVE' : 'PAUSED'}
                  </span>
                </div>
                <div className="font-display font-extrabold text-sm text-white mt-2">
                  Shift GPS Tracking
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {currentOfficer.on_shift
                    ? 'Streaming live to Head of Dept'
                    : 'Paused off-shift'}
                </div>
              </button>

              <button
                onClick={() =>
                  sentinelSync.updateOfficerLocation(currentOfficer.id, {
                    transit_mode: !currentLocation.transit_mode,
                  })
                }
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  currentLocation.transit_mode
                    ? 'bg-[#071B3E] border-[#FFD700] text-[#FFD700]'
                    : 'bg-[#071B3E]/60 border-blue-900 text-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Route className="w-5 h-5 text-[#FFD700]" />
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-[#030F26]">
                    {currentLocation.transit_mode ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="font-display font-extrabold text-sm text-white mt-2">
                  Paper Escort Mode
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {currentLocation.transit_mode
                    ? '200m route corridor active'
                    : 'Tap when escorting papers'}
                </div>
              </button>
            </div>

            {/* Automated 100m Exam Center Check-In Status Card */}
            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                geofenceStatus.insideCenter
                  ? 'bg-emerald-950/50 border-emerald-400/70'
                  : 'bg-[#071B3E] border-blue-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#FFD700] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Automated 100m Center Geofence
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    geofenceStatus.insideCenter
                      ? 'bg-emerald-400 text-[#002147]'
                      : 'bg-[#030F26] text-blue-200'
                  }`}
                >
                  {geofenceStatus.insideCenter ? 'CHECKED IN (<100m)' : 'IN TRANSIT'}
                </span>
              </div>

              <div className="font-display text-base font-extrabold text-white">
                {geofenceStatus.insideCenter
                  ? geofenceStatus.insideCenter.name
                  : assignedCenter
                  ? assignedCenter.name
                  : `Reporting Base: ${assignedOffice ? assignedOffice.name : 'WAEC Regional Depot'}`}
              </div>

              {assignedCenter?.wkt ? (
                <div className="text-[11px] font-mono text-[#FFD700]">
                  WKT: {assignedCenter.wkt}
                </div>
              ) : assignedOffice?.wkt ? (
                <div className="text-[11px] font-mono text-[#FFD700]">
                  Base WKT: {assignedOffice.wkt}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-blue-200">
                <span>
                  {assignedCenter ? (
                    <>Distance: <strong className="text-white">{geofenceStatus.nearestDistance}m</strong> (Radius: 100m)</>
                  ) : (
                    <>Base Station: <strong className="text-[#FFD700]">{assignedOffice?.code || 'WAEC'}</strong> (Active Base)</>
                  )}
                </span>
                <span>
                  Bearing: <strong className="text-[#FFD700]">{geofenceStatus.bearingToNearest}° N</strong>
                </span>
              </div>

              {/* Reporting WAEC Regional Base Selector */}
              <div className="pt-1">
                <label className="block text-[10px] font-mono uppercase text-blue-300 mb-1">
                  Reporting WAEC Regional Base (10 Official Depots):
                </label>
                <select
                  aria-label="Select Reporting WAEC Regional Base"
                  value={currentOfficer.assigned_office_id || ''}
                  onChange={(e) =>
                    sentinelSync.assignOfficerOffice(
                      currentOfficer.id,
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-[#FFD700]/50 text-white text-xs font-bold"
                >
                  {Object.values(dbState.waec_offices || {}).map((off) => (
                    <option key={off.id} value={off.id}>
                      {off.name} ({off.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Deployed Examination Center Selector */}
              <div className="pt-1">
                <label className="block text-[10px] font-mono uppercase text-blue-300 mb-1">
                  Deployed Examination Center (100m Geofence):
                </label>
                {Object.keys(dbState.centers).length === 0 ? (
                  <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900 text-[11px] text-blue-200 flex items-center justify-between">
                    <span>Awaiting examination centers list upload</span>
                    <span className="text-[10px] font-mono text-[#FFD700] bg-[#071B3E] px-2 py-0.5 rounded border border-[#FFD700]/30 font-bold">
                      PENDING
                    </span>
                  </div>
                ) : (
                  <select
                    aria-label="Select Deployed WAEC Examination Center"
                    value={currentOfficer.assigned_center_id}
                    onChange={(e) =>
                      sentinelSync.deployMonitorToExamCenter(
                        currentOfficer.id,
                        e.target.value
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-[#FFD700]/50 text-white text-xs font-bold"
                  >
                    <option value="">-- Select Exam Center ({allCentersList.length} Available) --</option>
                    {Object.entries(centersGroupedByRegion)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([region, centersInRegion]) => (
                        <optgroup key={region} label={`${region} (${centersInRegion.length})`}>
                          {centersInRegion.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {c.code}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => {
                    if (assignedCenter) {
                      sentinelSync.updateOfficerLocation(currentOfficer.id, {
                        lat: assignedCenter.lat,
                        lng: assignedCenter.lng,
                        speed: 1.2,
                      });
                    } else if (assignedOffice) {
                      sentinelSync.updateOfficerLocation(currentOfficer.id, {
                        lat: assignedOffice.lat,
                        lng: assignedOffice.lng,
                        speed: 1.2,
                      });
                    }
                  }}
                  className="py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-bold cursor-pointer"
                >
                  {assignedCenter ? '📍 Arrive at Exam Center' : '🏢 Arrive at WAEC Base'}
                </button>
                <button
                  onClick={() => {
                    const baseLat = assignedCenter ? assignedCenter.lat : (assignedOffice?.lat || currentLocation.lat);
                    const baseLng = assignedCenter ? assignedCenter.lng : (assignedOffice?.lng || currentLocation.lng);
                    sentinelSync.updateOfficerLocation(currentOfficer.id, {
                      lat: baseLat + 0.003,
                      lng: baseLng - 0.003,
                      speed: 28.5,
                    });
                  }}
                  className="py-2 px-3 rounded-xl bg-[#FFD700]/20 hover:bg-[#FFD700]/30 border border-[#FFD700]/50 text-[#FFD700] text-xs font-bold cursor-pointer"
                >
                  🚗 Depart Perimeter (&gt;100m)
                </button>
              </div>
            </div>

            {/* Live GPS Telemetry & Offline Hive Toggle */}
            <div className="p-4 rounded-2xl bg-[#071B3E] border border-blue-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-white flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-[#FFD700]" /> Handset GPS Telemetry
                </span>
                <button
                  type="button"
                  onClick={handleToggleRealGps}
                  className={`px-3 py-1 rounded-xl font-mono text-[10px] font-bold border cursor-pointer transition ${
                    usingRealBrowserGps
                      ? 'bg-emerald-500 text-[#002147] border-emerald-400'
                      : 'bg-[#030F26] text-blue-200 border-blue-800'
                  }`}
                >
                  {usingRealBrowserGps ? 'Phone GPS: ACTIVE' : 'Switch Phone GPS'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900">
                  <span className="text-[10px] text-blue-300 block">LAT / LNG</span>
                  <span className="text-white">
                    {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900">
                  <span className="text-[10px] text-blue-300 block">SPEED</span>
                  <span className="text-[#FFD700] font-bold">
                    {currentLocation.speed.toFixed(1)} km/h
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900">
                  <span className="text-[10px] text-blue-300 block">SYNC RATE</span>
                  <span className="text-emerald-400 font-bold">
                    {currentLocation.speed > 5 ? 'Every 1.0s' : 'Every 30s'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-blue-200 px-1 font-mono">
                <span>
                  Source:{' '}
                  <strong className={usingRealBrowserGps ? 'text-emerald-300' : 'text-blue-300'}>
                    {usingRealBrowserGps ? 'Physical Phone GPS Hardware' : 'Terminal Simulation Mode'}
                  </strong>
                </span>
                {usingRealBrowserGps && gpsAccuracyMeters !== null && (
                  <span className="text-[#FFD700] font-bold">Accuracy: ±{gpsAccuracyMeters}m</span>
                )}
              </div>

              <div className="pt-2 border-t border-blue-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isOffline ? (
                    <WifiOff className="w-4 h-4 text-[#FFD700]" />
                  ) : (
                    <Wifi className="w-4 h-4 text-emerald-400" />
                  )}
                  <div>
                    <div className="font-bold text-white">
                      Offline Hive Queue ({offlineQueue.length} cached)
                    </div>
                    <div className="text-[10px] text-blue-200">
                      Buffers GPS &amp; evidence when network drops
                    </div>
                  </div>
                </div>
                <button
                  onClick={toggleOfflineMode}
                  className={`px-3 py-1.5 rounded-xl font-mono text-[10px] font-bold border cursor-pointer ${
                    isOffline
                      ? 'bg-[#FFD700] text-[#002147] border-[#FFD700]'
                      : 'bg-[#030F26] text-blue-200 border-blue-800'
                  }`}
                >
                  {isOffline ? 'Reconnect & Sync' : 'Simulate Offline'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ================================================================ */}
        {/* TAB 2: FIELD MONITOR'S EVERYDAY WORK RECORDS LOGBOOK             */}
        {/* ================================================================ */}
        {activeTab === 'WORK_RECORDS' && (
          <div className="space-y-4">
            {/* Submit Today's Work Record Form */}
            <div className="p-4 rounded-3xl bg-[#071B3E] border-2 border-[#FFD700]/45 space-y-3 text-xs shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-black text-base text-white flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-[#FFD700]" /> Log Daily Work
                  Record
                </h2>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#FFD700]/20 text-[#FFD700] font-bold">
                  Syncs to HOD
                </span>
              </div>
              <p className="text-blue-200 text-[11px]">
                Record your daily examination monitoring attendance, question paper pouches verified, and summary notes for the Head of Department.
              </p>

              <form onSubmit={handleSaveDailyWorkLog} className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Work Date
                    </label>
                    <input
                      type="date"
                      required
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Examination Paper Code
                    </label>
                    <input
                      type="text"
                      required
                      value={workPaperCode}
                      onChange={(e) => setWorkPaperCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-[#FFD700] font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Check-In Time
                    </label>
                    <input
                      type="text"
                      required
                      value={workCheckIn}
                      onChange={(e) => setWorkCheckIn(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-emerald-400 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Sign-Out Time
                    </label>
                    <input
                      type="text"
                      required
                      value={workCheckOut}
                      onChange={(e) => setWorkCheckOut(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-[#FFD700] font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Question Pouches Verified
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={workPouches}
                      onChange={(e) => setWorkPouches(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-blue-100 mb-1">
                      Candidates Supervised
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={workCandidates}
                      onChange={(e) =>
                        setWorkCandidates(parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#030F26] border border-blue-800 text-white font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-blue-100 mb-1">
                    Daily Field Summary &amp; Handover Report
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={workSummary}
                    onChange={(e) => setWorkSummary(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-[#030F26] border border-blue-800 text-white text-xs"
                  />
                </div>

                {workSaveFeedback && (
                  <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-400 text-emerald-200 text-xs font-bold">
                    {workSaveFeedback}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FFD700] to-[#F4C430] text-[#002147] font-display font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer"
                >
                  Save &amp; Submit Daily Work Record to HOD
                </button>
              </form>
            </div>

            {/* My Everyday Work Records History */}
            <div className="p-4 rounded-3xl bg-[#071B3E] border border-blue-800 space-y-3">
              <h3 className="font-display font-extrabold text-sm text-[#FFD700] flex items-center gap-2">
                <FileText className="w-4 h-4" /> My Everyday Work Records (
                {myDailyWorkRecords.length} Days Logged)
              </h3>

              <div className="space-y-2.5">
                {myDailyWorkRecords.map((rec) => {
                  const isApproved = rec.status === 'APPROVED_BY_HOD';
                  return (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-2xl bg-[#030F26] border border-blue-900 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-extrabold text-[#FFD700]">
                          📅 {rec.date} • {rec.center_code}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              : 'bg-[#FFD700]/20 text-[#FFD700]'
                          }`}
                        >
                          {isApproved ? '✓ HOD APPROVED' : 'SUBMITTED'}
                        </span>
                      </div>

                      <div className="font-mono text-[11px] text-blue-200">
                        In: <strong>{rec.check_in_time}</strong> • Out:{' '}
                        <strong>{rec.check_out_time}</strong> • Pouches:{' '}
                        <strong>{rec.pouches_verified}</strong> • Candidates:{' '}
                        <strong>{rec.candidates_present}</strong>
                      </div>

                      <p className="text-blue-100 text-[11px]">{rec.summary_notes}</p>

                      {rec.hod_remarks && (
                        <div className="p-2 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-[11px] text-emerald-200">
                          <strong>HOD Feedback:</strong> {rec.hod_remarks}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: OFFICER LIVE ESCORT MAP & ROUTE CORRIDOR                  */}
        {/* ================================================================ */}
        {activeTab === 'MAP_CORRIDOR' && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#071B3E] border border-[#FFD700]/40 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-display font-extrabold text-white">
                  {assignedRoute ? assignedRoute.name : 'Assigned Center Patrol'}
                </span>
                <span
                  className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                    routeDeviation > 200
                      ? 'bg-red-600 text-white'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  Deviation: {routeDeviation}m / 200m
                </span>
              </div>
              <div className="text-[11px] text-blue-200 font-mono">
                {assignedCenter ? (
                  <>
                    Target Center: {assignedCenter.code} ({assignedCenter.name}) •{' '}
                    {routeProgress.progressPct}% Complete
                  </>
                ) : (
                  <>
                    Base Depot: {assignedOffice ? assignedOffice.name : 'WAEC Office'} • Target Exam Center: Pending Assignment
                  </>
                )}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden border-2 border-[#FFD700]/40 h-80 relative">
              <MapContainer
                center={[currentLocation.lat, currentLocation.lng]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter lat={currentLocation.lat} lng={currentLocation.lng} />

                {/* WAEC Regional Offices Markers */}
                {dbState.waec_offices &&
                  Object.values(dbState.waec_offices).map((office) => (
                    <Marker
                      key={office.id}
                      position={[office.lat, office.lng]}
                      icon={createOfficeMarkerIcon(office)}
                    >
                      <Popup>
                        <div className="text-xs font-sans space-y-1">
                          <span className="px-1.5 py-0.5 rounded bg-[#FFD700] text-[#002147] font-bold text-[9px]">
                            {office.is_head_office ? 'WAEC HQ' : 'WAEC OFFICE'}
                          </span>
                          <strong className="text-[#002147] block text-xs">
                            {office.name}
                          </strong>
                          <div className="text-slate-600 text-[10px]">{office.description}</div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                {assignedCenter && (
                  <Circle
                    center={[assignedCenter.lat, assignedCenter.lng]}
                    radius={assignedCenter.radius_meters}
                    pathOptions={{
                      color: '#FFD700',
                      fillColor: '#002147',
                      fillOpacity: 0.3,
                    }}
                  />
                )}

                {assignedRoute && (
                  <Polyline
                    positions={assignedRoute.waypoints}
                    pathOptions={{ color: '#FFD700', weight: 4, dashArray: '8, 6' }}
                  />
                )}

                <Marker
                  position={[currentLocation.lat, currentLocation.lng]}
                  icon={officerPinIcon}
                >
                  <Popup>
                    <strong>{currentOfficer.name}</strong>
                    <br />
                    Speed: {currentLocation.speed.toFixed(1)} km/h
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            <div className="p-4 rounded-2xl bg-[#071B3E] border border-blue-800 space-y-2">
              <h3 className="text-xs font-display font-extrabold uppercase tracking-wider text-[#FFD700] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> My Automated Center Check-In Logs
              </h3>
              {officerGeofenceLogs.length === 0 ? (
                <p className="text-xs text-blue-300">
                  No center entries recorded yet on this shift.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {officerGeofenceLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded mr-1.5 bg-emerald-500/20 text-emerald-300">
                          {log.event_type === 'ENTER_CENTER' ? 'CHECK-IN' : 'DEPART'}
                        </span>
                        <span className="font-semibold text-white">{log.center_name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-[#FFD700]">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 4: WATERMARKED FIELD EVIDENCE CAMERA                         */}
        {/* ================================================================ */}
        {activeTab === 'CAMERA_EVIDENCE' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#071B3E] border border-[#FFD700]/40 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-extrabold text-sm text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#FFD700]" /> Tamper-Evident Evidence
                  Camera
                </h2>
                <span className="font-mono text-[10px] text-emerald-400">
                  Pixel Watermark Active
                </span>
              </div>
              <p className="text-blue-200 text-[11px]">
                Burns your GPS coordinates, UTC timestamp, Center / Office Code (
                {assignedCenter?.code || assignedOffice?.code || 'WAEC-GH'}), and Officer ID directly onto the image pixels.
              </p>

              <div>
                <label className="block font-bold text-blue-100 mb-1">
                  Incident / Inspection Category
                </label>
                <select
                  aria-label="Evidence Category"
                  value={evidenceCategory}
                  onChange={(e) =>
                    setEvidenceCategory(e.target.value as IncidentEvidence['category'])
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-[#030F26] border border-blue-800 text-white font-semibold"
                >
                  <option value="MALPRACTICE">
                    MALPRACTICE — Examination Hall Irregularity
                  </option>
                  <option value="SEAL_TAMPERING">
                    SEAL_TAMPERING — Question Paper Pouch Inspection
                  </option>
                  <option value="HOSTILITY">
                    HOSTILITY — Crowd / Security Threat at Center
                  </option>
                  <option value="LATE_ARRIVAL">
                    LATE_ARRIVAL — Transport / Escort Delay Log
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-blue-100 mb-1">
                  Field Officer Observation Notes
                </label>
                <textarea
                  rows={2}
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-[#030F26] border border-blue-800 text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={isCapturing}
                  onClick={() => handleCaptureWatermarkedPhoto()}
                  className="py-3 px-3 rounded-xl bg-[#FFD700] hover:bg-[#F4C430] text-[#002147] font-display font-black text-xs flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  {isCapturing ? 'Watermarking...' : 'Capture Evidence Photo'}
                </button>

                <label className="py-3 px-3 rounded-xl bg-[#030F26] hover:bg-[#0C2757] text-blue-100 font-bold text-xs flex items-center justify-center gap-1.5 border border-blue-800 cursor-pointer">
                  <span>Upload From Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleCaptureWatermarkedPhoto(f);
                    }}
                  />
                </label>
              </div>
            </div>

            {lastWatermarkedPreview && (
              <div className="p-3.5 rounded-2xl bg-[#071B3E] border border-emerald-400/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Watermarked &amp; Sent to Head of
                    Department
                  </span>
                  <a
                    href={lastWatermarkedPreview}
                    download={`WAEC_Evidence_${currentOfficer.id}_${Date.now()}.jpg`}
                    className="inline-flex items-center gap-1 text-[#FFD700] font-bold text-[11px]"
                  >
                    <Download className="w-3.5 h-3.5" /> Save JPEG
                  </a>
                </div>
                <img
                  src={lastWatermarkedPreview}
                  alt="Watermarked Field Evidence"
                  className="w-full rounded-xl border border-blue-900"
                />
              </div>
            )}

            {officerIncidents.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#071B3E] border border-blue-800 space-y-2">
                <h3 className="text-xs font-display font-extrabold uppercase tracking-wider text-[#FFD700]">
                  My Uploaded Evidence ({officerIncidents.length})
                </h3>
                <div className="space-y-2">
                  {officerIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="p-2.5 rounded-xl bg-[#030F26] border border-blue-900 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-[#FFD700] font-mono mr-2">
                          [{inc.category}]
                        </span>
                        <span className="text-blue-100">{inc.center_code}</span>
                      </div>
                      <span className="font-mono text-[10px] text-emerald-400">
                        {inc.synced ? 'SYNCED TO HOD' : 'QUEUED IN HIVE'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 5: DUAL SOS EMERGENCY & SILENT HARDWARE TRIGGER              */}
        {/* ================================================================ */}
        {activeTab === 'SOS_EMERGENCY' && (
          <div className="space-y-4">
            <div className="p-5 rounded-3xl bg-red-950/50 border-2 border-red-500/80 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-red-600/20 border border-red-500 flex items-center justify-center mx-auto text-red-400">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <h2 className="font-display text-lg font-black text-white">
                Emergency SOS Panic Button
              </h2>
              <p className="text-xs text-blue-100">
                Press and hold for <strong>2 full seconds</strong> to alert the Head of
                Department, trigger the 880Hz HQ siren, and record 15 seconds of ambient
                audio.
              </p>

              <button
                onMouseDown={startSosHold}
                onMouseUp={cancelSosHold}
                onMouseLeave={cancelSosHold}
                onTouchStart={startSosHold}
                onTouchEnd={cancelSosHold}
                className="w-full py-5 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-display font-black text-base tracking-wider uppercase shadow-2xl relative overflow-hidden select-none cursor-pointer"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-white/30 transition-all"
                  style={{ width: `${holdProgress}%` }}
                />
                <span className="relative">
                  {holdProgress > 0
                    ? `KEEP HOLDING... ${holdProgress}%`
                    : 'HOLD 2 SECONDS TO SEND SOS'}
                </span>
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#071B3E] border border-[#FFD700]/40 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-display font-extrabold text-white flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-[#FFD700]" /> Silent Duress Trigger (3x
                  Volume-Down)
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#030F26] text-[#FFD700]">
                  {volTapCount}/3 Taps (&lt;1.5s)
                </span>
              </div>
              <p className="text-blue-200 text-[11px]">
                Under hostility when you cannot look at your screen, rapidly press your
                physical <strong>Volume-Down button 3 times within 1.5 seconds</strong>.
              </p>
              <button
                type="button"
                onClick={handleHardwareVolumeDownTap}
                className="w-full py-3 rounded-xl bg-[#030F26] hover:bg-[#0C2757] border border-[#FFD700]/50 text-[#FFD700] font-mono font-bold text-xs cursor-pointer"
              >
                🔉 Tap 3x Rapidly to Trigger Silent Hardware SOS ({volTapCount}/3)
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#071B3E] border border-blue-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-5 h-5 text-[#FFD700]" />
                <div>
                  <div className="font-bold text-white">
                    WAEC National Security Control Room
                  </div>
                  <div className="text-[11px] text-blue-200 font-mono">
                    Direct Hotline: +233 30 222 1511
                  </div>
                </div>
              </div>
              <a
                href="tel:+233302221511"
                className="px-3 py-2 rounded-xl bg-[#FFD700] text-[#002147] font-display font-black"
              >
                Call HQ
              </a>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM 5-TAB MOBILE NAVIGATION BAR IN WAEC OFFICIAL NAVY & GOLD */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#002147]/95 backdrop-blur border-t-2 border-[#FFD700]/40 grid grid-cols-5 px-1.5 py-1.5 z-50">
        <button
          onClick={() => setActiveTab('PATROL')}
          className={`flex flex-col items-center py-1.5 rounded-xl text-[10px] font-display font-extrabold transition cursor-pointer ${
            activeTab === 'PATROL'
              ? 'text-[#002147] bg-[#FFD700] shadow'
              : 'text-blue-200'
          }`}
        >
          <Radio className="w-4 h-4 mb-0.5" />
          <span>Profile &amp; Shift</span>
        </button>

        <button
          onClick={() => setActiveTab('WORK_RECORDS')}
          className={`flex flex-col items-center py-1.5 rounded-xl text-[10px] font-display font-extrabold transition cursor-pointer ${
            activeTab === 'WORK_RECORDS'
              ? 'text-[#002147] bg-[#FFD700] shadow'
              : 'text-blue-200'
          }`}
        >
          <ClipboardCheck className="w-4 h-4 mb-0.5" />
          <span>Daily Log</span>
        </button>

        <button
          onClick={() => setActiveTab('MAP_CORRIDOR')}
          className={`flex flex-col items-center py-1.5 rounded-xl text-[10px] font-display font-extrabold transition cursor-pointer ${
            activeTab === 'MAP_CORRIDOR'
              ? 'text-[#002147] bg-[#FFD700] shadow'
              : 'text-blue-200'
          }`}
        >
          <MapPin className="w-4 h-4 mb-0.5" />
          <span>Escort Map</span>
        </button>

        <button
          onClick={() => setActiveTab('CAMERA_EVIDENCE')}
          className={`flex flex-col items-center py-1.5 rounded-xl text-[10px] font-display font-extrabold transition cursor-pointer ${
            activeTab === 'CAMERA_EVIDENCE'
              ? 'text-[#002147] bg-[#FFD700] shadow'
              : 'text-blue-200'
          }`}
        >
          <Camera className="w-4 h-4 mb-0.5" />
          <span>Evidence</span>
        </button>

        <button
          onClick={() => setActiveTab('SOS_EMERGENCY')}
          className={`flex flex-col items-center py-1.5 rounded-xl text-[10px] font-display font-extrabold transition cursor-pointer ${
            activeTab === 'SOS_EMERGENCY'
              ? 'text-white bg-red-600 shadow'
              : 'text-red-400'
          }`}
        >
          <AlertOctagon className="w-4 h-4 mb-0.5" />
          <span>SOS Panic</span>
        </button>
      </nav>
    </div>
  );
}
export default App;
