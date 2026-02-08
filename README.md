# URLCheck OpenClaw Plugin

> MCP-native URL security scanner for safe agentic browsing.

**Publisher:** [CybrLab.ai](https://cybrlab.ai) | **Service:** [URLCheck](https://urlcheck.dev)

No ClawHub skill required. This plugin connects your OpenClaw agent to the
hosted URLCheck MCP endpoint over Streamable HTTP.

---

## Install

```bash
openclaw plugins install @cybrlab/urlcheck-openclaw
```

Restart your OpenClaw Gateway after installation.

## Configure

Add to `~/.openclaw/openclaw.json`:

**Trial (up to 100 requests/day, no API key):**

```json
{
  "plugins": {
    "entries": {
      "urlcheck-openclaw": {
        "enabled": true,
        "config": {}
      }
    }
  }
}
```

**Authenticated (higher limits):**

```json
{
  "plugins": {
    "entries": {
      "urlcheck-openclaw": {
        "enabled": true,
        "config": {
          "apiKey": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

Or set the `URLCHECK_API_KEY` environment variable instead of putting the key
in config. The plugin checks the environment variable if no `apiKey` is set in
config.

To obtain an API key, contact [contact@cybrlab.ai](mailto:contact@cybrlab.ai).

## Verify

After restarting the Gateway:

```bash
openclaw plugins list
```

You should see `urlcheck-openclaw` listed with two tools:

- `url_scanner_scan` — Analyze a URL for security threats
- `url_scanner_scan_with_intent` — Analyze a URL with user intent context

## Usage

Ask your agent to scan a URL before navigating:

```
Before opening https://example.com, run url_scanner_scan and tell me if access should be allowed.
```

For intent-aware scanning (improves detection for login, purchase, download pages):

```
I want to log in to my bank. Scan https://example.com with url_scanner_scan_with_intent and intent "log in to bank account".
```

### Response Fields

| Field                    | Type            | Description                                              |
|--------------------------|-----------------|----------------------------------------------------------|
| `risk_score`             | float (0.0-1.0) | Threat probability                                       |
| `confidence`             | float (0.0-1.0) | Analysis confidence                                      |
| `analysis_complete`      | boolean         | Whether the analysis finished fully                      |
| `agent_access_directive` | string          | `ALLOW`, `DENY`, `RETRY_LATER`, or `REQUIRE_CREDENTIALS` |
| `agent_access_reason`    | string          | Reason for the directive                                 |

Use `agent_access_directive` for navigation decisions.

## Scan Timing

URL scans typically take 30-90 seconds. The plugin uses the MCP SDK's direct
(synchronous) call mode with a server-side timeout of 300 seconds. No manual
polling is needed — the call blocks until the scan completes or times out.

## Troubleshooting

| Symptom                                | Cause                                  | Fix                                                        |
|----------------------------------------|----------------------------------------|------------------------------------------------------------|
| Plugin not listed                      | Not installed or Gateway not restarted | Run install command, restart Gateway                       |
| `[URLCheck] Connection failed` in logs | Endpoint unreachable                   | Check network; verify `curl https://urlcheck.ai/mcp` works |
| Tools not appearing                    | Connection failed on startup           | Check Gateway logs for `[URLCheck]` messages               |
| `401 Unauthorized`                     | API key required or invalid            | Set `apiKey` in config or `URLCHECK_API_KEY` env var       |
| `429 Too Many Requests`                | Rate limit exceeded                    | Reduce frequency or add API key for higher limits          |
| Scan takes too long                    | Target site is slow or complex         | Wait for completion; scans can take up to 90 seconds       |

## How It Works

This plugin is a thin wrapper. It:

1. Registers pre-defined tool schemas as native OpenClaw agent tools
2. Connects to `https://urlcheck.ai/mcp` using the MCP SDK
3. Proxies tool calls to the remote server

No scanner logic runs locally. No files are written to your system. The plugin
does not modify your OpenClaw configuration.

## Security

- **No shell access.** Communication uses typed JSON-RPC over HTTPS.
- **No local execution.** All analysis runs on the remote URLCheck service.
- **No config mutation.** The plugin never writes to `~/.openclaw/` files.
- **Auditable.** Source is a single file of JavaScript. Review it yourself.

## Links

- [Full API Documentation](https://github.com/cybrlab-ai/urlcheck-mcp/blob/main/docs/API.md)
- [Authentication Guide](https://github.com/cybrlab-ai/urlcheck-mcp/blob/main/docs/AUTHENTICATION.md)
- [Manual Setup (without plugin)](https://github.com/cybrlab-ai/urlcheck-mcp#openclaw-quick-start-manual-first)

## Support

- **Email:** [contact@cybrlab.ai](mailto:contact@cybrlab.ai)
- **Publisher:** [CybrLab.ai](https://cybrlab.ai)
- **Service:** [URLCheck](https://urlcheck.dev)

## License

Apache License 2.0
