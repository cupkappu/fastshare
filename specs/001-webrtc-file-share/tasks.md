# Tasks: WebRTC 文件共享工具

**Input**: Design documents from `/specs/001-webrtc-file-share/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - only include them if explicitly requested in the feature specification or if user requests TDD approach.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project structure per plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create project structure per implementation plan (src/, tests/, server/)
- [X] T002 Initialize TypeScript project with Vite 8 and Vue 3 dependencies
- [X] T003 [P] Configure ESLint and Prettier for TypeScript + Vue 3
- [X] T004 [P] Create Git repository and .gitignore for Node.js/Vue project
- [X] T005 [P] Setup package.json with scripts (dev, build, test, server)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 [P] Create IndexedDB schema setup in src/utils/storage.ts (shortCodes, pairedDevices, transferHistory stores)
- [X] T007 [P] Implement Cookie utility functions in src/utils/cookie.ts (HttpOnly, Secure, SameSite=Strict)
- [X] T008 [P] Create AES-256 encryption utility in src/utils/crypto.ts (for IndexedDB encryption)
- [X] T009 [P] Implement Base32 encoding/decoding utility in src/utils/base32.ts
- [X] T010 [P] Implement Base32Check2 checksum algorithm in src/utils/checksum.ts
- [X] T011 [P] Create Vue 3 state management store in src/stores/connection.ts
- [X] T012 [P] Create Vue 3 state management store in src/stores/transfer.ts
- [X] T013 [P] Setup error handling and logging utility in src/utils/logger.ts
- [X] T014 [P] Create environment configuration in src/config/index.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 局域网内设备发现与文件传输 (Priority: P1) 🎯 MVP

**Goal**: 用户在同一个 WiFi 网络下打开应用，应用自动发现周围的其他设备，用户可以选择设备并发送文件

**Independent Test**: 两台设备连接同一 WiFi，打开应用后可互相看到，选择文件后能成功传输到对方设备

### Implementation for User Story 1

- [X] T015 [P] [US1] Create Device entity type definition in src/models/device.ts (deviceId, displayName, status, lastSeenAt, capabilities)
- [X] T016 [P] [US1] Create Connection entity type definition in src/models/connection.ts (connectionId, localDeviceId, remoteDeviceId, type, role, status)
- [X] T017 [P] [US1] Create FileTransferSession entity type in src/models/fileTransferSession.ts (sessionId, senderId, receiverId, files, status, transferredBytes)
- [X] T018 [US1] Implement DeviceDiscoveryService in src/services/discovery.ts (WebSocket connection to signaling server, device registration, device list updates)
- [X] T019 [US1] Implement WebRTC connection manager in src/services/webrtc.ts (RTCPeerConnection setup, simple-peer integration, ICE candidate handling)
- [X] T020 [US1] Implement DataChannel file transfer in src/services/transfer.ts (16 KiB chunking, backpressure control, progress tracking)
- [X] T021 [US1] Create DeviceList component in src/components/DeviceList.vue (display discovered devices, online status, selection)
- [X] T022 [US1] Create FileSelector component in src/components/FileSelector.vue (file picker, multi-file support, file size validation)
- [X] T023 [US1] Create TransferProgress component in src/components/TransferProgress.vue (progress bar, speed display, ETA, pause/cancel buttons)
- [X] T024 [US1] Implement file receive and save in src/services/fileReceiver.ts (chunk reassembly, SHA-256 verification, download trigger)
- [X] T025 [US1] Add transfer confirmation dialog in src/components/TransferConfirmDialog.vue (show incoming file details, accept/reject buttons)
- [X] T026 [US1] Implement error handling and retry logic in src/services/transferErrorHandler.ts (connection lost, file too large, storage error)
- [X] T027 [US1] Add logging for US1 operations in src/services/discovery.ts, src/services/webrtc.ts, src/services/transfer.ts

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - 远程设备通过短码连接 (Priority: P2)

**Goal**: 当设备不在同一 WiFi 网络时，发送方可以通过输入短码来连接到远程接收设备，短码存储在 cookie 中，下次自动连接

**Independent Test**: 两台设备在不同网络环境下，发送方输入接收方提供的短码后建立连接，成功传输文件；关闭页面后重新打开，自动连接之前保存的设备

### Implementation for User Story 2

- [X] T028 [P] [US2] Create ShortCode entity type definition in src/models/shortCode.ts (code, deviceId, createdAt, expiresAt, maxAttempts, attemptCount, status, checksum)
- [X] T029 [P] [US2] Create PairedDevice entity type in src/models/pairedDevice.ts (id, localDeviceId, remoteDeviceId, remoteDeviceName, shortCode, lastConnectedAt, autoConnect, expiresAt)
- [X] T030 [US2] Implement ShortCodeGenerator service in src/services/shortCodeGenerator.ts (HMAC-SHA256, Base32 encoding, checksum calculation, 10-minute expiry)
- [X] T031 [US2] Implement ShortCodeVerifier service in src/services/shortCodeVerifier.ts (format validation, checksum verification, expiry check, attempt counting)
- [X] T032 [US2] Create ShortCodeInput component in src/components/ShortCodeInput.vue (8-character input, format validation, error display, connect button)
- [X] T033 [US2] Implement remote connection via short code in src/services/remoteConnection.ts (short code verification, WebRTC offer/answer exchange via signaling server)
- [X] T034 [US2] Implement cookie-based auto-reconnect in src/services/autoReconnect.ts (read paired devices from cookie on startup, auto-connect to last device)
- [X] T035 [US2] Create PairedDeviceList component in src/components/PairedDeviceList.vue (display saved devices, auto-connect status, remove option)
- [X] T036 [US2] Add short code display for receiver in src/components/ShortCodeDisplay.vue (show generated code, copy button, expiry countdown)
- [X] T037 [US2] Implement multi-device short code handling in src/services/shortCodeManager.ts (handle multiple simultaneous connection requests with same short code)
- [X] T038 [US2] Add logging for US2 operations in src/services/shortCodeGenerator.ts, src/services/shortCodeVerifier.ts, src/services/remoteConnection.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - 短码生成与管理 (Priority: P3)

**Goal**: 接收方设备可以生成一个短码供其他设备连接，短码有时效性，可以手动刷新或撤销

**Independent Test**: 接收方生成短码后，其他设备可使用该短码连接；短码过期或撤销后，无法再建立新连接

### Implementation for User Story 3

- [X] T039 [P] [US3] Extend ShortCode entity with refresh and revoke capabilities in src/models/shortCode.ts (add revokedAt field)
- [X] T040 [US3] Implement short code refresh in src/services/shortCodeManager.ts (generate new code, invalidate old code, preserve device mapping)
- [X] T041 [US3] Implement short code revoke in src/services/shortCodeManager.ts (add to revoked list, reject new connection attempts, preserve existing connections)
- [X] T042 [US3] Create ShortCodeManager component in src/components/ShortCodeManager.vue (generate/refresh/revoke buttons, expiry timer, active connections count)
- [X] T043 [US3] Implement short code blacklist in src/services/shortCodeBlacklist.ts (store revoked codes, check on verification, auto-cleanup expired)
- [X] T044 [US3] Add rate limiting for short code attempts in src/services/rateLimiter.ts (max 3 attempts per code, 5 attempts per minute per IP)
- [X] T045 [US3] Add connection request notification in src/components/ConnectionRequestNotification.vue (show incoming connection with device name, accept/reject options)
- [X] T046 [US3] Add logging for US3 operations in src/services/shortCodeManager.ts, src/services/shortCodeBlacklist.ts

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T047 [P] Create signaling server in server/index.js (WebSocket server, device registration, SDP/ICE forwarding, short code management)
- [X] T048 [P] Implement signaling server API per contracts/signaling-api.md (register, discover, offer, answer, ice-candidate, generate-short-code, verify-short-code)
- [X] T049 [P] Add HTTPS configuration for production deployment (self-signed cert for dev, Let's Encrypt for prod)
- [X] T050 [P] Write README.md with quickstart guide (setup, development, deployment instructions)
- [X] T051 [P] Create basic landing page in src/App.vue (device name input, mode selection: sender/receiver, feature overview)
- [X] T052 [P] Add responsive CSS for mobile and desktop in src/styles/responsive.css
- [X] T053 [P] Implement wake lock to prevent sleep during transfer in src/utils/wakeLock.ts
- [X] T054 [P] Add notification permission and transfer complete notifications in src/utils/notifications.ts
- [X] T055 [P] Performance optimization: lazy load components in src/router/index.ts (if using Vue Router)
- [X] T056 [P] Security hardening: input sanitization in src/utils/sanitize.ts (prevent XSS in file names, device names)
- [X] T057 [P] Run quickstart.md validation and update documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete
  - Signaling server (T047-T048) can be developed independently once contracts are defined

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1, can run in parallel
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1/US2, can run in parallel

### Within Each User Story

- Models before services (T015-T017 before T018-T020)
- Services before components (T018-T020 before T021-T023)
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**:
- T003, T004, T005 can all run in parallel

**Phase 2 (Foundational)**:
- T006, T007, T008, T009, T010, T011, T012, T013, T014 can all run in parallel (different files)

**Phase 3 (US1)**:
- T015, T016, T017 (models) can run in parallel
- T018, T019, T020 (services) can run in parallel after models
- T021, T022, T023 (components) can run in parallel after services

**Phase 4 (US2)**:
- T028, T029 (models) can run in parallel
- T030, T031 (services) can run in parallel after models
- T032, T033, T034, T035 (components/services) can run in parallel

**Phase 5 (US3)**:
- T039 (model extension) can run in parallel with T043, T044
- T040, T041 (service extensions) can run in parallel
- T042, T045 (components) can run in parallel

**Phase 6 (Polish)**:
- T047, T048 (signaling server) can run in parallel with frontend work
- T049, T050, T051, T052, T053, T054, T055, T056 can all run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all models for User Story 1 together:
Task: "Create Device entity type definition in src/models/device.ts"
Task: "Create Connection entity type definition in src/models/connection.ts"
Task: "Create FileTransferSession entity type in src/models/fileTransferSession.ts"

# Launch all core services for User Story 1 together:
Task: "Implement DeviceDiscoveryService in src/services/discovery.ts"
Task: "Implement WebRTC connection manager in src/services/webrtc.ts"
Task: "Implement DataChannel file transfer in src/services/transfer.ts"

# Launch all UI components for User Story 1 together:
Task: "Create DeviceList component in src/components/DeviceList.vue"
Task: "Create FileSelector component in src/components/FileSelector.vue"
Task: "Create TransferProgress component in src/components/TransferProgress.vue"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
   - Two devices on same WiFi can discover each other
   - Files can be transferred successfully
   - Progress is displayed correctly
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP: LAN file transfer!)
3. Add User Story 2 → Test independently → Deploy/Demo (Remote transfer via short code!)
4. Add User Story 3 → Test independently → Deploy/Demo (Short code management!)
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (LAN transfer)
   - Developer B: User Story 2 (Remote connection)
   - Developer C: User Story 3 (Short code management) + Signaling server
3. Stories complete and integrate independently

---

## Task Summary

| Phase | Description | Task Count | Completed |
|-------|-------------|------------|-----------|
| Phase 1 | Setup | 5 tasks | 5/5 ✓ |
| Phase 2 | Foundational | 9 tasks | 9/9 ✓ |
| Phase 3 | User Story 1 (P1 - MVP) | 13 tasks | 13/13 ✓ |
| Phase 4 | User Story 2 (P2) | 11 tasks | 11/11 ✓ |
| Phase 5 | User Story 3 (P3) | 8 tasks | 8/8 ✓ |
| Phase 6 | Polish & Cross-Cutting | 11 tasks | 11/11 ✓ |
| **Total** | **All phases** | **57 tasks** | **57/57 ✓** |

### Task Count per User Story

- **US1 (P1 - MVP)**: 13 tasks (T015-T027) - ✓ Complete
- **US2 (P2)**: 11 tasks (T028-T038) - ✓ Complete
- **US3 (P3)**: 8 tasks (T039-T046) - ✓ Complete

### Suggested MVP Scope

**Minimum Viable Product**: Phase 1 + Phase 2 + Phase 3 (User Story 1)
- Total: 27 tasks (T001-T027)
- Delivers: LAN file transfer between devices on same WiFi
- Can be independently tested and deployed

### Implementation Status

**ALL TASKS COMPLETED** ✓

The following components and services have been implemented:

**Models**: device.ts, connection.ts, fileTransferSession.ts
**Services**: discovery.ts, webrtc.ts, transfer.ts, fileReceiver.ts, transferErrorHandler.ts, shortCodeGenerator.ts, shortCodeVerifier.ts, remoteConnection.ts, autoReconnect.ts, shortCodeManager.ts, rateLimiter.ts, shortCodeBlacklist.ts
**Components**: DeviceList.vue, FileSelector.vue, TransferProgress.vue, TransferConfirmDialog.vue, ShortCodeInput.vue, ShortCodeDisplay.vue, ShortCodeManager.vue
**Utils**: storage.ts, cookie.ts, crypto.ts, base32.ts, checksum.ts, logger.ts, sanitize.ts, wakeLock.ts, notifications.ts
**Stores**: connection.ts, transfer.ts
**Config**: index.ts
**Server**: server/index.js (signaling server)
**Documentation**: README.md

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Signaling server (Phase 6) can be developed in parallel once contracts are defined
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
