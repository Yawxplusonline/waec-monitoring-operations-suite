import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';

/// Module E: Watermarked Evidence Capture in Flutter Canvas.
/// Burns GPS coordinates, UTC timestamp, Center ID, and Officer ID directly onto the image pixels
/// prior to compression and upload to Firebase Cloud Storage.
class WatermarkCaptureService {
  static Future<Uint8List> burnForensicWatermark({
    required ui.Image originalImage,
    required String officerId,
    required String centerId,
    required double lat,
    required double lng,
  }) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final double width = originalImage.width.toDouble();
    final double height = originalImage.height.toDouble();

    // 1. Draw raw camera frame
    canvas.drawImage(originalImage, Offset.zero, Paint());

    // 2. Draw semi-transparent forensic footer bar
    final footerPaint = Paint()..color = const Color(0xD9090D16);
    const double footerHeight = 110.0;
    canvas.drawRect(
      Rect.fromLTWH(0, height - footerHeight, width, footerHeight),
      footerPaint,
    );

    // 3. Burn metadata text directly onto image pixels
    final String stampText =
        'WAEC SENTINEL FORENSIC EVIDENCE | OFFICER: $officerId | CENTER: $centerId\n'
        'GPS: ${lat.toStringAsFixed(6)}, ${lng.toStringAsFixed(6)} | UTC: ${DateTime.now().toUtc().toIso8601String()}';

    final textPainter = TextPainter(
      text: TextSpan(
        text: stampText,
        style: const TextStyle(
          color: Color(0xFFFBBF24),
          fontSize: 20,
          fontWeight: FontWeight.bold,
          fontFamily: 'monospace',
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout(maxWidth: width - 32);
    textPainter.paint(canvas, Offset(16, height - footerHeight + 22));

    final picture = recorder.endRecording();
    final watermarkedImage =
        await picture.toImage(originalImage.width, originalImage.height);
    final byteData =
        await watermarkedImage.toByteData(format: ui.ImageByteFormat.png);

    return byteData!.buffer.asUint8List();
  }
}
