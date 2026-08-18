import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:slow_dating/features/auth/presentation/auth_controller.dart';

final class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

final class _OtpScreenState extends ConsumerState<OtpScreen> {
  final TextEditingController _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    await ref
        .read(authControllerProvider.notifier)
        .verifyOtp(_codeController.text);
  }

  Future<void> _resend() async {
    await ref.read(authControllerProvider.notifier).resendOtp();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    return Scaffold(
      key: const ValueKey('otp-screen'),
      appBar: AppBar(
        leading: IconButton(
          tooltip: 'Change phone number',
          onPressed: state.isBusy ? null : () => context.go('/sign-in'),
          icon: const Icon(Icons.arrow_back),
        ),
        title: const Text('Verify code'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      'Enter your code',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text('Use the six-digit code sent to your phone.'),
                  const SizedBox(height: 24),
                  TextField(
                    key: const ValueKey('otp-input'),
                    controller: _codeController,
                    enabled: !state.isVerifying,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(6),
                    ],
                    textInputAction: TextInputAction.done,
                    onSubmitted: state.isBusy ? null : (_) => _verify(),
                    decoration: const InputDecoration(
                      labelText: 'Six-digit code',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (!state.hasChallenge) ...[
                    const SizedBox(height: 12),
                    const Text('Request a code before verifying.'),
                  ],
                  if (state.errorMessage case final message?) ...[
                    const SizedBox(height: 12),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        message,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: state.isBusy || !state.hasChallenge
                        ? null
                        : _verify,
                    child: state.isVerifying
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              semanticsLabel: 'Verifying code',
                            ),
                          )
                        : const Text('Verify code'),
                  ),
                  if (state.hasChallenge) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: state.canResend ? _resend : null,
                      child: Text(
                        state.canResend
                            ? 'Resend code'
                            : 'Resend in ${state.remainingSeconds}s',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
