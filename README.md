# URLCheck OpenClaw Plugin

> Assess target URLs for potential threats and alignment with the user's browsing intent before agent navigation.

**Publisher:** [CybrLab.ai](https://cybrlab.ai) | **Service:** [URLCheck](https://urlcheck.dev)

This plugin connects your OpenClaw agent to the hosted URLCheck MCP
endpoint over Streamable HTTP. A companion skill is included that
instructs agents to assess target URLs for potential threats and
alignment with the user's browsing intent before navigation.

---

## Install

```bash
openclaw plugins install @cybrlab/urlcheck-openclaw
```

Restart your OpenClaw Gateway after installation.

## Configure

The installer automatically enables the plugin in `~/.openclaw/openclaw.json`.
No additional configuration is required for trial mode (up to 100 requests/day).

**API key (optional, higher limits):**

Set the `URLCHECK_API_KEY` environment variable, or add `apiKey` to the plugin
config in `~/.openclaw/openclaw.json`:

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

To obtain an API key, contact [contact@cybrlab.ai](mailto:contact@cybrlab.ai).

**Restricted tool policy (advanced):**

If you have `tools.allow` set in your config (restricting which tools are
available), add the plugin tools to `tools.alsoAllow`:

```json
{
  "tools": {
    "alsoAllow": [
      "url_scanner_scan",
      "url_scanner_scan_with_intent",
      "url_scanner_scan_async",
      "url_scanner_scan_with_intent_async",
      "url_scanner_tasks_get",
      "url_scanner_tasks_result",
      "url_scanner_tasks_list",
      "url_scanner_tasks_cancel"
    ]
  }
}
```

If you have not customized `tools.allow`, this step is not needed — all plugin
tools are available by default.

## Verify

After restarting the Gateway:

```bash
openclaw plugins list
```

You should see `urlcheck-openclaw` listed with scanner and task tools:

- `url_scanner_scan` — Analyze a URL for security threats
- `url_scanner_scan_async` — Analyze a URL asynchronously and return a task handle
- `url_scanner_scan_with_intent` — Analyze a URL with user intent context
- `url_scanner_scan_with_intent_async` — Intent-aware async scan with task handle
- `url_scanner_tasks_get` — Check task status
- `url_scanner_tasks_result` — Wait for task result
- `url_scanner_tasks_list` — List tasks
- `url_scanner_tasks_cancel` — Cancel a task

The plugin includes a bundled skill that instructs the agent to assess
target URLs for threats and intent alignment before navigating. You can
confirm the skill loaded:

```bash
openclaw skills list | grep urlcheck
```

If you install `urlcheck` from ClawHub separately, it still requires the
`@cybrlab/urlcheck-openclaw` plugin because the skill depends on
`url_scanner_scan` and `url_scanner_scan_with_intent` tools.

## User-Ready Flow

Use this minimal flow for first-time setup:

1. Install plugin:

```bash
openclaw plugins install @cybrlab/urlcheck-openclaw
```

2. Restart gateway:

```bash
openclaw gateway restart
```

3. Verify plugin and skill are available:

```bash
openclaw plugins list | grep -i urlcheck
openclaw skills list | grep -i urlcheck
openclaw skills check
```

4. Run a first prompt:

```text
Before opening https://example.com, run url_scanner_scan_with_intent with intent "log in to my account" and tell me whether I should proceed.
```

If `urlcheck` was installed from ClawHub, make sure the plugin is installed
first; the skill depends on URLCheck plugin tools.

## Usage

Ask your agent to scan a URL before navigating:

```
Before opening https://example.com, run url_scanner_scan and tell me if access should be allowed.
```

For intent-aware scanning (improves detection for login, purchase, download pages):

```
I want to log in to my bank. Scan https://example.com with url_scanner_scan_with_intent and intent "log in to bank account".
```

For asynchronous execution:

```text
Start an async scan for https://example.com using url_scanner_scan_async, then poll with url_scanner_tasks_get until completed and return the result with url_scanner_tasks_result.
```

`url_scanner_scan` and `url_scanner_scan_with_intent` also support optional MCP-style task mode by adding:

```json
{
  "task": {
    "ttl": 720000
  }
}
```

### Response Fields

| Field                    | Type            | Description                                                             |
|--------------------------|-----------------|-------------------------------------------------------------------------|
| `risk_score`             | float (0.0-1.0) | Threat probability                                                      |
| `confidence`             | float (0.0-1.0) | Analysis confidence                                                     |
| `analysis_complete`      | boolean         | Whether the analysis finished fully                                     |
| `agent_access_directive` | string          | `ALLOW`, `DENY`, `RETRY_LATER`, or `REQUIRE_CREDENTIALS`                |
| `agent_access_reason`    | string          | Reason for the directive                                                |
| `intent_alignment`       | string          | `misaligned`, `no_mismatch_detected`, `inconclusive`, or `not_provided` |

Use `agent_access_directive` for navigation decisions.

## Scan Timing

URL scans typically take 30-90 seconds.

- **Direct mode (sync):** `url_scanner_scan` / `url_scanner_scan_with_intent` block until completion or timeout.
- **Task mode (async):** use `*_async` tools (or pass `task` on base tools), then query task status/result via task tools.

## Troubleshooting

| Symptom                                | Cause                                  | Fix                                                                                          |
|----------------------------------------|----------------------------------------|----------------------------------------------------------------------------------------------|
| Plugin not listed                      | Not installed or Gateway not restarted | Run install command, restart Gateway                                                         |
| `[URLCheck] Connection failed` in logs | Endpoint unreachable                   | Check network; verify `curl https://urlcheck.ai/mcp` works                                   |
| Tools not appearing                    | Connection failed or `tools.allow` set | Check Gateway logs for `[URLCheck]`; if `tools.allow` is set, add tools to `tools.alsoAllow` |
| `401 Unauthorized`                     | API key required or invalid            | Set `apiKey` in config or `URLCHECK_API_KEY` env var                                         |
| `429 Too Many Requests`                | Rate limit exceeded                    | Reduce frequency or add API key for higher limits                                            |
| Scan takes too long                    | Target site is slow or complex         | Wait for completion; scans can take up to 90 seconds                                         |

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
- [Manual Setup (without plugin)](https://github.com/cybrlab-ai/urlcheck-mcp/blob/main/docs/OPENCLAW_SETUP.md)

## Support

- **Email:** [contact@cybrlab.ai](mailto:contact@cybrlab.ai)
- **Publisher:** [CybrLab.ai](https://cybrlab.ai)
- **Service:** [URLCheck](https://urlcheck.dev)

## License

Apache License 2.0
