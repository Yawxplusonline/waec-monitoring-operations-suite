import 'dart:async';
import 'package:flutter/services.dart';
import 'package:firebase_database/firebase_database.dart';

/// Module C: Hardware Silent SOS Listener & Dual Panic Trigger.
/// Detects 3 Volume-Down hardware presses within 1.5 seconds (1500ms)
/// and immediately writes `/alerts/{alert_id}` + triggers 15-second ambient audio capture.
class SosHardwareListener {
  static final List<int> _volumeDownTimestamps = [];
  static const int _requiredPresses = 3;
  static const int _windowMs = 1500;

  static void attachVolumeDownListener({
    required String officerId,
    required double Function() getLat,
    required double Function() getLng,
    required Future<void> Function(String alertId) onRecord15sAmbientAudio,
  }) {
    HardwareKeyboard.instance.addHandler((KeyEvent event) {
      if (event is KeyDownEvent &&
          event.logicalKey == LogicalKeyboardKey.audioVolumeDown) {
        final int now = DateTime.now().millisecondsSinceEpoch;
        _volumeDownTimestamps.add(now);
        _volumeDownTimestamps.removeWhere((t) => now - t > _windowMs);

        if (_volumeDownTimestamps.length >= _requiredPresses) {
          _volumeDownTimestamps.clear();
          triggerEmergencySos(
            officerId: officerId,
            lat: getLat(),
            lng: getLng(),
            type: 'SILENT_SOS',
            onRecord15sAmbientAudio: onRecord15sAmbientAudio,
          );
        }
        return true;
      }
      return false;
    });
  }

  static Future<void> triggerEmergencySos({
    required String officerId,
    required double lat,
    required double lng,
    required String type, // 'SILENT_SOS' | 'VISUAL_SOS'
    required Future<void> Function(String alertId) onRecord15sAmbientAudio,
  }) async {
    final String alertId = 'alert_${DateTime.now().millisecondsSinceEpoch}';
    final DatabaseReference alertRef =
        FirebaseDatabase.instance.ref('alerts/$alertId');

    await alertRef.set({
      'officer_id': officerId,
      'lat': lat,
      'lng': lng,
      'type': type,
      'status': 'ACTIVE',
      'timestamp': ServerValue.timestamp,
    });

    // Silently record 15 seconds of ambient audio and upload to Firebase Storage
    unawaited(onRecord15sAmbientAudio(alertId));
  }
}
