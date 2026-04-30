# Quickstart — Claude Desktop on macOS

Get to a working policy conversation in 60 seconds. The CLI / library
is still in progress; this path uses the skills purely as
documentation, which Claude (Sonnet 4.x and Opus 4.x) can act on
directly via its Bash / Web tools. No code generation needed from you.

## Three ways, easiest first

### 1. Paste-into-chat (zero install, works now)

Open a new Claude Desktop chat and paste the following as your first
message, replacing the inline blocks with the contents of the relevant
SKILL.md files:

```
You have access to UK Parliament APIs and datasets. The relevant
skill manifests are below. Use them when answering. When you call an
API, use Bash + curl, parse the JSON, and cite the URL you used.

--- SKILL: members ---
<paste contents of skills/members/SKILL.md>

--- SKILL: hansard ---
<paste contents of skills/hansard/SKILL.md>

--- SKILL: bills ---
<paste contents of skills/bills/SKILL.md>

--- SKILL: commons-votes ---
<paste contents of skills/commons-votes/SKILL.md>
```

Then ask a real question — see "Test prompts" below.

This is the fastest path because Claude Desktop's tooling is already
configured: it has the Bash tool when you allow it, and reading the
skill is enough for it to construct correct API requests.

### 2. Claude Code in the repo directory (most natural)

If you have the Claude Code CLI installed:

```sh
git clone https://github.com/danbri/forgetmenot.git ~/code/forgetmenot
cd ~/code/forgetmenot
claude
```

Claude Code auto-loads `.claude/skills/` from the project root — so
let's wire that up:

```sh
cd ~/code/forgetmenot
mkdir -p .claude
ln -snf "$(pwd)/skills" .claude/skills
```

Now `claude` in that directory has every skill loaded. Ask it
questions; it sees the skills, runs Bash to call the APIs, gives you
JSON-grounded answers.

### 3. Claude Desktop "Skills" feature (when you want them ambient)

If your Claude Desktop has the Skills panel (under
Settings → Capabilities or similar), upload the skill folders there
once and they will be available in every chat without paste-in:

```sh
cd ~/code/forgetmenot
# package one zip per facility; Claude Desktop accepts these as
# uploadable skills.
for d in skills/*/; do
  name=$(basename "$d")
  (cd "$d" && zip -qr "/tmp/parl-${name}.zip" .)
done
ls /tmp/parl-*.zip
```

In Claude Desktop → Settings → Skills (or Capabilities) → Add Skill,
upload one zip per facility. They'll be matched against your prompts
the same way Anthropic's first-party skills are.

If your Claude Desktop build does not have a Skills panel yet, fall
back to method 1 or 2.

## Test prompts to start with

Easy lookups (one-tool):

- "Who is the current MP for Hackney North and Stoke Newington, and what's their MNIS member ID?"
- "Show me the most recent Commons division — title, ayes, noes."
- "What did Sir Keir Starmer say about climate change in the most recent debate that mentioned it?"
- "What stage is the latest Online Safety Bill at?"
- "List Treasury Committee members as of today."
- "What's the latest entry in the Register of Members' Financial Interests for Diane Abbott?"

Multi-tool (the model has to chain across skills):

- "How did the MP for Bristol Central vote on the most recent Commons division about climate?"
- "Show me every amendment to the Online Safety Bill at Lords Report Stage and how each was decided."
- "When did this Government's Cabinet last change, and who joined or left?"
- "Pull the Treasury Committee's most recent report and summarise it. Include the link."
- "Find all written questions about NHS dentistry tabled in the last month, grouped by answering body."

Procedure questions (Erskine May):

- "What's the procedure for a 'Take Note' debate in the Lords?"
- "Look up Erskine May 20.5 and quote it back to me."

SPARQL territory (more demanding):

- "How many Members in the current Commons have served continuously since 2010?"
- "List all Liberal Democrat MPs with their MNIS IDs and constituencies, joined to the SPARQL graph."

## What to expect

- Claude will read the relevant SKILL.md, then call out via Bash/curl
  to the API. Allow the Bash tool when prompted.
- Responses come back as JSON; Claude summarises and cites the URL.
- For multi-step questions Claude will make several calls in sequence
  — typically 2–6 for a moderate cross-facility question.
- Connectivity flakiness shows up as `curl` failures with HTTP 000;
  ask Claude to retry.
- Claude does not currently know the SPARQL ontology in detail;
  ask it to start with the discovery queries in
  `skills/sparql/reference.md` if you need a SPARQL answer.

## When the CLI lands

Once `bin/parl.mjs` is in place (status: in progress), the same
prompts will use it instead of raw curl, which should improve
reliability for smaller models. The skills will be updated to teach
the model "prefer the CLI, fall back to curl". For Claude Sonnet /
Opus the difference is small; the win is for Qwen3 / Gemma /
ChatGPT-via-MCP.
