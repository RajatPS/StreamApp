# Streaming backend

This Node.js service creates temporary rooms and relays room-scoped WebSocket signaling. It is suitable for deployment as a Render Web Service, but it does not transport camera media. Real-time video still requires an Expo-compatible WebRTC media client and working ICE/TURN configuration.

## Local development

Requirements: Node.js 20 or newer.

From the frontend project directory:

```powershell
npm --prefix backend ci
npm --prefix backend test
npm --prefix backend start
```

The server defaults to `0.0.0.0:4000` and reports readiness at `http://localhost:4000/health`. To test from a phone on the same trusted Wi-Fi, set `EXPO_PUBLIC_API_URL` in the frontend's ignored `.env.local` file to `http://<computer-lan-ip>:4000`, then restart Expo. The root `.env.example` documents the variable. The backend does not load `.env` files; the backend `.env.example` is a reference for its optional `HOST` and `PORT` process variables.

## Deploy to Render

Create a **Web Service** from the repository with these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

The backend reads `PORT` from its process environment and binds to `0.0.0.0`. Render assigns `PORT` automatically; do not set a fixed production port. `HOST` is optional and defaults to `0.0.0.0`. No database, authentication secret, third-party credential, or other backend environment variable is required by the current implementation.

After deployment, verify `https://<your-service>.onrender.com/health` returns `{"status":"ok"}`. Render terminates HTTPS and supports the service's WebSocket endpoint; clients use HTTPS for API requests and WSS for signaling.

### Important deployment limits

- Room state and host tokens are held in process memory. A restart or redeploy ends all rooms.
- Use one service instance. Multiple instances do not share room state and can split HTTP and WebSocket requests across different room registries.
- Rooms are temporary: waiting rooms expire after 30 minutes, and a disconnected host has a 60-second reconnect window.
- Viewers can join with a room ID; there are no user accounts or viewer authorization requirements. Host actions require the random host token returned on room creation.
- HTTP CORS currently permits all origins. The API does not use cookie-based authentication; the native app does not require browser-origin configuration.
- Public room creation and joining do not currently have rate limits or abuse controls. Consider these before exposing the service to substantial public traffic.
- The service relays signaling messages only. The app currently has no WebRTC media adapter, so a successful deployment does not mean that video will stream.

## Frontend configuration

Set `EXPO_PUBLIC_API_URL` to the deployed service's HTTPS origin, for example `https://your-backend-name.onrender.com`.

- For local development, put the reachable local backend URL in `.env.local` at the frontend project root.
- For a production Expo/EAS build, configure `EXPO_PUBLIC_API_URL` in the Expo build environment before creating the bundle. Expo inlines `EXPO_PUBLIC_` variables into client code at build time; changing a Render backend variable does not update an already-built app.
- This URL is public client configuration, not a secret. Never put database credentials, private keys, or server-only tokens in an `EXPO_PUBLIC_` variable.
- The Create Connection form may still override the configured URL. Join and saved connection flows use the backend URL stored/configured by the app.

The backend `.env.example` lists `HOST` and `PORT` for reference. The Node service reads process environment variables, not `.env` files; configure them in Render's service settings or in the local shell. For Render, leave `PORT` to Render's automatic assignment.
