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
import {
  CreateTaskResultSchema,
  GetTaskPayloadResultSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

const PLUGIN_ID = "urlcheck-openclaw";
const ENDPOINT = "https://urlcheck.ai/mcp";
const CLIENT_NAME = "urlcheck-openclaw-plugin";
const CLIENT_VERSION = "0.1.11";
const REQUEST_TIMEOUT_MS = 600_000;
const REQUEST_TIMEOUT_CODE = -32001;
const INTERNAL_ERROR_CODE = -32603;
const DEFAULT_TASK_TTL_MS = 720_000;

const TASK_OPTIONS_SCHEMA = {
  type: "object",
  description:
    "Optional task options. Include this object to request task-augmented (async) execution.",
  properties: {
    ttl: {
      type: "integer",
      description:
        "Optional task result retention in milliseconds. Example: 720000.",
    },
  },
  additionalProperties: false,
};

const ASYNC_TASK_OPTIONS_SCHEMA = {
  ...TASK_OPTIONS_SCHEMA,
  description:
    "Optional task options for async execution (for example, custom ttl).",
};

function createScanInputSchema({ includesIntent = false, isAsyncTool = false } = {}) {
  const properties = {
    url: {
      type: "string",
      description:
        "The URL to analyze. Must be HTTP or HTTPS. If no scheme provided, https:// is assumed.",
    },
    task: isAsyncTool ? ASYNC_TASK_OPTIONS_SCHEMA : TASK_OPTIONS_SCHEMA,
  };

  if (includesIntent) {
    properties.intent = {
      type: "string",
      description:
        "User's stated purpose for visiting the URL (e.g., 'login to email', 'book a hotel', 'download software'). Max 248 characters.",
    };
  }

  return {
    type: "object",
    properties,
    required: ["url"],
  };
}

/**
 * Public plugin tool surface.
 *
 * Existing tool names stay backward-compatible. Async and task lifecycle tools
 * are added for discoverability and parity with MCP task workflows.
 */
const TOOL_DEFS = [
  {
    name: "url_scanner_scan",
    description:
      "Analyze a URL for potential threats. Runs direct mode by default; include task for async mode.",
    inputSchema: createScanInputSchema(),
    kind: "scan",
    mcpTool: "url_scanner_scan",
    mode: "auto",
  },
  {
    name: "url_scanner_scan_async",
    description:
      "Analyze a URL asynchronously and return a task handle immediately.",
    inputSchema: createScanInputSchema({ isAsyncTool: true }),
    kind: "scan",
    mcpTool: "url_scanner_scan",
    mode: "task",
  },
  {
    name: "url_scanner_scan_with_intent",
    description:
      "Analyze a URL with optional intent context. Runs direct mode by default; include task for async mode.",
    inputSchema: createScanInputSchema({ includesIntent: true }),
    kind: "scan",
    mcpTool: "url_scanner_scan_with_intent",
    mode: "auto",
  },
  {
    name: "url_scanner_scan_with_intent_async",
    description:
      "Analyze a URL with optional intent context asynchronously and return a task handle immediately.",
    inputSchema: createScanInputSchema({ includesIntent: true, isAsyncTool: true }),
    kind: "scan",
    mcpTool: "url_scanner_scan_with_intent",
    mode: "task",
  },
  {
    name: "url_scanner_tasks_get",
    description: "Get non-blocking status for an existing URL scan task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task identifier." },
      },
      required: ["taskId"],
    },
    kind: "task",
    mcpMethod: "tasks/get",
    resultSchema: GetTaskPayloadResultSchema,
  },
  {
    name: "url_scanner_tasks_result",
    description: "Wait for task completion and return task result payload.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task identifier." },
      },
      required: ["taskId"],
    },
    kind: "task",
    mcpMethod: "tasks/result",
    resultSchema: GetTaskPayloadResultSchema,
  },
  {
    name: "url_scanner_tasks_list",
    description: "List URL scan tasks for the authenticated API key context.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    kind: "task",
    mcpMethod: "tasks/list",
    resultSchema: GetTaskPayloadResultSchema,
  },
  {
    name: "url_scanner_tasks_cancel",
    description: "Cancel a queued or running URL scan task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task identifier." },
      },
      required: ["taskId"],
    },
    kind: "task",
    mcpMethod: "tasks/cancel",
    resultSchema: GetTaskPayloadResultSchema,
  },
];

// Module-level state persists across OpenClaw register() re-invocations.
let client = null;
let connectionHeaders = null;
let connectMcpImpl = connectMcp;

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
        client = await connectMcpImpl();
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

        const input = asObjectParams(params);
        if (!input) {
          return errorResult("Invalid arguments: expected an object.");
        }

        try {
          if (toolDef.kind === "scan") {
            return await executeScanTool(toolDef, input);
          }
          return await executeTaskMethodTool(toolDef, input);
        } catch (err) {
          const message = err?.message || String(err);
          return errorResult(`URLCheck error: ${message}`);
        }
      },
    });
  }
}

async function executeScanTool(toolDef, params) {
  const { task, ...scanArgs } = params;
  let taskOptions;

  try {
    taskOptions = parseTaskOptions(task, { forceTask: toolDef.mode === "task" });
  } catch (err) {
    return errorResult(err.message);
  }

  const mode = taskOptions ? "task" : "direct";

  if (mode === "task") {
    try {
      const taskResult = await callToolAsTask(toolDef.mcpTool, scanArgs, taskOptions);
      return normalizeStructuredResult(taskResult, "URLCheck task created.");
    } catch (err) {
      const message = err?.message || String(err);
      return errorResult(`URLCheck async error: ${message}`);
    }
  }

  return executeDirectScan(toolDef.mcpTool, scanArgs);
}

async function executeTaskMethodTool(toolDef, params) {
  try {
    const methodParams =
      toolDef.mcpMethod === "tasks/list" ? {} : params;

    const rawResult = await callMcpRequest(
      {
        method: toolDef.mcpMethod,
        params: methodParams,
      },
      toolDef.resultSchema,
      {
        timeout: REQUEST_TIMEOUT_MS,
        resetTimeoutOnProgress: true,
      },
      { allowRetry: true },
    );

    const result = normalizeTaskMethodPayload(toolDef.mcpMethod, rawResult);
    return normalizeStructuredResult(result, "URLCheck task operation completed.");
  } catch (err) {
    const message = err?.message || String(err);
    return errorResult(`URLCheck task error: ${message}`);
  }
}

async function executeDirectScan(mcpToolName, scanArgs, options = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ensureConnectedClient();

      const result = await client.callTool({
        name: mcpToolName,
        arguments: scanArgs,
      }, undefined, {
        timeout: REQUEST_TIMEOUT_MS,
        resetTimeoutOnProgress: true,
      });

      if (result.isError) {
        const text = extractErrorText(result.content) || "Unknown error";
        return errorResult(text);
      }

      return normalizeToolResult(result);
    } catch (err) {
      // Recover from server-side wait timeout if taskId is available.
      if (
        err instanceof McpError &&
        err.code === INTERNAL_ERROR_CODE &&
        err.data?.taskId
      ) {
        try {
          return await recoverFromTimeout(
            err.data.taskId,
            err.data.pollInterval,
            options.recoveryOptions,
          );
        } catch (recoveryErr) {
          return errorResult(
            `URLCheck timeout recovery failed: ${recoveryErr.message}`,
          );
        }
      }

      if (shouldRetryCallError(err, attempt)) {
        const message = err?.message || String(err);
        console.warn(
          `[URLCheck] Call failed (${message}), reconnecting...`,
        );
        await resetClientConnection();
        continue;
      }

      const message = err?.message || String(err);
      return errorResult(`URLCheck error: ${message}`);
    }
  }

  return errorResult(
    "URLCheck error: request failed after retry. Please try again.",
  );
}

async function callToolAsTask(mcpToolName, scanArgs, taskOptions) {
  return callMcpRequest(
    {
      method: "tools/call",
      params: {
        name: mcpToolName,
        arguments: scanArgs,
      },
    },
    CreateTaskResultSchema,
    {
      timeout: REQUEST_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
      task: taskOptions,
    },
    { allowRetry: false },
  );
}

async function callMcpRequest(request, resultSchema, requestOptions, options = {}) {
  const maxAttempts = options.allowRetry ? 2 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await ensureConnectedClient();

    try {
      return await client.request(request, resultSchema, requestOptions);
    } catch (err) {
      if (options.allowRetry && shouldRetryCallError(err, attempt)) {
        const message = err?.message || String(err);
        console.warn(
          `[URLCheck] Request failed (${message}), reconnecting...`,
        );
        await resetClientConnection();
        continue;
      }

      throw err;
    }
  }

  throw new Error("URLCheck request failed after retry.");
}

async function ensureConnectedClient() {
  if (client) {
    return;
  }

  try {
    client = await connectMcpImpl();
    console.log(`[URLCheck] Reconnected to ${ENDPOINT}`);
  } catch (err) {
    throw new Error(`URLCheck reconnect failed: ${err.message}`);
  }
}

async function resetClientConnection() {
  if (!client) {
    return;
  }

  try {
    await client.close();
  } catch {
    // ignore
  }

  client = null;
}

/**
 * Recover a scan result after a direct-call -32603 timeout.
 *
 * The server returns `data.taskId` and `data.pollInterval` when a direct call
 * exceeds the wait timeout. The task keeps running server-side; this function
 * polls `tasks/get` until the task completes, then fetches the full result via
 * `tasks/result`.
 */
async function recoverFromTimeout(taskId, pollIntervalMs, options = {}) {
  const maxWaitMs = Number.isInteger(options.maxWaitMs)
    ? options.maxWaitMs
    : 500_000;
  const sleepFn = typeof options.sleepFn === "function" ? options.sleepFn : delay;
  const deadline = Date.now() + maxWaitMs;
  const interval = Math.max(pollIntervalMs || 2000, 1000);

  console.log(
    `[URLCheck] Direct-call timeout - recovering task ${taskId} via polling`,
  );

  while (Date.now() < deadline) {
    await sleepFn(interval);

    let taskResult;
    try {
      taskResult = await callMcpRequest(
        {
          method: "tasks/get",
          params: { taskId },
        },
        GetTaskPayloadResultSchema,
        {
          timeout: REQUEST_TIMEOUT_MS,
          resetTimeoutOnProgress: true,
        },
        { allowRetry: true },
      );
    } catch {
      continue;
    }

    const task = taskResult?.task || taskResult;
    const status = String(task?.status || "").toLowerCase();

    if (status === "completed") {
      try {
        const taskPayload = await callMcpRequest(
          {
            method: "tasks/result",
            params: { taskId },
          },
          GetTaskPayloadResultSchema,
          {
            timeout: REQUEST_TIMEOUT_MS,
            resetTimeoutOnProgress: true,
          },
          { allowRetry: true },
        );

        console.log(`[URLCheck] Task ${taskId} recovered successfully`);
        return normalizeRecoveredTaskPayload(taskPayload);
      } catch {
        // Continue polling
      }
    }

    if (status === "failed" || status === "cancelled") {
      throw new Error(`Task ${taskId} ended with status: ${status}`);
    }
  }

  throw new Error(`Recovery poll exhausted for task ${taskId}`);
}

function normalizeRecoveredTaskPayload(taskPayload) {
  if (taskPayload?.value !== undefined) {
    return normalizeStructuredResult(taskPayload.value, "URLCheck scan completed.");
  }

  if (Array.isArray(taskPayload?.content) || taskPayload?.structuredContent !== undefined) {
    return normalizeToolResult(taskPayload);
  }

  return normalizeStructuredResult(taskPayload, "URLCheck scan completed.");
}

function normalizeTaskMethodPayload(method, payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (method === "tasks/get" || method === "tasks/cancel") {
    if (payload.task && typeof payload.task === "object") {
      return payload;
    }

    if (payload.taskId && payload.status) {
      return { task: payload };
    }
  }

  return payload;
}

function normalizeStructuredResult(payload, fallbackText) {
  const response = {
    structuredContent: payload,
    content: [{ type: "text", text: safeSerialize(payload, fallbackText) }],
  };

  if (payload?._meta !== undefined) {
    response._meta = payload._meta;
  }

  return response;
}

function parseTaskOptions(taskParam, { forceTask = false } = {}) {
  if (taskParam === undefined || taskParam === null) {
    return forceTask ? { ttl: DEFAULT_TASK_TTL_MS } : undefined;
  }

  if (typeof taskParam !== "object" || Array.isArray(taskParam)) {
    throw new Error("Invalid 'task' parameter: expected an object.");
  }

  const allowedKeys = new Set(["ttl"]);
  for (const key of Object.keys(taskParam)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Invalid task option '${key}'.`);
    }
  }

  const options = {};

  if (taskParam.ttl !== undefined) {
    if (!Number.isInteger(taskParam.ttl) || taskParam.ttl <= 0) {
      throw new Error("Invalid task.ttl: expected a positive integer.");
    }
    options.ttl = taskParam.ttl;
  }

  if (forceTask && Object.keys(options).length === 0) {
    options.ttl = DEFAULT_TASK_TTL_MS;
  }

  return options;
}

function asObjectParams(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  return params;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export function shouldRetryCallError(err, attempt) {
  if (attempt !== 0) {
    return false;
  }

  // Retry transport-like failures once.
  if (!(err instanceof McpError)) {
    return true;
  }

  // Retry MCP RequestTimeout once; other MCP protocol errors are final.
  return (
    err.code === REQUEST_TIMEOUT_CODE ||
    /request timed out|timed out/i.test(err.message)
  );
}

function safeSerialize(value, fallback = "URLCheck scan completed.") {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

const INTERNAL_TEST_HOOKS_ENABLED =
  process.env.URLCHECK_INTERNAL_TEST_HOOKS === "1";

export const __testables = INTERNAL_TEST_HOOKS_ENABLED
  ? {
      parseTaskOptions,
      asObjectParams,
      normalizeStructuredResult,
      normalizeTaskMethodPayload,
      normalizeRecoveredTaskPayload,
      extractErrorText,
      safeSerialize,
      resolveApiKey,
      executeDirectScan,
      recoverFromTimeout,
      callMcpRequest,
      setClientForTest(value) {
        client = value;
      },
      setConnectionHeadersForTest(value) {
        connectionHeaders = value;
      },
      setConnectMcpForTest(value) {
        connectMcpImpl = value || connectMcp;
      },
      resetStateForTest() {
        client = null;
        connectionHeaders = null;
        connectMcpImpl = connectMcp;
      },
      getStateForTest() {
        return {
          hasClient: Boolean(client),
          connectionHeaders,
        };
      },
    }
  : undefined;
