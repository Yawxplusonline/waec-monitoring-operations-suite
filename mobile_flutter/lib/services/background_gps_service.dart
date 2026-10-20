import 'dart:async';
import 'dart:ui';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:latlong2/latlong.dart';
import 'hive_offline_sync_service.dart';

/// Phase 2 (Module B): Real-Time GPS Tracking, Adaptive 1s/30s Bandwidth Throttler,
/// 45-Second State Heartbeat Pulse, and Kinematic Velocity-Jump Mock GPS Detection.
class BackgroundGpsService {
  static Future<void> initializeService() async {
    final service = FlutterBackgroundService();

    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onStartBackgroundIsolate,
        autoStart: false,
        isForegroundMode: true,
        notificationChannelId: 'waec_sentinel_gps_channel',
        initialNotificationTitle: 'WAEC Sentinel Active Shift',
        initialNotificationContent: 'Streaming verified escort & center telemetry',
        foregroundServiceNotificationId: 8842,
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: onStartBackgroundIsolate,
        onBackground: onIosBackground,
      ),
    );
  }

  @pragma('vm:entry-point')
  static Future<bool> onIosBackground(ServiceInstance service) async {
    DartPluginRegistrant.ensureInitialized();
    return true;
  }

  @pragma('vm:entry-point')
  static void onStartBackgroundIsolate(ServiceInstance service) async {
    DartPluginRegistrant.ensureInitialized();
    await HiveOfflineSyncService.initBoxes();
    final battery = Battery();
    const distanceCalc = Distance();

    String activeOfficerId = 'officer_001';
    bool transitMode = false;
    DateTime lastSentTimestamp = DateTime.fromMillisecondsSinceEpoch(0);
    Position? previousPosition;

    service.on('setOfficerContext').listen((event) {
      if (event != null) {
        activeOfficerId = event['officerId'] as String? ?? activeOfficerId;
        transitMode = event['transitMode'] as bool? ?? transitMode;
      }
    });

    service.on('stopService').listen((_) {
      service.stopSelf();
    });

    // Configure Firebase RTDB onDisconnect() to flip status to OFFLINE after network drop
    final officerRef = FirebaseDatabase.instance.ref('officers/$activeOfficerId');
    await officerRef.child('status').onDisconnect().set('OFFLINE');
    await officerRef.update({
      'status': 'ONLINE',
      'last_heartbeat': ServerValue.timestamp,
    });

    // Periodic 15-second State Heartbeat (ensures officer stays within 45s watchdog window)
    Timer.periodic(const Duration(seconds: 15), (timer) async {
      try {
        await officerRef.update({
          'status': 'ONLINE',
          'last_heartbeat': ServerValue.timestamp,
        });
      } catch (_) {
        // Offline: server watchdog will mark OFFLINE after 45 seconds
      }
    });

    Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 0,
      ),
    ).listen((Position pos) async {
      final double speedKmh = (pos.speed * 3.6).clamp(0.0, 220.0);
      final bool isMoving = speedKmh > 5.0;
      final Duration minInterval = isMoving
          ? const Duration(seconds: 1)
          : const Duration(seconds: 30);

      final DateTime now = DateTime.now();
      if (now.difference(lastSentTimestamp) < minInterval) {
        return; // Intelligent throttle skip (< 6% battery/hr standard)
      }

      // Kinematic velocity-jump anti-spoofing check (> 250 km/h teleport)
      bool kinematicSpoofDetected = false;
      if (previousPosition != null) {
        final double meters = distanceCalc.as(
          LengthUnit.Meter,
          LatLng(previousPosition!.latitude, previousPosition!.longitude),
          LatLng(pos.latitude, pos.longitude),
        );
        final double dtSec =
            now.difference(lastSentTimestamp).inMilliseconds / 1000.0;
        if (dtSec > 0 && meters > 2000 && (meters / dtSec) * 3.6 > 250) {
          kinematicSpoofDetected = true;
        }
      }
      previousPosition = pos;
      lastSentTimestamp = now;

      final int batteryLevel = await battery.batteryLevel;
      final payload = <String, dynamic>{
        'lat': pos.latitude,
        'lng': pos.longitude,
        'heading': pos.heading,
        'speed': double.parse(speedKmh.toStringAsFixed(1)),
        'battery': batteryLevel,
        'transit_mode': transitMode,
        'is_mock': pos.isMocked || kinematicSpoofDetected,
        'updated_at': now.millisecondsSinceEpoch,
      };

      try {
        await FirebaseDatabase.instance
            .ref('live_locations/$activeOfficerId')
            .set(payload);
        await HiveOfflineSyncService.flushAllQueuesSequentially();
      } catch (_) {
        await HiveOfflineSyncService.bufferTelemetryPacket(
          activeOfficerId,
          payload,
        );
      }
    });
  }
}
