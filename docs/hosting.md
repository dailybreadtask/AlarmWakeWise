# Hosting: Railway and Neon

The server (`server/`) runs on Railway. Its database is Neon Postgres. The app talks to it through `EXPO_PUBLIC_WAKEWISE_API_URL`.

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| Server | Railway, built from `server/Dockerfile` | `railway.toml` points at it. Health check: `GET /health`. |
| Database | Neon project `wakewise` (London, `aws-eu-west-2`) | Tables `device` and `watch`. No names, no accounts. |
| Rail feed | National Rail Darwin Push Port, read by the server | The server holds the live trains in memory. |
| Push | Apple Push Notification service, called from the server | Needs an APNs key. |

## What the database holds

- `device`: a push token and whether it is for the sandbox or production. Nothing else about the person.
- `watch`: a journey to watch (stations, train, times) and the status of the last check.
- A watch ends by itself two hours after its deadline, and finished watches are deleted after a day. Turning off "Watch my journey overnight" in the app deletes the device and all its watches at once.

## Variables on Railway

Set these in the Railway dashboard (Variables). Never commit them.

| Variable | What |
| --- | --- |
| `WAKEWISE_API_TOKEN` | The shared token the app sends. |
| `OPENAI_API_KEY` | Speech and reading requests. |
| `DATABASE_URL` | Neon pooled connection string. |
| `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY_BASE64` | The push key. `base64 -i AuthKey_XXXX.p8` gives the value. |
| `NATIONAL_RAIL_*` | The Darwin Push Port and departure board settings, as in `.env.example`. |
| `TOMTOM_API_KEY` | Driving times and place lookup. |
| `WEATHERKIT_TEAM_ID`, `WEATHERKIT_SERVICE_ID`, `WEATHERKIT_KEY_ID`, `WEATHERKIT_PRIVATE_KEY_BASE64` | Weather. |

`PORT` is set by Railway.

## After deploying

1. Open `https://<your-service>.up.railway.app/health`. It should answer `{"ok":true}`.
2. In the project's `.env.local`, set `EXPO_PUBLIC_WAKEWISE_API_URL` to that address and rebuild or reload the app.
3. In the app, open Speech and privacy and turn on "Watch my journey overnight". Allow notifications when iOS asks.
4. The Railway log shows `{"event":"watch_cycle",...}` every five minutes once watching is on. It logs counts only, never tokens, stations or times.

## Limits

- One shared API token protects the server. It ships in the app, so it only deters casual use until accounts exist.
- The push is an ordinary notification, not a time-sensitive one. A phone on Do Not Disturb will not show it until the Focus ends. Time Sensitive Notifications need an extra capability and review.
- Only trains are watched. Buses and cars have no live feed here yet.
