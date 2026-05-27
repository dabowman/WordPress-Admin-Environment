---
name: wordpress-blocks
description: Comprehensive WordPress block development (WP 6.5+; current: 6.9, released December 2025) covering core blocks, block patterns, block extensions, and custom block creation. MUST load before making block.json / block API claims — WordPress ships twice yearly and training data goes stale within months. Use when working with WordPress blocks, Gutenberg editor, block patterns, block markup, block data, block supports, block styles, custom blocks, or extending core blocks. Emphasizes core-first philosophy and theme.json integration.
---

# WordPress Blocks Development

WordPress block development (WP 6.5+; current: 6.9, released December 2, 2025) with emphasis on using core blocks, patterns, and theme.json integration before building custom.

## Core Philosophy

**Hierarchy of solutions:**
1. Use core blocks with global styles
2. Create block patterns from core blocks
3. Extend core blocks with filters/variations
4. Only then: build custom blocks

**Why:** Maintainability, consistency, theme integration, smaller bundle size.

## Decision Framework

```
Need a feature?
  
  ├─ Can core blocks do this?
  │  └─ YES → Check references/core-blocks-catalog.md
  │  └─ NO → Continue
  │
  ├─ Can I extend a core block?
  │  └─ YES → Use block filters (see Block Extensions below)
  │  └─ NO → Continue
  │
  ├─ Can I combine core blocks in a pattern?
  │  └─ YES → Use block patterns (see Block Patterns below)
  │  └─ NO → Continue
  │
  └─ Must I build a custom block?
     └─ YES → See Custom Block Development below
     └─ Consider: Is this worth the maintenance burden?
```

## Quick Reference

**Core Blocks:** See `references/core-blocks-catalog.md` - 109+ blocks covering text, media, design, layout, and more.

**Block Supports:** See `references/block-supports.md` - Complete reference for automatic theme.json integration.

**Theme.json Integration:** See `references/theme-json-integration.md` - How to build blocks that use theme design system.

**Security & Performance:** See `references/security-performance.md` - Essential checklists.

**Interactivity API:** See `references/interactivity-api.md` - Frontend interactivity patterns.

**block.json Schema:** See `references/block-json-schema.md` - Complete metadata reference.

---

## Workflow 1: Block Patterns (Recommended First)

**Use for:** Hero sections, card layouts, testimonials, CTAs, any repeated layout.

### Creating Patterns

**Pattern file:** `patterns/hero.php` (in theme or plugin)

```php
<?php
/**
 * Title: Hero Section
 * Slug: namespace/hero
 * Categories: featured
 * Description: Full-width hero with heading and buttons
 */
?>
<!-- wp:cover {"url":"","dimRatio":50,"align":"full"} -->
<div class="wp-block-cover alignfull">
	<span aria-hidden="true" class="wp-block-cover__background has-background-dim"></span>
	<div class="wp-block-cover__inner-container">
		<!-- wp:heading {"textAlign":"center","level":1} -->
		<h1 class="wp-block-heading has-text-align-center">Welcome</h1>
		<!-- /wp:heading -->
		
		<!-- wp:paragraph {"align":"center"} -->
		<p class="has-text-align-center">Your tagline here</p>
		<!-- /wp:paragraph -->
		
		<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
		<div class="wp-block-buttons">
			<!-- wp:button -->
			<div class="wp-block-button"><a class="wp-block-button__link wp-element-button">Get Started</a></div>
			<!-- /wp:button -->
		</div>
		<!-- /wp:buttons -->
	</div>
</div>
<!-- /wp:cover -->
```

---

## Workflow 2: Extending Core Blocks

**Use for:** Adding functionality to existing blocks without forking them.

### Block Filters

**Add custom attributes:**
```typescript
import { addFilter } from '@wordpress/hooks';

addFilter(
	'blocks.registerBlockType',
	'namespace/add-custom-attribute',
	(settings, name) => {
		if (name === 'core/paragraph') {
			return {
				...settings,
				attributes: {
					...settings.attributes,
					customId: { type: 'string', default: '' }
				}
			};
		}
		return settings;
	}
);
```

---

## Workflow 3: Custom Block Development (Last Resort)

**Only build custom blocks when:**
- Third-party API integration (MapLibre, Stripe, etc.)
- Complex client-side interactivity (calculators, configurators)
- Unique data structures
- Performance-critical features requiring custom optimization
- Proprietary business logic

### 1. Choose Block Type

**Static Block:** Output saved to post content - `assets/block-templates/basic-static/`
**Dynamic Block:** Server-rendered on every page load - `assets/block-templates/dynamic-php/`
**Interactive Block:** Uses Interactivity API - `assets/block-templates/interactive/`

### 2. Scaffold Block

```bash
python scripts/init_block.py my-block --type static --output ./src/blocks
```

### 3. Configure block.json

```json
{
	"$schema": "https://schemas.wp.org/trunk/block.json",
	"apiVersion": 3,
	"name": "namespace/block-name",
	"title": "Block Title",
	"supports": {
		"color": { "text": true, "background": true },
		"spacing": { "margin": true, "padding": true }
	}
}
```

**`apiVersion: 3` is required for WP 6.9+.** Lower values trigger console warnings under `SCRIPT_DEBUG`. WP 7.0 will iframe the post editor regardless of apiVersion — apiVersion 3 ensures style isolation, viewport units, and media queries work inside the iframe. Migrating from 2 → 3 is usually a one-field bump; verify all style handles are declared in `block.json` (styles missing from the iframe won't apply) and that any `window`-scoped third-party scripts handle the iframe boundary.

See `references/block-json-schema.md` for complete reference.

### 4. Implement Block Supports

**Always use block supports over custom controls.** See `references/block-supports.md`.

### 5. Integrate with theme.json

**Use CSS custom properties:**
```scss
.wp-block-namespace-my-block {
	color: var(--wp--preset--color--primary);
	padding: var(--wp--preset--spacing--40);
}
```

See `references/theme-json-integration.md` for patterns.

### 6. Security & Performance

**Always:** Sanitize inputs, escape outputs, use nonces, check capabilities, cache queries.

See `references/security-performance.md` for checklist.

---

## Key Reminders

1. **Core blocks first** - Check `references/core-blocks-catalog.md`
2. **Block supports over custom controls** - Automatic theme.json integration
3. **theme.json design system** - No separate tokens for blocks
4. **Security always** - Sanitize inputs, escape outputs, use nonces
5. **Performance matters** - Cache queries, lazy load assets

## When Stuck

1. **What can core blocks do?** → `references/core-blocks-catalog.md`
2. **How to add spacing/color?** → `references/block-supports.md`
3. **How to use theme colors?** → `references/theme-json-integration.md`
4. **How to add interactivity?** → `references/interactivity-api.md`
5. **Security/performance?** → `references/security-performance.md`
6. **What goes in block.json?** → `references/block-json-schema.md`

## Resources

- Scripts: `scripts/init_block.py` - Scaffold new blocks
- Templates: `assets/block-templates/` - Static, dynamic, and interactive templates
- References: See Quick Reference section above
