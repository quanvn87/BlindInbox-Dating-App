# BlindInbox Application Renaming Design

**Date:** 2026-09-09  
**Status:** Approved for planning

## Goal

Rename the unreleased application from Slow Dating to BlindInbox throughout the
repository. The new name must be consistent for users, platform identifiers,
source imports, generated API documentation, and project documentation.

## Scope

### Flutter application

- Change the Dart package name from `slow_dating` to `blind_inbox`.
- Update every Dart import using the old package name.
- Change user-visible copy, including the Material application title and
  onboarding age-validation messages, from “Slow Dating” to “BlindInbox”.

### Android

- Change the namespace and application ID from `com.quan.slow_dating` to
  `com.quan.blindinbox`.
- Move the Kotlin source path and update its package declaration accordingly.
- Set the Android launcher label to `BlindInbox`.

The new application ID intentionally makes Android treat BlindInbox as a new
application. There are no released users or compatibility obligations yet.

### iOS, web, and Windows

- Set iOS display name to `BlindInbox` and bundle identifier to
  `com.quan.blindInbox`.
- Set web document title, progressive-web-app manifest name, and short name to
  `BlindInbox`.
- Set Windows executable and visible product metadata to `blind_inbox` and
  `BlindInbox` as appropriate for each platform convention.

### API and documentation

- Rename the OpenAPI contract from `slow-dating-v1.json` to
  `blindinbox-v1.json`, update generation/check scripts, and change the API
  title to `BlindInbox API`.
- Update README, architecture/design documents, roadmap, setup instructions,
  and other active product references to BlindInbox.
- Preserve historical plan filenames and commit-history references when a
  rename would make a historical document misleading. Their prose may still
  explain that the product is now BlindInbox.

## Non-goals

- No database schema, API endpoint, authentication, matching, chat, or product
  behavior changes.
- No migration support from the old Android app, because it has not been
  released.
- No changes to the GitHub repository URL. It remains
  `quanvn87/BlindInbox-Dating-App`.

## Verification

- Search the active application source, configuration, and documentation for
  obsolete `slow_dating` and “Slow Dating” references, allowing only deliberate
  historical references.
- Run Flutter formatting, analysis, tests, and a release APK build.
- Run API linting, build, unit tests, and deterministic OpenAPI generation.
- Confirm generated Android output uses `com.quan.blindinbox`.

## Risks and handling

Package identifiers appear in platform-specific files. A checklist-based rename
followed by platform builds will catch inconsistent paths, imports, and build
configuration. Existing debug installations may need uninstalling once because
the application ID changes.
