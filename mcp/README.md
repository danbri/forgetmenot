# forgetmenot MCP server

A [Model Context Protocol](https://modelcontextprotocol.io/) server
exposing UK Parliament APIs and datasets as typed tools, browsable
resources, and named prompts. Wraps the same `lib/facilities/*.mjs`
that the `parl` CLI uses — single source of truth.

The MCP shape adds value over the CLI in three places:
- **Clients without shell access** (Claude.ai web, in-browser local
  models with an MCP harness, hosted assistants, mobile clients).
- **Local models with weaker tool-use ability** (Qwen3 8B, Gemma 4B):
  the typed schema constrains the model's tool calls in a way bare
  documentation cannot.
- **Cross-client reuse**: Cursor, Continue, Zed, Codex, Windsurf,
  OpenWebUI, anything that speaks MCP.

It does *not* replace the CLI when you have shell access — for Claude
Code or Claude Desktop's Bash tool the CLI is lighter.

## What it exposes

### Tools (~40)

Highest-value calls per facility, named `<facility>_<verb>`:

- **SPARQL**: `sparql_query`, `sparql_classes`, `sparql_predicates_of`,
  `sparql_describe`, `sparql_skos_schemes`.
- **Members**: `members_search`, `members_get`, `members_voting`,
  `members_interests`, `members_contributions`, `constituency_search`,
  `parties_state`.
- **Bills**: `bills_search`, `bills_get`, `bills_stages`,
  `bills_amendments`.
- **Committees**: `committees_search`, `committees_get`,
  `committees_business_search`, `committees_oral_evidence_search`.
- **Hansard**: `hansard_last_sitting`, `hansard_search`,
  `hansard_search_debates`, `hansard_debate`.
- **Votes**: `commons_votes_search`, `commons_votes_get`,
  `commons_votes_by_party`, `lords_votes_search`, `lords_votes_get`.
- **Questions**: `oral_questions_search`, `edms_search`, `wq_search`,
  `wq_get`.
- **Procedure**: `si_search`, `si_get`, `si_timeline`,
  `treaties_search`, `treaties_get`, `interests_search`,
  `em_paragraph`, `em_search`.
- **Live + meta**: `now_current`, `petitions_search`, `petitions_get`,
  `odata_get`, `odata_sets`, `pq_postcode`, `pq_run`, `lda_get`.

Each tool returns the API's JSON response as a single text content
block. Errors come back as `isError: true` with a one-line message
including the upstream URL when known.

### Resources

Two URI templates:

- `forgetmenot://spec/{name}` — the cached OpenAPI specs in `_specs/`.
- `forgetmenot://skill/{path}` — the SKILL.md and reference.md files
  for each facility.

These are served straight from the local filesystem; the model can
browse them via `resources/list` and `resources/read` without any
network round-trip.

### Prompts

- `explain_bill` — given a bill ID, drives the right tool sequence
  and asks for a summary with citations.
- `explain_division` — same for a Commons division.
- `postcode_to_mp` — postcode → constituency → MP profile.

## Run it

```sh
cd /path/to/forgetmenot-palace
npm install                       # one-time, installs MCP SDK + zod
node mcp/server.mjs                # starts a stdio server
```

The server logs `forgetmenot MCP server vX.Y.Z ready (stdio)` to
**stderr** and uses **stdout exclusively for the MCP protocol**. Do not
add `console.log` to it.

## Wire it into clients

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS), or the Windows / Linux equivalent. Add:

```json
{
  "mcpServers": {
    "forgetmenot": {
      "command": "node",
      "args": ["/Users/danbri/working/sandbox/forgetmenot-palace/mcp/server.mjs"]
    }
  }
}
```

Restart Claude Desktop. The tools will appear under the hammer icon.
Try: *"Use the forgetmenot tools to find the latest Commons division
and tell me which Lib Dems voted aye."*

### Claude Code

Project-local `.mcp.json` at the repo root, or run from a directory
that has one:

```json
{
  "mcpServers": {
    "forgetmenot": {
      "command": "node",
      "args": ["./mcp/server.mjs"]
    }
  }
}
```

Claude Code picks up `.mcp.json` automatically. Same prompt as above.

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "forgetmenot": {
      "command": "node",
      "args": ["/abs/path/to/forgetmenot-palace/mcp/server.mjs"]
    }
  }
}
```

### Continue.dev

In your `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: forgetmenot
    command: node
    args: ["/abs/path/to/forgetmenot-palace/mcp/server.mjs"]
```

### Zed

`~/.config/zed/settings.json` under `context_servers`:

```json
{
  "context_servers": {
    "forgetmenot": {
      "command": {
        "path": "node",
        "args": ["/abs/path/to/forgetmenot-palace/mcp/server.mjs"]
      }
    }
  }
}
```

### OpenWebUI / local models (Qwen3, Gemma) via Ollama

OpenWebUI doesn't speak MCP directly, but the
[mcpo](https://github.com/open-webui/mcpo) bridge does. Run
the forgetmenot stdio server inside mcpo, point OpenWebUI at the
resulting OpenAPI surface, and your local model gets the same tools.

```sh
pipx install mcpo
mcpo --port 8000 -- node /abs/path/to/forgetmenot-palace/mcp/server.mjs
# Then add http://localhost:8000 as an OpenAPI tools URL in OpenWebUI.
```

## Test it without a client

Use the official MCP Inspector:

```sh
npx @modelcontextprotocol/inspector node mcp/server.mjs
```

Open the URL it prints. You'll get a UI for `tools/list`, calling each
tool with a JSON-schema form, and browsing resources.

Or hand-roll a quick stdio probe:

```sh
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0.0.1"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"hansard_last_sitting","arguments":{"house":"Commons"}}}'
  sleep 2
} | node mcp/server.mjs
```

## Design notes

- **Stdlib + two deps.** Only `@modelcontextprotocol/sdk` and `zod`.
  Everything else is the same `lib/` the CLI uses.
- **Schemas are the API contract.** Field names match the canonical
  REST APIs where possible (`memberId`, `divisionId`, `term`).
  Where the upstream uses a quirky parameter name (e.g. Hansard's
  `queryParameters.searchTerm`), the schema uses the friendly form
  and the facility module does the translation.
- **Errors don't kill the server.** Every tool handler is wrapped
  in `safe()` which returns `{ isError: true, content: [...] }` on
  exception. The server keeps running.
- **Politeness.** All requests go through `lib/http.mjs`, which sets
  a User-Agent identifying this repo (`forgetmenot/<version>
  (+https://github.com/danbri/forgetmenot)`), retries on 5xx, and
  caps each request at 30 s by default.

## Open work

- **HTTP transport** (`mcp/server-http.mjs`) using
  `StreamableHTTPServerTransport` for hosting at a shared remote
  endpoint. Stub planned but not committed.
- **Fly.io deployment** (`fly.toml`) for that shared endpoint with
  rate limiting, server-side caching of stable reference data, and
  audit logging.
- **More tools.** ~40 of the ~200 library functions are surfaced;
  add more as need emerges. Avoid surfacing the whole library — keep
  the tool list scannable.
- **Per-tool cost hints.** Some calls are cheap (member lookup),
  others expensive (whole-graph SPARQL aggregates). MCP doesn't have
  a cost field but `description` should warn.
