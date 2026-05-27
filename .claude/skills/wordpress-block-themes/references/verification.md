# Verifying theme.json / block theme claims against upstream

This skill is a point-in-time snapshot. WordPress ships major versions twice a year and adds / renames / deprecates fields between them. Before you make a definitive claim about a `theme.json` field, block behavior, or theme API — especially a **negative** claim ("X isn't supported", "Y doesn't exist") — verify against the live upstream.

## When to verify

| Situation | Action |
|---|---|
| Claiming a field *exists* + reference backs it | Accept — cite the reference. |
| Claiming a field *doesn't exist* | **Always verify** against `schemas.wp.org/trunk/theme.json`. |
| User names a field you don't recognize | Verify before denying it. Don't hallucinate absence. |
| Working with anything tagged "new in 6.8 / 6.9 / 7.0" | Cross-check dev-notes — feature flags and final shape sometimes change between dev-notes and release. |
| User says "I read X supports Y" | Verify before contradicting. |

## Primary upstream sources

### Schemas (authoritative for field existence + shape)

- **theme.json (latest):** https://schemas.wp.org/trunk/theme.json
- **theme.json (pinned version):** https://schemas.wp.org/wp/{major}.{minor}/theme.json — e.g. `wp/6.9/theme.json`
- **block.json:** https://schemas.wp.org/trunk/block.json

Fetch with `WebFetch`. These redirect to GitHub raw — follow the redirect.

### Developer handbooks (authoritative for intended usage + examples)

- **Theme Handbook → Global Settings & Styles:** https://developer.wordpress.org/themes/global-settings-and-styles/
- **Block Editor Handbook:** https://developer.wordpress.org/block-editor/
- **Block Editor → theme.json reference:** https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/
- **Block Editor → Block API:** https://developer.wordpress.org/block-editor/reference-guides/block-api/
- **Core API handbook:** https://developer.wordpress.org/reference/

### Dev-notes (authoritative for what shipped when)

- **All dev-notes:** https://make.wordpress.org/core/tag/dev-notes/
- **Per-release tag:** https://make.wordpress.org/core/tag/dev-notes+{maj}-{min}/ — e.g. `dev-notes+6-9`
- **Release field guides:** https://make.wordpress.org/core/{maj}-{min}-field-guide/ — e.g. `6-9-field-guide`

Dev-notes are the quickest way to find "what's new in X.Y" with links to the relevant Trac tickets and handbook pages.

### Source of truth (when docs lag)

- **Gutenberg repo (trunk):** https://github.com/WordPress/gutenberg
  - `schemas/json/theme.json` — the raw JSON schema
  - `packages/block-editor/` — editor UI + behavior
  - `lib/` — bleeding-edge features not yet in core
- **Core repo (develop):** https://github.com/WordPress/wordpress-develop

Use `gh` CLI or WebFetch against `raw.githubusercontent.com/WordPress/gutenberg/trunk/...` for direct file reads.

## Verification recipes

### "Does field X exist in theme.json?"

```
WebFetch https://schemas.wp.org/trunk/theme.json
prompt: "Does this schema define settings.X? Quote the relevant JSON. If yes, describe the shape."
```

### "When was field X added?"

```
WebFetch https://make.wordpress.org/core/tag/dev-notes/
prompt: "Find the dev-note announcing settings.X. Which WP release? Link the post."
```

Fall back to Gutenberg git blame on `schemas/json/theme.json` if dev-notes don't surface it.

### "What's new in 6.9 / 7.0?"

```
WebFetch https://make.wordpress.org/core/tag/dev-notes+6-9/
prompt: "List every dev-note tagged with this release affecting {theme.json | blocks | Interactivity | REST}."
```

### "Is core block `core/X` real?"

```
WebFetch https://developer.wordpress.org/block-editor/reference-guides/core-blocks/
prompt: "Is core/X in the core blocks list? Quote its description."
```

Or read `packages/block-library/src/X/block.json` in the Gutenberg repo.

## Rule of thumb

A negative claim from memory is almost always worth 30 seconds of verification. The cost of being wrong (user edits the wrong location, skill ships bad guidance downstream) is much higher than the cost of one WebFetch.
