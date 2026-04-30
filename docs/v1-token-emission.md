# v1 token emission reference

What lands in `<style id="wp-admin-shell-tokens">` at kernel mount, and how authors target it.

## Pipeline

```
admin.json.styles  →  compileStyles()  →  { wpds, chrome, scoped }
                                     ↓
                              buildCompatBridge()  →  { static aliases }
                                     ↓
                              emitTokensCss()  →  CSS string
                                     ↓
                              <style id="wp-admin-shell-tokens">
```

The kernel calls `injectTokens(config.styles)` once at mount. `data-wpds-density` is written separately on `#wp-admin-shell` via `applyDensity`.

## Three CSS-variable families (spec §4.3.2)

Emission order matters — later declarations win on the cascade.

### 1. WPDS surface

Slot path joined by `-`, prefixed `--wpds-`. Path mirrors the `@wordpress/theme` token names verbatim.

| `styles` path | CSS variable |
|---|---|
| `color.bg.interactive.brand.strong` | `--wpds-color-bg-interactive-brand-strong` |
| `color.bg.surface.neutral.strong`   | `--wpds-color-bg-surface-neutral-strong`   |
| `color.fg.content.neutral.default`  | `--wpds-color-fg-content-neutral-default`  |
| `color.stroke.focus.brand`          | `--wpds-color-stroke-focus-brand`          |
| `border.width.focus`                | `--wpds-border-width-focus`                |
| `dimension.gap.md`                  | `--wpds-dimension-gap-md`                  |
| `font.size.md`                      | `--wpds-font-size-md`                      |

### 2. Chrome extension namespace

Slot path joined by `--`, prefixed `--wp-admin-shell--chrome--`. Covers shell-only surfaces WPDS does not yet describe.

| `styles.chrome` path | CSS variable |
|---|---|
| `sidebar.background`           | `--wp-admin-shell--chrome--sidebar--background` |
| `sidebar.foreground`           | `--wp-admin-shell--chrome--sidebar--foreground` |
| `sidebar.foreground-active`    | `--wp-admin-shell--chrome--sidebar--foreground-active` |
| `sidebar.border`               | `--wp-admin-shell--chrome--sidebar--border` |
| `sidebar.item.background`      | `--wp-admin-shell--chrome--sidebar--item--background` |
| `sidebar.item.background-hover` | `--wp-admin-shell--chrome--sidebar--item--background-hover` |
| `sidebar.item.background-active` | `--wp-admin-shell--chrome--sidebar--item--background-active` |
| `sidebar.item.foreground`      | `--wp-admin-shell--chrome--sidebar--item--foreground` |
| `sidebar.item.foreground-active` | `--wp-admin-shell--chrome--sidebar--item--foreground-active` |
| `sidebar.width`                | `--wp-admin-shell--chrome--sidebar--width` |
| `toolbar.background`           | `--wp-admin-shell--chrome--toolbar--background` |
| `toolbar.foreground`           | `--wp-admin-shell--chrome--toolbar--foreground` |
| `toolbar.border`               | `--wp-admin-shell--chrome--toolbar--border` |
| `toolbar.height`               | `--wp-admin-shell--chrome--toolbar--height` |
| `site-hub.background`          | `--wp-admin-shell--chrome--site-hub--background` |
| `site-hub.foreground`          | `--wp-admin-shell--chrome--site-hub--foreground` |
| `site-hub.icon-size`           | `--wp-admin-shell--chrome--site-hub--icon-size` |
| `site-hub.padding`             | `--wp-admin-shell--chrome--site-hub--padding` |
| `content.background`           | `--wp-admin-shell--chrome--content--background` |
| `content.card-background`      | `--wp-admin-shell--chrome--content--card-background` |
| `content.card-radius`          | `--wp-admin-shell--chrome--content--card-radius` |
| `content.card-padding`         | `--wp-admin-shell--chrome--content--card-padding` |
| `content.card-max-width`       | `--wp-admin-shell--chrome--content--card-max-width` |

### 3. Compat bridge (static, post-pass)

Authored once in `compatBridge.js`. Authors cannot remove or override these aliases. They make legacy `@wordpress/components`, wp-admin pages, and SCSS-compiled CSS inherit shell theming.

| Variable | Value |
|---|---|
| `--wp-admin-theme-color`           | `var(--wpds-color-bg-interactive-brand-strong)` |
| `--wp-admin-theme-color--rgb`      | numeric R, G, B triplet of brand strong |
| `--wp-admin-theme-color-darker-10` | `var(--wpds-color-bg-interactive-brand-strong-active)` |
| `--wp-admin-theme-color-darker-20` | `rgb(...)` derived from HSL.lightness − 20 |
| `--wp-admin-border-width-focus`    | `var(--wpds-border-width-focus)` |
| `--wp-components-color-accent`     | `var(--wpds-color-bg-interactive-brand-strong)` |
| `--wp-components-color-background` | `var(--wpds-color-bg-surface-neutral-strong)` |
| `--wp-components-color-foreground` | `var(--wpds-color-fg-content-neutral-default)` |

Numeric derivations require `bg-interactive-brand-strong` to terminate at a literal hex/rgb after alias chasing. If the brand value is unresolvable, `--wp-admin-theme-color--rgb` is omitted and `--wp-admin-theme-color-darker-20` falls back to the strong-active alias.

## Per-region / per-app overrides (§M3.7)

`styles.regions[<id>].*` and `styles.applications[<id>].*` emit scoped CSS:

```css
#wp-admin-shell [data-region-id="sidebar"] {
	--wpds-color-bg-surface-neutral-strong: #0a0a0a;
}

#wp-admin-shell [data-app-id="posts"] {
	--wpds-color-bg-surface-neutral-strong: #ffffff;
}
```

Region ids match `region-source.id` declared in the resolved config. App ids match the app instance id (e.g. `posts`, `pages`, `media`). The shell's region/app components emit `data-region-id` / `data-app-id` attributes; engines reading custom regions should propagate them too.

## Density attribute

`styles.density` resolves to one of `default`, `compact`, `comfortable` and is written as `data-wpds-density` on `#wp-admin-shell`. WPDS already ships density-keyed gap/padding overrides under that selector — the shell never authors per-density CSS itself.

```html
<div id="wp-admin-shell" data-wpds-density="compact"> ... </div>
```

## Aliases (DTCG)

Strings of the form `"{path}"` are DTCG aliases.

- **Within-document**: prefix with `styles.` to point at another slot in the same admin.json.
  ```jsonc
  "color": { "stroke": { "focus": { "brand": "{styles.color.bg.interactive.brand.strong}" } } }
  ```
  Resolves recursively (alias-of-alias), terminating when the chain hits a literal value.

- **tokens.json (v2)**: paths starting with anything other than `styles.` are tokens.json aliases. v1 has no tokens.json — these emit a `var(--token-{kebab})` fallback so a future tokens.json layer can supply them. Author shells in v1 should inline literal hex/dimension values to avoid relying on the fallback.

## Defaults baseline

`src/runtime/styles/wpds-defaults/6.9.json` snapshots `@wordpress/theme/src/prebuilt/css/design-tokens.css` (140 slots). The cascade resolver loads it as the implicit `core` baseline keyed by `admin.json.$wpds`. Authors override individual slots in `admin.json.styles` without re-authoring the full matrix.

The parity test (`tests/parity/wpds-snapshot.test.mjs`, `npm run test:parity`) parses the live upstream CSS at run time and diffs against the snapshot. Drift fails the build, so a coordinated bump is required before merging a WordPress release.

## Worked example — `developer-admin` default emission

With `styles.branding.accentColor = '#3858e9'` (no further overrides), the v0 normalizer seeds the chrome surfaces and the runtime emits roughly:

```css
#wp-admin-shell {
	/* WPDS surface (subset; full matrix when tokens are authored) */
	--wpds-color-bg-interactive-brand-strong:        #3858e9;
	--wpds-color-bg-interactive-brand-strong-active: #3858e9;
	--wpds-color-bg-surface-neutral-strong:          #ffffff;
	--wpds-color-fg-content-neutral-default:         #1e1e1e;
	--wpds-color-stroke-focus-brand:                 #3858e9;
	--wpds-border-width-focus:                       2px;

	/* Chrome */
	--wp-admin-shell--chrome--sidebar--background:        #1e1e1e;
	--wp-admin-shell--chrome--sidebar--foreground:        #949494;
	--wp-admin-shell--chrome--sidebar--foreground-active: #e0e0e0;
	--wp-admin-shell--chrome--sidebar--border:            #2f2f2f;
	--wp-admin-shell--chrome--sidebar--item--background:        transparent;
	--wp-admin-shell--chrome--sidebar--item--background-hover:  #2f2f2f;
	--wp-admin-shell--chrome--sidebar--item--background-active: #3858e9;
	--wp-admin-shell--chrome--sidebar--item--foreground:        #e0e0e0;
	--wp-admin-shell--chrome--sidebar--item--foreground-active: #ffffff;
	--wp-admin-shell--chrome--sidebar--width:             300px;
	--wp-admin-shell--chrome--toolbar--background:        #1e1e1e;
	--wp-admin-shell--chrome--toolbar--foreground:        #e0e0e0;
	--wp-admin-shell--chrome--toolbar--border:            #2f2f2f;
	--wp-admin-shell--chrome--toolbar--height:            48px;
	--wp-admin-shell--chrome--site-hub--background:       #1e1e1e;
	--wp-admin-shell--chrome--site-hub--foreground:       #ffffff;
	--wp-admin-shell--chrome--site-hub--icon-size:        32px;
	--wp-admin-shell--chrome--site-hub--padding:          12px;
	--wp-admin-shell--chrome--content--background:        #1e1e1e;
	--wp-admin-shell--chrome--content--card-background:   #ffffff;
	--wp-admin-shell--chrome--content--card-radius:       4px;
	--wp-admin-shell--chrome--content--card-padding:      16px;
	--wp-admin-shell--chrome--content--card-max-width:    1200px;

	/* Compat bridge */
	--wp-admin-theme-color:           var(--wpds-color-bg-interactive-brand-strong);
	--wp-admin-theme-color-darker-10: var(--wpds-color-bg-interactive-brand-strong-active);
	--wp-admin-border-width-focus:    var(--wpds-border-width-focus);
	--wp-components-color-accent:     var(--wpds-color-bg-interactive-brand-strong);
	--wp-components-color-background: var(--wpds-color-bg-surface-neutral-strong);
	--wp-components-color-foreground: var(--wpds-color-fg-content-neutral-default);
	--wp-admin-theme-color--rgb:      56, 88, 233;
	--wp-admin-theme-color-darker-20: rgb(...);  /* HSL.lightness − 20 */
}
```

To re-brand the shell, override `styles.color.bg.interactive.brand.strong` (and optionally `chrome.sidebar.item.background-active`) in admin.json. Every consumer reading the WPDS or compat-bridge surface picks up the change automatically.

## References

- [`wp-admin-shell-design-spec.md`](./wp-admin-shell-design-spec.md) §4.3 — authoritative for the styles tree and emission rules.
- [`wp-admin-shell-v1-plan.md`](./wp-admin-shell-v1-plan.md) §M3 — milestone tasks and exit criteria.
- `src/runtime/styles/compileStyles.js`, `compatBridge.js`, `density.js`, `emitTokens.js` — implementation.
- `src/runtime/styles/wpds-defaults/6.9.json` — pinned WPDS baseline.
