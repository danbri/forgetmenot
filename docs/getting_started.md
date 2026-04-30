# Getting started

Test this on a real LLM in 5 minutes. Below: paths for Claude (Desktop
and Code), Gemini, ChatGPT, and a local Qwen3 / Gemma on macOS via
Ollama. Each path notes what does and doesn't work, because the
constraints differ a lot.

## Prerequisites

```sh
git clone https://github.com/danbri/forgetmenot.git ~/code/forgetmenot
cd ~/code/forgetmenot
node --version       # need Node 18+ for fetch global
node bin/parl.mjs --version          # should print 0.1.0
node bin/parl.mjs members search --name Cooper --house Commons --take 1
```

If the smoke command works, the CLI is ready. Optional: put `parl` on
your PATH:

```sh
npm link             # registers `parl` globally
parl --version
```

## 1 — Claude Desktop on macOS

Three install paths, easiest first.

### 1a. Paste-into-chat (zero install, works today)

Open a fresh Claude Desktop chat and paste this as the first message,
filling in the inline blocks from the repo:

```
You have access to UK Parliament APIs and datasets. The Skill manifests
below describe what's available. There is also a Node CLI at
`bin/parl.mjs` in the repo at ~/code/forgetmenot — prefer it over
constructing curl by hand.

Use the Bash tool to call:
  cd ~/code/forgetmenot && node bin/parl.mjs <facility> <command> [args]

Cite the URLs you used.

--- SKILL: members ---
[paste contents of skills/members/SKILL.md]

--- SKILL: hansard ---
[paste skills/hansard/SKILL.md]

--- SKILL: bills ---
[paste skills/bills/SKILL.md]

--- SKILL: commons-votes ---
[paste skills/commons-votes/SKILL.md]

--- SKILL: sparql ---
[paste skills/sparql/SKILL.md]
```

Allow the Bash tool when prompted. Ask test questions from
[`docs/quickstart-claude-desktop.md`](quickstart-claude-desktop.md).

### 1b. Claude Code in the repo directory (recommended)

Claude Code auto-loads project-local `.claude/skills/`:

```sh
cd ~/code/forgetmenot
mkdir -p .claude
ln -snf "$(pwd)/skills" .claude/skills
claude        # launch Claude Code
```

Now every chat in this directory has all 21 skill manifests available.
The CLI is on the same path; Claude can run it directly.

### 1c. Claude Desktop "Skills" panel (when ambient)

If your Claude Desktop has a Skills panel:

```sh
cd ~/code/forgetmenot
for d in skills/*/; do
  name=$(basename "$d")
  (cd "$d" && zip -qr "/tmp/parl-${name}.zip" .)
done
ls /tmp/parl-*.zip
```

Upload each zip in Settings → Skills. They activate automatically based
on the `description` frontmatter.

## 2 — Gemini (Google)

Two paths:

### 2a. Gemini in the browser, attach the SKILLs as files

Open a fresh Gemini conversation, attach the relevant `SKILL.md` files
as text uploads, and prompt as in the Claude paste-in path.

Gemini cannot run shell commands, so it will produce HTTP requests in
text and ask you to run them. Useful for exploration; less smooth for
multi-step questions. The same constraint applies to ChatGPT (web).

### 2b. Gemini API + function calling

A small wrapper that exposes each `lib/facilities/*.mjs` function as a
Gemini function declaration is the right architecture; not yet shipped
in this repo (in [`docs/todo.md`](todo.md)).

## 3 — ChatGPT (OpenAI)

### 3a. ChatGPT chat (web) — paste-in

Same constraint as Gemini chat: no shell access. Paste the SKILLs as
the system message, ask questions, paste the constructed URLs into
your shell yourself or have ChatGPT walk you through it.

### 3b. Custom GPT with OpenAPI Actions

ChatGPT Custom GPTs accept OpenAPI 3.0 / Swagger specs as "Actions".
The cached specs in `_specs/*.json` are the right shape for this:

1. Open <https://chat.openai.com/gpts/editor> → Create.
2. Configure → Actions → "Import from URL" — paste e.g.
   `https://members-api.parliament.uk/swagger/v1/swagger.json`.
3. Repeat for each spec you want to expose.
4. Authentication: None.
5. Privacy policy URL: required by ChatGPT — point at the
   [Open Parliament Licence](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/).

This works **without** the CLI — ChatGPT calls the Parliament APIs
directly from its own infrastructure. **Note** that one Custom GPT can
import a limited number of Actions (the ChatGPT ceiling has been ~10
in the past), so cherry-pick.

### 3c. ChatGPT Code Interpreter

The Code Interpreter sandbox is **Linux Python with no internet**, so
the CLI can't reach the Parliament APIs from inside it. Skip.

## 4 — Local models on macOS (Qwen3, Gemma) via Ollama

```sh
brew install ollama
ollama serve &              # background daemon
ollama pull qwen3:7b        # or gemma3:4b, mistral:7b, llama3.1:8b
ollama run qwen3:7b
```

Plain Ollama doesn't do tool-calling out of the box. Two paths:

### 4a. OpenWebUI in front of Ollama (recommended)

OpenWebUI gives Ollama a chat UI with tool-calling, system prompts,
and uploads:

```sh
docker run -d -p 3000:8080 \
  -v openwebui:/app/backend/data \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  --name openwebui \
  ghcr.io/open-webui/open-webui:main
```

Open <http://localhost:3000>. Upload each `SKILL.md` to a Knowledge
collection; create a custom model preset that includes the collection
in its system prompt. Add a tool that runs `node bin/parl.mjs ...` via
OpenWebUI's "function tools".

For a smaller model like Qwen3 7B or Gemma3 4B, prefer `parl <facility>
<command>` invocations over having the model construct curl. The CLI
gives a small surface (verb + flags) which the model handles much more
reliably than building HTTP requests.

### 4b. llama.cpp + a thin Node agent loop

If you'd rather not run Docker, write a small Node script that:

1. POSTs to llama.cpp's `/completion` or `/v1/chat/completions`.
2. Watches model output for a tool-call marker (e.g. ` ```cli ` blocks).
3. Runs the matched `parl ...` command with `child_process`.
4. Feeds the JSON output back into the conversation.

About 100 lines. Sketched in [`docs/todo.md`](todo.md) for follow-up.

### 4c. In-browser local model

For Web LLM / Transformers.js setups: open
[`browser/index.html`](../browser/index.html) and import `parl.js`.
Same library functions as the Node CLI; the model uses them directly.
**CORS caveat**: not every Parliament API permits browser-origin
requests. We have not yet probed which do; if a call fails with a CORS
error in the browser console, the same call works from the Node CLI.
A per-API CORS map is in [`docs/todo.md`](todo.md).

## 5 — A no-LLM use

The CLI is also useful on its own for analysts and journalists. There
is no agent loop, no skills, just a tool you can pipe through `jq`:

```sh
parl bills search --term "online safety" --house Commons \
  | jq '.items[] | {id: .billId, title: .shortTitle, stage: .currentStage.description}'
```

## Test prompts

Once you have any of the above wired up, try:

**Single-tool:**

- "Who is the current MP for Hackney North and Stoke Newington?"
- "Show me the most recent Commons division. Title, ayes, noes."
- "What did Sir Keir Starmer say in the most recent debate that mentioned climate?"
- "List the current Treasury Committee members."
- "What's the latest written statement from the Department of Health?"

**Multi-tool:**

- "How did the MP for Bristol Central vote on the most recent Commons division about climate?"
- "List every amendment to the Online Safety Bill at Lords Report Stage and how each was decided."
- "Find all written questions about NHS dentistry tabled in April 2026, grouped by answering body."
- "Who are the current Cabinet Ministers and which constituencies do they represent?"

**Procedural:**

- "What's Erskine May's procedure for a Take Note debate?"
- "Quote me Erskine May 20.5."
- "What kinds of statutory instrument procedures are there, and which is most common right now?"

**SPARQL:**

- "Discover the top 30 instance classes in the Parliament SPARQL store and report which look most useful for joining REST API resources."
- "Pull the SKOS concept scheme for the Parliament Thesaurus and list its top concepts."

## Troubleshooting

- **`fatal: unable to access ...github.com`** — your network has flaky
  TLS. Retry; the CLI's `lib/http.mjs` already retries 5xx.
- **`ECONNREFUSED` from petitions.parliament.uk** — the petitions
  service was up at last check; if down for hours, fall back to the
  petitions website's HTML.
- **`HttpError: 500 ... Read timed out` on SPARQL** — the count-all
  classes query is heavy on the public endpoint. Add `--limit 30` or
  similar.
- **`HttpError: 404` on MNIS** — confirmed intermittent; retry.
- **Browser CORS error** — the Node CLI works for the same query;
  use it instead.
