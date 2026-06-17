#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════
 *  Lapras Fleet-Ops MCP Server  (Model Context Protocol)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Exposes Lapras fleet operations as MCP tools over stdio, so ANY MCP
 *  client (Claude Desktop, Claude Code, the in-app copilot, a custom agent)
 *  can read fleet state and dispatch jobs through a typed, schema-validated
 *  interface.
 *
 *  Tools (see lib/fleet-tools.ts for the JSON-Schema contracts):
 *    • get_fleet_status
 *    • list_jobs
 *    • find_nearest_available_tech
 *    • assign_job
 *    • get_job_history
 *
 *  Run:   npm run mcp
 *  Wire into an MCP client config, e.g. Claude Desktop:
 *    {
 *      "mcpServers": {
 *        "lapras-fleet": {
 *          "command": "npx",
 *          "args": ["tsx", "mcp-server/index.ts"],
 *          "env": {
 *            "NEXT_PUBLIC_SUPABASE_URL": "https://xxx.supabase.co",
 *            "SUPABASE_SERVICE_ROLE_KEY": "eyJ..."
 *          }
 *        }
 *      }
 *    }
 * ════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import { FLEET_TOOLS, executeTool } from '../lib/fleet-tools';

// ─── Supabase client (service role preferred to bypass RLS for ops) ───
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[lapras-mcp] Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and a key.');
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── MCP server wiring ───
const server = new Server(
  { name: 'lapras-fleet', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: FLEET_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await executeTool(sb, name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: `Error in ${name}: ${message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[lapras-mcp] Fleet-Ops MCP server running on stdio.');
}

main().catch((err) => {
  console.error('[lapras-mcp] Fatal:', err);
  process.exit(1);
});
