---
name: wordpress-phpstan
description: "Configure, run, or fix PHPStan in WordPress codebases (plugins/themes/sites). Use whenever creating or editing `phpstan.neon` / `phpstan.neon.dist`, generating or shrinking `phpstan-baseline.neon`, raising/lowering `level:`, fixing PHPStan errors with WordPress-friendly PHPDoc (`WP_REST_Request<...>`, hook-callback `@param` types, array shapes for `$wpdb` results, Action Scheduler `$args` shapes), wiring up `szepeviktor/phpstan-wordpress` or `php-stubs/wordpress-stubs`, adding plugin-specific stubs (`php-stubs/woocommerce-stubs`, `php-stubs/acf-pro-stubs`), narrowing `paths` / `excludePaths`, or scoping `ignoreErrors` patterns to a vendor prefix. Trigger on any mention of phpstan, neon config, static analysis in PHP, `@phpstan-` annotations, baseline file growth, 'class not found' errors after enabling phpstan, or 'how do I type a WP hook callback'. Pair with `wordpress-project-triage` first to know which paths to analyse. Don't use for PHPCS / WordPress Coding Standards (different tool)."
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+). Requires Composer-based PHPStan."
---

# WP PHPStan

## ⚠ Verify before asserting

PHPStan, the WordPress stub packages, and rule levels change over time. Before claiming a rule, an option, or a stub behavior:

| Surface | Live source |
|---|---|
| PHPStan docs | `https://phpstan.org/user-guide/getting-started` |
| `phpstan-wordpress` | `https://github.com/szepeviktor/phpstan-wordpress` |
| `php-stubs/wordpress-stubs` | `https://github.com/php-stubs/wordpress-stubs` |
| WooCommerce / ACF / other stubs | `https://github.com/php-stubs` |
| Composer package versions | `composer show <package>` |

A negative claim ("PHPStan can't type WP hooks") usually means the stub package isn't loaded — verify before extending `ignoreErrors`.

## When to use

Use this skill when working on PHPStan in a WordPress codebase, for example:

- setting up or updating `phpstan.neon` / `phpstan.neon.dist`
- generating or updating `phpstan-baseline.neon`
- fixing PHPStan errors via WordPress-friendly PHPDoc (REST requests, hooks, query results)
- handling third-party plugin/theme classes safely (stubs/autoload/targeted ignores)

## Inputs required

- `wp-project-triage` output (run first if you haven't)
- Whether adding/updating Composer dev dependencies is allowed (stubs).
- Whether changing the baseline is allowed for this task.

## Procedure

### 0) Discover PHPStan entrypoints (deterministic)
1. Inspect PHPStan setup (config, baseline, scripts):
   - `node ~/.claude/skills/wordpress-phpstan/scripts/phpstan_inspect.mjs`

Prefer the repo’s existing `composer` script (e.g. `composer run phpstan`) when present.

### 1) Ensure WordPress core stubs are loaded

`szepeviktor/phpstan-wordpress` or `php-stubs/wordpress-stubs` are effectively required for most WordPress plugin/theme repos. Without it, expect a high volume of errors about unknown WordPress core functions.

- Confirm the package is installed (see `composer.dependencies` in the inspect report).
- Ensure the PHPStan config references the stubs (see `references/third-party-classes.md`).

### 2) Ensure a sane `phpstan.neon` for WordPress projects

- Keep `paths` focused on first-party code (plugin/theme directories).
- Exclude generated and vendored code (`vendor/`, `node_modules/`, build artifacts, tests unless explicitly analyzed).
- Keep `ignoreErrors` entries narrow and documented.

See:
- `references/configuration.md`

### 3) Fix errors with WordPress-specific typing (preferred)

Prefer correcting types over ignoring errors. Common WP patterns that need help:

- REST endpoints: type request parameters using `WP_REST_Request<...>`
- Hook callbacks: add accurate `@param` types for callback args
- Database results and iterables: use array shapes or object shapes for query results
- Action Scheduler: type `$args` array shapes for job callbacks

See:
- `references/wordpress-annotations.md`

### 4) Handle third-party plugin/theme classes (only when needed)

When integrating with plugins/themes not present in the analysis environment:

- First, confirm the dependency is real (installed/required).
- Prefer plugin-specific stubs already used in the repo (common examples: `php-stubs/woocommerce-stubs`, `php-stubs/acf-pro-stubs`).
- If PHPStan still cannot resolve classes, add targeted `ignoreErrors` patterns for the specific vendor prefix.

See:
- `references/third-party-classes.md`

### 5) Baseline management (use as a migration tool, not a trash bin)

- Generate a baseline once for legacy code, then reduce it over time.
- Do not “baseline” newly introduced errors.

See:
- `references/configuration.md`

## Verification

- Run PHPStan using the discovered command (`composer run ...` or `vendor/bin/phpstan analyse`).
- Confirm the baseline file (if used) is included and didn’t grow unexpectedly.
- Re-run after changing `ignoreErrors` to ensure patterns are not masking unrelated issues.

## Failure modes / debugging

- “Class not found”:
  - confirm autoloading/stubs, or add a narrow ignore pattern
- Huge error counts after enabling PHPStan:
  - reduce `paths`, add `excludePaths`, start at a lower level, then ratchet up
- Inconsistent types around hooks / REST params:
  - add explicit PHPDoc (see references) rather than runtime guards

## Escalation

- If a type depends on a third-party plugin API you can’t confirm, ask for the dependency version or source before inventing types.
- If fixing requires adding new Composer dependencies (stubs/extensions), confirm it with the user first.
