import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:blind_inbox/features/auth/presentation/auth_controller.dart';

final class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

final class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  late final TextEditingController _phoneController;

  @override
  void initState() {
    super.initState();
    _phoneController = TextEditingController(
      text: ref.read(authControllerProvider).phone,
    );
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final sent = await ref
        .read(authControllerProvider.notifier)
        .requestOtp(_phoneController.text);
    if (sent && mounted) {
      context.go('/verify-code');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    return Scaffold(
      key: const ValueKey('phone-screen'),
      appBar: AppBar(title: const Text('Sign in')),
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
                      'Continue with your phone',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Enter a Vietnamese mobile number. We will send a six-digit code.',
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    key: const ValueKey('phone-input'),
                    controller: _phoneController,
                    enabled: !state.isRequesting,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    textInputAction: TextInputAction.send,
                    onSubmitted: state.isBusy ? null : (_) => _submit(),
                    decoration: const InputDecoration(
                      labelText: 'Phone number',
                      hintText: '090 123 4567',
                      border: OutlineInputBorder(),
                    ),
                  ),
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
                    onPressed: state.isBusy ? null : _submit,
                    child: state.isRequesting
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              semanticsLabel: 'Sending code',
                            ),
                          )
                        : const Text('Send code'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
