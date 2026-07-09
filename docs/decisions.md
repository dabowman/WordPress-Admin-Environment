# Release-cleanup decisions

Recorded 2026-07-06, ahead of the initial (0.1.0) release. These settle the
open questions from the pre-release cleanup so they don't get relitigated.
Historical context for each lives in `docs/archive/` (notably
`cleanup-findings.md` and the P2 pitch draft).

## D1 — Name

**WordPress Admin Workspaces** (plugin header: "WP Admin Workspaces"). The
runtime the workspaces live inside is the *admin shell* — "shell" survives
only as that lowercase architectural noun, never as a product name. The
config file is `workspace.json`. The GitHub repo is
`dabowman/WordPress-Admin-Workspaces`; all URIs, clone instructions, and
test paths point there. Anything still saying "WordPress Admin Environment",
"WP Admin Shell" (as a title), or `admin.json` is drift to be fixed on sight.

## D2 — CIAB / next_admin compatibility

**Not a committed goal.** No live code ever implemented `next_admin_*`
aliases — the compatibility was prose framing on native
`wp_admin_workspaces_*` functions. That framing is stripped from live
docblocks, docs, and schema descriptions. The API shapes themselves stay as
they are (they're good shapes); they're simply this project's API now. The
CIAB history and prior-art analysis stay in `docs/archive/`.

## D3 — Token pipeline

**Keep.** The DTCG resolver (~480 LOC) deliberately fills core's `--wpds-*`
namespace rather than inventing a parallel one, so it is an authoring layer,
not a duplicate. Open follow-up (not a release blocker): audit
`build/wpds-tokens.css` overlap against the token CSS WordPress 7.0 ships
and slim the generated output where core already supplies the value. The
token pipeline is implementation detail — it stays out of pitch-level copy.

## D4 — Audience and story

The story is **different workspaces for different users**: one WordPress
install, multiple `workspace.json` files, each shaped to a persona. The
front-door assets (screenshots, README pitch, demo workspaces) are built
around persona workspaces, not around engine demos. Positioning-post timing
and venue remain open until the persona workspaces exist.

## App surface (Phase 2 option)

**Full cut.** `core:posts` is the flagship native screen and gets the polish
budget; `core:simple-editor` (the writer persona's editor) and
`core:settings-workspace` (the workspace's own on/off panel) are the only
other native screen apps. System/chrome apps (navigation, site-hub,
toolbar-actions, notices, user-menu, command-palette, iframe-fallback) are
shell infrastructure and stay — they are not screens; preview-pane, which
had no consumer left, is parked. Other native screen apps are
parked on an archive branch, their screens routed through the iframe escape
hatch in `wp-admin-default`. The bundled demo workspaces are rewritten as
persona workspaces per D4; engine-specific apps follow their engines.

## Back-compat

**Remove all of it.** Nothing has shipped publicly, so there are no external
users to migrate: the `wp_admin_shell_*` → `wp_admin_workspaces_*` option
migration, the uninstall sweeps for legacy option names, the
`workspace.engine` / `settings.workspace.layoutEngine` resolver fallbacks,
the v1 router shape, the v2 DataView/fieldCollections shape readers, and the
flat `registerMenuRenderer` alias all go. Pre-1.0, the schema may change
without migration paths.

## App-specific PHP REST surfaces

The site-health and activate-theme REST controllers (plus the settings
`show_in_rest` shims) stay in `main` even though their bundled native
consumers are parked: they are tested, generic REST gap-fillers any
workspace/app author (or the Abilities surface) can use. The classic
dashboard-widget bridge + per-widget REST endpoint were parked WITH the
dashboard grid — the iframed classic dashboard renders plugin widgets
natively (JS included), which supersedes the captured-HTML tier.

## Upstream private-API ask

The Gutenberg-repo ask for a public consumption path (the one item left of
the private-API de-risk) is filed by the maintainer personally, not from
this repo's tooling.
