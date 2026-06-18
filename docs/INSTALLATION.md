# Installation

CloudSIP is a standalone frontend-only WebRTC SIP softphone. It is deployed with static hosting only: upload the files to a web server and open `index.html`.

## Requirements

- Static web hosting
- HTTPS for production WebRTC usage
- A SIP server that supports SIP over WebSocket
- A browser with microphone access, preferably Chrome or Edge

WebRTC requires HTTPS or localhost for microphone access and secure media permissions. Local testing on `localhost` is allowed by browsers without a public TLS certificate.

## Deploy to a web server

1. Clone or download the repository.
2. Upload the repository contents, or the application directory, to an HTTPS web server.
3. Open `index.html` in the browser.
4. Open Settings and enter your SIP WebSocket server, SIP URI, username, and password.
5. Allow microphone permission when prompted.

No backend is required by default. CloudSIP runs in the browser and communicates directly with your SIP WebSocket endpoint.

## Local testing

From the directory you want to serve, run:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080/` in a supported browser.

## Local data

- Settings are stored locally in browser `localStorage`.
- Recordings are stored locally in browser IndexedDB.
- No backend storage is used by default.

Do not enter production credentials on shared or untrusted browser profiles.
