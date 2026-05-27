# Block Templates

These templates demonstrate WordPress 6.8+ best practices for custom blocks.

## basic-static/
**Use when:** Block output is saved to post content (static HTML)  
**Files:** block.json, index.tsx, edit.tsx, save.tsx, style.scss, editor.scss

**Key features:**
- TypeScript for type safety
- Block supports for theme.json integration
- Proper use of `useBlockProps()`
- CSS uses theme design tokens

## dynamic-php/
**Use when:** Block needs server-side rendering (dynamic content, queries)  
**Files:** block.json, render.php

**Key features:**
- Server-side rendering via PHP
- Query caching for performance
- Proper security (sanitization, escaping)
- Uses `get_block_wrapper_attributes()`

## interactive/
**Use when:** Block needs frontend interactivity (toggles, AJAX, state)  
**Files:** block.json, render.php, view.js

**Key features:**
- WordPress Interactivity API
- Proper nonce handling for AJAX
- Server state initialization
- Async actions for performance

## Usage

Copy the appropriate template directory as a starting point for your custom block.

**Customize:**
1. Update `namespace` in all files
2. Update `block-name` to your block slug
3. Modify attributes in block.json
4. Update PHP namespace if using classes
5. Build with `npm run build`

**Register:**
```php
function register_custom_blocks() {
	register_block_type( __DIR__ . '/build/block-name' );
}
add_action( 'init', 'register_custom_blocks' );
```
