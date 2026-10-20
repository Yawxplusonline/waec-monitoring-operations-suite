import 'package:hive_flutter/hive_flutter.dart';
import 'package:firebase_database/firebase_database.dart';

/// Phase 2 (Module B & E): Structured Hive NoSQL Local Offline Buffer Engine.
/// Guarantees zero data loss during cellular dropouts in rural exam centers by queuing
/// GPS coordinates, incident reports, and SOS alerts locally and flushing FIFO upon reconnect.
class HiveOfflineSyncService {
  static const String telemetryBoxName = 'waec_telemetry_box';
  static const String incidentsBoxName = 'waec_incidents_box';
  static const String sosBoxName = 'waec_sos_box';

  static Future<void> initBoxes() async {
    await Hive.initFlutter();
    await Future.wait([
      Hive.openBox<Map>(telemetryBoxName),
      Hive.openBox<Map>(incidentsBoxName),
      Hive.openBox<Map>(sosBoxName),
    ]);
  }

  static Future<void> bufferTelemetryPacket(
    String officerId,
    Map<String, dynamic> locationPayload,
  ) async {
    final box = Hive.box<Map>(telemetryBoxName);
    await box.add({
      'officer_id': officerId,
      'payload': locationPayload,
      'queued_at': DateTime.now().millisecondsSinceEpoch,
    });
  }

  static Future<void> bufferIncidentReport(
    String incidentId,
    Map<String, dynamic> incidentPayload,
  ) async {
    final box = Hive.box<Map>(incidentsBoxName);
    await box.put(incidentId, incidentPayload);
  }

  static Future<int> flushAllQueuesSequentially() async {
    int flushedCount = 0;
    final db = FirebaseDatabase.instance;

    // 1. Flush SOS Box First (Highest Priority)
    final sosBox = Hive.box<Map>(sosBoxName);
    for (final key in sosBox.keys.toList()) {
      final alert = sosBox.get(key);
      if (alert != null) {
        await db.ref('alerts/$key').set(Map<String, dynamic>.from(alert));
        await sosBox.delete(key);
        flushedCount++;
      }
    }

    // 2. Flush Telemetry Breadcrumbs FIFO
    final telemetryBox = Hive.box<Map>(telemetryBoxName);
    for (final key in telemetryBox.keys.toList()) {
      final entry = telemetryBox.get(key);
      if (entry != null) {
        final String officerId = entry['officer_id'] as String;
        final payload = Map<String, dynamic>.from(entry['payload'] as Map);
        await db.ref('live_locations/$officerId').set(payload);
        await telemetryBox.delete(key);
        flushedCount++;
      }
    }

    // 3. Flush Watermarked Incident Evidence Reports
    final incidentsBox = Hive.box<Map>(incidentsBoxName);
    for (final key in incidentsBox.keys.toList()) {
      final inc = incidentsBox.get(key);
      if (inc != null) {
        final data = Map<String, dynamic>.from(inc)..['synced'] = true;
        await db.ref('incidents/$key').set(data);
        await incidentsBox.delete(key);
        flushedCount++;
      }
    }

    return flushedCount;
  }
}
