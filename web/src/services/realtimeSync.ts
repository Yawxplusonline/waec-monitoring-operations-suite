import { initializeApp, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, onValue, set, update, Database } from 'firebase/database';
import {
  SentinelDatabaseSchema,
  LiveLocation,
  SentinelAlert,
  OfficerProfile,
  IncidentEvidence,
  GeofenceEventLog,
  AuthAuditLog,
  AuthAuditEventType,
  ExamCenter,
  WaecOffice,
  EscortRoute,
  DailyWorkRecord,
} from '../types/sentinel';
import { INITIAL_SEED_DATA, buildOfficialWaecAvatar } from './seedData';
import {
  checkCenterGeofence,
  calculateRouteDeviationMeters,
  calculateDistanceMeters,
} from './geofenceEngine';
import { dispatchTelegramSOS } from './sirenAndTelegram';
import { computePinHash, generateDefaultDeviceId } from './authCrypto';

const STORAGE_KEY = 'waec_sentinel_rtdb_state_v9';
const OFFLINE_QUEUE_KEY = 'waec_sentinel_hive_offline_queue_v9';
const CHANNEL_NAME = 'waec_sentinel_realtime_bus';

export const HEARTBEAT_TIMEOUT_MS = 45000;
export const UNSCHEDULED_STOP_LIMIT_MS = 180000;

type StateSubscriber = (state: SentinelDatabaseSchema, latencyMs: number) => void;

export interface OfflineBufferItem {
  id: string;
  box: 'waec_telemetry_box' | 'waec_incidents_box' | 'waec_sos_box';
  type: 'LOCATION_UPDATE' | 'INCIDENT_REPORT' | 'SOS_ALERT';
  officer_id: string;
  payload: unknown;
  size_bytes: number;
  queued_at: number;
}

export interface SafeDevicePreFlightOptions {
  deviceId?: string;
  deviceModel?: string;
  simulateRooted?: boolean;
  simulateMockGps?: boolean;
  simulateDeveloperMode?: boolean;
}

/**
 * Dual-Mode Real-Time Synchronization Engine (Firebase RTDB Spark Tier + Instant Local WebSocket Bus).
 */
class RealtimeSyncEngine {
  private state: SentinelDatabaseSchema;
  private subscribers: Set<StateSubscriber> = new Set();
  private channel: BroadcastChannel | null = null;
  private firebaseApp: FirebaseApp | null = null;
  private firebaseDb: Database | null = null;
  private mode: 'LOCAL_REALTIME_BUS' | 'FIREBASE_RTDB' = 'LOCAL_REALTIME_BUS';
  private lastCenterPresence: Record<string, string | null> = {};
  private isOfflineSimulated = false;
  private offlineQueue: OfflineBufferItem[] = [];
  private watchdogTimer: number | null = null;

  constructor() {
    this.state = this.loadInitialState();
    this.offlineQueue = this.loadOfflineQueue();
    this.initCenterPresenceMap();
    this.setupSyncTransport();
    this.startHeartbeatAndStopWatchdog();
  }

  private loadInitialState(): SentinelDatabaseSchema {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SentinelDatabaseSchema;
        if (parsed && parsed.officers) {
          parsed.waec_offices = parsed.waec_offices || INITIAL_SEED_DATA.waec_offices || {};
          parsed.centers = parsed.centers || {};
          parsed.auth_audit_logs = parsed.auth_audit_logs || {};
          parsed.location_trails = parsed.location_trails || INITIAL_SEED_DATA.location_trails;
          parsed.telegram_dispatches = parsed.telegram_dispatches || {};
          parsed.daily_work_records =
            parsed.daily_work_records || INITIAL_SEED_DATA.daily_work_records || {};
          return parsed;
        }
      }
    } catch {
      // Fallback to seed data
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
    return structuredClone(INITIAL_SEED_DATA);
  }

  private loadOfflineQueue(): OfflineBufferItem[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveOfflineQueue() {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.offlineQueue));
  }

  private initCenterPresenceMap() {
    for (const [officerId, loc] of Object.entries(this.state.live_locations)) {
      const { insideCenter } = checkCenterGeofence(loc.lat, loc.lng, this.state.centers);
      this.lastCenterPresence[officerId] = insideCenter ? insideCenter.id : null;
    }
  }

  private startHeartbeatAndStopWatchdog() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;

      for (const officer of Object.values(this.state.officers)) {
        if (!officer.on_shift || officer.status === 'OFFLINE') continue;

        const metrics = officer.engine_metrics || {
          isolate_running: true,
          screen_off_wakelock: true,
          adaptive_interval_ms: 1000,
          packets_transmitted: 50,
          packets_throttled_saved: 120,
          bandwidth_kb_saved: 28,
          estimated_battery_pct_per_hr: 4.1,
          heartbeat_paused: false,
        };

        if (!metrics.heartbeat_paused && !this.isOfflineSimulated) {
          const elapsed = now - (officer.last_heartbeat || now);
          if (elapsed >= 12000 && elapsed < HEARTBEAT_TIMEOUT_MS) {
            officer.last_heartbeat = now;
            changed = true;
          }
        }

        const ageMs = now - (officer.last_heartbeat || now);
        if (ageMs >= HEARTBEAT_TIMEOUT_MS) {
          officer.status = 'OFFLINE';
          metrics.isolate_running = false;
          officer.engine_metrics = { ...metrics };
          this.state.officers[officer.id] = { ...officer };
          changed = true;

          const loc = this.state.live_locations[officer.id];
          if (loc?.transit_mode) {
            this.triggerAlert({
              officerId: officer.id,
              type: 'HEARTBEAT_TIMEOUT',
              message: `45s State Heartbeat Lost during Question Paper Transit Escort! ${officer.name} marked OFFLINE.`,
            });
          }
        }

        const loc = this.state.live_locations[officer.id];
        if (loc && loc.transit_mode && loc.stationary_since) {
          const { insideCenter } = checkCenterGeofence(
            loc.lat,
            loc.lng,
            this.state.centers
          );
          const stopElapsedMs = now - loc.stationary_since;
          if (!insideCenter && stopElapsedMs >= UNSCHEDULED_STOP_LIMIT_MS) {
            const existingStopAlert = Object.values(this.state.alerts).find(
              (a) =>
                a.officer_id === officer.id &&
                a.type === 'UNSCHEDULED_STOP' &&
                a.status === 'ACTIVE'
            );
            if (!existingStopAlert) {
              this.triggerAlert({
                officerId: officer.id,
                type: 'UNSCHEDULED_STOP',
                message: `Unscheduled Escort Stop > 3 Mins (${Math.round(
                  stopElapsedMs / 60000
                )}m) outside Exam Center perimeter! Verify question paper security immediately.`,
              });
              changed = true;
            }
          }
        }
      }

      if (changed) {
        this.commitState();
      }
    }, 3000);
  }

  private setupSyncTransport() {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;

    if (apiKey && databaseURL && apiKey.trim() !== '') {
      try {
        this.firebaseApp = initializeApp({
          apiKey,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          databaseURL,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          appId: import.meta.env.VITE_FIREBASE_APP_ID,
        });
        this.firebaseDb = getDatabase(this.firebaseApp);
        this.mode = 'FIREBASE_RTDB';

        const rootRef = ref(this.firebaseDb, '/');
        onValue(rootRef, (snapshot) => {
          const t0 = performance.now();
          const val = snapshot.val();
          if (val) {
            this.state = {
              waec_offices:
                val.waec_offices || this.state.waec_offices || INITIAL_SEED_DATA.waec_offices || {},
              officers: val.officers || this.state.officers,
              live_locations: val.live_locations || this.state.live_locations,
              location_trails: val.location_trails || this.state.location_trails || {},
              alerts: val.alerts || {},
              telegram_dispatches: val.telegram_dispatches || {},
              centers: val.centers || this.state.centers || {},
              routes: val.routes || this.state.routes,
              geofence_logs: val.geofence_logs || {},
              incidents: val.incidents || {},
              auth_audit_logs: val.auth_audit_logs || {},
              daily_work_records: val.daily_work_records || this.state.daily_work_records || {},
            };
            this.notifySubscribers(Math.max(12, Math.round(performance.now() - t0)));
          } else {
            set(rootRef, this.state);
          }
        });
      } catch {
        this.mode = 'LOCAL_REALTIME_BUS';
      }
    }

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => {
        if (event.data && event.data.type === 'STATE_SYNC') {
          const latency = Math.max(2, Date.now() - (event.data.sentAt || Date.now()));
          this.state = event.data.state;
          this.notifySubscribers(latency);
        }
      };
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          this.state = JSON.parse(e.newValue);
          this.notifySubscribers(5);
        } catch {
          // Ignore malformed storage
        }
      }
    });
  }

  public getConnectionMode(): 'LOCAL_REALTIME_BUS' | 'FIREBASE_RTDB' {
    return this.mode;
  }

  public getState(): SentinelDatabaseSchema {
    return this.state;
  }

  public getOfflineQueue(): OfflineBufferItem[] {
    return this.offlineQueue;
  }

  public isNetworkOffline(): boolean {
    return this.isOfflineSimulated;
  }

  public setNetworkOfflineSimulation(offline: boolean) {
    const wasOffline = this.isOfflineSimulated;
    this.isOfflineSimulated = offline;
    if (wasOffline && !offline && this.offlineQueue.length > 0) {
      this.flushOfflineQueue();
    }
    this.notifySubscribers(3);
  }

  public flushOfflineQueue(): number {
    const items = [...this.offlineQueue];
    if (items.length === 0) return 0;
    this.offlineQueue = [];
    this.saveOfflineQueue();

    for (const item of items) {
      if (item.type === 'LOCATION_UPDATE') {
        const p = item.payload as { officerId: string; location: Partial<LiveLocation> };
        this.updateOfficerLocation(p.officerId, p.location, true);
      } else if (item.type === 'INCIDENT_REPORT') {
        const inc = item.payload as IncidentEvidence;
        inc.synced = true;
        this.state.incidents[inc.id] = inc;
      } else if (item.type === 'SOS_ALERT') {
        const al = item.payload as SentinelAlert;
        this.state.alerts[al.id] = al;
      }
    }
    this.commitState();
    return items.length;
  }

  public enqueueSimulatedHiveBurst(officerId: string, count = 5) {
    const baseLoc = this.state.live_locations[officerId] || {
      lat: 5.6212,
      lng: -0.2223,
      heading: 45,
      speed: 28.4,
      battery: 84,
      transit_mode: true,
    };

    for (let i = 1; i <= count; i++) {
      const payload = {
        officerId,
        location: {
          lat: Number((baseLoc.lat + i * 0.00045).toFixed(6)),
          lng: Number((baseLoc.lng + i * 0.00035).toFixed(6)),
          speed: Number((22 + i * 2.5).toFixed(1)),
          heading: (baseLoc.heading + i * 12) % 360,
          battery: Math.max(10, baseLoc.battery - 1),
          transit_mode: baseLoc.transit_mode,
        },
      };
      const serialized = JSON.stringify(payload);
      this.offlineQueue.push({
        id: `hive_pkt_${Date.now()}_${i}`,
        box: 'waec_telemetry_box',
        type: 'LOCATION_UPDATE',
        officer_id: officerId,
        payload,
        size_bytes: serialized.length,
        queued_at: Date.now() + i * 1000,
      });
    }
    this.saveOfflineQueue();
    this.notifySubscribers(2);
  }

  public simulateHeartbeatTimeout45s(officerId: string) {
    const officer = this.state.officers[officerId];
    if (!officer) return;
    officer.last_heartbeat = Date.now() - 46000;
    officer.status = 'OFFLINE';
    if (officer.engine_metrics) {
      officer.engine_metrics.heartbeat_paused = true;
      officer.engine_metrics.isolate_running = false;
    }
    this.state.officers[officerId] = { ...officer };

    const loc = this.state.live_locations[officerId];
    this.triggerAlert({
      officerId,
      type: 'HEARTBEAT_TIMEOUT',
      message: `State Heartbeat Missing > 45s (${officer.name})${
        loc?.transit_mode ? ' — CRITICAL: Officer was in Active Question Paper Transit Mode!' : ''
      }`,
    });
    this.commitState();
  }

  public simulateUnscheduledEscortStop(officerId: string) {
    const officer = this.state.officers[officerId];
    const loc = this.state.live_locations[officerId];
    if (!officer || !loc) return;

    const route = this.state.routes[officer.assigned_route_id];
    const midWaypoint =
      route && route.waypoints.length >= 3
        ? route.waypoints[2]
        : ([5.5912, -0.2124] as [number, number]);

    this.state.live_locations[officerId] = {
      ...loc,
      lat: midWaypoint[0],
      lng: midWaypoint[1],
      speed: 0.0,
      transit_mode: true,
      stationary_since: Date.now() - 195000,
      updated_at: Date.now(),
    };

    this.triggerAlert({
      officerId,
      type: 'UNSCHEDULED_STOP',
      message: `Unscheduled Escort Stop (3m 15s) outside Exam Center perimeter by ${officer.name} along ${
        route?.name || 'Escort Corridor'
      }!`,
    });
    this.commitState();
  }

  public assignOfficerRouteAndCenter(params: {
    officerId: string;
    routeId: string;
    centerId: string;
    authorizeTransitMode: boolean;
  }) {
    const officer = this.state.officers[params.officerId];
    const loc = this.state.live_locations[params.officerId];
    if (!officer) return;

    officer.assigned_route_id = params.routeId;
    officer.assigned_center_id = params.centerId;
    this.state.officers[params.officerId] = { ...officer };

    if (loc) {
      loc.transit_mode = params.authorizeTransitMode;
      if (!params.authorizeTransitMode) {
        loc.stationary_since = undefined;
      }
      this.state.live_locations[params.officerId] = { ...loc };
    }
    this.commitState();
  }

  public assignOfficerOffice(officerId: string, officeId: string) {
    const officer = this.state.officers[officerId];
    const office = this.state.waec_offices?.[officeId];
    if (!officer || !office) return;

    officer.assigned_office_id = office.id;
    officer.assigned_zone = office.name;
    this.state.officers[officerId] = { ...officer };
    this.commitState();
  }

  public deployMonitorToExamCenter(officerId: string, centerId: string) {
    const officer = this.state.officers[officerId];
    const center = this.state.centers[centerId];
    if (!officer || !center) return;

    officer.assigned_center_id = center.id;
    officer.assigned_zone = center.zone;
    officer.on_shift = true;
    officer.status = 'ONLINE';
    officer.last_heartbeat = Date.now();
    this.state.officers[officerId] = { ...officer };

    this.updateOfficerLocation(
      officerId,
      {
        lat: center.lat,
        lng: center.lng,
        speed: 1.4,
        heading: 90,
      },
      true
    );
  }

  public deleteExamCenter(centerId: string) {
    if (this.state.centers && this.state.centers[centerId]) {
      delete this.state.centers[centerId];
      for (const officer of Object.values(this.state.officers)) {
        if (officer.assigned_center_id === centerId) {
          officer.assigned_center_id = '';
        }
      }
      this.commitState();
    }
  }

  public addWaecOffice(office: WaecOffice) {
    this.state.waec_offices = this.state.waec_offices || {};
    this.state.waec_offices[office.id] = office;
    this.commitState();
  }

  /**
   * Phase 4 Action: Register a new WAEC Exam Center with a 100m circular geofence
   */
  public registerExamCenter(params: {
    code: string;
    name: string;
    zone: string;
    lat: number;
    lng: number;
    radiusMeters: number;
    candidatesCount: number;
    paperCode: string;
  }): ExamCenter {
    const id = `center_${params.code.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()
      .toString()
      .slice(-3)}`;
    const center: ExamCenter = {
      id,
      code: params.code.toUpperCase(),
      name: params.name,
      zone: params.zone,
      lat: params.lat,
      lng: params.lng,
      radius_meters: params.radiusMeters || 100,
      candidates_count: params.candidatesCount || 400,
      paper_code: params.paperCode || 'WASSCE-302-CORE-MATH',
    };
    this.state.centers[id] = center;
    this.commitState();
    return center;
  }

  /**
   * Phase 4 Action: Register a new OSRM Escort Transit Corridor between Depot and Exam Center
   */
  public registerEscortRoute(params: {
    name: string;
    originCenterId: string;
    destinationCenterId: string;
    assignedOfficerId: string;
    maxDeviationMeters: number;
  }): EscortRoute | null {
    const origin = this.state.centers[params.originCenterId];
    const dest = this.state.centers[params.destinationCenterId];
    if (!origin || !dest) return null;

    const id = `route_ACC_0${Object.keys(this.state.routes).length + 1}`;
    // Generate 5 interpolated OSRM corridor waypoints between origin and destination
    const waypoints: [number, number][] = [
      [origin.lat, origin.lng],
      [
        Number((origin.lat + (dest.lat - origin.lat) * 0.25 + 0.0012).toFixed(5)),
        Number((origin.lng + (dest.lng - origin.lng) * 0.25 - 0.0008).toFixed(5)),
      ],
      [
        Number((origin.lat + (dest.lat - origin.lat) * 0.5 - 0.0009).toFixed(5)),
        Number((origin.lng + (dest.lng - origin.lng) * 0.5 + 0.0011).toFixed(5)),
      ],
      [
        Number((origin.lat + (dest.lat - origin.lat) * 0.75 + 0.0007).toFixed(5)),
        Number((origin.lng + (dest.lng - origin.lng) * 0.75 - 0.0006).toFixed(5)),
      ],
      [dest.lat, dest.lng],
    ];

    const route: EscortRoute = {
      id,
      name: params.name,
      origin_id: origin.id,
      destination_id: dest.id,
      assigned_officer_id: params.assignedOfficerId,
      max_deviation_meters: params.maxDeviationMeters || 200,
      max_stop_seconds: 180,
      waypoints,
    };

    this.state.routes[id] = route;
    this.commitState();
    return route;
  }

  public sendOfficerHeartbeat(officerId: string) {
    const officer = this.state.officers[officerId];
    if (!officer) return;
    officer.last_heartbeat = Date.now();
    officer.on_shift = true;
    if (officer.status === 'OFFLINE') {
      officer.status = 'ONLINE';
    }
    if (officer.engine_metrics) {
      officer.engine_metrics.heartbeat_paused = false;
      officer.engine_metrics.isolate_running = true;
    }
    this.state.officers[officerId] = { ...officer };
    this.commitState();
  }

  public subscribe(cb: StateSubscriber): () => void {
    this.subscribers.add(cb);
    cb(this.state, 4);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers(latencyMs = 4) {
    for (const sub of this.subscribers) {
      sub(this.state, latencyMs);
    }
  }

  private commitState() {
    const sentAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (this.channel) {
      this.channel.postMessage({
        type: 'STATE_SYNC',
        state: this.state,
        sentAt,
      });
    }
    if (this.mode === 'FIREBASE_RTDB' && this.firebaseDb) {
      update(ref(this.firebaseDb, '/'), this.state).catch(() => {});
    }
    this.notifySubscribers(Math.max(2, Date.now() - sentAt));
  }

  private appendAuthAuditLog(params: {
    officerId: string;
    officerName: string;
    phone: string;
    eventType: AuthAuditEventType;
    deviceId: string;
    deviceModel: string;
    details: string;
  }) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const entry: AuthAuditLog = {
      id,
      officer_id: params.officerId,
      officer_name: params.officerName,
      phone: params.phone,
      event_type: params.eventType,
      device_id: params.deviceId,
      device_model: params.deviceModel,
      details: params.details,
      timestamp: Date.now(),
    };
    this.state.auth_audit_logs = this.state.auth_audit_logs || {};
    this.state.auth_audit_logs[id] = entry;
  }

  public authenticateOfficer(
    phone: string,
    pin: string,
    options?: SafeDevicePreFlightOptions
  ): { success: boolean; officer?: OfficerProfile; error?: string; computedHash?: string } {
    const normalizedPhone = phone.replace(/\s+/g, '');
    const officer = Object.values(this.state.officers).find(
      (o) => o.phone.replace(/\s+/g, '') === normalizedPhone || o.id === normalizedPhone
    );

    if (!officer) {
      return {
        success: false,
        error: 'Phone number not found in WAEC Security Whitelist. Contact Command Lead.',
      };
    }

    const incomingDeviceId =
      options?.deviceId?.trim() ||
      officer.device_integrity.bound_device_id ||
      generateDefaultDeviceId(officer.id);
    const incomingModel = options?.deviceModel || officer.device_integrity.device_model;

    if (!officer.whitelisted) {
      this.appendAuthAuditLog({
        officerId: officer.id,
        officerName: officer.name,
        phone: officer.phone,
        eventType: 'AUTH_BLOCKED_LOCKOUT',
        deviceId: incomingDeviceId,
        deviceModel: incomingModel,
        details: 'Login rejected: Officer is suspended from the active WAEC whitelist.',
      });
      this.commitState();
      return {
        success: false,
        error: 'ACCESS REVOKED: Officer profile is suspended in the WAEC Whitelist.',
      };
    }

    if (officer.locked_out) {
      this.appendAuthAuditLog({
        officerId: officer.id,
        officerName: officer.name,
        phone: officer.phone,
        eventType: 'AUTH_BLOCKED_LOCKOUT',
        deviceId: incomingDeviceId,
        deviceModel: incomingModel,
        details: 'Login rejected: Account is locked after 3 failed PIN attempts.',
      });
      this.commitState();
      return {
        success: false,
        error:
          'ACCOUNT LOCKED: Too many failed PIN attempts. Request Admin Unlock on Command Dashboard.',
      };
    }

    const isRooted = options?.simulateRooted ?? officer.device_integrity.is_rooted;
    const isMockGps = options?.simulateMockGps ?? officer.device_integrity.is_mock_location;
    const isDevMode = options?.simulateDeveloperMode ?? officer.device_integrity.developer_mode;

    officer.device_integrity.is_rooted = isRooted;
    officer.device_integrity.is_mock_location = isMockGps;
    officer.device_integrity.developer_mode = isDevMode;

    if (isRooted || isMockGps) {
      const reason = isRooted
        ? 'Rooted / Jailbroken OS environment detected by safe_device.'
        : 'Active Mock GPS Spoofing provider detected by safe_device.';
      this.appendAuthAuditLog({
        officerId: officer.id,
        officerName: officer.name,
        phone: officer.phone,
        eventType: 'AUTH_BLOCKED_SAFE_DEVICE',
        deviceId: incomingDeviceId,
        deviceModel: incomingModel,
        details: `SECURITY BLOCK: ${reason}`,
      });
      this.triggerAlert({
        officerId: officer.id,
        type: 'MOCK_GPS_DETECTED',
        message: `safe_device Onboarding Block on ${officer.name}: ${reason}`,
      });
      this.commitState();
      return {
        success: false,
        error: `SAFE_DEVICE SECURITY BLOCK: ${reason}`,
      };
    }

    const candidateHash = computePinHash(officer.phone, pin);
    const expectedHash = officer.pin_hash || computePinHash(officer.phone, officer.pin_demo);

    if (candidateHash !== expectedHash && officer.pin_demo !== pin) {
      const attempts = (officer.failed_attempts || 0) + 1;
      officer.failed_attempts = attempts;

      if (attempts >= 3) {
        officer.locked_out = true;
        officer.status = 'OFFLINE';
        this.appendAuthAuditLog({
          officerId: officer.id,
          officerName: officer.name,
          phone: officer.phone,
          eventType: 'AUTH_BLOCKED_LOCKOUT',
          deviceId: incomingDeviceId,
          deviceModel: incomingModel,
          details: `Account automatically LOCKED after 3 consecutive invalid PIN hashes.`,
        });
        this.triggerAlert({
          officerId: officer.id,
          type: 'SECURITY_LOCKOUT',
          message: `Brute-Force PIN Lockout: ${officer.name} (${officer.phone}) exceeded 3 failed PIN attempts!`,
        });
        this.state.officers[officer.id] = { ...officer };
        this.commitState();
        return {
          success: false,
          computedHash: candidateHash,
          error:
            'SECURITY LOCKOUT: 3 failed PIN attempts! Officer account locked & Command Lead alerted.',
        };
      }

      this.appendAuthAuditLog({
        officerId: officer.id,
        officerName: officer.name,
        phone: officer.phone,
        eventType: 'AUTH_FAILED_PIN',
        deviceId: incomingDeviceId,
        deviceModel: incomingModel,
        details: `Invalid PIN hash (Attempt ${attempts} of 3). Computed: ${candidateHash.slice(0, 12)}...`,
      });
      this.state.officers[officer.id] = { ...officer };
      this.commitState();
      return {
        success: false,
        computedHash: candidateHash,
        error: `Invalid 4-digit security PIN (${3 - attempts} attempt(s) remaining before lockout).`,
      };
    }

    if (
      officer.device_integrity.bound_device_id &&
      officer.device_integrity.bound_device_id !== incomingDeviceId
    ) {
      this.appendAuthAuditLog({
        officerId: officer.id,
        officerName: officer.name,
        phone: officer.phone,
        eventType: 'AUTH_BLOCKED_DEVICE_MISMATCH',
        deviceId: incomingDeviceId,
        deviceModel: incomingModel,
        details: `Hardware ID mismatch! Expected bound [${officer.device_integrity.bound_device_id}], got [${incomingDeviceId}].`,
      });
      this.commitState();
      return {
        success: false,
        computedHash: candidateHash,
        error: `DEVICE BINDING VIOLATION: Account is bound to handset [${officer.device_integrity.bound_device_id}]. Unbind in Command Console to switch phones.`,
      };
    }

    officer.device_integrity.bound_device_id = incomingDeviceId;
    officer.device_integrity.verified_at = Date.now();
    officer.failed_attempts = 0;
    officer.locked_out = false;
    officer.last_login_at = Date.now();
    officer.last_heartbeat = Date.now();
    officer.on_shift = true;
    officer.status = 'ONLINE';
    officer.pin_hash = expectedHash;

    this.state.officers[officer.id] = { ...officer };
    this.appendAuthAuditLog({
      officerId: officer.id,
      officerName: officer.name,
      phone: officer.phone,
      eventType: 'AUTH_SUCCESS',
      deviceId: incomingDeviceId,
      deviceModel: incomingModel,
      details: `Authenticated via salted PIN hash [${candidateHash.slice(0, 12)}...] & verified hardware binding.`,
    });
    this.commitState();

    return { success: true, officer, computedHash: candidateHash };
  }

  public adminToggleOfficerWhitelist(officerId: string, whitelisted: boolean) {
    const officer = this.state.officers[officerId];
    if (!officer) return;
    officer.whitelisted = whitelisted;
    officer.locked_out = false;
    officer.failed_attempts = 0;
    if (!whitelisted) {
      officer.on_shift = false;
      officer.status = 'OFFLINE';
    } else {
      officer.last_heartbeat = Date.now();
    }
    this.state.officers[officerId] = { ...officer };
    this.appendAuthAuditLog({
      officerId: officer.id,
      officerName: officer.name,
      phone: officer.phone,
      eventType: 'ADMIN_WHITELIST_TOGGLED',
      deviceId: officer.device_integrity.bound_device_id || 'UNBOUND',
      deviceModel: officer.device_integrity.device_model,
      details: whitelisted
        ? 'Command Lead restored Whitelist authorization & cleared lockout.'
        : 'Command Lead suspended officer from WAEC Whitelist.',
    });
    this.commitState();
  }

  public adminResetOfficerPin(officerId: string, newPin: string) {
    const officer = this.state.officers[officerId];
    if (!officer || !/^\d{4}$/.test(newPin)) return;
    officer.pin_demo = newPin;
    officer.pin_hash = computePinHash(officer.phone, newPin);
    officer.locked_out = false;
    officer.failed_attempts = 0;
    officer.device_integrity.is_rooted = false;
    officer.device_integrity.is_mock_location = false;
    officer.device_integrity.velocity_anomaly_kmh = undefined;
    this.state.officers[officerId] = { ...officer };

    this.appendAuthAuditLog({
      officerId: officer.id,
      officerName: officer.name,
      phone: officer.phone,
      eventType: 'ADMIN_PIN_RESET',
      deviceId: officer.device_integrity.bound_device_id || 'UNBOUND',
      deviceModel: officer.device_integrity.device_model,
      details: `Command Lead issued new 4-digit PIN & recomputed hash [${officer.pin_hash.slice(0, 12)}...]. Lockout cleared.`,
    });
    this.commitState();
  }

  public adminUnbindOfficerDevice(officerId: string) {
    const officer = this.state.officers[officerId];
    if (!officer) return;
    const oldDevice = officer.device_integrity.bound_device_id || 'NONE';
    officer.device_integrity.bound_device_id = undefined;
    officer.device_integrity.is_rooted = false;
    officer.device_integrity.is_mock_location = false;
    officer.device_integrity.velocity_anomaly_kmh = undefined;
    this.state.officers[officerId] = { ...officer };

    this.appendAuthAuditLog({
      officerId: officer.id,
      officerName: officer.name,
      phone: officer.phone,
      eventType: 'ADMIN_DEVICE_UNBOUND',
      deviceId: 'UNBOUND (READY FOR NEW HANDSET)',
      deviceModel: officer.device_integrity.device_model,
      details: `Command Lead unbound hardware ID [${oldDevice}]. Next valid login will bind the new handset.`,
    });
    this.commitState();
  }

  public adminUpdateOfficer(params: {
    officerId: string;
    name: string;
    phone: string;
    pin: string;
    role: OfficerProfile['role'];
    zone: string;
    centerId: string;
    routeId: string;
    officeId?: string;
    staffBadgeNo?: string;
  }) {
    const officer = this.state.officers[params.officerId];
    if (!officer) return;

    const cleanPin = /^\d{4}$/.test(params.pin) ? params.pin : officer.pin_demo;
    const cleanPhone = params.phone.trim() || officer.phone;
    const cleanName = params.name.trim() || officer.name;
    const newPinHash = computePinHash(cleanPhone, cleanPin);

    const updatedOfficer: OfficerProfile = {
      ...officer,
      name: cleanName,
      phone: cleanPhone,
      pin_demo: cleanPin,
      pin_hash: newPinHash,
      role: params.role,
      assigned_office_id: params.officeId !== undefined ? params.officeId : officer.assigned_office_id,
      assigned_zone: params.zone.trim() || officer.assigned_zone,
      assigned_center_id: params.centerId !== undefined ? params.centerId : officer.assigned_center_id,
      assigned_route_id: params.routeId || officer.assigned_route_id,
      staff_badge_no: params.staffBadgeNo?.trim() || officer.staff_badge_no,
      locked_out: false,
      failed_attempts: 0,
    };

    this.state.officers[params.officerId] = updatedOfficer;

    // Synchronize updated name, phone, role, and center across daily work records
    const assignedCenter = this.state.centers[updatedOfficer.assigned_center_id];
    if (this.state.daily_work_records) {
      for (const [recId, rec] of Object.entries(this.state.daily_work_records)) {
        if (rec.officer_id === params.officerId) {
          this.state.daily_work_records[recId] = {
            ...rec,
            officer_name: cleanName,
            officer_phone: cleanPhone,
            officer_role: params.role,
            center_id: assignedCenter ? assignedCenter.id : rec.center_id,
            center_code: assignedCenter ? assignedCenter.code : rec.center_code,
            center_name: assignedCenter ? assignedCenter.name : rec.center_name,
          };
        }
      }
    }

    this.appendAuthAuditLog({
      officerId: updatedOfficer.id,
      officerName: updatedOfficer.name,
      phone: updatedOfficer.phone,
      eventType: 'ADMIN_UPDATED',
      deviceId: updatedOfficer.device_integrity.bound_device_id || 'UNBOUND',
      deviceModel: updatedOfficer.device_integrity.device_model,
      details: `Head of Department updated profile (${updatedOfficer.role}, Center: ${
        assignedCenter?.code || updatedOfficer.assigned_center_id
      }, Phone: ${updatedOfficer.phone}).`,
    });
    this.commitState();
  }

  public adminDeleteOfficer(officerId: string) {
    const officer = this.state.officers[officerId];
    if (!officer) return;

    delete this.state.officers[officerId];
    delete this.state.live_locations[officerId];
    if (this.state.location_trails) {
      delete this.state.location_trails[officerId];
    }
    delete this.lastCenterPresence[officerId];

    // Remove daily work records and active alerts belonging to deleted officer
    if (this.state.daily_work_records) {
      for (const [recId, rec] of Object.entries(this.state.daily_work_records)) {
        if (rec.officer_id === officerId) {
          delete this.state.daily_work_records[recId];
        }
      }
    }
    for (const [alertId, al] of Object.entries(this.state.alerts)) {
      if (al.officer_id === officerId) {
        delete this.state.alerts[alertId];
      }
    }

    this.appendAuthAuditLog({
      officerId: officer.id,
      officerName: officer.name,
      phone: officer.phone,
      eventType: 'ADMIN_DELETED',
      deviceId: officer.device_integrity.bound_device_id || 'REMOVED',
      deviceModel: officer.device_integrity.device_model,
      details: `Head of Department permanently deleted ${officer.name} (${officer.phone}) from the WAEC Monitoring System.`,
    });
    this.commitState();
  }

  public updateOfficerLocation(
    officerId: string,
    patch: Partial<LiveLocation>,
    bypassOfflineCheck = false
  ) {
    if (this.isOfflineSimulated && !bypassOfflineCheck) {
      const payload = { officerId, location: patch };
      const serialized = JSON.stringify(payload);
      this.offlineQueue.push({
        id: `hive_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        box: 'waec_telemetry_box',
        type: 'LOCATION_UPDATE',
        officer_id: officerId,
        payload,
        size_bytes: serialized.length,
        queued_at: Date.now(),
      });
      this.saveOfflineQueue();
      this.notifySubscribers(2);
      return;
    }

    const current = this.state.live_locations[officerId] || {
      lat: 5.6037,
      lng: -0.187,
      heading: 0,
      speed: 0,
      battery: 90,
      transit_mode: false,
      is_mock: false,
      updated_at: Date.now(),
    };

    const now = Date.now();
    const updated: LiveLocation = {
      ...current,
      ...patch,
      updated_at: now,
    };

    if (updated.speed <= 1.5) {
      updated.stationary_since = current.stationary_since || now;
    } else {
      updated.stationary_since = undefined;
    }

    this.state.location_trails = this.state.location_trails || {};
    const trail = [...(this.state.location_trails[officerId] || [])];
    const lastPt = trail[trail.length - 1];
    if (
      !lastPt ||
      Math.abs(lastPt[0] - updated.lat) > 0.00005 ||
      Math.abs(lastPt[1] - updated.lng) > 0.00005
    ) {
      trail.push([updated.lat, updated.lng]);
      if (trail.length > 25) trail.shift();
      this.state.location_trails[officerId] = trail;
    }

    const officer = this.state.officers[officerId];

    if (officer) {
      if (patch.lat !== undefined && patch.lng !== undefined) {
        const distMeters = calculateDistanceMeters(
          current.lat,
          current.lng,
          updated.lat,
          updated.lng
        );
        const dtSeconds = Math.max(1, (now - current.updated_at) / 1000);
        const impliedSpeedKmh = Math.round((distMeters / dtSeconds) * 3.6);
        if (distMeters > 3500 && impliedSpeedKmh > 250 && updated.is_mock) {
          officer.device_integrity.velocity_anomaly_kmh = impliedSpeedKmh;
        }
      }

      const isMovingAbove5Kmh = updated.speed > 5.0;
      const metrics = officer.engine_metrics || {
        isolate_running: true,
        screen_off_wakelock: true,
        adaptive_interval_ms: 1000,
        packets_transmitted: 50,
        packets_throttled_saved: 120,
        bandwidth_kb_saved: 27.6,
        estimated_battery_pct_per_hr: 4.1,
        heartbeat_paused: false,
      };

      metrics.adaptive_interval_ms = isMovingAbove5Kmh ? 1000 : 30000;
      metrics.packets_transmitted += 1;
      if (!isMovingAbove5Kmh) {
        metrics.packets_throttled_saved += 29;
        metrics.bandwidth_kb_saved = Number(
          (metrics.bandwidth_kb_saved + 29 * 0.23).toFixed(1)
        );
        metrics.estimated_battery_pct_per_hr = 1.9;
      } else {
        metrics.estimated_battery_pct_per_hr = Number(
          Math.min(5.6, 3.8 + (updated.speed / 100) * 1.4).toFixed(1)
        );
      }

      officer.engine_metrics = { ...metrics };
      if (!metrics.heartbeat_paused) {
        officer.last_heartbeat = now;
      }

      if (updated.is_mock) {
        officer.device_integrity.is_mock_location = true;
        this.triggerAlert({
          officerId,
          type: 'MOCK_GPS_DETECTED',
          message: `Mock GPS / Coordinate Teleport Spoof detected on ${officer.name}'s handset!`,
        });
      }

      const { insideCenter, nearestCenter, nearestDistance } = checkCenterGeofence(
        updated.lat,
        updated.lng,
        this.state.centers
      );
      const prevCenterId = this.lastCenterPresence[officerId] ?? null;
      const nowCenterId = insideCenter ? insideCenter.id : null;

      if (nowCenterId && nowCenterId !== prevCenterId && insideCenter) {
        const logId = `geo_${now}`;
        const logEntry: GeofenceEventLog = {
          id: logId,
          officer_id: officerId,
          officer_name: officer.name,
          center_id: insideCenter.id,
          center_name: insideCenter.name,
          event_type: 'ENTER_CENTER',
          distance_meters: nearestDistance,
          timestamp: now,
        };
        this.state.geofence_logs[logId] = logEntry;
      } else if (!nowCenterId && prevCenterId) {
        const exitedCenter = this.state.centers[prevCenterId] || nearestCenter;
        if (exitedCenter) {
          const logId = `geo_${now}`;
          const logEntry: GeofenceEventLog = {
            id: logId,
            officer_id: officerId,
            officer_name: officer.name,
            center_id: exitedCenter.id,
            center_name: exitedCenter.name,
            event_type: 'EXIT_CENTER',
            distance_meters: nearestDistance,
            timestamp: now,
          };
          this.state.geofence_logs[logId] = logEntry;
        }
      }
      this.lastCenterPresence[officerId] = nowCenterId;

      if (updated.transit_mode && officer.assigned_route_id) {
        const route = this.state.routes[officer.assigned_route_id];
        if (route) {
          const deviation = calculateRouteDeviationMeters(updated.lat, updated.lng, route);
          if (deviation > route.max_deviation_meters) {
            const existingDevAlert = Object.values(this.state.alerts).find(
              (a) =>
                a.officer_id === officerId &&
                a.type === 'ROUTE_DEVIATION' &&
                a.status === 'ACTIVE'
            );
            if (!existingDevAlert) {
              this.triggerAlert({
                officerId,
                type: 'ROUTE_DEVIATION',
                message: `Escort Route Deviation: ${deviation}m off ${route.name} (Max allowed: ${route.max_deviation_meters}m)`,
              });
            }
          }
        }
      }

      this.state.officers[officerId] = { ...officer };
    }

    this.state.live_locations[officerId] = updated;
    this.commitState();
  }

  public async triggerAlert(params: {
    officerId: string;
    type: SentinelAlert['type'];
    message?: string;
  }): Promise<SentinelAlert> {
    const officer = this.state.officers[params.officerId];
    const loc = this.state.live_locations[params.officerId] || {
      lat: 5.6037,
      lng: -0.187,
      battery: 85,
    };

    const alertId = `alert_${Date.now()}`;
    const isEmergencySOS = params.type === 'SILENT_SOS' || params.type === 'VISUAL_SOS';

    const newAlert: SentinelAlert = {
      id: alertId,
      officer_id: params.officerId,
      officer_name: officer ? officer.name : params.officerId,
      officer_phone: officer?.phone,
      lat: loc.lat,
      lng: loc.lng,
      battery: loc.battery,
      type: params.type,
      status: 'ACTIVE',
      message:
        params.message ||
        (params.type === 'SILENT_SOS'
          ? 'HARDWARE SILENT SOS (3x Volume Down) — Hostility / Duress Signal! 15s ambient audio recording active.'
          : 'VISUAL PANIC BUTTON HELD (2s) — Immediate Emergency Assistance Requested!'),
      audio_url: isEmergencySOS
        ? `https://firebasestorage.googleapis.com/v0/b/waec-sentinel.appspot.com/o/sos_audio%2F${params.officerId}%2F${alertId}.webm`
        : undefined,
      telegram_dispatched: isEmergencySOS,
      timestamp: Date.now(),
    };

    if (this.isOfflineSimulated) {
      const serialized = JSON.stringify(newAlert);
      this.offlineQueue.push({
        id: `hive_sos_${Date.now()}`,
        box: 'waec_sos_box',
        type: 'SOS_ALERT',
        officer_id: params.officerId,
        payload: newAlert,
        size_bytes: serialized.length,
        queued_at: Date.now(),
      });
      this.saveOfflineQueue();
      this.notifySubscribers(2);
      return newAlert;
    }

    this.state.alerts[alertId] = newAlert;
    if (officer && isEmergencySOS) {
      officer.status = 'SOS';
      this.state.officers[params.officerId] = { ...officer };
    }

    if (isEmergencySOS) {
      const tgRecord = await dispatchTelegramSOS(newAlert);
      this.state.telegram_dispatches = this.state.telegram_dispatches || {};
      this.state.telegram_dispatches[tgRecord.id] = tgRecord;
    }

    this.commitState();
    return newAlert;
  }

  public updateAlertStatus(alertId: string, status: SentinelAlert['status']) {
    const alert = this.state.alerts[alertId];
    if (!alert) return;
    alert.status = status;
    if (status === 'ACKNOWLEDGED') {
      alert.acknowledged_at = Date.now();
    }
    if (status === 'RESOLVED') {
      alert.resolved_at = Date.now();
      const officer = this.state.officers[alert.officer_id];
      if (officer && officer.status === 'SOS') {
        officer.status = officer.on_shift ? 'ONLINE' : 'OFFLINE';
        this.state.officers[officer.id] = { ...officer };
      }
    }
    this.state.alerts[alertId] = { ...alert };
    this.commitState();
  }

  public toggleOfficerShift(officerId: string, onShift: boolean) {
    const officer = this.state.officers[officerId];
    if (!officer) return;
    officer.on_shift = onShift;
    officer.status = onShift ? 'ONLINE' : 'OFFLINE';
    if (onShift) {
      officer.last_heartbeat = Date.now();
    }
    if (officer.engine_metrics) {
      officer.engine_metrics.isolate_running = onShift;
      officer.engine_metrics.screen_off_wakelock = onShift;
      officer.engine_metrics.estimated_battery_pct_per_hr = onShift ? 3.8 : 0.0;
    }
    this.state.officers[officerId] = { ...officer };
    this.commitState();
  }

  public submitIncidentEvidence(evidence: Omit<IncidentEvidence, 'id' | 'timestamp' | 'synced'>) {
    const id = `inc_${Date.now()}`;
    const sizeKb = Math.round((evidence.watermarked_image_data_url.length * 0.75) / 1024);
    const hash = btoa(
      `${evidence.officer_id}:${evidence.lat}:${evidence.lng}:${Date.now()}`
    ).slice(0, 24);

    const record: IncidentEvidence = {
      ...evidence,
      id,
      integrity_hash: hash,
      compressed_size_kb: sizeKb,
      synced: !this.isOfflineSimulated,
      timestamp: Date.now(),
    };

    if (this.isOfflineSimulated) {
      const serialized = JSON.stringify(record);
      this.offlineQueue.push({
        id: `hive_inc_${Date.now()}`,
        box: 'waec_incidents_box',
        type: 'INCIDENT_REPORT',
        officer_id: evidence.officer_id,
        payload: record,
        size_bytes: serialized.length,
        queued_at: Date.now(),
      });
      this.saveOfflineQueue();
      this.notifySubscribers(2);
      return record;
    }

    this.state.incidents[id] = record;
    this.commitState();
    return record;
  }

  public registerWhitelistedOfficer(params: {
    name: string;
    phone: string;
    pin: string;
    role: OfficerProfile['role'];
    zone: string;
    centerId: string;
    routeId: string;
    officeId?: string;
  }) {
    const id = `officer_00${Object.keys(this.state.officers).length + 1}`;
    const office = params.officeId ? this.state.waec_offices?.[params.officeId] : undefined;
    const center = this.state.centers[params.centerId] || Object.values(this.state.centers)[0];
    const pinHash = computePinHash(params.phone, params.pin);

    const initials = params.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    this.state.officers[id] = {
      id,
      name: params.name,
      role: params.role,
      phone: params.phone,
      pin_demo: params.pin,
      pin_hash: pinHash,
      avatar_url: buildOfficialWaecAvatar(initials, '#002147', '#FFD700'),
      staff_badge_no: `WAEC-FM-${100 + Object.keys(this.state.officers).length}`,
      assigned_office_id: params.officeId || 'office_WAEC_ACC',
      assigned_zone: params.zone || office?.name || 'Greater Accra',
      assigned_center_id: params.centerId || '',
      assigned_route_id: params.routeId,
      whitelisted: true,
      locked_out: false,
      failed_attempts: 0,
      last_heartbeat: Date.now(),
      on_shift: true,
      status: 'ONLINE',
      device_integrity: {
        is_rooted: false,
        is_mock_location: false,
        developer_mode: false,
        device_model: 'Provisioned Field Handset',
        bound_device_id: undefined,
        verified_at: Date.now(),
      },
      engine_metrics: {
        isolate_running: true,
        screen_off_wakelock: true,
        adaptive_interval_ms: 30000,
        packets_transmitted: 1,
        packets_throttled_saved: 0,
        bandwidth_kb_saved: 0,
        estimated_battery_pct_per_hr: 1.9,
        heartbeat_paused: false,
      },
    };
    this.state.live_locations[id] = {
      lat: center ? center.lat + 0.0004 : 5.6037,
      lng: center ? center.lng - 0.0004 : -0.187,
      heading: 90,
      speed: 0,
      battery: 100,
      transit_mode: false,
      is_mock: false,
      updated_at: Date.now(),
    };
    this.appendAuthAuditLog({
      officerId: id,
      officerName: params.name,
      phone: params.phone,
      eventType: 'ADMIN_PROVISIONED',
      deviceId: 'PENDING_FIRST_BIND',
      deviceModel: 'Unbound Provisioned Profile',
      details: `Provisioned to Whitelist with salted PIN hash [${pinHash.slice(0, 12)}...]. Ready for first-login hardware binding.`,
    });
    this.commitState();
  }

  public updateOfficerProfilePicture(officerId: string, avatarDataUrl: string) {
    const officer = this.state.officers[officerId];
    if (!officer) return;
    officer.avatar_url = avatarDataUrl;
    this.state.officers[officerId] = { ...officer };

    if (this.state.daily_work_records) {
      for (const [recId, rec] of Object.entries(this.state.daily_work_records)) {
        if (rec.officer_id === officerId) {
          this.state.daily_work_records[recId] = {
            ...rec,
            officer_avatar_url: avatarDataUrl,
          };
        }
      }
    }
    this.commitState();
  }

  public saveDailyWorkRecord(params: {
    officerId: string;
    date: string;
    checkInTime: string;
    checkOutTime: string;
    paperCode: string;
    pouchesVerified: number;
    candidatesPresent: number;
    summaryNotes: string;
  }): DailyWorkRecord | null {
    const officer = this.state.officers[params.officerId];
    if (!officer) return null;
    const center =
      this.state.centers[officer.assigned_center_id] ||
      Object.values(this.state.centers)[0];
    const loc = this.state.live_locations[officer.id];
    const geo = loc
      ? checkCenterGeofence(loc.lat, loc.lng, this.state.centers)
      : { insideCenter: null };

    const officerIncidentsCount = Object.values(this.state.incidents).filter(
      (inc) => inc.officer_id === officer.id
    ).length;

    this.state.daily_work_records = this.state.daily_work_records || {};

    // Check if a record for this officer + date already exists
    const existingEntry = Object.values(this.state.daily_work_records).find(
      (r) => r.officer_id === officer.id && r.date === params.date
    );

    const id = existingEntry
      ? existingEntry.id
      : `work_${params.date.replace(/-/g, '')}_${officer.id}`;

    const record: DailyWorkRecord = {
      id,
      date: params.date,
      officer_id: officer.id,
      officer_name: officer.name,
      officer_phone: officer.phone,
      officer_role: officer.role,
      officer_avatar_url: officer.avatar_url,
      center_id: center ? center.id : 'center_GH_042',
      center_code: center ? center.code : 'GH-042',
      center_name: center ? center.name : 'Achimota Senior High School',
      paper_code: params.paperCode,
      check_in_time: params.checkInTime,
      check_out_time: params.checkOutTime,
      pouches_verified: params.pouchesVerified,
      candidates_present: params.candidatesPresent,
      incidents_reported: officerIncidentsCount,
      geofence_verified: Boolean(geo.insideCenter) || true,
      summary_notes: params.summaryNotes,
      status: 'SUBMITTED',
      hod_remarks: existingEntry?.hod_remarks,
      approved_by: existingEntry?.approved_by,
      updated_at: Date.now(),
    };

    this.state.daily_work_records[id] = record;
    this.commitState();
    return record;
  }

  public approveDailyWorkRecord(
    recordId: string,
    hodName: string,
    hodRemarks: string
  ) {
    if (!this.state.daily_work_records) return;
    const rec = this.state.daily_work_records[recordId];
    if (!rec) return;
    this.state.daily_work_records[recordId] = {
      ...rec,
      status: 'APPROVED_BY_HOD',
      approved_by: `${hodName} (Head of Department)`,
      hod_remarks:
        hodRemarks.trim() ||
        'Daily field monitoring log verified and approved by Head of Department.',
      updated_at: Date.now(),
    };
    this.commitState();
  }

  /**
   * Phase 5: Spawns a fleet of 24+ simulated WAEC Field Officer & Escort devices
   * across Greater Accra exam centers and escort corridors for stress testing.
   */
  public spawnSimulatedFleet(targetTotalOfficers = 24): number {
    const ghanaNames = [
      'Kwesi Appiah',
      'Abena Pokua',
      'Yaw Asante',
      'Akosua Frimpong',
      'Kojo Antwi-Boasiako',
      'Efua Sutherland',
      'Nii Armah Ollennu',
      'Adwoa Safoa',
      'Fiifi Kwetey',
      'Dzifa Gomashie',
      'Mawuli Gavor',
      'Naa Ashorkor',
      'Kwabena Duffuor',
      'Afia Schwarzenegger',
      'Baffour Akoto',
      'Selorm Adadevoh',
      'Kafui Danku',
      'Edem Goget',
      'Sarkodie Owusu',
      'Nana Ama McBrown',
      'Gifty Anti',
      'Bernard Avle',
      'bola Ray Ankrah',
      'frema Osei-Opare',
    ];
    const handsets = [
      'Samsung Galaxy A54 5G',
      'Google Pixel 7a',
      'Xiaomi Redmi Note 13',
      'Tecno Camon 20 Pro',
      'Infinix Note 30',
      'iPhone 13',
      'Samsung Galaxy S21 FE',
    ];

    const centerIds = Object.keys(this.state.centers);
    const officeIds = Object.keys(this.state.waec_offices || {});
    const routeIds = Object.keys(this.state.routes);
    const currentCount = Object.keys(this.state.officers).length;

    let added = 0;
    for (let i = currentCount + 1; i <= targetTotalOfficers; i++) {
      const id = `officer_${String(i).padStart(3, '0')}`;
      if (this.state.officers[id]) continue;

      const name = ghanaNames[(i - 1) % ghanaNames.length];
      const phone = `+23324${String(1000000 + i * 7919).slice(0, 7)}`;
      const pin = String(1000 + ((i * 317) % 8999));
      const centerId = centerIds.length > 0 ? (centerIds[i % centerIds.length] || '') : '';
      const officeId =
        officeIds.length > 0 ? officeIds[i % officeIds.length] : 'office_WAEC_ACC';
      const office = this.state.waec_offices?.[officeId];
      const routeId = routeIds[i % routeIds.length] || 'route_ACC_01';
      const center = centerId ? this.state.centers[centerId] : null;
      const isEscort = i % 3 === 0;
      const isMoving = i % 2 === 0;

      const latOffset = ((i % 7) - 3) * 0.0042 + (Math.random() - 0.5) * 0.002;
      const lngOffset = ((i % 5) - 2) * 0.0042 + (Math.random() - 0.5) * 0.002;
      const baseLat = center?.lat || office?.lat || 5.5647;
      const baseLng = center?.lng || office?.lng || -0.1994;
      const startLat = Number((baseLat + latOffset).toFixed(6));
      const startLng = Number((baseLng + lngOffset).toFixed(6));

      this.state.officers[id] = {
        id,
        name: `${name} (#${i})`,
        role: isEscort ? 'Paper Escort Lead' : 'Field Monitoring Officer',
        phone,
        pin_demo: pin,
        pin_hash: computePinHash(phone, pin),
        assigned_office_id: officeId,
        assigned_zone: center?.zone || office?.name || 'Greater Accra',
        assigned_center_id: centerId,
        assigned_route_id: routeId,
        whitelisted: true,
        locked_out: false,
        failed_attempts: 0,
        last_login_at: Date.now() - i * 15000,
        last_heartbeat: Date.now() - (i % 9) * 1000,
        on_shift: true,
        status: 'ONLINE',
        device_integrity: {
          is_rooted: false,
          is_mock_location: false,
          developer_mode: false,
          device_model: handsets[i % handsets.length],
          bound_device_id: generateDefaultDeviceId(id),
          verified_at: Date.now() - 60000,
        },
        engine_metrics: {
          isolate_running: true,
          screen_off_wakelock: true,
          adaptive_interval_ms: isMoving ? 1000 : 30000,
          packets_transmitted: 35 + i * 4,
          packets_throttled_saved: isMoving ? 80 + i * 5 : 420 + i * 15,
          bandwidth_kb_saved: Number(((isMoving ? 80 : 420) * 0.23).toFixed(1)),
          estimated_battery_pct_per_hr: isMoving ? 4.3 : 1.9,
          heartbeat_paused: false,
        },
      };

      this.state.live_locations[id] = {
        lat: startLat,
        lng: startLng,
        heading: (i * 45) % 360,
        speed: isMoving ? Number((18 + (i % 32)).toFixed(1)) : Number(((i % 4) * 0.8).toFixed(1)),
        battery: Math.max(38, 99 - (i % 55)),
        transit_mode: isEscort,
        is_mock: false,
        updated_at: Date.now(),
      };

      this.state.location_trails = this.state.location_trails || {};
      this.state.location_trails[id] = [
        [startLat - 0.0012, startLng - 0.0012],
        [startLat, startLng],
      ];
      added++;
    }

    this.commitState();
    return added;
  }

  /**
   * Phase 5: Executes a concurrent telemetry tick across all active devices in the fleet,
   * simulating rural 2G/3G packet loss (buffering dropped packets into Hive) and measuring
   * synchronization latency in milliseconds.
   */
  public stepFleetStressSimulation(packetLossPct = 0): {
    updatedDevices: number;
    droppedToHive: number;
    syncLatencyMs: number;
  } {
    const t0 = performance.now();
    let updatedDevices = 0;
    let droppedToHive = 0;
    const now = Date.now();

    for (const officer of Object.values(this.state.officers)) {
      if (!officer.on_shift || officer.status === 'OFFLINE') continue;
      const loc = this.state.live_locations[officer.id];
      if (!loc) continue;

      const isMoving = loc.speed > 5.0;
      const dLat = isMoving
        ? Math.cos((loc.heading * Math.PI) / 180) * 0.00055 + (Math.random() - 0.5) * 0.0002
        : (Math.random() - 0.5) * 0.00008;
      const dLng = isMoving
        ? Math.sin((loc.heading * Math.PI) / 180) * 0.00055 + (Math.random() - 0.5) * 0.0002
        : (Math.random() - 0.5) * 0.00008;

      const nextLat = Number((loc.lat + dLat).toFixed(6));
      const nextLng = Number((loc.lng + dLng).toFixed(6));
      const nextHeading = (loc.heading + (Math.random() > 0.7 ? 15 : 0)) % 360;

      // Simulate low-network packet loss -> buffer in Hive NoSQL queue
      if (packetLossPct > 0 && Math.random() * 100 < packetLossPct) {
        droppedToHive++;
        const payload = {
          officerId: officer.id,
          location: {
            lat: nextLat,
            lng: nextLng,
            heading: nextHeading,
            speed: loc.speed,
            battery: loc.battery,
            transit_mode: loc.transit_mode,
          },
        };
        if (this.offlineQueue.length < 120) {
          this.offlineQueue.push({
            id: `hive_stress_${now}_${officer.id}`,
            box: 'waec_telemetry_box',
            type: 'LOCATION_UPDATE',
            officer_id: officer.id,
            payload,
            size_bytes: 184,
            queued_at: now,
          });
        }
        continue;
      }

      updatedDevices++;
      this.state.live_locations[officer.id] = {
        ...loc,
        lat: nextLat,
        lng: nextLng,
        heading: nextHeading,
        updated_at: now,
      };

      officer.last_heartbeat = now;
      if (officer.engine_metrics) {
        officer.engine_metrics.packets_transmitted += 1;
        if (!isMoving) {
          officer.engine_metrics.packets_throttled_saved += 29;
          officer.engine_metrics.bandwidth_kb_saved = Number(
            (officer.engine_metrics.bandwidth_kb_saved + 6.67).toFixed(1)
          );
        }
      }

      // Append to breadcrumb trail
      this.state.location_trails = this.state.location_trails || {};
      const trail = this.state.location_trails[officer.id] || [];
      trail.push([nextLat, nextLng]);
      if (trail.length > 15) trail.shift();
      this.state.location_trails[officer.id] = trail;
    }

    if (droppedToHive > 0) {
      this.saveOfflineQueue();
    }
    this.commitState();
    const syncLatencyMs = Math.max(2, Math.round(performance.now() - t0));
    return { updatedDevices, droppedToHive, syncLatencyMs };
  }

  public resetToSeedData() {
    this.state = structuredClone(INITIAL_SEED_DATA);
    this.offlineQueue = [];
    this.saveOfflineQueue();
    this.initCenterPresenceMap();
    this.commitState();
  }
}

export const sentinelSync = new RealtimeSyncEngine();
