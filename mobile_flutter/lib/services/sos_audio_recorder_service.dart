import 'dart:io';
import 'package:record/record.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:firebase_database/firebase_database.dart';

/// Phase 4 (Module C): Silent 15-Second Ambient SOS Audio Recorder & Encrypted Uploader.
/// Automatically records 15 seconds of ambient audio when a Silent (3x Vol-Down) or Visual SOS
/// is triggered and uploads it to Firebase Cloud Storage (`< 2 MB` Spark tier cap).
class SosAudioRecorderService {
  static final AudioRecorder _recorder = AudioRecorder();

  static Future<String?> record15SecondAmbientSosClip({
    required String officerId,
    required String alertId,
    required String tempDirectoryPath,
  }) async {
    if (!await _recorder.hasPermission()) {
      return null;
    }

    final String filePath = '$tempDirectoryPath/sos_${officerId}_$alertId.m4a';
    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        bitRate: 64000, // Compact ~120KB for 15 seconds to preserve 5GB free storage
        sampleRate: 22050,
      ),
      path: filePath,
    );

    await Future.delayed(const Duration(seconds: 15));
    final String? recordedPath = await _recorder.stop();
    if (recordedPath == null) return null;

    final file = File(recordedPath);
    if (!await file.exists()) return null;

    final storageRef = FirebaseStorage.instance
        .ref('sos_audio/$officerId/$alertId.webm');
    await storageRef.putFile(
      file,
      SettableMetadata(contentType: 'audio/webm'),
    );

    final String downloadUrl = await storageRef.getDownloadURL();
    await FirebaseDatabase.instance
        .ref('alerts/$alertId/audio_url')
        .set(downloadUrl);

    return downloadUrl;
  }
}
