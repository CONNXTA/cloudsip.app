# Recording

CloudSIP supports local browser recording for calls where recording is available in the browser.

## Storage model

Recordings are stored locally in browser IndexedDB. No backend is required by default, and CloudSIP does not upload recordings to a server unless you add separate custom functionality.

Because recordings are local to the browser profile, they may not appear on another device, another browser, or another user profile.

## Hosting and browser requirements

CloudSIP is a static browser application and should be served from static hosting. HTTPS is required for production WebRTC microphone access; `localhost` can be used for local testing.

Recording requires browser support for the relevant WebRTC and MediaRecorder capabilities. Chrome and Edge are recommended.

## Privacy and security

- Inform call participants and follow applicable recording laws and policies.
- Do not share exported recordings without authorization.
- Protect the browser profile and device where recordings are stored.
- Clear recordings from the browser when they are no longer needed.

## Related local data

- SIP and application settings are stored locally in browser `localStorage`.
- Recordings are stored locally in browser IndexedDB.
- No backend storage is used by default.
