/**
 * Smoke test: spawn the Lapras MCP server and list its tools.
 * Run: npx tsx scripts/mcp-smoke.ts
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'mcp-server/index.ts'],
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`✅ MCP server exposed ${tools.length} tools:`);
  for (const t of tools) console.log(`   • ${t.name}`);

  const expected = ['get_fleet_status', 'list_jobs', 'find_nearest_available_tech', 'assign_job', 'get_job_history'];
  const names = tools.map((t) => t.name).sort();
  const ok = expected.sort().every((e) => names.includes(e));
  await client.close();
  if (!ok) {
    console.error('❌ Missing expected tools');
    process.exit(1);
  }
  console.log('✅ All expected tools present.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Smoke test failed:', err);
  process.exit(1);
});
