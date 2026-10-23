# Backend Integration Inventory

## Audit scope

Reviewed the Expo app routes, reusable components, utilities, native video-filter module, package/configuration files, and application handlers. The project uses Expo Router and Expo SDK 57. There is no application backend, API client, authentication provider, database, signaling implementation, WebRTC client dependency, or test suite in the inspected project.

The requested backend runtime is Node.js. The selected initial access policy is public viewers: anyone who knows a room ID may watch, while host controls must use a separate server-issued credential. The selected initial test topology is a Node server on the developer computer/LAN, for phones on the same network. A signaling server alone will not provide video: the application also needs a compatible WebRTC media client and working ICE/TURN configuration.

## Feature-by-feature inventory

| Feature / action | Data read or changed | Current implementation | Backend / external need and missing work | Dependencies | Likely files and verification |
|---|---|---|---|---|---|
| Home: open Create Connection | Selects create mode | Opens the shared connection sheet | No backend call; save must register a room and return its ID | Room API | `src/app/index.tsx`, `src/components/connection-sheet.tsx`; verify create request and returned ID |
| Home: open Join Stream | Selects join mode | Opens the shared connection sheet | No backend call; must validate room and join signaling | Room API, access policy, signaling | Same files; verify valid, unknown, and closed room cases |
| Create Connection form | Connection Name, Room ID, signaling URL, STUN/TURN URL, TURN username/credential | Now registers a room with Node and saves the generated/supplied ID and host token locally; empty form preserves the “Local Preview” path | ICE/TURN fields remain unused until a media adapter and provider are configured | Node room service; host authorization; ICE/TURN provider when needed | `src/components/connection-sheet.tsx`, `src/app/index.tsx`, `src/utils/connection-storage.ts`, `src/utils/room-client.ts`; API and form tests |
| Saved connections: open | Saved connection ID/name | Routes to camera preview | Must create/register or resume a host session before signaling | Room service and signaling | `src/app/index.tsx`, `src/app/camera-preview.tsx`; verify host lifecycle |
| Saved connections: rename | Connection ID and new name | Persists locally; rejects empty names | No server need unless connection metadata becomes shared | Local storage or room service, depending on intended semantics | `src/app/index.tsx`, `src/utils/connection-storage.ts`, `src/components/rename-connection.tsx`; verify persistence |
| Saved connections: edit/delete | Connection ID | Handlers only log to console; no data changes occur | Local persistence operations are sufficient for saved entries; server cleanup is needed only for active rooms | Storage and, for active sessions, room service | `src/app/index.tsx`, `src/utils/connection-storage.ts`; verify updates and deletion |
| Saved connection persistence | Arbitrary form values | Expo SecureStore on native; `localStorage` on web | No backend needed for local saved settings; avoid storing server-only secrets in the app | Platform storage | `src/utils/connection-storage.ts`; native/web persistence checks |
| Camera preview and permissions | Camera permission, facing, preview size | Implemented with Expo Camera; requests camera permission; changes camera and preview state | No backend for preview | Expo Camera | `src/app/camera-preview.tsx`; device permission and camera checks |
| Local recording and filters | Camera video, selected resolution/filter, media permission | Implemented locally; saves videos with Media Library; filters use a custom native module and require a development build | No backend required | Expo Camera, Media Library, `modules/video-filters` | `src/app/camera-preview.tsx`, `modules/video-filters`; device recording/filter checks |
| Start/Stop Stream | Boolean UI state | Only toggles local state and displays a message that WebRTC is not connected | Needs local camera media track, WebRTC peer connection, room signaling, ICE, error/reconnect handling, cleanup | WebRTC library, Node signaling, STUN/TURN service | `src/app/camera-preview.tsx`, likely a new streaming service/hook; two-device media and lifecycle tests |
| Join by Stream ID and Display Name | Stream ID and Display Name | Passes both values to `/video-player`; no room lookup or network call; no stream-password field is present | Validate room and access policy, connect viewer to signaling, exchange SDP/ICE, attach received media | Room API, signaling, WebRTC, access policy | `src/components/connection-sheet.tsx`, `src/app/index.tsx`, `src/app/video-player.tsx`; API and two-device tests |
| Viewer screen and settings | Stream ID, Display Name, local quality settings | Displays a placeholder (“no stream connected”); settings are in-memory only and do not configure a transport | Render incoming remote media; apply receiving constraints to actual peer connection | WebRTC client and native renderer | `src/app/video-player.tsx`, possibly `src/components/active-stream-player.tsx`; cross-platform playback and settings checks |
| Active stream player component | `MediaStream`, connection name, optional native renderer/recorder | Component supports web MediaStream rendering and recording; it is not imported by any route, has no supplied native renderer, and receives no real stream | Wire only after a real media stream is available; native rendering/recording adapter needed | WebRTC media client and native renderer | `src/components/active-stream-player.tsx`; web and native rendering checks |
| Navigation and Back actions | Route stack | Expo Router routes are `/`, `/camera-preview`, `/video-player`; camera Back directly replaces with `/`; viewer Back uses history | No backend required; preserve routes while integrating | Expo Router | `src/app/_layout.tsx`, `src/app/index.tsx`, screen files; navigation regression checks |
| Navbar/sidebar | Menu toggle state | Navbar toggles an empty Sidebar | No backend or external service | None | `src/components/navbar.tsx`, `src/components/sidebar.tsx`; UI regression check |
| Video filter processing | Local recording URI and selected filter | Native iOS/Android module; unavailable in Expo Go; web reports unavailable | No backend required | Expo development build | `modules/video-filters`; development-build verification |
| Authentication / authorization | None currently collected | No user identity or access-control implementation | Decide whether viewers are public or must receive a separate invitation/capability; host-only operations must not trust a room ID | Product access policy; server-issued host capability or equivalent | Backend authorization and join flow; unauthorized-operation tests |
| Automated testing / diagnostics | N/A | No project test files or test script found; lint/typecheck have unrelated existing failures documented in recent task context | Add focused backend/API and client integration tests; real-device tests remain necessary for WebRTC | Test runner and device builds | Root/backend package manifests and tests; run targeted tests, lint, typecheck, Expo checks |

## Dependencies and proposed implementation boundary

1. Decide the room access policy before implementing join authorization or exposing invite information in the UI.
2. Implement a Node.js room/session and signaling service. Use ephemeral server memory for active sessions unless the app establishes a need for durable room history; local saved-connection data remains on-device.
3. Select and verify a React Native/Expo-compatible WebRTC media client. The current `CameraView` provides preview/recording but does not expose the `MediaStream` required by `ActiveStreamPlayer`.
4. Configure an actual STUN/TURN service. TURN credentials and a reachable production backend URL are deployment inputs; none are present, and none should be fabricated or bundled as permanent secrets.
5. Integrate create/join forms and host/viewer screens with the service and verify with two devices. Signaling success alone is not proof of media connectivity.

## Initial verification status

- Project scripts include Expo start/platform scripts and lint; there is no test script or test directory.
- No API, room registry, signaling endpoint, or WebRTC peer connection is currently wired.
- Cross-device streaming cannot be claimed or verified from this source state.
- Any final live-stream verification requires a reachable Node backend, WebRTC-capable development builds on the target devices, and working ICE/TURN configuration.

## Implementation status

### Completed and verified locally

- Added a Node.js backend with room creation, generated or caller-supplied unique room IDs, room lookup/join validation, a host-only end operation, a temporary host reconnect window, idle-room expiry, and room-scoped WebSocket message routing.
- Public viewers can join without a stream password. Host control uses a random server-issued token that is not included in public room responses.
- Connected the existing Create Connection form to room creation and device-local connection storage. The generated Room ID is saved with the connection.
- Connected the existing Join Stream form to backend room validation and the existing viewer route. Host and viewer routes connect for signaling presence and receive explicit status messages.
- Preserved the Expo Camera preview and local recording path. No WebRTC native dependency, Expo config plugin, or native project file was changed.
- Added backend setup guidance for same-LAN testing and documented that signaling does not transport media.

### Not implemented or awaiting required media integration

- Actual SDP/ICE offers and candidates are not produced by the app: the backend validates/routes those message types, but the current screens have no peer-connection implementation.
- The viewer has no incoming media track or native renderer. It reports that media is unavailable rather than presenting a success state.
- The Create form's STUN/TURN URL, username, and credential are not consumed; there is no verified TURN provider or temporary credential service.
- Expo SDK 57's camera API currently supplies preview and local recording, not the `MediaStream` needed by WebRTC. Replacing that capture path was explicitly deferred to preserve the existing camera and recording implementation. `react-native-webrtc` needs a custom development build, and the reviewed config-plugin compatibility table did not list SDK 57.
- The local Node process is LAN-only and stores room state in memory. It is not a production deployment or a remote service; restarting it removes rooms. No remote/mobile hardware session was available for this verification.
- Existing Home Page Edit Connection and Delete Connection actions remain console-only; these were identified during the audit but were not part of the selected room/signaling integration scope.

### Verification results

| Feature | Expected behavior | Test performed | Result |
|---|---|---|---|
| Room creation and unique IDs | Create a room with a generated or unique supplied ID and issue a host-only token | Node registry and HTTP tests | Passed |
| Room joining | Validate display name and reject missing/expired room IDs | Node HTTP API integration test | Passed |
| Host authorization | Reject invalid/duplicate hosts and allow only the host token to end a room | Node registry and HTTP tests | Passed |
| Signaling boundaries | Relay offers/answers/candidates only to participants in the same room | Node WebSocket integration test for offer/answer routing and registry tests for room isolation | Passed |
| Expiry/reconnect | Expire inactive rooms while retaining active host sessions and allowing reconnect | Node registry tests | Passed |
| Local backend readiness | Start the Node server and return a healthy response | `GET http://localhost:4000/health` while server was running | Passed |
| Android app bundle | Bundle the integrated Expo routes and client | `npx expo export --platform android` | Passed |
| Changed-file lint | Lint the changed TypeScript screens/utilities | ESLint targeted to changed files | Passed |
| Project lint/typecheck | Run the project-wide Expo lint and TypeScript check | Existing unrelated errors remain in `rename-connection.tsx`, `use-color-scheme.web.ts`, `collapsible.tsx`, and unresolved themed-component imports | Blocked by pre-existing errors |
| Two-device live video / TURN relay | See actual camera video on a second device and verify relay behavior | Not run; no WebRTC media adapter, TURN service, or device session | Not implemented |
