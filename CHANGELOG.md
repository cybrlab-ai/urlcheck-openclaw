# Changelog

## 0.1.1 (2026-02-07)

- Fixed OpenClaw tool proxy response shape to preserve structured MCP payloads (`content`, `structuredContent`, `_meta`).
- Updated tool execute handler to OpenClaw-compatible signature and safer default params handling.
- Tightened plugin config validation with `configSchema.additionalProperties = false`.
- Added `uiHints.apiKey.sensitive: true` at top-level manifest scope so compatible UIs can mask the input.
- Added `openclaw` in `devDependencies` for local plugin development/tooling compatibility.
- Updated `openclaw.extensions` entry to point to root `./index.js` and added root shim re-export.
- Removed undocumented `openclaw.minVersion` from `openclaw.plugin.json`.
- Improved sync workflow portability via configurable target path in sync script.

## 0.1.0 (2026-02-07)

- Initial release.
- Connects to hosted URLCheck MCP endpoint (`https://urlcheck.ai/mcp`).
- Registers `url_scanner_scan` and `url_scanner_scan_with_intent` as native OpenClaw tools.
- Supports trial mode (no API key, up to 100 requests/day) and authenticated mode.
- API key via plugin config or `URLCHECK_API_KEY` environment variable.
