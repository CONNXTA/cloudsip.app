# Keyboard Shortcuts

CloudSIP includes keyboard shortcuts to speed up common softphone actions. Exact shortcut behavior may depend on the active screen, focused input, and browser support.

## General guidance

- Keep focus out of text fields when using global shortcuts.
- Browser or operating-system shortcuts may take priority over web app shortcuts.
- Test shortcuts in the browser used by your team before publishing an internal user guide.

## Common actions

Use the in-app shortcut hints where available for actions such as:

- Opening or focusing the dial pad
- Starting a call
- Answering an incoming call
- Ending or rejecting a call
- Muting or unmuting audio
- Holding or resuming a call
- Sending DTMF from the dial pad

## Deployment notes

CloudSIP is served using static hosting only and requires no backend by default. HTTPS is required for WebRTC microphone access in production, while `localhost` is suitable for local testing.

Settings are stored locally in browser `localStorage`, and recordings are stored locally in browser IndexedDB.
