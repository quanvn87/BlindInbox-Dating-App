import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:xml/xml.dart';

void main() {
  const securePreferenceFiles = <String>{
    'FlutterSecureStorage.xml',
    'FlutterSecureKeyStorage.xml',
    'FlutterSecureStorageConfiguration.xml',
  };

  test('Android backup rules exclude flutter_secure_storage preferences', () {
    final manifest = File('android/app/src/main/AndroidManifest.xml')
        .readAsStringSync();
    final extractionRulesFile = File(
      'android/app/src/main/res/xml/data_extraction_rules.xml',
    );
    final legacyRulesFile = File(
      'android/app/src/main/res/xml/backup_rules.xml',
    );

    expect(manifest, contains('android:allowBackup="false"'));
    expect(
      manifest,
      contains('android:dataExtractionRules="@xml/data_extraction_rules"'),
    );
    expect(manifest, contains('android:fullBackupContent="@xml/backup_rules"'));
    expect(extractionRulesFile.existsSync(), isTrue);
    expect(legacyRulesFile.existsSync(), isTrue);

    final extractionRules = extractionRulesFile.readAsStringSync();
    final legacyRules = legacyRulesFile.readAsStringSync();

    expect(() => XmlDocument.parse(extractionRules), returnsNormally);
    expect(() => XmlDocument.parse(legacyRules), returnsNormally);
    expect(extractionRules, contains('<data-extraction-rules>'));
    expect(extractionRules, contains('<cloud-backup>'));
    expect(extractionRules, contains('<device-transfer>'));
    expect(legacyRules, contains('<full-backup-content>'));

    final cloudBackup = _section(extractionRules, 'cloud-backup');
    final deviceTransfer = _section(extractionRules, 'device-transfer');
    for (final preferenceFile in securePreferenceFiles) {
      final exclusion =
          '<exclude domain="sharedpref" path="$preferenceFile" />';
      expect(cloudBackup, contains(exclusion));
      expect(deviceTransfer, contains(exclusion));
      expect(legacyRules, contains(exclusion));
    }

    expect(
      RegExp(r'<exclude\b[^>]*>').allMatches(cloudBackup),
      hasLength(3),
      reason: 'Only secure-storage preferences should be excluded from cloud backup.',
    );
    expect(
      RegExp(r'<exclude\b[^>]*>').allMatches(deviceTransfer),
      hasLength(3),
      reason: 'Only secure-storage preferences should be excluded.',
    );
    expect(
      RegExp(r'<exclude\b[^>]*>').allMatches(legacyRules),
      hasLength(3),
      reason: 'Only secure-storage preferences should be excluded.',
    );
  });
}

String _section(String xml, String sectionName) {
  final match = RegExp('<$sectionName>([\\s\\S]*?)</$sectionName>')
      .firstMatch(xml);

  expect(match, isNotNull, reason: 'Missing <$sectionName> backup rules.');
  return match!.group(1)!;
}
