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

const PLUGIN_ID = "urlcheck-openclaw";
const ENDPOINT = "https://urlcheck.ai/mcp";
const CLIENT_NAME = "urlcheck-openclaw-plugin";
const CLIENT_VERSION = "0.1.3";

export default async function register(api) {
  let client = null;

  api.registerService({
    id: PLUGIN_ID,

    async start() {
      const apiKey = resolveApiKey(api);

      console.log(`[URLCheck] Endpoint: ${ENDPOINT}`);
      if (apiKey) {
        console.log(`[URLCheck] Auth: API key configured`);
      } else {
        console.log(
          `[URLCheck] Auth: trial mode (up to 100 requests/day, no API key)`
        );
      }

      const headers = {
        Accept: "application/json, text/event-stream",
      };
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const transport = new StreamableHTTPClientTransport(
        new URL(ENDPOINT),
        { requestInit: { headers } }
      );

      client = new Client(
        { name: CLIENT_NAME, version: CLIENT_VERSION },
        { capabilities: {} }
      );

      try {
        await client.connect(transport);
        console.log(`[URLCheck] Connected to ${ENDPOINT}`);
      } catch (err) {
        console.error(`[URLCheck] Connection failed: ${err.message}`);
        console.error(
          `[URLCheck] Verify endpoint is reachable: curl -s -o /dev/null -w "%{http_code}" ${ENDPOINT}`
        );
        client = null;
        return;
      }

      // Discover tools from server and register each one
      try {
        const { tools } = await client.listTools();
        for (const tool of tools) {
          registerToolProxy(api, tool);
        }
        console.log(
          `[URLCheck] Registered ${tools.length} tool(s): ${tools.map((t) => t.name).join(", ")}`
        );
      } catch (err) {
        console.error(`[URLCheck] Tool discovery failed: ${err.message}`);
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
        if (!client) {
          return {
            isError: true,
            error:
              "URLCheck plugin is not connected. Check logs for connection errors.",
          };
        }

        try {
          const result = await client.callTool({
            name: toolDef.name,
            arguments: params,
          });

          if (result.isError) {
            const text = extractErrorText(result.content) || "Unknown error";
            return { isError: true, error: text };
          }

          // Preserve structured MCP payloads instead of flattening into a string.
          const response = {};
          if (Array.isArray(result.content)) {
            response.content = result.content;
          }
          if (result.structuredContent !== undefined) {
            response.structuredContent = result.structuredContent;
          }
          if (result._meta !== undefined) {
            response._meta = result._meta;
          }

          // Fallback for unexpected payload shapes.
          if (
            response.content === undefined &&
            response.structuredContent === undefined &&
            response._meta === undefined
          ) {
            response.content = [{ type: "text", text: "URLCheck scan completed." }];
          }

          return response;
        } catch (err) {
          return { isError: true, error: `URLCheck error: ${err.message}` };
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
