import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { buildIndex, search } from './search.js';
import { getMethods } from './methods.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Load corpus at startup
const corpusPath = join(__dirname, '..', 'corpus', 'sharp-corpus.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const index = buildIndex(corpus);
console.log(`Corpus loaded: ${corpus.length} chunks indexed.`);

const SYSTEM_PROMPT = `You are an advisor trained on Gene Sharp's theory and practice of nonviolent resistance, drawing from his complete works including The Politics of Nonviolent Action, From Dictatorship to Democracy, The Anti-Coup, and related texts.

Your role is to help users:
- Understand the strategic logic of nonviolent struggle (Sharp's "political jiu-jitsu")
- Identify appropriate methods from Sharp's 198 techniques for their situation
- Analyze the sources of power and how to undermine them nonviolently
- Plan phased campaigns that build capacity before escalating
- Anticipate and counter repression using Sharp's frameworks

Core principles to apply:
1. Power is not monolithic — it depends on consent, cooperation, and obedience from pillars of support
2. Nonviolent discipline is strategic, not merely moral — violence by protesters harms the cause
3. Conversion, accommodation, coercion, and disintegration are four mechanisms of change
4. Planning matters: identify grievances, define objectives, assess sources of power, choose methods, build coalitions
5. Oppression and repression can backfire ("political jiu-jitsu") when nonviolent discipline is maintained

When advising:
- Always ground recommendations in Sharp's framework, citing relevant concepts
- Use the search_corpus tool to find specific passages supporting your advice
- Use get_methods to present relevant tactical options
- Distinguish between strategic objectives and tactical actions
- Acknowledge context: what works depends on the nature of the opponent, available population, and historical moment

Source attribution: All knowledge comes from Gene Sharp's work, published by the Albert Einstein Institution. Users should consult the original texts at aeinstein.org for authoritative guidance.`;

const TOOL_NAMES = ['search_corpus', 'get_methods', 'get_system_prompt'];

function createMcpServer() {
  const server = new McpServer({
    name: 'sharp-advisor-mcp',
    version: '1.0.0',
  });

  server.tool(
    'search_corpus',
    'Search Gene Sharp\'s nonviolent resistance corpus for passages relevant to a query. Returns the most relevant excerpts from Sharp\'s books with source and chapter information.',
    {
      query: z.string().describe('The search query — a question, concept, or situation you want to find guidance on'),
      limit: z.number().int().min(1).max(20).optional().default(5).describe('Number of results to return (default 5, max 20)'),
    },
    async ({ query, limit }) => {
      const results = search(query, corpus, index, limit);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: 'No relevant passages found for that query.' }] };
      }
      const formatted = results.map((r, i) =>
        `## Result ${i + 1} — ${r.source}\n**Chapter/Section:** ${r.chapter}\n**Relevance:** ${r.relevance_score}\n\n${r.text}`
      ).join('\n\n---\n\n');
      return { content: [{ type: 'text', text: formatted }] };
    }
  );

  server.tool(
    'get_methods',
    'Returns Sharp\'s 198 methods of nonviolent action, optionally filtered by class. Use this to identify specific tactics appropriate for a situation.',
    {
      class: z.enum(['protest_persuasion', 'noncooperation', 'intervention']).optional().describe(
        'Filter by class: "protest_persuasion" (methods 1–54: symbolic acts, marches, petitions), ' +
        '"noncooperation" (methods 55–148: strikes, boycotts, political noncooperation), ' +
        '"intervention" (methods 149–198: sit-ins, parallel institutions, economic disruption). ' +
        'Omit to get all 198 methods.'
      ),
    },
    async ({ class: classFilter }) => {
      const methods = getMethods(classFilter);
      const grouped = {};
      for (const m of methods) {
        if (!grouped[m.category]) grouped[m.category] = [];
        grouped[m.category].push(m);
      }
      const lines = [];
      for (const [cat, items] of Object.entries(grouped)) {
        lines.push(`### ${cat}`);
        for (const m of items) {
          lines.push(`${m.number}. ${m.name}`);
        }
        lines.push('');
      }
      const header = classFilter
        ? `## Sharp's Methods: ${classFilter.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (${methods.length} methods)\n\n`
        : `## Sharp's 198 Methods of Nonviolent Action\n\n`;
      return { content: [{ type: 'text', text: header + lines.join('\n') }] };
    }
  );

  server.tool(
    'get_system_prompt',
    'Returns the recommended system prompt to use when setting up a Claude Project with this connector. Paste this into your Project Instructions to configure Claude as a Sharp-trained nonviolent resistance advisor.',
    {},
    async () => {
      return { content: [{ type: 'text', text: SYSTEM_PROMPT }] };
    }
  );

  return server;
}

// Read full request body as a buffer, then parse JSON
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) { resolve(undefined); return; }
      try { resolve(JSON.parse(raw)); } catch { resolve(undefined); }
    });
    req.on('error', reject);
  });
}

// HTTP server — stateless: create a new MCP server + transport per request
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', tools: TOOL_NAMES, corpus_chunks: corpus.length }));
    return;
  }

  // MCP endpoint — stateless: fresh server + transport per request
  if (url.pathname === '/mcp') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    const server = createMcpServer();
    await server.connect(transport);

    const parsedBody = req.method === 'POST' ? await readBody(req) : undefined;
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

httpServer.listen(PORT, () => {
  console.log(`Sharp Advisor MCP server listening on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
