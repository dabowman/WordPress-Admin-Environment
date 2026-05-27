# Developer Tooling

WP-CLI custom commands, PHPUnit testing, performance optimization, Plugin Check.

## WP-CLI custom commands

```php
if ( defined( 'WP_CLI' ) && WP_CLI ) {
    class Acme_CLI {
        /**
         * Imports items from a CSV file.
         *
         * ## OPTIONS
         *
         * <file>
         * : Path to CSV.
         *
         * [--dry-run]
         * : Preview without writing.
         *
         * ## EXAMPLES
         *
         *     wp acme import data.csv --dry-run
         *
         * @when after_wp_load
         */
        public function import( $args, $assoc ) {
            [ $file ] = $args;
            $dry = ! empty( $assoc['dry-run'] );
            if ( ! file_exists( $file ) ) { WP_CLI::error( "Missing: $file" ); }
            $rows = array_map( 'str_getcsv', file( $file ) );
            $bar = \WP_CLI\Utils\make_progress_bar( 'Importing', count( $rows ) );
            foreach ( $rows as $r ) {
                if ( ! $dry ) { wp_insert_post( /* ... */ ); }
                $bar->tick();
            }
            $bar->finish();
            WP_CLI::success( sprintf( 'Imported %d rows.', count( $rows ) ) );
        }

        public function purge( $args, $assoc ) {
            WP_CLI::confirm( 'Delete ALL items?', $assoc );
            WP_CLI::success( 'Purged.' );
        }
    }
    WP_CLI::add_command( 'acme', 'Acme_CLI' );
}
```

**Registration patterns:** function, closure, class (methods = subcommands), invokable class (`__invoke` only). Prefer `add_action( 'cli_init', ... )` for registration.

**Docblock sections:** short description, long description, `## OPTIONS` (with `<required>`, `[--optional]`, `[--flag]`), `## EXAMPLES`. Annotations: `@when before_wp_load` / `after_wp_load`.

**Output:** `WP_CLI::success/error/warning/log/line/debug`. `WP_CLI::error` exits with status 1. Progress bars via `\WP_CLI\Utils\make_progress_bar()`. Formatted output via `\WP_CLI\Utils\format_items('table'|'json'|'csv'|'yaml', $rows, $fields)`.

## PHPUnit testing

**Scaffold:** `wp scaffold plugin-tests my-plugin`.

**Install test suite:**

```bash
bash bin/install-wp-tests.sh wp_test root '' localhost latest
```

**Composer dev deps:**

```bash
composer require --dev yoast/phpunit-polyfills wp-phpunit/wp-phpunit phpunit/phpunit
```

### `tests/bootstrap.php`

```php
$_tests_dir = getenv('WP_TESTS_DIR') ?: rtrim(sys_get_temp_dir(), '/\\') . '/wordpress-tests-lib';
require_once $_tests_dir . '/includes/functions.php';
tests_add_filter( 'muplugins_loaded', fn() => require dirname(__DIR__) . '/my-plugin.php' );
require $_tests_dir . '/includes/bootstrap.php';
```

### Test class

```php
class Test_CPT extends WP_UnitTestCase {
    public function set_up() { parent::set_up(); acme_register_book_cpt(); }
    public function test_cpt_registered() { $this->assertTrue( post_type_exists( 'book' ) ); }
    public function test_factory() {
        $id = self::factory()->post->create( array( 'post_type' => 'book' ) );
        $this->assertSame( 'book', get_post_type( $id ) );
    }
    public function test_invalid_returns_wp_error() {
        $this->assertWPError( acme_validate( '' ) );
    }
}
```

`WP_UnitTestCase` auto-rolls back the DB per test.

**Factories:** `self::factory()->post/user/term/comment/attachment/blog->create( [] )`.

**WP-specific assertions:** `assertWPError`, `assertQueryTrue`, `assertEqualSets`, `assertDiscardWhitespace`.

**Request simulation:** `$this->go_to( $url )`.

### HTTP mocking

```php
add_filter( 'pre_http_request', fn( $p, $a, $url ) =>
    str_contains( $url, 'api.example.com' )
        ? array(
            'response' => array( 'code' => 200 ),
            'body'     => '{"ok":true}',
            'headers'  => array(),
            'cookies'  => array(),
            'filename' => null,
          )
        : $p,
    10, 3 );
```

### Brain Monkey + Mockery (isolated unit tests without WP loaded)

```php
Functions\expect('get_option')->once()->with('my_key')->andReturn('val');
Functions\when('esc_html')->returnArg();
```

### JS and E2E

- **JS unit:** `wp-scripts test-unit-js` (Jest).
- **E2E:** `wp-scripts test-playwright` with `@wordpress/e2e-test-utils-playwright`.

## Performance

### Object cache

Request-scoped by default; persistent with a drop-in at `wp-content/object-cache.php` (Redis, Memcached, SQLite).

```php
$data = wp_cache_get( $key, $group, false, $found );
if ( false === $found ) {
    $data = expensive_query();
    wp_cache_set( $key, $data, $group, HOUR_IN_SECONDS );
}
```

Use the `$found` parameter by reference because cached `false` is indistinguishable from a miss without it. `wp_cache_add_global_groups()` for multisite-shared keys. `wp_cache_add_non_persistent_groups()` for volatile keys.

### `WP_Query` optimization flags

```php
new WP_Query( array(
    'post_type'              => 'book',
    'posts_per_page'         => 20,
    'no_found_rows'          => true,   // skip SQL_CALC_FOUND_ROWS
    'update_post_meta_cache' => false,
    'update_post_term_cache' => false,
    'fields'                 => 'ids',  // IDs only
) );
```

Always set explicit `posts_per_page` — `-1` is dangerous on large datasets.

### Prime caches in bulk (avoid N+1)

```php
update_meta_cache( 'post', $ids );
update_object_term_cache( $ids, 'post' );
_prime_post_caches( $ids, true, true );
```

### Autoload optimization (WP 6.4+)

- `wp_prime_option_caches( $names )` — single-query bulk option fetch.
- `wp_set_option_autoload_values()` — bulk update autoload state.
- Don't autoload options only read on specific admin screens; prime them on `load-{hook}`.

## Plugin Check (PCP)

Official plugin at wordpress.org/plugins/plugin-check/. Mirrors wp.org reviewer checks; **mandatory before submission**.

**Categories:** `general`, `plugin_repo`, `security`, `performance`, `accessibility`.

### CLI

```bash
wp plugin check my-plugin
wp plugin check my-plugin --categories=plugin_repo,security
wp plugin check my-plugin --format=json
wp plugin check my-plugin --require=./wp-content/plugins/plugin-check/cli.php  # runtime checks
wp plugin list-checks
```

### Common flags you'll see

- `WordPress.Security.EscapeOutput.*` — unescaped output.
- `WordPress.Security.ValidatedSanitizedInput` — missing sanitization on superglobals.
- `WordPress.WP.I18n.MissingTranslatorsComment` — missing translator comment.
- `WordPress.DB.PreparedSQL.NotPrepared` — raw `$wpdb->query()` with interpolation.
- `WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedVariableFound` — unprefixed globals.
- `missing_direct_file_access_protection` — missing ABSPATH guard.
- `file_type` — bundled `.git`, `.cursor`, binaries, phars (disallowed in wp.org zips).
- `trademarked_term` — slug/name uses a trademarked term.
- `non_blocking_scripts` — scripts not deferred/async.
- `load_plugin_textdomain` — no longer needed for wp.org plugins.

### CI

GitHub Action: `WordPress/plugin-check-action@v1`, with `categories` and `exclude-checks` inputs. Pair with `wp dist-archive` to run against the actual shipped zip rather than the dev tree.
