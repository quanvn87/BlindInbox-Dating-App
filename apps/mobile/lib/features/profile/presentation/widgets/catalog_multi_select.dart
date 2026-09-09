import 'package:flutter/material.dart';
import 'package:blind_inbox/features/profile/domain/profile_models.dart';

final class CatalogMultiSelect extends StatelessWidget {
  const CatalogMultiSelect({
    required this.title,
    required this.options,
    required this.selectedCodes,
    required this.keyPrefix,
    required this.onToggle,
    super.key,
  });

  final String title;
  final List<CatalogOption> options;
  final List<String> selectedCodes;
  final String keyPrefix;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        for (final option in options)
          Builder(
            builder: (context) {
              final selected = selectedCodes.contains(option.code);
              return Semantics(
                key: ValueKey('$keyPrefix-${option.code}'),
                selected: selected,
                child: CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(option.label),
                  value: selected,
                  onChanged: (_) => onToggle(option.code),
                ),
              );
            },
          ),
      ],
    );
  }
}
