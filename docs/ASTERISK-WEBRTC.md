# Asterisk WebRTC Notes

CloudSIP can be used with Asterisk when Asterisk is configured for WebRTC-compatible SIP over WebSocket.

## Deployment model

CloudSIP remains a static browser application. Host it on HTTPS static hosting and configure it to connect to your Asterisk WebSocket endpoint. No backend is required by default.

## Browser and transport requirements

- HTTPS is required for WebRTC in production.
- `localhost` may be used for local testing.
- Asterisk must expose a WebSocket or secure WebSocket SIP transport reachable by the browser.
- TLS, DTLS-SRTP, ICE, and WebRTC-compatible codecs should be configured for browser clients.

## Configuration checklist

Use your Asterisk version's official documentation for exact syntax. In general, verify:

- HTTP/WebSocket support is enabled.
- A secure WebSocket transport is available for browser clients.
- PJSIP endpoints for WebRTC users are configured with WebRTC media settings.
- NAT, ICE, STUN, and TURN settings match your network environment.
- Codecs offered by Asterisk are compatible with browser WebRTC.
- Firewall rules allow HTTPS/WSS signaling and RTP/ICE media paths.

## CloudSIP settings

In CloudSIP Settings, configure values such as:

- SIP WebSocket URL
- SIP URI or extension identity
- SIP username
- SIP password
- Display name

Settings are stored locally in browser `localStorage`. Do not commit real SIP credentials or share screenshots containing passwords.

## Recordings

Call recordings, when created, are stored locally in browser IndexedDB. They are not uploaded to Asterisk or any backend by CloudSIP by default.

## Emergency calling disclaimer

CloudSIP is not for emergency calling. Do not rely on browser softphone availability for emergency services.
