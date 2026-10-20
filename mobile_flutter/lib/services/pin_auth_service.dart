import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:firebase_database/firebase_database.dart';
import 'anti_spoof_service.dart';

class PinAuthResult {
  final bool success;
  final String? officerId;
  final String? errorMessage;

  const PinAuthResult({
    required this.success,
    this.officerId,
    this.errorMessage,
  });
}

/// Phase 1 (Module A): Zero-Cost Phone Number + Salted 4-Digit PIN Whitelist Auth
/// & Hardware Device Fingerprint Binding (`bound_device_id`).
class PinAuthService {
  static const String _salt = 'WAEC_SENTINEL_V1_SALT_2026';

  static String computeSaltedPinSha256(String phone, String pin) {
    final normalizedPhone = phone.replaceAll(RegExp(r'\s+'), '');
    final payload = '$_salt:$normalizedPhone:${pin.trim()}';
    return sha256.convert(utf8.encode(payload)).toString();
  }

  static Future<PinAuthResult> authenticateWithPhoneAndPin({
    required String officerId,
    required String phone,
    required String pin,
    required String hardwareDeviceId,
    required String deviceModel,
  }) async {
    // 1. Run `safe_device` anti-spoofing & root detection pre-flight check
    final integrity = await AntiSpoofService.verifyDeviceIntegrity();
    if (!integrity.isSafe) {
      await _writeAuditLog(
        officerId: officerId,
        phone: phone,
        eventType: 'AUTH_BLOCKED_SAFE_DEVICE',
        deviceId: hardwareDeviceId,
        deviceModel: deviceModel,
        details: integrity.blockReason ?? 'Blocked by safe_device',
      );
      return PinAuthResult(
        success: false,
        errorMessage: integrity.blockReason,
      );
    }

    final officerRef = FirebaseDatabase.instance.ref('officers/$officerId');
    final snapshot = await officerRef.get();
    if (!snapshot.exists || snapshot.value == null) {
      return const PinAuthResult(
        success: false,
        errorMessage: 'Officer phone not found in WAEC Whitelist.',
      );
    }

    final data = Map<String, dynamic>.from(snapshot.value as Map);
    if (data['whitelisted'] != true) {
      return const PinAuthResult(
        success: false,
        errorMessage: 'Officer access is suspended in WAEC Whitelist.',
      );
    }

    if (data['locked_out'] == true) {
      return const PinAuthResult(
        success: false,
        errorMessage: 'Account locked after 3 failed PIN attempts. Contact Command Lead.',
      );
    }

    // 2. Verify Cryptographic PIN Hash
    final String expectedHash = data['pin_hash'] as String? ?? '';
    final String candidateHash = computeSaltedPinSha256(phone, pin);

    if (candidateHash != expectedHash) {
      final int attempts = ((data['failed_attempts'] as int?) ?? 0) + 1;
      final bool lockNow = attempts >= 3;
      await officerRef.update({
        'failed_attempts': attempts,
        'locked_out': lockNow,
      });

      await _writeAuditLog(
        officerId: officerId,
        phone: phone,
        eventType: lockNow ? 'AUTH_BLOCKED_LOCKOUT' : 'AUTH_FAILED_PIN',
        deviceId: hardwareDeviceId,
        deviceModel: deviceModel,
        details: 'Failed PIN attempt $attempts of 3.',
      );

      return PinAuthResult(
        success: false,
        errorMessage: lockNow
            ? 'SECURITY LOCKOUT: 3 failed PIN attempts!'
            : 'Invalid 4-digit PIN (${3 - attempts} attempt(s) remaining).',
      );
    }

    // 3. Enforce Hardware Device Binding (`bound_device_id`)
    final integrityNode = Map<String, dynamic>.from(
      (data['device_integrity'] as Map?) ?? {},
    );
    final String? boundDeviceId = integrityNode['bound_device_id'] as String?;
    if (boundDeviceId != null &&
        boundDeviceId.isNotEmpty &&
        boundDeviceId != hardwareDeviceId) {
      await _writeAuditLog(
        officerId: officerId,
        phone: phone,
        eventType: 'AUTH_BLOCKED_DEVICE_MISMATCH',
        deviceId: hardwareDeviceId,
        deviceModel: deviceModel,
        details: 'Bound device mismatch! Expected $boundDeviceId',
      );
      return PinAuthResult(
        success: false,
        errorMessage:
            'Handset mismatch! Account is bound to $boundDeviceId. Request Admin Unbind.',
      );
    }

    // 4. Bind Hardware ID & Mark Officer ONLINE
    await officerRef.update({
      'failed_attempts': 0,
      'locked_out': false,
      'status': 'ONLINE',
      'device_integrity': {
        ...integrity.toRtdbJson(),
        'bound_device_id': hardwareDeviceId,
        'device_model': deviceModel,
      },
    });

    await _writeAuditLog(
      officerId: officerId,
      phone: phone,
      eventType: 'AUTH_SUCCESS',
      deviceId: hardwareDeviceId,
      deviceModel: deviceModel,
      details: 'Verified Phone + PIN Hash & Bound Hardware ID.',
    );

    return PinAuthResult(success: true, officerId: officerId);
  }

  static Future<void> _writeAuditLog({
    required String officerId,
    required String phone,
    required String eventType,
    required String deviceId,
    required String deviceModel,
    required String details,
  }) async {
    final auditRef = FirebaseDatabase.instance.ref('auth_audit_logs').push();
    await auditRef.set({
      'officer_id': officerId,
      'phone': phone,
      'event_type': eventType,
      'device_id': deviceId,
      'device_model': deviceModel,
      'details': details,
      'timestamp': ServerValue.timestamp,
    });
  }
}
