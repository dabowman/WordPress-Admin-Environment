---
name: wordpress-design-system
description: "Build UIs with the WordPress Design System (WPDS) — `@wordpress/components`, `@wordpress/ui`, design tokens, color/spacing/typography presets, component patterns. Use whenever importing from `@wordpress/components` (Button, Modal, Notice, Panel, Card, ToggleControl, SelectControl, ToolbarButton, etc.), styling Gutenberg/WooCommerce/WordPress.com/Jetpack interfaces, picking color primitives, applying spacing scales, choosing typography variables/presets, building admin screens, sidebar plugins, settings panels, or any UI rendered in wp-admin or block editor surfaces. **REQUIRES the WPDS MCP server** for canonical component/token lookup — without it, defer to the upstream Components handbook. Trigger on any mention of WPDS, WordPress Design System, `@wordpress/components`, `@wordpress/ui`, design tokens in a WordPress context, color primitives, spacing scale, typography presets, or building UI inside any A8C/WP product. Skip non-UI concerns (data fetching, i18n) — let `wordpress-core-data`, `wordpress-rest-api`, or `wordpress-plugin-development` handle those."
compatibility: "Requires WPDS MCP server configured and running. Targets WordPress 6.9+ (PHP 7.2.24+)."
---

# WordPress Design System (WPDS)

## ⚠ Verify before asserting

WPDS components and tokens evolve continuously with the Gutenberg/Components release cadence. Before claiming a component prop or token doesn't exist, check the live source — don't rely on training data:

| Surface | Live source |
|---|---|
| WPDS reference site (via MCP) | `wpds://pages` |
| Component list (via MCP) | `wpds://components` / `wpds://components/:name` |
| Token list (via MCP) | `wpds://design-tokens` |
| `@wordpress/components` source | `https://github.com/WordPress/gutenberg/tree/trunk/packages/components` |
| Storybook (live component examples) | `https://wordpress.github.io/gutenberg/` |

The WPDS MCP server is the primary source — fall back to GitHub/Storybook only if it's unavailable.

## Prerequisites

This skill works best with the **WPDS MCP server** installed. The MCP provides access to WordPress Design System documentation and resources, such as components and DS token lists.

The following terms should be treated as synonyms:
- "WordPress" and "WP";
- "Design System" and "DS";
- "WordPress Design System" and "WPDS".

## When to use

Use this skill when the user mentions:

- building and/or reviewing any UI in a WordPress-related context (for example, Gutenberg, WooCommerce, WordPress.com, Jetpack, etc etc);
- WordPress Design System, WPDS, Design System;
- UI components, Design tokens, color primitives, spacing scales, typography variables and presets;
- Specific component packages such as @wordpress/components or @wordpress/ui;

## Rules

### Use the WPDS MCP server to access WPDS-related documentation

- Use the WPDS MCP server to retrieve the canonical, authoritative documentation:
  - reference site (`wpds://pages`)
  - list of available components (`wpds://components`) and specific component information (`wpds://components/:name`)
  - list of available tokens (`wpds://design-tokens`)
- DO NOT search the web for canonical documentation about the WordPress Design System. If asked by the user, push back and ask for confirmation, warning them that the MCP server is the best place to provide information

### Required documentation

Before working on any WPDS-related tasks, make sure you read relevant documentation on the reference site. This documentation should take the absolute precedence when evaluating the best course of action for any given tasks.

### Boundaries

- Skip non-UI related aspects of an answer (for example, fetching data from stores, or localizing strings of text).
- Focus on building UI that adheres as much as possible to the WPDS best practices, uses the most fitting WPDS components/tokens/patterns.

### Tech stack

- Unless you are told otherwise (or gathered specific information from the local context of the request), assume the following tech stack: TypeScript, React, CSS.

### Validation

- If the local context in which a task is running provide lint scripts, use them to validate the proposed code output when possible.

## Output

- As a recap at the end of your response, provide a clear and concise explanation of what the solution does, and add context to why each decision was made.
- Be explicit about the boundaries, ie. what was explicitly left out of the task because not relevant (eg non-ui related).
- Provide working code snippets
