import 'package:safe_device/safe_device.dart';

class DeviceIntegrityResult {
  final bool isSafe;
  final bool isJailBrokenOrRooted;
  final bool isMockLocationEnabled;
  final bool isDevelopmentModeEnabled;
  final String? blockReason;

  const DeviceIntegrityResult({
    required this.isSafe,
    required this.isJailBrokenOrRooted,
    required this.isMockLocationEnabled,
    required this.isDevelopmentModeEnabled,
    this.blockReason,
  });

  Map<String, dynamic> toRtdbJson() => {
        'is_rooted': isJailBrokenOrRooted,
        'is_mock_location': isMockLocationEnabled,
        'developer_mode': isDevelopmentModeEnabled,
        'verified_at': DateTime.now().millisecondsSinceEpoch,
      };
}

/// Module A: Device Binding & Anti-Spoofing Verification using `safe_device`.
/// Blocks officers attempting to manipulate GPS coordinates or run on rooted devices.
class AntiSpoofService {
  static Future<DeviceIntegrityResult> verifyDeviceIntegrity() async {
    final bool isJailBroken = await SafeDevice.isJailBroken;
    final bool canMockLocation = await SafeDevice.canMockLocation;
    final bool isDevMode = await SafeDevice.isDevelopmentModeEnable;

    if (isJailBroken) {
      return DeviceIntegrityResult(
        isSafe: false,
        isJailBrokenOrRooted: true,
        isMockLocationEnabled: canMockLocation,
        isDevelopmentModeEnabled: isDevMode,
        blockReason: 'SECURITY BLOCK: Rooted or Jailbroken device detected.',
      );
    }

    if (canMockLocation) {
      return DeviceIntegrityResult(
        isSafe: false,
        isJailBrokenOrRooted: false,
        isMockLocationEnabled: true,
        isDevelopmentModeEnabled: isDevMode,
        blockReason: 'SECURITY BLOCK: Mock GPS Location Spoofing app detected.',
      );
    }

    return DeviceIntegrityResult(
      isSafe: true,
      isJailBrokenOrRooted: false,
      isMockLocationEnabled: false,
      isDevelopmentModeEnabled: isDevMode,
    );
  }
}
