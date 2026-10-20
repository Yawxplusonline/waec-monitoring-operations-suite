import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  KeyRound,
  Smartphone,
  Unlock,
  Ban,
  CheckCircle2,
  History,
  FileCode2,
  Hash,
  Unlink,
} from 'lucide-react';
import { SentinelDatabaseSchema, OfficerProfile } from '../types/sentinel';
import { sentinelSync } from '../services/realtimeSync';
import { computePinHash } from '../services/authCrypto';

interface AdminWhitelistManagerProps {
  dbState: SentinelDatabaseSchema;
  onTestOfficerLogin: (officerId: string) => void;
}

export const AdminWhitelistManager: React.FC<AdminWhitelistManagerProps> = ({
  dbState,
  onTestOfficerLogin,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+23320');
  const [pin, setPin] = useState('4321');
  const [role, setRole] = useState<OfficerProfile['role']>('Field Monitoring Officer');
  const [zone, setZone] = useState('Accra Central');
  const [centerId, setCenterId] = useState('center_GH_042');
  const [routeId, setRouteId] = useState('route_ACC_01');

  const [pinResetValues, setPinResetValues] = useState<Record<string, string>>({});

  const officers = Object.values(dbState.officers);
  const auditLogs = Object.values(dbState.auth_audit_logs || {}).sort(
    (a, b) => b.timestamp - a.timestamp
  );

  const liveHashPreview = computePinHash(phone, pin);

  const handleProvisionOfficer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !/^\d{4}$/.test(pin.trim())) return;
    sentinelSync.registerWhitelistedOfficer({
      name: name.trim(),
      phone: phone.trim(),
      pin: pin.trim(),
      role,
      zone: zone.trim() || 'Accra Central',
      centerId,
      routeId,
    });
    setName('');
    setPhone('+23320');
    setPin('4321');
  };

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Phase 1 Header Banner */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-400 font-mono text-[11px] font-bold">
                PHASE 1: FOUNDATION &amp; ACCESS SECURITY
              </span>
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold">
                $0.00 SMS GATEWAY COST
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white mt-1.5">
              Admin Whitelist, Cryptographic PIN Hash &amp; Device Binding Console
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Manage verified WAEC field personnel, inspect <code className="text-amber-300">safe_device</code> anti-spoofing status, unbind replacement handsets, and audit brute-force PIN lockouts in real time.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">WHITELISTED</span>
              <strong className="text-emerald-400 text-base">
                {officers.filter((o) => o.whitelisted).length}
              </strong>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">LOCKED / FLAGGED</span>
              <strong className="text-red-400 text-base">
                {
                  officers.filter(
                    (o) =>
                      o.locked_out ||
                      o.device_integrity.is_rooted ||
                      o.device_integrity.is_mock_location
                  ).length
                }
              </strong>
            </div>
            <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block">AUDIT EVENTS</span>
              <strong className="text-sky-400 text-base">{auditLogs.length}</strong>
            </div>
          </div>
        </div>

        {/* Top Grid: Provisioning Form + Officer Security Roster */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: PROVISION NEW WHITELISTED OFFICER */}
          <form
            onSubmit={handleProvisionOfficer}
            className="lg:col-span-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3.5 text-xs"
          >
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <UserPlus className="w-4 h-4" />
              <span>Provision Whitelisted WAEC Officer</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Pre-registers an officer phone number with a salted 4-digit PIN hash. On first login, the officer&apos;s hardware <code className="text-sky-300">device_id</code> is automatically bound.
            </p>

            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Full Name</label>
              <input
                type="text"
                required
                placeholder="e.g., Nana YawBoadu"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  Phone Number (ID)
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">
                  4-Digit Security PIN
                </label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="\d{4}"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-amber-400 font-mono font-bold tracking-widest text-center"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] space-y-1">
              <div className="text-slate-400 flex items-center gap-1">
                <Hash className="w-3 h-3 text-amber-400" /> Salted RTDB <code className="text-amber-300">pin_hash</code> Preview:
              </div>
              <div className="text-emerald-400 break-all">{liveHashPreview}</div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Operational Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as OfficerProfile['role'])}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="Field Monitoring Officer">Field Monitoring Officer</option>
                  <option value="Paper Escort Lead">Paper Escort Lead</option>
                  <option value="Depot / Escort Supervisor">Depot / Escort Supervisor</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Assigned Zone</label>
                <input
                  type="text"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Assigned Center</label>
                <select
                  value={centerId}
                  onChange={(e) => setCenterId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  {Object.values(dbState.centers).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Escort Route</label>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  {Object.values(dbState.routes).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition"
            >
              Authorize &amp; Write to RTDB Whitelist
            </button>
          </form>

          {/* RIGHT: WHITELISTED OFFICERS & HARDWARE BINDING TABLE */}
          <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Active Officer Whitelist, PIN Hashes &amp; Hardware Bindings
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                3 Failed PINs = Auto Lockout
              </span>
            </div>

            <div className="space-y-3">
              {officers.map((officer) => {
                const isCompromised =
                  officer.device_integrity.is_rooted ||
                  officer.device_integrity.is_mock_location;
                const customPinVal = pinResetValues[officer.id] ?? '';

                return (
                  <div
                    key={officer.id}
                    className={`p-4 rounded-xl border transition text-xs ${
                      officer.locked_out || isCompromised
                        ? 'bg-red-950/30 border-red-500/70'
                        : !officer.whitelisted
                        ? 'bg-slate-950/40 border-slate-800 opacity-75'
                        : 'bg-slate-950/90 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white">
                            {officer.name}
                          </span>
                          <span className="font-mono text-[11px] text-amber-400">
                            {officer.phone}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                              officer.locked_out
                                ? 'bg-red-600 text-white'
                                : !officer.whitelisted
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                            }`}
                          >
                            {officer.locked_out
                              ? 'LOCKED OUT (3 STRIKES)'
                              : officer.whitelisted
                              ? 'WHITELISTED'
                              : 'SUSPENDED'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {officer.role} • Zone: {officer.assigned_zone}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => onTestOfficerLogin(officer.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-semibold text-[11px]"
                        >
                          <Smartphone className="w-3.5 h-3.5" /> Test Handset Login
                        </button>

                        <button
                          onClick={() =>
                            sentinelSync.adminToggleOfficerWhitelist(
                              officer.id,
                              !officer.whitelisted || Boolean(officer.locked_out)
                            )
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-[11px] transition ${
                            officer.locked_out || !officer.whitelisted
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              : 'bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/50'
                          }`}
                        >
                          {officer.locked_out ? (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Unlock Account
                            </>
                          ) : officer.whitelisted ? (
                            <>
                              <Ban className="w-3.5 h-3.5" /> Suspend
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Re-Whitelist
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Cryptographic & Hardware Binding Row */}
                    <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px]">
                      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">
                          PIN / SALTED SHA DIGEST
                        </span>
                        <div className="text-slate-200 mt-0.5">
                          Demo PIN: <strong className="text-amber-400">{officer.pin_demo}</strong> (Fails:{' '}
                          {officer.failed_attempts || 0}/3)
                        </div>
                        <div className="text-[10px] text-slate-400 truncate" title={officer.pin_hash}>
                          Hash: {officer.pin_hash}
                        </div>
                      </div>

                      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-500 block">
                            HARDWARE DEVICE BINDING
                          </span>
                          <div className="text-sky-300 font-bold truncate mt-0.5">
                            {officer.device_integrity.bound_device_id || 'UNBOUND (Binds on 1st Login)'}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {officer.device_integrity.device_model}
                          </div>
                        </div>
                        {officer.device_integrity.bound_device_id && (
                          <button
                            onClick={() => sentinelSync.adminUnbindOfficerDevice(officer.id)}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] shrink-0 flex items-center gap-1"
                            title="Unbind hardware ID so officer can sign in on a replacement handset"
                          >
                            <Unlink className="w-3 h-3" /> Unbind
                          </button>
                        )}
                      </div>

                      <div className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-slate-500 block">
                            SAFE_DEVICE TELEMETRY
                          </span>
                          {isCompromised ? (
                            <span className="text-red-400 font-bold flex items-center gap-1 mt-0.5">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              {officer.device_integrity.is_rooted ? 'ROOTED OS' : 'MOCK GPS'}
                            </span>
                          ) : (
                            <span className="text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                              <ShieldCheck className="w-3.5 h-3.5" /> VERIFIED CLEAN
                            </span>
                          )}
                        </div>

                        {/* Admin PIN Re-Issue Control */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            maxLength={4}
                            placeholder="New PIN"
                            value={customPinVal}
                            onChange={(e) =>
                              setPinResetValues({
                                ...pinResetValues,
                                [officer.id]: e.target.value.replace(/\D/g, ''),
                              })
                            }
                            className="w-16 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-amber-400 text-center text-[11px]"
                          />
                          <button
                            onClick={() => {
                              const nextPin = customPinVal || '1234';
                              if (/^\d{4}$/.test(nextPin)) {
                                sentinelSync.adminResetOfficerPin(officer.id, nextPin);
                                setPinResetValues({ ...pinResetValues, [officer.id]: '' });
                              }
                            }}
                            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1"
                            title="Re-issue 4-digit PIN and clear any security flags"
                          >
                            <KeyRound className="w-3 h-3" /> Reset PIN
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Grid: Immutable Security Audit Stream + Firebase RTDB Rules Enforcer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" /> Real-Time Authentication &amp; Security Audit Log (<code className="text-sky-300">/auth_audit_logs</code>)
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">Append-Only RTDB Node</span>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {auditLogs.map((log) => {
                const isError = log.event_type.startsWith('AUTH_BLOCKED') || log.event_type === 'AUTH_FAILED_PIN';
                const isAdmin = log.event_type.startsWith('ADMIN_');
                return (
                  <div
                    key={log.id}
                    className={`p-3 rounded-xl border font-mono text-[11px] flex items-start justify-between gap-3 ${
                      isError
                        ? 'bg-red-950/30 border-red-500/50 text-red-200'
                        : isAdmin
                        ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isError
                              ? 'bg-red-600 text-white'
                              : isAdmin
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                          }`}
                        >
                          {log.event_type}
                        </span>
                        <strong className="text-white">{log.officer_name}</strong>
                        <span className="text-slate-400">({log.phone})</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs">{log.details}</p>
                      <div className="text-[10px] text-slate-500">
                        Device ID: {log.device_id} • Model: {log.device_model}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-amber-400" /> Phase 1 Firebase RTDB Security Rules
              </h3>
              <span className="text-[10px] font-mono text-amber-400">firebase/database.rules.json</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Server-side write rules guarantee that even if a malicious client modifies local app state, Firebase rejects location writes if <code className="text-amber-300">whitelisted !== true</code>, <code className="text-amber-300">locked_out === true</code>, or <code className="text-amber-300">is_mock_location === true</code>.
            </p>
            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-60">
{`"live_locations": {
  "$officer_id": {
    ".write": "auth != null && auth.uid === $officer_id
      && root.child('officers').child($officer_id).child('whitelisted').val() === true
      && root.child('officers').child($officer_id).child('locked_out').val() !== true
      && root.child('officers').child($officer_id).child('device_integrity/is_rooted').val() === false
      && root.child('officers').child($officer_id).child('device_integrity/is_mock_location').val() === false"
  }
}`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
