# Security Policy

CloudSIP is a standalone static browser application. It does not include a backend service by default.

## Credential safety

- Do not commit SIP passwords, SIP authentication secrets, production SIP usernames, WebSocket URLs containing secrets, or other private credentials.
- Use placeholder values in examples and documentation.
- Review browser profiles and exported files before sharing debugging information.

## Local browser storage

CloudSIP stores application data locally in the user's browser:

- SIP settings are stored locally in browser `localStorage`.
- Recordings are stored locally in browser IndexedDB.
- No backend is used by default.

Anyone with access to the same browser profile may be able to access locally stored settings or recordings. Use operating-system account protection, browser profile isolation, and device encryption where appropriate.

## Reporting vulnerabilities

Please report suspected vulnerabilities via GitHub issues or contact the project maintainers at a designated security contact placeholder, such as `security@example.com`, until a project-specific address is published.

Do not include real SIP passwords, private recordings, or sensitive production configuration in public reports.
