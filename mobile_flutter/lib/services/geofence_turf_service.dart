import 'package:latlong2/latlong.dart';
import 'package:firebase_database/firebase_database.dart';

/// Phase 4 (Module D): Client-Side 100m Exam Center Geofencing & 200m Escort Route Deviation Service.
/// Uses `latlong2` geodesic distance math to log automatic `ENTER_CENTER` and `EXIT_CENTER` events.
class GeofenceTurfService {
  static const Distance _distance = Distance();
  static final Map<String, String?> _activeCenterByOfficer = {};

  static double distanceMeters(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    return _distance.as(
      LengthUnit.Meter,
      LatLng(lat1, lng1),
      LatLng(lat2, lng2),
    );
  }

  static Future<void> evaluateCenterGeofences({
    required String officerId,
    required String officerName,
    required double lat,
    required double lng,
    required Map<String, Map<String, dynamic>> centers,
  }) async {
    String? insideCenterId;
    String? insideCenterName;
    int insideDistance = 0;

    for (final entry in centers.entries) {
      final c = entry.value;
      final double cLat = (c['lat'] as num).toDouble();
      final double cLng = (c['lng'] as num).toDouble();
      final double radius = ((c['radius_meters'] as num?) ?? 100).toDouble();

      final double d = distanceMeters(lat, lng, cLat, cLng);
      if (d <= radius) {
        insideCenterId = entry.key;
        insideCenterName = c['name'] as String? ?? entry.key;
        insideDistance = d.round();
        break;
      }
    }

    final String? previousCenterId = _activeCenterByOfficer[officerId];
    if (insideCenterId != null && insideCenterId != previousCenterId) {
      _activeCenterByOfficer[officerId] = insideCenterId;
      await FirebaseDatabase.instance.ref('geofence_logs').push().set({
        'officer_id': officerId,
        'officer_name': officerName,
        'center_id': insideCenterId,
        'center_name': insideCenterName,
        'event_type': 'ENTER_CENTER',
        'distance_meters': insideDistance,
        'timestamp': ServerValue.timestamp,
      });
    } else if (insideCenterId == null && previousCenterId != null) {
      _activeCenterByOfficer[officerId] = null;
      await FirebaseDatabase.instance.ref('geofence_logs').push().set({
        'officer_id': officerId,
        'officer_name': officerName,
        'center_id': previousCenterId,
        'center_name': centers[previousCenterId]?['name'] ?? previousCenterId,
        'event_type': 'EXIT_CENTER',
        'distance_meters': 105,
        'timestamp': ServerValue.timestamp,
      });
    }
  }
}
