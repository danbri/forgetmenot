# Installing and using these skills

The repo contains 28 skills, one per UK Parliament-operated API or
dataset family, under `skills/<facility>/`. Each skill is two files:

```
skills/<facility>/
├── SKILL.md       # frontmatter + manifest body — loaded into context first
└── reference.md   # full endpoint listing — loaded only when SKILL.md says so
```

The frontmatter follows the [Agent Skills](https://agentskills.io)
open standard:

```markdown
---
name: <facility>
description: <one paragraph; this is what the LLM matches against>
---
```

The skills do **not** ship code. They ship documentation that is
small enough to load into the LLM's context, contains the exact base
URLs, parameter conventions and worked examples, and tells the LLM
where the cached OpenAPI spec lives if it needs more detail. The
actual HTTP work is done by the `parl` Node CLI in `bin/parl.mjs` and
the JS library in `lib/facilities/` — documented as its own skill at
[`skills/parl/`](../skills/parl/SKILL.md).

## Wiring the skills into Claude

[Claude Code](https://code.claude.com/docs/en/skills) auto-discovers
skills from three filesystem locations:

| Scope    | Path                                      |
|----------|-------------------------------------------|
| Project  | `<repo>/.claude/skills/<name>/SKILL.md`   |
| Personal | `~/.claude/skills/<name>/SKILL.md`        |
| Plugin   | `<plugin>/skills/<name>/SKILL.md`         |

We keep the canonical skill files under `skills/<name>/` (so the repo
is browseable on GitHub and the relative cross-references between
skills resolve), and use `scripts/install-skills.sh` to wire them
into `.claude/skills/` via relative symlinks.

### Project install (default)

From the repo root:

```sh
bash scripts/install-skills.sh
```

Creates `.claude/skills/<name>` → `../../skills/<name>` relative
symlinks. Idempotent, re-runnable, and gitignored — `git status`
stays clean. Claude Code picks the skills up automatically when run
in this repo or any subdirectory.

To verify, ask Claude "What skills are available?".

### Personal install (one repo, every project)

```sh
bash scripts/install-skills.sh --user
```

Creates `~/.claude/skills/<name>` symlinks pointing back into this
clone. The skills become available in **every** project Claude Code
opens. The downside: the links point at this specific clone — if you
move or delete the directory, the links break.

### Windows / restricted-filesystem install

```sh
bash scripts/install-skills.sh --copy
```

Copies the skill folders instead of symlinking them. Use when
`core.symlinks` is off (the default on many Windows setups) or when
you can't create symlinks. The downside: updates to the source files
require re-running the script.

### Uninstalling

```sh
bash scripts/install-skills.sh --uninstall
```

Removes the symlinks (or, with `--copy`, the copied directories) it
created. Combine with `--user` to remove the personal install.

## Other surfaces

### Anthropic Agent SDK (Python or TypeScript)

The Agent SDK ships skills as part of the prompt. Point the SDK at
the same `skills/` directory:

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

### Claude API (programmatic, beta)

The Claude API supports custom skills via `/v1/skills` endpoints.
Each skill is uploaded as a zip; the description is used the same
way Claude Code uses it. See the
[Anthropic skills guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)
for the upload + beta-header dance.

Custom skills uploaded to one surface (API / claude.ai / Claude
Code) do **not** sync — they have to be uploaded separately for
each. The skill format is identical.

### claude.ai

Pro/Max/Team/Enterprise plans can upload custom skills as zip files
via Settings → Features. The same SKILL.md format works.

### Other LLM platforms

The skills are plain Markdown with YAML frontmatter, which is widely
supported (Gemini CLI, OpenCode, Cursor, Goose, etc. all listed on
[agentskills.io](https://agentskills.io)). To use them with a
non-Anthropic platform:

1. Pre-load every `SKILL.md` body into a system prompt (~250 lines
   total across all 28 facilities).
2. On user input, *or* via a retrieval step, decide which
   `reference.md` files to also include based on the description
   match.
3. The LLM then has enough context to construct the right HTTP
   request to the right Parliament endpoint — or to call the `parl`
   CLI / library.

## From CI / scripts (no LLM at all)

The repo is also useful without Claude. The cached OpenAPI specs in
`_specs/` and the discovery scripts in `scripts/` give you a
self-contained reference for any program that wants to integrate
with UK Parliament APIs.

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
