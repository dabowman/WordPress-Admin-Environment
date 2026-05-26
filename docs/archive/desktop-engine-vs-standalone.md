# Desktop engine — admin shell vs. standalone plugin

**Date:** 2026-05-12
**Question:** Would building the desktop-OS UX be easier as a `core:desktop` engine on the WP Admin Shell kernel, or as a standalone plugin (the way [WordPress/desktop-mode](https://github.com/WordPress/desktop-mode) ships it today)?
**Verdict:** Admin shell is easier *and* produces a better product. Captured here as a follow-up to `desktop-mode-engine-feasibility.md` — that doc answered "can we port it"; this one answers "is porting actually the cheaper path."

---

## 1. What admin shell gives free

Reuse, in rough LOC saved vs. reinventing standalone:

| Thing | LOC saved | Why it matters |
|---|---|---|
| Cascade resolver (6-origin merge w/ tombstones, customizable filter, hash-keyed cache) | ~1,000 PHP | Desktop-mode has no equivalent — settings are flat user prefs, no role/site/plugin overlays, no admin lockdown. |
| App registry + manifest validation + convention discovery | ~500 | Desktop-mode invented its own `desktop_mode_register_window()`; the shell already ships `wp_admin_shell_register_app()`. |
| URL routing (matchRoute + useRoute + slot decomposer) | ~500 | Per-window URL state falls out of region-ID nesting (`workspace/win-123`). Desktop-mode hand-rolls the iframe-src / parent-URL dance. |
| 4-layer capability gating | ~300 | Desktop-mode does ad-hoc `current_user_can()` per render path. |
| ThemeProviderHost + compileStyles + tokens.json + DTCG resolver | ~500 | Desktop-mode hardcodes CSS custom properties; no token cascade, no per-region scoping. |
| dirty-state + triggerStore + bindings + NavigationGuard | ~400 | Per-window scoping falls out of region-ID keying — no `instanceKey` plumbing required. |
| Schema validation (admin-v2 + admin-app-v2 + admin-engine-v2 sweep) | ~200 | Desktop-mode validates nothing. |
| **18 native React + WPDS admin apps** (Posts / Media / Users / Comments / Plugins / Themes / Settings / etc.) | **~15,000** | Desktop-mode iframes every classic admin page because it has no React replacements. |

**Total ride-along:** ~17–18k LOC + the architectural patterns. Desktop-mode itself is ~12k TS + ~4k PHP from scratch for *less* functionality than the shell already ships.

The last row is the killer. Desktop-mode shows `edit.php` in an iframe. Admin-shell-on-desktop shows native `<PostsApp>` (DataViews + WPDS) mounted directly inside a window. Different product.

---

## 2. What admin shell costs

| Cost | Impact |
|---|---|
| Hard Gutenberg runtime dep (transitively via `@wordpress/ui` → `@wordpress/theme` private APIs) | Sites without the Gutenberg plugin → shell renders empty. Standalone desktop-mode has zero `@wordpress/*` deps. Hard constraint, not negotiable. |
| Two kernel additions (`core:dynamic-children` + window manifest block) | ~150 LOC. Negligible. |
| Schema discipline | Slows individual feature exploration; pays back in plugin-author contract stability. |
| WPDS aesthetics leaking into windows | Apps inside window frames render in WPDS. Pure desktop-mode aesthetics would need per-app theming via the 4-tier model. Doable but labor. Standalone owns 100% of pixels. |
| Coupled to admin shell release cadence | Kernel bug blocks engine work. Mitigation: small upstream PRs. |
| Bridge + WindowManager port complexity | **Same either way.** Iframe bridge is parent ↔ iframe regardless of parent owner. |

---

## 3. Verdict

**Admin shell is easier** because:

1. Two kernel additions vs. reinventing cascade / routing / caps / theming / registry / validation / dirty-state.
2. Native-React apps eliminate ~70% of upstream desktop-mode's iframe surface area. The bridge port (~1,950 LOC of inline JS in `chromeless-bridge.php`) is for *legacy* admin pages — for native shell apps, no bridge needed; the window IS React-mounted directly.
3. Engine architecture exists precisely for this. Building standalone now means re-implementing cascade / routing / registry that already work.

**Admin shell is HARDER** in two specific cases:

- Sites that can't have the Gutenberg plugin installed.
- Visual identities that don't want any WPDS surface anywhere.

Neither applies to this port — admin shell already requires Gutenberg, and the `--wpd-*` token system + per-app theming overrides give enough control.

**Honest framing:** desktop-mode-as-plugin was the right call when admin shell didn't exist. Admin-shell-as-platform was deliberately designed (post-DS-decoupling at v2.0.0-beta.2) to make this exact kind of engine possible without re-implementing the bottom 60% of a shell every time. This port is the stress test of that thesis.

**Even desktop-mode itself would be easier to build as an admin shell engine than as a standalone plugin — if starting from zero today.** The reason it exists standalone is historical (predates the shell's engine architecture), not architectural.

---

## 4. Caveat — DS-pluggability is real for chrome, partial for app contents

Surfaced in the same session, captured separately in the `project_ds_pluggability_contract` memory and in `docs/plans/2026-05-12-desktop-engine-port.md`. Recap so this analysis is self-contained:

| Layer | DS-pluggable today? |
|---|---|
| Kernel (`src/runtime/*` outside `engines/`) | YES — zero `--wpds-*` / `@wordpress/ui` references. |
| Engine chrome (dock, frame, wallpaper, region containers) | YES — engine ships own ThemeProvider + compileStyles + token namespace. |
| `core:default`'s region `default-style` blocks | WPDS-flavored — engine's choice, not a kernel constraint. |
| **58 bundled app files in `src/apps/`** | NO — direct imports of `@wordpress/ui` / `@wordpress/components`; CSS reads `--wpds-*` tokens directly. |

Kernel keeps its DS-neutral promise. Bundled apps don't. Window contents on `core:desktop` will render with WPDS look unless mitigated. Three options:

| Option | Effort | Result |
|---|---|---|
| **Token bridge** — desktop's `compileStyles` emits `--wpds-color-bg-surface-neutral: var(--wpd-window-body-bg)` etc. for the WPDS slots that matter | ~1 day | Apps inherit desktop palette via WPDS vars they already read. Color / dimension primitives align. Component-internal WPDS spacing/borders still apply. Bridges ~70% of the visual gap without touching apps. |
| **Accept mixed aesthetic** | 0 | Chrome = desktop look, contents = WPDS look. Visual contract: "chrome is engine, contents are apps." Some Linux WMs do this (titlebars themed differently from GTK app contents). |
| **Port apps to non-WPDS** | months | Defeats the reuse-18-apps benefit. Out of scope. |

**Port direction:** token bridge as MVP. Mixed-aesthetic edges (component spacing, border radii baked into WPDS layered rules) documented as a known limitation. App-side DS facade — apps import `<Button>` from a kernel-provided component registry, engines populate it — is the eventual real fix; out of scope for this port and tracked separately.

For the desktop port: **engine DS pluggability is REAL for chrome and PARTIAL for window contents.** The port proves the chrome half; the contents half stays a documented limitation.

---

## 5. Cross-refs

- `docs/research/desktop-mode-engine-feasibility.md` — companion feasibility study (can we port it).
- `docs/plans/2026-05-12-desktop-engine-port.md` — execution plan (P1 merged, P2.T2 MVP landed).
- Memory: `project_desktop_engine_port`, `project_ds_pluggability_contract`, `project_dynamic_children`, `project_ds_decoupling_2026_05_12`.
