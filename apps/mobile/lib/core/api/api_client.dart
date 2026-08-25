import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

const configuredApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000/v1',
);

Dio createApiClient({String baseUrl = configuredApiBaseUrl}) {
  return Dio(BaseOptions(baseUrl: baseUrl));
}

final apiBaseUrlProvider = Provider<String>((ref) => configuredApiBaseUrl);

final apiClientProvider = Provider<Dio>((ref) {
  final client = createApiClient(baseUrl: ref.watch(apiBaseUrlProvider));
  ref.onDispose(() => client.close(force: true));
  return client;
});
