# Slow Dating App Delivery Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each referenced plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chia đặc tả ứng dụng thành các vertical slice độc lập, mỗi slice tạo ra phần mềm chạy được và có cổng kiểm thử trước khi chuyển sang subsystem tiếp theo.

**Architecture:** Flutter client giao tiếp với NestJS modular monolith qua REST/WebSocket. Oracle XE giữ dữ liệu quan hệ, MongoDB giữ phiên chat/tin nhắn và object storage giữ media.

**Tech Stack:** Flutter 3.47.x, Dart 3.13.x, Node.js 24 LTS, NestJS 11, TypeScript, Oracle XE 21c, MongoDB 8.x, MinIO, Jest, Flutter Test.

## Global Constraints

- Toàn bộ sản phẩm, kể cả mục đích bạn bè hoặc nói chuyện, chỉ dành cho người từ 18 tuổi.
- Android là nền tảng hoàn thiện đầu tiên; iOS, web và Windows giữ khả năng build từ cùng Flutter codebase.
- Không lưu ảnh CCCD/video selfie thô trong hệ thống.
- Không lưu binary media trong Oracle hoặc MongoDB.
- Oracle XE 21c bị giới hạn 2 CPU, 2 GB RAM và 12 GB user data.
- Mọi deadline dùng UTC từ server; client không tự quyết định hạn mức hoặc phase.
- Mọi command có side effect phải hỗ trợ idempotency.
- Unit test được dùng fake/mock; repository integration test phải chạy database thật.

---

## Plan 1 — Foundation, Auth, Profile and Preferences

**File:** `docs/project/plans/2026-08-18-foundation-auth-profile.md`

**Deliverable:** Hai client Android có thể đăng nhập bằng development OTP qua backend thật, lưu phiên an toàn, khai hồ sơ 18+, giới tính bản thân, giới tính muốn kết nối, mục đích kết nối và khu vực hành chính trong Oracle XE.

**Exit gate:** Backend integration tests dùng Oracle XE pass; Flutter unit/widget tests pass; Android app hoàn tất onboarding và tải lại đúng hồ sơ sau restart.

## Plan 2 — Search, GPS, Matching and Proposals

**File dự kiến:** `docs/project/plans/2026-08-18-matching-proposals.md`

**Deliverable:** Hàng chờ tự động, GPS snapshot 24 giờ, lọc hai chiều, tối đa ba thẻ/ngày, quẹt trái/phải, lời mở đầu và đề xuất chờ tối đa 72 giờ.

**Exit gate:** Concurrency test chứng minh một người không thể có hai đề xuất/kết nối độc quyền; hai thiết bị nhận cùng proposal và chỉ kết nối khi đồng thuận.

## Plan 3 — Realtime Chat State Machine

**File dự kiến:** `docs/project/plans/2026-08-18-chat-state-machine.md`

**Deliverable:** MongoDB replica set, REST recovery, WebSocket realtime, idempotent message send và toàn bộ phase 10 → 30 → 50 với fake clock.

**Exit gate:** Test đồng thời ở tin cuối không vượt hạn mức; reconnect không mất/trùng tin; các deadline và quyết định chuyển phase pass.

## Plan 4 — Media, Safety, Moderation and Notifications

**File dự kiến:** `docs/project/plans/2026-08-18-safety-media-notifications.md`

**Deliverable:** Object storage, media scanning pipeline, block/report, moderator UI tối thiểu, anti-contact/anti-scam rules, push abstraction và outbox đồng bộ.

**Exit gate:** Block có hiệu lực ngay; file chưa quét không đến người nhận; report gắn message; audit ghi mọi lần moderator mở dữ liệu nhạy cảm.

## Plan 5 — Privacy, Load, Recovery and Android Release Candidate

**File dự kiến:** `docs/project/plans/2026-08-18-hardening-release.md`

**Deliverable:** Xóa/anonymize, retention 90 ngày, backup/restore drill, load test 1.000 WebSocket, security test, Android release candidate và build validation web/Windows/iOS source compatibility.

**Exit gate:** Recovery drill pass; retention job pass; mục tiêu tải đạt; Android build ký thử nghiệm được; web và Windows build thành công; iOS project mở/build được trên macOS CI hoặc máy Mac.

## Sequencing Rule

Chỉ viết và thực thi plan kế tiếp khi exit gate của plan hiện tại đã pass và interface mà plan sau phụ thuộc đã ổn định. Không thêm Redis, microservice, gọi video, thanh toán hoặc phát nhạc trong năm plan này.
