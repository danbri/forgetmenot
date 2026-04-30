# Installing and using these skills

The repo contains 21 skills, one per UK Parliament-operated API or
dataset family, under `skills/<facility>/`. Each skill is two files:

```
skills/<facility>/
├── SKILL.md       # frontmatter + manifest body — loaded into context first
└── reference.md   # full endpoint listing — loaded only when SKILL.md says so
```

The frontmatter follows the Anthropic Skills convention:

```markdown
---
name: uk-parliament-<facility>
description: <one paragraph; this is what the LLM matches against>
---
```

The skills do **not** ship code. They ship documentation that is
small enough to load into the LLM's context, contains the exact base
URLs, parameter conventions and worked examples, and tells the LLM
where the cached OpenAPI spec lives if it needs more detail.

## Wiring the skills up

### Claude Desktop on macOS (or Windows/Linux)

Claude Desktop loads skills from the `~/.claude/skills/` directory.

```sh
# from the repo root
mkdir -p ~/.claude/skills
for s in skills/*; do
  ln -snf "$(pwd)/$s" "~/.claude/skills/$(basename "$s")"
done
```

Or if you do not want to symlink the whole repo:

```sh
git clone https://github.com/danbri/forgetmenot.git ~/code/forgetmenot
mkdir -p ~/.claude/skills
ln -snf ~/code/forgetmenot/skills/* ~/.claude/skills/
```

Restart Claude Desktop. The skills are loaded lazily — the
description is consulted on every turn, and the body of `SKILL.md` is
only included in the prompt when the description matches the user's
request.

### Claude Code (CLI)

Claude Code uses the same `~/.claude/skills/` directory, plus
project-local `.claude/skills/` if present.

```sh
# project-local install
mkdir -p .claude/skills
ln -snf ~/code/forgetmenot/skills/* .claude/skills/
```

Project-local skills only activate when Claude Code is run from that
directory tree.

### Anthropic Agent SDK (Python or TypeScript)

The Anthropic Agent SDK ships skills as part of the prompt. Point
the SDK at the same `skills/` directory:

```python
from anthropic_agent import Agent

agent = Agent(
    skills_path="/path/to/forgetmenot/skills",
    # ... other config
)
```

(The exact API depends on the SDK version; check the current docs.
The principle is the same: the SDK reads the per-skill folder, uses
the description for triggering, and includes the body when triggered.)

### Other LLM platforms

The skills are plain Markdown with YAML frontmatter, which is widely
supported. To use them with a non-Anthropic platform:

1. Pre-load every `SKILL.md` body into a system prompt (small, ~250
   lines total across all 21 facilities).
2. On user input, *or* via a retrieval step, decide which
   `reference.md` files to also include based on the description
   match.
3. The LLM then has enough context to construct the right HTTP
   request to the right Parliament endpoint.

There is no MCP server in the repo. If you want one — e.g. so a
non-Claude client can call into these APIs over JSON-RPC rather
than constructing HTTP themselves — the skill folders give you the
endpoint inventory you need to write one. Each skill could be an MCP
tool name; the `reference.md` is essentially the tool schema. This is
on the deferred list in [`docs/todo.md`](todo.md).

### From CI / scripts (no LLM at all)

The repo is also useful without Claude. The cached OpenAPI specs in
`_specs/` and the discovery scripts in `scripts/` give you a
self-contained reference for any program that wants to integrate with
UK Parliament APIs.

```sh
# Generate a fresh local copy of every spec
bash scripts/refetch-specs.sh

# Re-discover entity sets / templates / dataset names
bash scripts/refetch-discovered.sh

# Confirm everything is reachable today
bash scripts/probe-endpoints.sh

# Run the smoke test
bash tests/test_endpoints.sh
```

## Updating the skills

Skills should track API changes. The recommended cadence is:

1. Run `bash scripts/refetch-specs.sh` and
   `bash scripts/refetch-discovered.sh`.
2. `git diff _specs/` — any non-trivial change usually warrants
   updating the affected `reference.md`.
3. Run `bash tests/test_endpoints.sh` and commit any newly-broken
   endpoints to `docs/worklog.md` rather than silently ignoring.
4. Probe results live in `_specs/probes/` with a date-stamped name;
   commit them so changes over time are diffable.
