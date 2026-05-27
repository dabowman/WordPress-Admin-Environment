---
name: wordpress-project-triage
description: "Run a deterministic JSON inspection of a WordPress repo before touching code. Returns `project.kind` (plugin / theme / block-theme / wp-core-checkout / gutenberg / full-site / unknown), tooling signals (Composer, Node, `@wordpress/scripts`, `@wp-playground/cli`, wp-env), test signals (PHPUnit, Playwright, Jest), version hints (`Requires at least`, `Tested up to`, `theme.json` version, `block.json` apiVersion), and Abilities API usage. Use **first** in any unfamiliar repo, before invoking other WP skills, so routing and guardrails are based on real signals not guesses. Trigger on 'what kind of WP repo is this', 'is this a block theme or classic', 'does this repo use @wordpress/scripts', 'do they have phpstan', 'is this Gutenberg trunk or a consumer', or whenever you're about to make assumptions about WP project structure from path patterns alone. Run via `node ~/.claude/skills/wordpress-project-triage/scripts/detect_wp_project.mjs` (prints JSON to stdout). Re-run after structural changes (added `theme.json`, `block.json`, build config). If the report says `kind: unknown`, inspect `composer.json`, `package.json`, `style.css`, `block.json`, `theme.json`, `wp-content/` manually."
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+). Filesystem-based agent with bash + node. Some workflows require WP-CLI."
---

# WP Project Triage

## ⚠ Verify before asserting

The detector script signals reflect repo state at run time. Before asserting something *isn't* present in a repo:

- Re-run the script — caches and ignore patterns may hide files.
- Check `composer.json`, `package.json`, `style.css`, `block.json`, `theme.json`, `wp-content/` manually if the report says `kind: unknown`.
- For tooling/version claims, prefer reading the actual file (e.g. `cat style.css`) over the script's parsed signal.

The schema lives at `~/.claude/skills/wordpress-project-triage/references/triage.schema.json`. If you need a signal that isn't there, extend the script — don't guess.

## When to use

Use this skill to quickly understand what kind of WordPress repo you’re in and what commands/conventions to follow before making changes.

## Inputs required

- Repo root (current working directory).

## Procedure

1. Run the detector (prints JSON to stdout):
   - `node ~/.claude/skills/wordpress-project-triage/scripts/detect_wp_project.mjs`
2. If you need the exact output contract, read:
   - `~/.claude/skills/wordpress-project-triage/references/triage.schema.json`
3. Use the report to select workflow guardrails:
   - project kind(s)
   - PHP/Node tooling present
   - tests present
   - version hints and sources
4. If the report is missing signals you need, update the detector rather than guessing.

## Verification

- The JSON should parse and include: `project.kind`, `signals`, and `tooling`.
- Re-run after changes that affect structure/tooling (adding `theme.json`, `block.json`, build config).

## Failure modes / debugging

- If it reports `unknown`, check whether the repo root is correct.
- If scanning is slow, add/extend ignore directories in the script.
