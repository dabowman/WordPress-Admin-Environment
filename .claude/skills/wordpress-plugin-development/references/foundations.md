# Plugin Foundations

Anatomy, bootstrap, lifecycle, naming, architecture, and the hooks system.

## Anatomy of a plugin

Minimum: a single PHP file in `wp-content/plugins/` with a header comment. WordPress scans top-level PHP files one level deep for plugin headers. **Only one file per plugin folder** may carry the header.

**Canonical directory layout (handbook style):**

```
/plugin-name
  plugin-name.php          # main file with header
  uninstall.php            # optional cleanup on delete
  readme.txt               # wp.org directory metadata
  /languages               # .pot/.po/.mo/.l10n.php/.json translations
  /includes                # core PHP classes / business logic
  /admin                   # admin-area code + /js, /css, /partials
  /public                  # front-end code + /js, /css, /partials
  /assets                  # build assets, blocks
  /vendor                  # composer dependencies (when distributed)
```

**Modern PSR-4 layout (deviates from handbook, common in shops with a build step):**

```
/plugin-name
  plugin-name.php
  composer.json
  /src                     # PSR-4 namespace root (Vendor\PluginName\)
    Plugin.php
    /Admin /Frontend /Services /Repositories
  /vendor /tests /assets /languages
```

## Plugin header (complete reference)

```php
<?php
/**
 * Plugin Name
 *
 * @package           PluginPackage
 * @author            Your Name
 * @copyright         2026 Your Name
 * @license           GPL-2.0-or-later
 *
 * @wordpress-plugin
 * Plugin Name:       My Plugin
 * Plugin URI:        https://example.com/plugins/my-plugin/
 * Description:       Short, single-line description (<140 chars).
 * Version:           1.10.3
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            John Smith
 * Author URI:        https://author.example.com/
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Update URI:        https://example.com/my-plugin/
 * Text Domain:       my-plugin
 * Domain Path:       /languages
 * Network:           true
 * Requires Plugins:  woocommerce, advanced-custom-fields
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }
```

**Notable fields:**
- Only `Plugin Name` is technically required.
- `Update URI` (5.8+) prevents wp.org from overwriting same-slug plugins you host yourself.
- `Requires Plugins` (6.5+) declares wp.org-slug dependencies.
- `Text Domain` must match the plugin folder slug to benefit from automatic language-pack loading.
- `Network: true` makes the plugin multisite-network-only.

**Version gotcha:** WP uses PHP `version_compare()`. `1.02` is greater than `1.1`. Always use dotted SemVer (`1.2.0`).

## Bootstrap pattern

```php
if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'ACME_PLUGIN_VERSION',  '1.0.0' );
define( 'ACME_PLUGIN_FILE',     __FILE__ );
define( 'ACME_PLUGIN_DIR',      plugin_dir_path( __FILE__ ) );
define( 'ACME_PLUGIN_URL',      plugin_dir_url( __FILE__ ) );
define( 'ACME_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

if ( is_readable( __DIR__ . '/vendor/autoload.php' ) ) {
    require_once __DIR__ . '/vendor/autoload.php';
}
\Acme\MyPlugin\Plugin::run( __FILE__ );
```

**Path helpers:**
- `plugin_dir_path( __FILE__ )` → absolute path with trailing slash.
- `plugin_dir_url( __FILE__ )` → URL with trailing slash.
- `plugins_url( 'assets/img.png', __FILE__ )` → full URL to an asset.
- `plugin_basename( __FILE__ )` → relative path from plugins dir (`myplugin/myplugin.php`).

Every PHP file must guard against direct access:

```php
if ( ! defined( 'ABSPATH' ) ) { exit; }
```

## Activation, deactivation, uninstall

```php
register_activation_hook( __FILE__, 'acme_activate' );
function acme_activate( $network_wide ) {
    acme_register_cpts();       // register CPTs FIRST so rewrite rules are generated
    acme_create_tables();       // dbDelta
    add_option( 'acme_version', ACME_PLUGIN_VERSION );
    flush_rewrite_rules();
}

register_deactivation_hook( __FILE__, 'acme_deactivate' );
function acme_deactivate() {
    wp_clear_scheduled_hook( 'acme_cron' );
    flush_rewrite_rules();
}
```

**DO in activation:** seed options (`add_option` is idempotent), create DB tables via `dbDelta()`, schedule cron, flush rewrites.

**DON'T in activation:** register hooks (activation runs once then WordPress redirects), assume `init`/`plugins_loaded` will fire, destroy data.

**Activation hooks do NOT fire on auto-update.** Put upgrade routines on `plugins_loaded`/`admin_init` with a version-option check (see §Upgrade routines below).

### Uninstall — prefer `uninstall.php`

```php
<?php
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) { die; }

delete_option( 'acme_settings' );
delete_option( 'acme_version' );
delete_site_option( 'acme_network_settings' );

global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}acme_logs" );

if ( is_multisite() ) {
    foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $blog_id ) {
        switch_to_blog( $blog_id );
        delete_option( 'acme_settings' );
        restore_current_blog();
    }
}
```

Prefer `uninstall.php` over `register_uninstall_hook()` because the latter cannot accept closures or object-instance callbacks (core rejects objects outright, and closures silently fail on serialization), persists callbacks in the `uninstall_plugins` option (updated whenever the stored callback differs from the newly-registered one), and loads the main plugin file during teardown. If both exist, `uninstall.php` wins.

## Prefixing and namespacing

All global functions, classes, option keys, meta keys, post types, taxonomies, hooks, and CSS classes must be prefixed. Handbook suggests ≥5 chars. Modern plugins replace prefixing with PHP namespaces:

```php
namespace Acme\MyPlugin;
class Plugin { /* ... */ }
```

Inside a namespace, core WP functions require global qualification (`\register_post_type`) or a `use function` declaration (`use function register_post_type;`).

## Upgrade routines & versioning

```php
add_action( 'plugins_loaded', 'acme_maybe_upgrade' );
function acme_maybe_upgrade() {
    $installed = get_option( 'acme_version', '0.0.0' );
    if ( version_compare( $installed, ACME_PLUGIN_VERSION, '<' ) ) {
        if ( version_compare( $installed, '1.1.0', '<' ) ) { acme_upgrade_to_1_1_0(); }
        if ( version_compare( $installed, '2.0.0', '<' ) ) { acme_upgrade_to_2_0_0(); }
        update_option( 'acme_version', ACME_PLUGIN_VERSION );
    }
}
```

Keep in sync: plugin header `Version:`, `readme.txt` `Stable tag:`, a PHP constant, Git tag.

## Composer, PSR-4, and scoping

```json
{
  "name": "acme/my-plugin",
  "type": "wordpress-plugin",
  "license": "GPL-2.0-or-later",
  "require": { "php": ">=7.4" },
  "require-dev": {
    "phpunit/phpunit": "^9.0",
    "brain/monkey": "^2.6",
    "wp-coding-standards/wpcs": "^3.0",
    "yoast/phpunit-polyfills": "^1.0",
    "szepeviktor/phpstan-wordpress": "^1.3"
  },
  "autoload":     { "psr-4": { "Acme\\MyPlugin\\":        "src/"   } },
  "autoload-dev": { "psr-4": { "Acme\\MyPlugin\\Tests\\": "tests/" } }
}
```

**Dependency conflict problem:** Plugin A with `monolog/monolog:1.x` + Plugin B with `monolog:3.x` will fatal whichever autoloads second. Solutions:
- **`brianhenryie/strauss`** (actively maintained) — prefixes vendored namespaces to a plugin-unique prefix.
- **`humbug/php-scoper`** — same idea, broader tooling.

**WPCS vs PSR-4 file naming conflict:** WPCS wants `class-my-class.php`; PSR-4 wants `MyClass.php`. Exclude the `WordPress.Files.FileName.*` sniffs in `phpcs.xml.dist`.

## Architecture patterns

**Procedural** is fine for small plugins. **OOP** scales better for anything substantial.

### Singleton (common but criticized — globals, untestable)

```php
final class Acme_Plugin {
    private static ?self $instance = null;
    public static function instance(): self {
        return self::$instance ??= new self();
    }
    private function __construct() {
        add_action( 'init', [ $this, 'init' ] );
    }
    public function init(): void { /* ... */ }
}
add_action( 'plugins_loaded', [ Acme_Plugin::class, 'instance' ] );
```

### Dependency injection / service container (recommended for large plugins)

```php
final class Plugin {
    private Container $container;
    public static function run( string $file ): void {
        ( new self() )->boot( $file );
    }
    private function boot( string $file ): void {
        $this->container = new Container();
        $this->container->add( PostRepository::class )->addArgument( $GLOBALS['wpdb'] );
        $this->container->add( AdminController::class )->addArgument( PostRepository::class );
        $this->container->get( AdminController::class )->hooks();
    }
}
```

Structure large plugins into **controllers / services / repositories / models** — controllers handle WP hooks, services contain business logic, repositories isolate DB/API calls.

## Coding standards

- **Indent:** tabs. **Braces:** K&R same-line. **Quotes:** single unless interpolation needed.
- **Naming:** `snake_case` functions/variables/hooks, `Upper_Snake_Case` classes (handbook style) or `PascalCase` (PSR-4). Constants `UPPER_SNAKE_CASE`.
- **Yoda conditions:** `if ( 'post' === $type )`. Applies to `==`, `!=`, `===`, `!==`. Not `<`, `>`.
- **Arrays:** long syntax `array()` in core ruleset.
- **SQL:** keywords uppercase, always `$wpdb->prepare()`.
- **PHPDoc:** `@since`, `@param`, `@return`, `@package`. Hook docblocks precede `do_action`/`apply_filters` calls so `WP Parser` picks them up.

## Hooks system

Actions = do something; filters = modify and return a value. Internally identical.

```php
add_action( $hook, $callback, $priority = 10, $accepted_args = 1 );
add_filter( $hook, $callback, $priority = 10, $accepted_args = 1 );
do_action( $hook, ...$args );
$v = apply_filters( $hook, $value, ...$args );
```

Lower priority runs first (default 10). **`$accepted_args` must match the parameters the callback expects** — default 1 silently drops extras (e.g., `save_post` passes three: `$post_id, $post, $update`).

### Hook introspection

`has_action()`, `did_action()`, `doing_action()`, `current_filter()`, `remove_action()`.

### Removing class-method hooks from third parties

Closures are unremovable by design (no stable identity). For static/instance methods, walk `$GLOBALS['wp_filter'][$hook]->callbacks[$priority]` and match by class + method name. Better: have plugins expose a `{slug}_hooks_enabled` filter so third parties can `__return_false` it.

### Critical core hooks (execution order)

| Hook | Typical use |
|------|-------------|
| `plugins_loaded` | Initialize singletons, load textdomains (when not wp.org hosted) |
| `init` | Register CPTs, taxonomies, shortcodes, blocks, rewrite rules |
| `wp_loaded` | Late init catch-all |
| `admin_init` | Register settings, run upgrade routines, form handlers |
| `admin_menu` | `add_menu_page` / `add_submenu_page` |
| `admin_enqueue_scripts` | Admin JS/CSS (receives `$hook_suffix`) |
| `wp_enqueue_scripts` | Frontend JS/CSS |
| `enqueue_block_editor_assets` | Editor-only JS/CSS |
| `rest_api_init` | Register REST routes |
| `save_post` / `save_post_{type}` | Persist meta (with nonce + cap check) |
| `template_redirect` | Short-circuit before template load |
| `the_content` (filter) | Modify post HTML |
