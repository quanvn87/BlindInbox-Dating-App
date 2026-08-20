import 'package:flutter/material.dart';
import 'package:slow_dating/features/profile/domain/profile_models.dart';

final class LocationSelector extends StatelessWidget {
  const LocationSelector({
    required this.title,
    required this.locations,
    required this.selectedCode,
    required this.keyPrefix,
    required this.onChanged,
    this.isRequired = false,
    this.provinceOnly = false,
    super.key,
  });

  final String title;
  final List<LocationOption> locations;
  final String? selectedCode;
  final String keyPrefix;
  final ValueChanged<String?> onChanged;
  final bool isRequired;
  final bool provinceOnly;

  @override
  Widget build(BuildContext context) {
    final byCode = {for (final location in locations) location.code: location};
    final selected = byCode[selectedCode];
    final ward = selected?.level == LocationLevel.ward ? selected : null;
    final district = switch (selected?.level) {
      LocationLevel.district => selected,
      LocationLevel.ward => byCode[ward?.parentCode],
      _ => null,
    };
    final province = switch (selected?.level) {
      LocationLevel.province => selected,
      LocationLevel.district => byCode[district?.parentCode],
      LocationLevel.ward => byCode[district?.parentCode],
      _ => null,
    };
    final provinces = locations
        .where((location) => location.level == LocationLevel.province)
        .toList();
    final districts = locations
        .where(
          (location) =>
              location.level == LocationLevel.district &&
              location.parentCode == province?.code,
        )
        .toList();
    final wards = locations
        .where(
          (location) =>
              location.level == LocationLevel.ward &&
              location.parentCode == district?.code,
        )
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        KeyedSubtree(
          key: ValueKey('$keyPrefix-province'),
          child: _LocationDropdown(
            key: ValueKey(
              '$keyPrefix-province-value-${province?.code ?? 'none'}',
            ),
            label: isRequired ? 'Province or city *' : 'Province or city',
            options: provinces,
            value: province?.code,
            onChanged: provinces.isEmpty ? null : onChanged,
          ),
        ),
        if (!provinceOnly) ...[
          const SizedBox(height: 8),
          KeyedSubtree(
            key: ValueKey('$keyPrefix-district'),
            child: _LocationDropdown(
              key: ValueKey(
                '$keyPrefix-district-${province?.code ?? 'none'}-'
                '${district?.code ?? 'none'}',
              ),
              label: 'District',
              options: districts,
              value: district?.code,
              onChanged: province == null || districts.isEmpty
                  ? null
                  : onChanged,
            ),
          ),
          const SizedBox(height: 8),
          KeyedSubtree(
            key: ValueKey('$keyPrefix-ward'),
            child: _LocationDropdown(
              key: ValueKey(
                '$keyPrefix-ward-${district?.code ?? 'none'}-'
                '${ward?.code ?? 'none'}',
              ),
              label: 'Ward',
              options: wards,
              value: ward?.code,
              onChanged: district == null || wards.isEmpty ? null : onChanged,
            ),
          ),
        ],
        if (!isRequired && selectedCode != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => onChanged(null),
              child: const Text('Clear location'),
            ),
          ),
      ],
    );
  }
}

final class _LocationDropdown extends StatelessWidget {
  const _LocationDropdown({
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    super.key,
  });

  final String label;
  final List<LocationOption> options;
  final String? value;
  final ValueChanged<String?>? onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: [
        for (final option in options)
          DropdownMenuItem(value: option.code, child: Text(option.name)),
      ],
      onChanged: onChanged,
    );
  }
}
