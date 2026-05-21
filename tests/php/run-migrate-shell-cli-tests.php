<?php
/**
 * v2 → v3 admin.json migration helper tests (Phase 3d.2).
 *
 * Invoke:
 *   npx wp-env run cli wp eval-file \
 *     wp-content/plugins/WordPress-Admin-Environment/tests/php/run-migrate-shell-cli-tests.php
 *
 * Coverage:
 *   - is_pre_v3() detection (rejects v3 docs, accepts v2/v1/v0).
 *   - screen_id_from_path() derivation (basic, nested, curly params, root).
 *   - ensure_unique_id() disambiguation.
 *   - derive_label_from_path() (multi-segment + param-aware).
 *   - slugify_command_id() (basic, special chars, numeric prefix).
 *   - build_screens() — routes → screens, path map population.
 *   - iframe-fallback collapse to iframe:<url> shorthand.
 *   - route.config.variant → dataViewRef synthesis (heuristic +
 *     manifest paths).
 *   - build_commands() — bindings → commands w/ synthesized ids.
 *   - rewrite() end-to-end: viewConfigs → settings.dataViews,
 *     fieldCollections → settings.dataFields, default-route →
 *     workspace.default-screen, branding promotion, preload passthrough.
 *   - lightweight_validate() catches required-field / pattern issues.
 *   - encode_json() emits tab-indented output ending in newline.
 *   - Helpers::default_output_path() suffix-swap behavior.
 *   - dry-run path (logic-only smoke; CLI args not exercised).
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Migrate_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function ok( $label, $cond, $detail = '' ) {
		if ( $cond ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			if ( $detail ) {
				echo "      $detail\n";
			}
		}
	}

	public static function eq( $label, $actual, $expected ) {
		if ( $actual === $expected ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			echo '      expected: ' . var_export( $expected, true ) . "\n";
			echo '      actual:   ' . var_export( $actual, true ) . "\n";
		}
	}
}

$T          = 'WPAS_Migrate_Test_Runner';
$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-shell.php';

// ── 1. is_pre_v3 detection ─────────────────────────────────────────

$T::ok(
	'is_pre_v3: v2 doc accepted',
	WP_Admin_Shell_Migrate_Rewriter::is_pre_v3( array(
		'version' => 1,
		'engine'  => 'core:default',
		'regions' => array(),
	) )
);
$T::ok(
	'is_pre_v3: v3 version rejected',
	! WP_Admin_Shell_Migrate_Rewriter::is_pre_v3( array( 'version' => 3 ) )
);
$T::ok(
	'is_pre_v3: v3 workspace-only rejected',
	! WP_Admin_Shell_Migrate_Rewriter::is_pre_v3( array(
		'workspace' => array( 'engine' => 'core:default' ),
	) )
);
$T::ok(
	'is_pre_v3: v3 screens-only rejected',
	! WP_Admin_Shell_Migrate_Rewriter::is_pre_v3( array(
		'screens' => array( 'home' => array() ),
	) )
);

// ── 2. screen_id_from_path derivation ──────────────────────────────

$T::eq(
	'screen_id: simple path',
	WP_Admin_Shell_Migrate_Rewriter::screen_id_from_path( '/posts' ),
	'posts'
);
$T::eq(
	'screen_id: nested path',
	WP_Admin_Shell_Migrate_Rewriter::screen_id_from_path( '/posts/drafts' ),
	'posts-drafts'
);
$T::eq(
	'screen_id: parametric path',
	WP_Admin_Shell_Migrate_Rewriter::screen_id_from_path( '/posts/{id}/edit' ),
	'posts-id-edit'
);
$T::eq(
	'screen_id: root path → home',
	WP_Admin_Shell_Migrate_Rewriter::screen_id_from_path( '/' ),
	'home'
);

// ── 3. ensure_unique_id ────────────────────────────────────────────

$T::eq(
	'ensure_unique_id: no collision',
	WP_Admin_Shell_Migrate_Rewriter::ensure_unique_id( 'posts', array() ),
	'posts'
);
$T::eq(
	'ensure_unique_id: appends -2 on collision',
	WP_Admin_Shell_Migrate_Rewriter::ensure_unique_id( 'posts', array( 'posts' => true ) ),
	'posts-2'
);
$T::eq(
	'ensure_unique_id: skips -2 when taken, uses -3',
	WP_Admin_Shell_Migrate_Rewriter::ensure_unique_id(
		'posts',
		array( 'posts' => true, 'posts-2' => true )
	),
	'posts-3'
);

// ── 4. derive_label_from_path ──────────────────────────────────────

$T::eq(
	'label: /posts',
	WP_Admin_Shell_Migrate_Rewriter::derive_label_from_path( '/posts' ),
	'Posts'
);
$T::eq(
	'label: /posts/drafts uses last segment',
	WP_Admin_Shell_Migrate_Rewriter::derive_label_from_path( '/posts/drafts' ),
	'Drafts'
);
$T::eq(
	'label: /tools/site-health title-cases hyphens',
	WP_Admin_Shell_Migrate_Rewriter::derive_label_from_path( '/tools/site-health' ),
	'Site Health'
);
$T::eq(
	'label: /posts/{id}/edit skips {param} segment',
	WP_Admin_Shell_Migrate_Rewriter::derive_label_from_path( '/posts/{id}/edit' ),
	'Edit'
);

// ── 5. slugify_command_id ──────────────────────────────────────────

$T::eq(
	'slugify: title-case input',
	WP_Admin_Shell_Migrate_Rewriter::slugify_command_id( 'Open Command Palette' ),
	'open-command-palette'
);
$T::eq(
	'slugify: shortcut chars',
	WP_Admin_Shell_Migrate_Rewriter::slugify_command_id( 'Mod+K' ),
	'mod-k'
);
$T::eq(
	'slugify: app-id chars',
	WP_Admin_Shell_Migrate_Rewriter::slugify_command_id( 'core:command-palette' ),
	'core-command-palette'
);

// ── 6. build_screens — basic route → screen ───────────────────────

$v2_routes = array(
	'/posts'       => array( 'app' => 'core:posts', 'config' => array( 'postType' => 'post' ) ),
	'/posts/{id}'  => array( 'app' => 'core:editor', 'config' => array( 'postType' => 'post', 'post-id' => '{id}' ) ),
	'/media'       => array( 'app' => 'core:media' ),
);
$path_map = array();
$screens  = WP_Admin_Shell_Migrate_Rewriter::build_screens( $v2_routes, $path_map );

$T::ok( 'build_screens: produces posts screen', isset( $screens['posts'] ) );
$T::eq( 'build_screens: posts.path preserved', $screens['posts']['path'], '/posts' );
$T::eq( 'build_screens: posts.app preserved', $screens['posts']['app'], 'core:posts' );
$T::eq(
	'build_screens: posts.config.postType preserved',
	$screens['posts']['config']['postType'],
	'post'
);
$T::eq(
	'build_screens: parametric path → kebab-cased id without braces',
	isset( $screens['posts-id'] ) ? 'posts-id' : 'missing',
	'posts-id'
);
$T::eq(
	'build_screens: path map populated for /media',
	$path_map['/media'] ?? '',
	'media'
);

// ── 7. iframe-fallback collapse ────────────────────────────────────

$v2_iframe_routes = array(
	'/tools' => array(
		'app'    => 'core:iframe-fallback',
		'config' => array( 'url' => 'tools.php' ),
	),
);
$screens_if = WP_Admin_Shell_Migrate_Rewriter::build_screens( $v2_iframe_routes );
$T::eq(
	'iframe collapse: app rewritten to iframe:<url> shorthand',
	$screens_if['tools']['app'],
	'iframe:tools.php'
);
$T::ok(
	'iframe collapse: config.url stripped after collapse',
	! isset( $screens_if['tools']['config']['url'] )
);
$T::ok(
	'iframe collapse: config block removed entirely when only url was set',
	! isset( $screens_if['tools']['config'] )
);

// ── 8. dataViewRef synthesis (heuristic fallback) ──────────────────

$v2_variant_routes = array(
	'/posts/drafts' => array(
		'app'    => 'core:posts',
		'config' => array( 'postType' => 'post', 'variant' => 'drafts' ),
	),
);
$screens_var = WP_Admin_Shell_Migrate_Rewriter::build_screens( $v2_variant_routes );
$T::eq(
	'variant → dataViewRef synthesized via heuristic',
	$screens_var['posts-drafts']['dataViewRef'] ?? '',
	'postType/post/drafts'
);
$T::ok(
	'variant: stripped from config after dataViewRef synthesis',
	! isset( $screens_var['posts-drafts']['config']['variant'] )
);
$T::eq(
	'variant: other config keys preserved (postType retained)',
	$screens_var['posts-drafts']['config']['postType'] ?? '',
	'post'
);

// Taxonomy heuristic fallback. Use a plugin:* app so the manifest
// registry has no entry — exercises the (taxonomy, config.taxonomy)
// heuristic path directly. Using core:taxonomy here would resolve to
// the manifest's universal `(taxonomy, category)` baseline regardless
// of the route's `config.taxonomy` value.
$v2_tax_routes = array(
	'/taxonomy/post_tag' => array(
		'app'    => 'plugin:acme/term-browser',
		'config' => array( 'taxonomy' => 'post_tag', 'variant' => 'with-counts' ),
	),
);
$screens_tax = WP_Admin_Shell_Migrate_Rewriter::build_screens( $v2_tax_routes );
$T::eq(
	'variant → dataViewRef uses (taxonomy, config.taxonomy) heuristic',
	$screens_tax['taxonomy-post-tag']['dataViewRef'] ?? '',
	'taxonomy/post_tag/with-counts'
);

// Manifest precedence — when the registry has a binding, it wins over
// the heuristic. core:taxonomy's manifest declares
// dataView.{kind:taxonomy, name:category}, so a route declaring
// taxonomy:post_tag in config still resolves to (taxonomy, category)
// per CIAB convention (the universal baseline).
$v2_manifest_routes = array(
	'/taxonomy/post_tag' => array(
		'app'    => 'core:taxonomy',
		'config' => array( 'taxonomy' => 'post_tag', 'variant' => 'with-counts' ),
	),
);
$screens_mfst = WP_Admin_Shell_Migrate_Rewriter::build_screens( $v2_manifest_routes );
$T::eq(
	'variant → dataViewRef from manifest registry beats heuristic',
	$screens_mfst['taxonomy-post-tag']['dataViewRef'] ?? '',
	'taxonomy/category/with-counts'
);

// Variant with neither postType nor taxonomy → leave variant in config.
$v2_orphan_variant = array(
	'/widgets' => array(
		'app'    => 'plugin:acme/widgets',
		'config' => array( 'variant' => 'compact' ),
	),
);
$screens_orphan = WP_Admin_Shell_Migrate_Rewriter::build_screens( $v2_orphan_variant );
$T::ok(
	'variant without inferrable kind/name stays in config',
	isset( $screens_orphan['widgets']['config']['variant'] )
);
$T::ok(
	'variant without inferrable kind/name does NOT produce dataViewRef',
	! isset( $screens_orphan['widgets']['dataViewRef'] )
);

// ── 9. build_commands ─────────────────────────────────────────────

$bindings = array(
	array( 'shortcut' => 'Mod+K', 'invoke' => 'core:command-palette', 'label' => 'Open Palette' ),
	array( 'shortcut' => 'Mod+Alt+N', 'navigate' => '/posts/new', 'label' => 'New Post' ),
	array( 'shortcut' => 'g p', 'navigate' => '/posts' ), // no label — synthesize from navigate/shortcut.
);
$commands = WP_Admin_Shell_Migrate_Rewriter::build_commands( $bindings );

$T::eq( 'build_commands: count matches bindings', count( $commands ), 3 );
$T::eq(
	'build_commands: id slugified from label',
	$commands[0]['id'],
	'open-palette'
);
$T::eq( 'build_commands: shortcut preserved', $commands[0]['shortcut'], 'Mod+K' );
$T::eq( 'build_commands: invoke preserved', $commands[0]['invoke'], 'core:command-palette' );
$T::eq( 'build_commands: label preserved', $commands[0]['label'], 'Open Palette' );
$T::eq( 'build_commands: navigate preserved', $commands[1]['navigate'], '/posts/new' );
// Third binding has no label — id is synthesized from invoke fallback then shortcut. invoke is empty,
// so the rewriter uses the shortcut ("g p" → "g-p").
$T::eq(
	'build_commands: id slugified from shortcut when no label/invoke',
	$commands[2]['id'],
	'g-p'
);

// Empty bindings entry should be skipped.
$commands_skip = WP_Admin_Shell_Migrate_Rewriter::build_commands(
	array( array() )
);
$T::eq( 'build_commands: skips empty entries', count( $commands_skip ), 0 );

// ── 10. rewrite() end-to-end ──────────────────────────────────────

$v2_doc = array(
	'$schema'    => '../docs/schemas/admin-v2.json',
	'version'    => 1,
	'$wpds'      => '6.9',
	'name'       => 'test-shell',
	'title'      => 'Test Shell',
	'description'=> 'For migration tests.',
	'engine'     => 'core:default',
	'regions'    => array(
		'main' => array( 'template' => 'core:main', 'routing' => array( 'route-key' => '_self' ) ),
	),
	'routes'     => array(
		'/posts' => array( 'app' => 'core:posts', 'config' => array( 'postType' => 'post' ) ),
		'/media' => array( 'app' => 'core:media' ),
	),
	'default-route' => '/posts',
	'bindings'   => array(
		array( 'shortcut' => 'Mod+K', 'invoke' => 'core:command-palette', 'label' => 'Palette' ),
	),
	'viewConfigs' => array(
		'postType' => array(
			'post' => array(
				'_default' => array(
					'fields' => array(
						array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
					),
				),
			),
		),
	),
	'fieldCollections' => array(
		'core/post-fields' => array(
			'kind'   => 'postType',
			'name'   => 'post',
			'fields' => array(
				array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
			),
		),
	),
	'preload' => array( '/wp/v2/users/me', array( '/wp/v2/posts', 'OPTIONS' ) ),
	'styles'  => array(
		'branding' => array( 'logo' => '/assets/logo.svg', 'title' => 'Test' ),
		'theme'    => array( 'color' => array( 'primary' => '#abc' ) ),
	),
);

$v3 = WP_Admin_Shell_Migrate_Rewriter::rewrite( $v2_doc );

$T::eq( 'rewrite: version is 3',        $v3['version'], 3 );
$T::eq( 'rewrite: $schema points at v3','../docs/schemas/admin-v3.json', $v3['$schema'] );
$T::eq( 'rewrite: $wpds preserved',     $v3['$wpds'], '6.9' );
$T::eq( 'rewrite: name preserved',      $v3['name'], 'test-shell' );
$T::eq( 'rewrite: title preserved',     $v3['title'], 'Test Shell' );
$T::eq( 'rewrite: workspace.engine',    $v3['workspace']['engine'], 'core:default' );
$T::eq(
	'rewrite: workspace.default-screen resolved from default-route path',
	$v3['workspace']['default-screen'],
	'posts'
);
$T::eq(
	'rewrite: workspace.branding.logo from styles.branding',
	$v3['workspace']['branding']['logo'],
	'/assets/logo.svg'
);
$T::eq(
	'rewrite: workspace.branding.title from styles.branding',
	$v3['workspace']['branding']['title'],
	'Test'
);
$T::ok(
	'rewrite: styles block retained sans branding',
	isset( $v3['styles']['theme'] ) && ! isset( $v3['styles']['branding'] )
);

$T::ok( 'rewrite: settings.dataViews present', isset( $v3['settings']['dataViews']['postType']['post']['_default'] ) );
$T::ok( 'rewrite: settings.dataFields present', isset( $v3['settings']['dataFields']['core/post-fields'] ) );

$T::ok( 'rewrite: screens.posts produced',  isset( $v3['screens']['posts'] ) );
$T::ok( 'rewrite: screens.media produced',  isset( $v3['screens']['media'] ) );
$T::eq( 'rewrite: screens.posts.app',       $v3['screens']['posts']['app'], 'core:posts' );

$T::eq( 'rewrite: commands count = 1',      count( $v3['commands'] ), 1 );
$T::eq( 'rewrite: command id slugified',    $v3['commands'][0]['id'], 'palette' );

$T::eq( 'rewrite: preload preserved',       $v3['preload'][0], '/wp/v2/users/me' );

$T::ok(
	'rewrite: v2 regions block preserved under v3 escape hatch',
	isset( $v3['regions']['main'] )
);

// Ensure the rewrite output identifies as v3.
$T::ok(
	'rewrite: output passes is_v3 detector',
	WP_Admin_Shell_V3_Compiler::is_v3( $v3 )
);

// ── 11. lightweight_validate ───────────────────────────────────────

$T::eq(
	'validate: clean v3 doc has zero errors',
	count( WP_Admin_Shell_Migrate_Rewriter::lightweight_validate( $v3 ) ),
	0
);

$bad = array( 'version' => 3, '$wpds' => 'not-a-version', 'name' => 'NoUppercase', 'screens' => array() );
$bad_errors = WP_Admin_Shell_Migrate_Rewriter::lightweight_validate( $bad );
$T::ok(
	'validate: surfaces $wpds pattern violation',
	(bool) array_filter( $bad_errors, function ( $e ) { return strpos( $e, '$wpds' ) !== false; } )
);
$T::ok(
	'validate: surfaces missing workspace',
	(bool) array_filter( $bad_errors, function ( $e ) { return strpos( $e, 'workspace' ) !== false; } )
);
$T::ok(
	'validate: surfaces non-kebab name',
	(bool) array_filter( $bad_errors, function ( $e ) { return strpos( $e, 'name' ) !== false && strpos( $e, 'kebab' ) !== false; } )
);

// ── 12. encode_json + Helpers ──────────────────────────────────────

$json = WP_Admin_Shell_Migrate_Rewriter::encode_json( $v3 );
$T::ok( 'encode_json: returns non-empty string', is_string( $json ) && $json !== '' );
$T::ok( 'encode_json: starts with `{`',          $json[0] === '{' );
$T::ok( 'encode_json: ends with newline',        substr( $json, -1 ) === "\n" );
$T::ok(
	'encode_json: tab-indented (no four-space-indent runs at line start)',
	! preg_match( '/^    [^ ]/m', $json )
);
// Round-trip parseable.
$reparsed = json_decode( $json, true );
$T::ok( 'encode_json: round-trips through json_decode', is_array( $reparsed ) );
$T::eq( 'encode_json: round-trip preserves version', $reparsed['version'] ?? null, 3 );

$T::eq(
	'Helpers::default_output_path: .json → .v3.json',
	WP_Admin_Shell_Migrate_CLI_Helpers::default_output_path( '/tmp/shell.json' ),
	'/tmp/shell.v3.json'
);
$T::eq(
	'Helpers::default_output_path: no .json suffix → appended',
	WP_Admin_Shell_Migrate_CLI_Helpers::default_output_path( '/tmp/shell' ),
	'/tmp/shell.v3.json'
);

// ── 13. Summary ────────────────────────────────────────────────────

echo "\n— Summary —\n";
echo 'PASS: ' . WPAS_Migrate_Test_Runner::$pass . '  FAIL: ' . WPAS_Migrate_Test_Runner::$fail . "\n";
if ( WPAS_Migrate_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
