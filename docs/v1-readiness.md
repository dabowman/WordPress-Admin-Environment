# v1 production-readiness pass

Bundle budget, performance smoke test, accessibility checklist, and the Gutenberg dependency gate. Tracks plan §M5.12.

## Bundle-size budget

Measured at the end of M5 (`npm run build`):

| Asset | Size (minified) | Notes |
|---|---:|---|
| `build/index.js`        | 371 KiB | Single-bundle. `@wordpress/dataviews` + `@wordpress/ui` bundled per `BUNDLED_PACKAGES`. All other `@wordpress/*` externalized. |
| `build/index.css`       |  16 KiB | Shell layout + chrome surfaces + apps. |
| `build/dataviews.css`   |  74 KiB | Copied verbatim from `@wordpress/dataviews/build-style/style.css`. |
| **Entrypoint total**    | **461 KiB** | JS + both CSS files. |

**Ship target.** Plan §M5.12 sets v1 ship target at the M4 measurement plus 10% headroom. Final M5 number is **371 KiB** for `index.js` → ship target **≤ 408 KiB JS**, **≤ 100 KiB shell-side CSS** (the dataviews CSS is copy-through). Source-level code splitting (loading plugin sources on demand) is a v3 item per spec §11; v1 ships single-bundle.

The bundle landed *below* the M4 spike measurement because tree-shaking now drops some `@wordpress/components` modules previously pulled by ad-hoc `<Notice>` usage in the user apps — that is, the M4.6 notice consolidation paid for itself.

## Performance smoke test

Methodology (plan §M5.12):

1. Clear browser cache.
2. Navigate to `/wp-admin/admin.php?page=wp-admin-shell`.
3. Measure from `navigationStart` to first paint of the routable region's first app.
4. Recorded on a baseline laptop (M1/M2 MacBook), throttled to "Fast 4G" + 4× CPU slowdown.

**Cold mount target: under 500 ms.**

The path on first paint:
- Network: index.js (gz ≈ 110 KiB) + index.css + dataviews.css.
- Parse + execute: kernel registers builtins, normalizer runs, token CSS injects.
- React renders the engine + regions + the routed app. PostsApp's first paginated DataViews query fires after mount.

Spec §6.1 keeps `wp_add_inline_script` + `wp_json_encode` for config delivery (preserves type fidelity); the resolver cache (M2.7) makes repeat mounts essentially free server-side.

**Pre-mount FOUC.** Tokens emit from JS at kernel mount, not server-side. Any pre-mount chrome (admin bar, page header before React boots) flashes wp-admin defaults briefly before the shell tokens land. Acceptable for v1 — the shell takes over the viewport on mount and the flash window is small. SSR token emission (a `<style>` tag the PHP enqueue layer prints from the resolved styles tree) is a v2 polish item if the FOUC becomes visually distracting.

## Accessibility smoke checklist

Concrete checks for v1 (not a substitute for the v3 full audit):

- [x] Command palette reachable via `⌘K`. Focus traps until dismissed (handled by `@wordpress/commands`).
- [x] Overlay regions render `role="dialog"` + `aria-modal="true"` + labelled `aria-labelledby` (delegated to `@wordpress/components` Modal).
- [x] Sidebar navigation wrapped in `<nav>` with `aria-label`.
- [x] Drill-down screens move focus to the heading on entry; restore focus to the originating item on back (handled by `SidebarContent` + `SidebarNavigationContext`).
- [x] Focus ring visible on every interactive element via `--wpds-color-stroke-focus-brand` token.
- [x] No `tabindex` values above 0 in the runtime.
- [x] Every icon-only button has an `aria-label` or visible text via `<VisuallyHidden>`.
- [x] Single keyboard pass through `developer-admin` reaches every primary action.

Tooling: `axe` against the rendered shell DOM, plus one manual VoiceOver pass on macOS. Both run before the v1 ship tag; the v3 milestone covers the deeper a11y audit.

## Gutenberg dependency gate

The plugin header declares `Requires Plugins: gutenberg`. WordPress 6.7+ honours the header at activation time; on older sites the plugin still loads but raises a dismissible admin notice if Gutenberg is missing.

Why hard-required: any `@wordpress/ui` overlay component (`Notice.CloseIcon → IconButton → Tooltip → @wordpress/theme`) calls `__dangerousOptInToUnstableAPIsOnlyForCoreModules` against `wp.privateApis`. WP core 6.9's allowlist excludes `@wordpress/theme`/`@wordpress/ui`/`@wordpress/dataviews`; the Gutenberg plugin overrides `wp-private-apis` with one that includes them. Without Gutenberg, those modules throw at module-load and the entire shell renders empty with no React error boundary catching it.

The detect-and-conditionally-render alternative (mass-fallback to `@wordpress/components`) was scoped out for v1; track as a v3 item if upstream WPDS adoption stalls.

## Migration

- v0 (MVP flat) admin.json files keep working indefinitely (spec §10).
- The MVP `wp_admin_shell_active_config` option migrates to `wp_admin_shell_active_shell` once on plugin upgrade; reads check the new key first and fall back. Legacy key drops in v2.
- `wp admin-shell upgrade-config <name>` rewrites a v0 file to v1 form on disk; the v0 file is preserved alongside as `<name>.v0.json`.

## Sign-off

When all four bundled shells render through the kernel with parity, fixture tests stay green (`run-cascade-tests` 22/22, `run-selection-tests` 5/5, `test:parity` 4/4), the build size remains under the ship target, and a manual run of the a11y checklist passes — v1 is ready for tag.
