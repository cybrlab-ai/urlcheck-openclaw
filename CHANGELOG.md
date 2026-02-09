# Changelog

## 0.1.6 (2026-02-09)

- Updated skill description to clarify companion dependency on `@cybrlab/urlcheck-openclaw` plugin tools.
- Updated descriptions across all public artifacts to reflect intent-alignment capability.
- Added ClawHub dependency note in README: skill requires plugin for tools.
- Added User-Ready Flow section in README for first-time setup.

## 0.1.5 (2026-02-08)

- Added bundled companion skill (`skills/urlcheck/SKILL.md`) that assesses target URLs for potential threats and alignment with the user's browsing intent before agent navigation.
- Registered skill directory in plugin manifest (`"skills": ["./skills"]`).
- Updated plugin description to reflect bundled skill.

## 0.1.4 (2026-02-08)

- Fixed OpenClaw gateway compatibility: tools are now registered synchronously during `register()` so the gateway exposes them via `/tools/invoke`.
- Moved MCP client to module scope to persist across OpenClaw `register()` re-invocations.
- Pre-defined tool schemas (`url_scanner_scan`, `url_scanner_scan_with_intent`) for synchronous registration; MCP connection deferred to `start()`.

## 0.1.3 (2026-02-07)

**WARNING:** This release has been deprecated.

- Updated release workflow runtime to Node 24 to ensure npm OIDC trusted publishing compatibility.
- Bumped plugin runtime and manifest versions to `0.1.3`.

## 0.1.2 (2026-02-07)

**WARNING:** This release has been deprecated.

- Fixed plugin README documentation links to canonical `urlcheck-mcp` public docs paths.
- Hardened release workflow: `npm publish --provenance` now runs only on `v*` tags.
- Bumped plugin runtime and manifest versions to `0.1.2`.

## 0.1.1 (2026-02-07)

**WARNING:** This release has been deprecated.

- Fixed OpenClaw tool proxy response shape to preserve structured MCP payloads (`content`, `structuredContent`, `_meta`).
- Updated tool execute handler to OpenClaw-compatible signature and safer default params handling.
- Tightened plugin config validation with `configSchema.additionalProperties = false`.
- Added `uiHints.apiKey.sensitive: true` at top-level manifest scope so compatible UIs can mask the input.
- Added `openclaw` in `devDependencies` for local plugin development/tooling compatibility.
- Updated `openclaw.extensions` entry to point to root `./index.js` and added root shim re-export.
- Removed undocumented `openclaw.minVersion` from `openclaw.plugin.json`.
- Improved sync workflow portability via configurable target path in sync script.
- Added GitHub Actions workflow for npm Trusted Publishing with `--provenance` on version tags.

## 0.1.0 (2026-02-07)

**WARNING:** This release has been deprecated.

- Initial release.
- Connects to hosted URLCheck MCP endpoint (`https://urlcheck.ai/mcp`).
- Registers `url_scanner_scan` and `url_scanner_scan_with_intent` as native OpenClaw tools.
- Supports trial mode (no API key, up to 100 requests/day) and authenticated mode.
- API key via plugin config or `URLCHECK_API_KEY` environment variable.
