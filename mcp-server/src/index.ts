#!/usr/bin/env node
/**
 * P3FO MCP Server entry point (stdio transport).
 *
 * Connects an AI assistant to a running P3FO backend over its REST API.
 * Configuration via env: P3FO_API_URL (default http://localhost:5172),
 * optional P3FO_API_TOKEN for Bearer auth.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { P3foClient } from './client.js';
import { registerTools } from './tools.js';

const baseUrl = process.env.P3FO_API_URL ?? 'http://localhost:5172';
const token = process.env.P3FO_API_TOKEN;

const client = new P3foClient(baseUrl, token);
const server = new McpServer({
  name: 'p3fo',
  version: '0.1.0',
});

registerTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);