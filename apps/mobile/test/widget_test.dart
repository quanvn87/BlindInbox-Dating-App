import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:slow_dating/app/app.dart';

void main() {
  testWidgets('app starts on the sign-in placeholder', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: SlowDatingApp()));
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
  });
}
