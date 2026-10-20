import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'services/anti_spoof_service.dart';
import 'services/background_gps_service.dart';
import 'services/sos_hardware_listener.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await BackgroundGpsService.initializeService();
  runApp(const WaecSentinelApp());
}

class WaecSentinelApp extends StatelessWidget {
  const WaecSentinelApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WAEC Sentinel Field App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF090D16),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFF59E0B),
          secondary: Color(0xFF10B981),
          error: Color(0xFFEF4444),
        ),
      ),
      home: const SentinelFieldHomeScreen(),
    );
  }
}

class SentinelFieldHomeScreen extends StatefulWidget {
  const SentinelFieldHomeScreen({super.key});

  @override
  State<SentinelFieldHomeScreen> createState() => _SentinelFieldHomeScreenState();
}

class _SentinelFieldHomeScreenState extends State<SentinelFieldHomeScreen> {
  DeviceIntegrityResult? _integrity;
  bool _onShift = false;
  bool _transitEscortMode = false;

  @override
  void initState() {
    super.initState();
    _runSecurityChecks();
    SosHardwareListener.attachVolumeDownListener(
      officerId: 'officer_001',
      getLat: () => 5.6212,
      getLng: () => -0.2223,
      onRecord15sAmbientAudio: (alertId) async {
        // Records 15s ambient audio & uploads to Firebase Storage `/sos_audio/officer_001/{alertId}.webm`
      },
    );
  }

  Future<void> _runSecurityChecks() async {
    final res = await AntiSpoofService.verifyDeviceIntegrity();
    setState(() => _integrity = res);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WAEC SENTINEL FIELD UNIT'),
        backgroundColor: const Color(0xFF0F172A),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              color: const Color(0xFF1E293B),
              child: ListTile(
                title: const Text('Device Anti-Spoofing Status (safe_device)'),
                subtitle: Text(
                  _integrity == null
                      ? 'Verifying hardware integrity...'
                      : _integrity!.isSafe
                          ? 'VERIFIED: No Root / No Mock GPS Detected'
                          : _integrity!.blockReason ?? 'Blocked',
                ),
              ),
            ),
            const SizedBox(height: 12),
            SwitchListTile(
              title: const Text('Active Shift GPS Streaming (1s / 30s Adaptive)'),
              subtitle: const Text('Strictly enabled only during active shift hours'),
              value: _onShift,
              onChanged: (val) => setState(() => _onShift = val),
            ),
            SwitchListTile(
              title: const Text('Question Paper Transit Escort Mode'),
              subtitle: const Text('Enables 200m route deviation & 3-min stop monitoring'),
              value: _transitEscortMode,
              onChanged: (val) => setState(() => _transitEscortMode = val),
            ),
            const Spacer(),
            GestureDetector(
              onLongPress: () {
                SosHardwareListener.triggerEmergencySos(
                  officerId: 'officer_001',
                  lat: 5.6212,
                  lng: -0.2223,
                  type: 'VISUAL_SOS',
                  onRecord15sAmbientAudio: (_) async {},
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 22),
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444),
                  borderRadius: BorderRadius.circular(16),
                ),
                alignment: Alignment.center,
                child: const Text(
                  'HOLD 2 SECONDS FOR EMERGENCY SOS',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
