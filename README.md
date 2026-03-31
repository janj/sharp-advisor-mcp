# Sharp Advisor MCP

A remote MCP server that makes Gene Sharp's nonviolent resistance corpus searchable by AI assistants. Connect it as a custom connector in Claude.ai and ask questions about strategy, tactics, and theory drawn directly from Sharp's work.

This server was built as a public interest project. All source texts remain freely available at [aeinstein.org](https://www.aeinstein.org/digital-library).

## What it is

Gene Sharp (1928–2018) was a political scientist who dedicated his life to documenting how ordinary people have successfully resisted oppression without violence. His work — developed at the [Albert Einstein Institution](https://www.aeinstein.org) — has influenced movements in dozens of countries.

This server indexes the following texts and makes them queryable by AI:

| Text | Description |
|------|-------------|
| The Politics of Nonviolent Action | Sharp's foundational three-volume work on power, methods, and dynamics |
| How Nonviolent Struggle Works | Accessible summary of Sharp's theory |
| From Dictatorship to Democracy | Strategic framework for liberation movements |
| 198 Methods of Nonviolent Action | The complete catalog of nonviolent tactics |
| The Anti-Coup | How to defend democracy against coups d'état |
| On Strategic Nonviolent Conflict | Strategic thinking for nonviolent campaigns |
| There Are Realistic Alternatives | The case for nonviolent resistance as a practical alternative to war |

## Connect as a Custom Connector

Claude Pro and Max subscribers can add this as a custom connector:

1. Go to **Settings → Connectors** in Claude.ai
2. Click **Add custom connector**
3. Paste the MCP server URL:
   ```
   https://sharp-advisor-mcp.fly.dev/mcp
   ```
4. Click **Save**

The connector provides three tools that Claude will use automatically when relevant:
- **search_corpus** — full-text search over all seven texts
- **get_methods** — Sharp's 198 methods, filterable by class
- **get_system_prompt** — the recommended advisor system prompt

## Recommended System Prompt

For the best experience, create a **Claude Project** with this server connected, and paste the following into the Project Instructions. Claude will call `get_system_prompt` to retrieve the current version:

```
You are an advisor trained on Gene Sharp's theory and practice of nonviolent
resistance. When answering questions about strategy, tactics, or specific
situations, use the search_corpus tool to find relevant passages from Sharp's
works, and get_methods to identify specific tactics. Always ground your advice
in Sharp's frameworks and cite the source texts.
```

Or ask Claude directly: `Use get_system_prompt to show me the recommended system prompt.`

## Tools

### `search_corpus`
Searches all corpus chunks using TF-IDF relevance ranking. No vector database needed — the full corpus fits in memory.

```json
{ "query": "how to counter repression", "limit": 5 }
```

### `get_methods`
Returns Sharp's 198 methods, optionally filtered by class:

```json
{ "class": "protest_persuasion" }
// or: "noncooperation", "intervention"
// or omit to get all 198
```

### `get_system_prompt`
Returns the full advisor system prompt with no arguments.

## Run Locally

```bash
git clone https://github.com/janj/sharp-advisor-mcp
cd sharp-advisor-mcp
npm install
node src/index.js
```

Health check: `curl http://localhost:3000/`

MCP endpoint: `http://localhost:3000/mcp`

The corpus (`corpus/sharp-corpus.json`) is committed to the repo — no download step needed.

### Rebuild the Corpus

If you want to regenerate the corpus from PDFs:

```bash
# Install devbox (https://www.jetify.com/devbox) for pdftotext
devbox shell
node scripts/build-corpus.js
```

PDFs are not committed. The script downloads them from aeinstein.org.

## Deploy Your Own Instance

```bash
fly auth login
fly launch --name my-sharp-advisor --no-deploy
fly deploy
```

Then connect `https://my-sharp-advisor.fly.dev/mcp` as a custom connector.

## Credits

All content is the work of **Gene Sharp** and the **Albert Einstein Institution**.

- Full texts and more resources: [aeinstein.org/digital-library](https://www.aeinstein.org/digital-library)
- This server does not redistribute PDFs — only extracted text for AI retrieval

## License

MIT — fork it, run your own, improve it.
