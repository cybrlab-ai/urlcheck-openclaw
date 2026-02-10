/**
 * URLCheck OpenClaw Plugin
 *
 * Thin wrapper that connects OpenClaw agents to the URLCheck MCP server
 * for URL security scanning. No scanner logic is bundled — all analysis
 * runs on the remote URLCheck service.
 *
 * Publisher: CybrLab.ai (https://cybrlab.ai)
 * Service:   URLCheck (https://urlcheck.dev)
 * License:   Apache-2.0
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";

const PLUGIN_ID = "urlcheck-openclaw";
const ENDPOINT = "https://urlcheck.ai/mcp";
const CLIENT_NAME = "urlcheck-openclaw-plugin";
const CLIENT_VERSION = "0.1.9";
const REQUEST_TIMEOUT_MS = 600_000;

/**
 * Known tool definitions from the URLCheck MCP server.
 *
 * Tools are registered synchronously during register() so the OpenClaw
 * gateway can expose them immediately via /tools/invoke. The execute()
 * callbacks forward to the live MCP client connected during start().
 */
const TOOL_DEFS = [
  {
    name: "url_scanner_scan",
    description:
      "Scan a URL for security threats including phishing, malware, and suspicious patterns.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to scan" },
      },
      required: ["url"],
    },
  },
  {
    name: "url_scanner_scan_with_intent",
    description:
      "Scan a URL with user intent context for enhanced security analysis.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to scan" },
        intent: {
          type: "string",
          description: "The user intent for visiting this URL",
        },
      },
      required: ["url"],
    },
  },
];

// Module-level state persists across OpenClaw register() re-invocations.
let client = null;
let connectionHeaders = null;

/**
 * Create a fresh MCP client and connect to the URLCheck endpoint.
 */
async function connectMcp() {
  const transport = new StreamableHTTPClientTransport(
    new URL(ENDPOINT),
    { requestInit: { headers: { ...connectionHeaders } } },
  );

  const newClient = new Client(
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { capabilities: {} },
  );
  newClient.requestTimeoutMs = REQUEST_TIMEOUT_MS;

  await newClient.connect(transport);
  return newClient;
}

export default function register(api) {
  // Register tools synchronously so the gateway picks them up immediately.
  for (const toolDef of TOOL_DEFS) {
    registerToolProxy(api, toolDef);
  }
  console.log(
    `[URLCheck] Registered ${TOOL_DEFS.length} tool(s): ${TOOL_DEFS.map((t) => t.name).join(", ")}`,
  );

  api.registerService({
    id: PLUGIN_ID,

    async start() {
      const apiKey = resolveApiKey(api);

      console.log(`[URLCheck] Endpoint: ${ENDPOINT}`);
      if (apiKey) {
        console.log(`[URLCheck] Auth: API key configured`);
      } else {
        console.log(
          `[URLCheck] Auth: trial mode (up to 100 requests/day, no API key)`,
        );
      }

      connectionHeaders = {
        Accept: "application/json, text/event-stream",
      };
      if (apiKey) {
        connectionHeaders["X-API-Key"] = apiKey;
      }

      try {
        client = await connectMcp();
        console.log(`[URLCheck] Connected to ${ENDPOINT}`);
      } catch (err) {
        console.error(`[URLCheck] Connection failed: ${err.message}`);
        console.error(
          `[URLCheck] Verify endpoint is reachable: curl -s -o /dev/null -w "%{http_code}" ${ENDPOINT}`,
        );
        client = null;
      }
    },

    async stop() {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore close errors during shutdown
        }
        client = null;
        console.log(`[URLCheck] Disconnected`);
      }
      connectionHeaders = null;
    },
  });

  /**
   * Register a single MCP tool as a native OpenClaw tool.
   *
   * OpenClaw agent-tools execute signature: execute(_id, params)
   * - _id: tool invocation ID (managed by OpenClaw runtime)
   * - params: the arguments object passed by the agent
   */
  function registerToolProxy(api, toolDef) {
    api.registerTool({
      name: toolDef.name,
      description: toolDef.description || `URLCheck tool: ${toolDef.name}`,
      parameters: toolDef.inputSchema,

      async execute(_id, params = {}) {
        if (!client && !connectionHeaders) {
          return errorResult(
            "URLCheck plugin has not been started. Check logs for errors.",
          );
        }

        for (let attempt = 0; attempt < 2; attempt++) {
          // Reconnect if the client is gone (first call after timeout,
          // or retry after a transport error on attempt 0).
          if (!client) {
            try {
              client = await connectMcp();
              console.log(`[URLCheck] Reconnected to ${ENDPOINT}`);
            } catch (err) {
              return errorResult(
                `URLCheck reconnect failed: ${err.message}`,
              );
            }
          }

          try {
            const result = await client.callTool({
              name: toolDef.name,
              arguments: params,
            });

            if (result.isError) {
              const text =
                extractErrorText(result.content) || "Unknown error";
              return errorResult(text);
            }

            return normalizeToolResult(result);
          } catch (err) {
            // MCP protocol errors (e.g. -32602 invalid params) mean the
            // connection is healthy — the server responded. Don't reconnect.
            if (err instanceof McpError) {
              return errorResult(`URLCheck error: ${err.message}`);
            }

            // Transport errors on first attempt: reconnect and retry once.
            if (attempt === 0) {
              console.warn(
                `[URLCheck] Call failed (${err.message}), reconnecting…`,
              );
              try {
                await client.close();
              } catch {
                // ignore
              }
              client = null;
              continue;
            }
            return errorResult(`URLCheck error: ${err.message}`);
          }
        }
      },
    });
  }
}

/**
 * Resolve API key from OpenClaw config and environment.
 * Never silently mutates user config files.
 *
 * Priority: plugin config apiKey > URLCHECK_API_KEY env var > null (trial mode)
 */
function resolveApiKey(api) {
  const pluginConfig =
    api.config?.plugins?.entries?.[PLUGIN_ID]?.config || {};

  return pluginConfig.apiKey || process.env.URLCHECK_API_KEY || null;
}

function extractErrorText(content) {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * Build an error result that OpenClaw can safely process.
 *
 * OpenClaw runtime calls .filter() on result.content unconditionally,
 * so every return — including errors — must include a content[] array.
 */
export function errorResult(message) {
  return {
    isError: true,
    error: message,
    content: [{ type: "text", text: message }],
  };
}

export function normalizeToolResult(result) {
  const response = {};

  if (result?.structuredContent !== undefined) {
    response.structuredContent = result.structuredContent;
  }
  if (result?._meta !== undefined) {
    response._meta = result._meta;
  }

  // OpenClaw runtime expects content to be an array for successful tool output.
  if (Array.isArray(result?.content) && result.content.length > 0) {
    response.content = result.content;
  } else if (result?.structuredContent !== undefined) {
    response.content = [
      { type: "text", text: safeSerialize(result.structuredContent) },
    ];
  } else {
    response.content = [{ type: "text", text: "URLCheck scan completed." }];
  }

  return response;
}

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "URLCheck scan completed.";
  }
}
