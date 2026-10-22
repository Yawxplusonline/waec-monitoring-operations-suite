export type OfficerStatus = 'ONLINE' | 'OFFLINE' | 'SOS';

export interface DeviceIntegrity {
  is_rooted: boolean;
  is_mock_location: boolean;
  developer_mode: boolean;
  device_model: string;
  bound_device_id?: string;
  velocity_anomaly_kmh?: number;
  verified_at: number;
}

export interface BackgroundEngineMetrics {
  isolate_running: boolean;
  screen_off_wakelock: boolean;
  adaptive_interval_ms: 1000 | 30000;
  packets_transmitted: number;
  packets_throttled_saved: number;
  bandwidth_kb_saved: number;
  estimated_battery_pct_per_hr: number;
  heartbeat_paused?: boolean;
}

export type UserRole =
  | 'Head of Monitoring Team'
  | 'Field Monitoring Officer';

export type GroupRole = 'Group Leader' | 'Group Member';

export interface RegionalMonitoringSquad {
  id: string;
  name: string;
  region: string;
  leader_id: string;
  member_ids: string[];
  vehicle_badge?: string;
  assigned_office_id?: string;
  notes?: string;
}

export interface OfficerProfile {
  id: string;
  name: string;
  role: UserRole;
  phone: string;
  pin_demo: string;
  pin_hash: string;
  avatar_url?: string;
  staff_badge_no?: string;
  group_id?: string;
  group_name?: string;
  group_role?: GroupRole;
  assigned_region?: string;
  assigned_office_id?: string;
  assigned_zone: string;
  assigned_center_id: string;
  assigned_route_id: string;
  whitelisted: boolean;
  locked_out?: boolean;
  failed_attempts?: number;
  last_login_at?: number;
  last_heartbeat?: number;
  on_shift: boolean;
  status: OfficerStatus;
  device_integrity: DeviceIntegrity;
  engine_metrics?: BackgroundEngineMetrics;
}

export interface DailyWorkRecord {
  id: string;
  date: string; // YYYY-MM-DD
  officer_id: string;
  officer_name: string;
  officer_phone: string;
  officer_role: UserRole;
  officer_avatar_url?: string;
  center_id: string;
  center_code: string;
  center_name: string;
  paper_code: string;
  check_in_time: string;
  check_out_time: string;
  pouches_verified: number;
  candidates_present: number;
  incidents_reported: number;
  geofence_verified: boolean;
  summary_notes: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED_BY_HOD';
  hod_remarks?: string;
  approved_by?: string;
  updated_at: number;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  heading: number;
  speed: number; // km/h
  battery: number; // 0-100
  transit_mode: boolean;
  stationary_since?: number;
  is_mock?: boolean;
  is_real_device_gps?: boolean;
  accuracy_meters?: number;
  updated_at: number;
}

export type AlertType =
  | 'SILENT_SOS'
  | 'VISUAL_SOS'
  | 'ROUTE_DEVIATION'
  | 'UNSCHEDULED_STOP'
  | 'MOCK_GPS_DETECTED'
  | 'SECURITY_LOCKOUT'
  | 'HEARTBEAT_TIMEOUT';

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface SentinelAlert {
  id: string;
  officer_id: string;
  officer_name: string;
  officer_phone?: string;
  lat: number;
  lng: number;
  battery: number;
  type: AlertType;
  status: AlertStatus;
  message: string;
  audio_url?: string;
  telegram_dispatched?: boolean;
  acknowledged_at?: number;
  resolved_at?: number;
  timestamp: number;
}

export interface TelegramDispatchRecord {
  id: string;
  alert_id: string;
  officer_id: string;
  officer_name: string;
  alert_type: AlertType;
  mode: 'LIVE_TELEGRAM_API' | 'SIMULATED_BOT_WEBHOOK';
  chat_id: string;
  osm_url: string;
  markdown_payload: string;
  timestamp: number;
}

export interface WaecOffice {
  id: string;
  code: string;
  name: string;
  region: string;
  wkt: string;
  description: string;
  lat: number;
  lng: number;
  is_head_office?: boolean;
}

export interface ExamCenter {
  id: string;
  code: string;
  name: string;
  zone: string;
  wkt?: string;
  description?: string;
  lat: number;
  lng: number;
  radius_meters: number;
  candidates_count: number;
  paper_code: string;
}

export interface EscortRoute {
  id: string;
  name: string;
  origin_id: string;
  destination_id: string;
  assigned_officer_id: string;
  max_deviation_meters: number;
  max_stop_seconds: number;
  waypoints: [number, number][];
}

export interface GeofenceEventLog {
  id: string;
  officer_id: string;
  officer_name: string;
  center_id: string;
  center_name: string;
  event_type: 'ENTER_CENTER' | 'EXIT_CENTER';
  distance_meters: number;
  timestamp: number;
}

export interface IncidentEvidence {
  id: string;
  officer_id: string;
  officer_name: string;
  center_id: string;
  center_code: string;
  category: 'MALPRACTICE' | 'SEAL_TAMPERING' | 'HOSTILITY' | 'LATE_ARRIVAL';
  notes: string;
  lat: number;
  lng: number;
  watermarked_image_data_url: string;
  integrity_hash?: string;
  compressed_size_kb?: number;
  synced: boolean;
  timestamp: number;
}

export type AuthAuditEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILED_PIN'
  | 'AUTH_BLOCKED_LOCKOUT'
  | 'AUTH_BLOCKED_DEVICE_MISMATCH'
  | 'AUTH_BLOCKED_SAFE_DEVICE'
  | 'ADMIN_PROVISIONED'
  | 'ADMIN_UPDATED'
  | 'ADMIN_DELETED'
  | 'ADMIN_PIN_RESET'
  | 'ADMIN_DEVICE_UNBOUND'
  | 'ADMIN_WHITELIST_TOGGLED';

export interface AuthAuditLog {
  id: string;
  officer_id: string;
  officer_name: string;
  phone: string;
  event_type: AuthAuditEventType;
  device_id: string;
  device_model: string;
  details: string;
  timestamp: number;
}

export interface SentinelDatabaseSchema {
  waec_offices?: Record<string, WaecOffice>;
  officers: Record<string, OfficerProfile>;
  live_locations: Record<string, LiveLocation>;
  location_trails?: Record<string, [number, number][]>;
  alerts: Record<string, SentinelAlert>;
  telegram_dispatches?: Record<string, TelegramDispatchRecord>;
  centers: Record<string, ExamCenter>;
  routes: Record<string, EscortRoute>;
  geofence_logs: Record<string, GeofenceEventLog>;
  incidents: Record<string, IncidentEvidence>;
  auth_audit_logs: Record<string, AuthAuditLog>;
  daily_work_records?: Record<string, DailyWorkRecord>;
  regional_squads?: Record<string, RegionalMonitoringSquad>;
}
