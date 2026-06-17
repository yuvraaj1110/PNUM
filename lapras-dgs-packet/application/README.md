# Lapras — Application Source

Real-time plumbing fleet-dispatch platform (Next.js 15 + Supabase + MCP + copilot).

**Setup:** see [`../SETUP.md`](../SETUP.md) in the parent submission packet.

```bash
cp .env.example .env.local   # fill in Supabase + LLM keys — never commit .env.local
npm install
npm run dev                  # http://localhost:3000
npm test
```

**Do not submit** `.env.local` or any file containing API keys.
