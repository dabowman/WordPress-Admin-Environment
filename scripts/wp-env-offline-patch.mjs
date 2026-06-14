/**
 * Patches @wordpress/env for sandboxed cloud sessions (Claude Code on the web).
 *
 * Two classes of problem make a stock `wp-env start` impossible in the cloud
 * sandbox, and neither can be fixed from .wp-env.json:
 *
 * 1. NETWORK — the generated Dockerfiles run `apt-get update`/`apk update`,
 *    install $PHPIZE_DEPS + sudo + git, and download Composer + PHPUnit at
 *    image build time. The sandbox egress policy blocks every host those
 *    steps need (deb.debian.org, security.debian.org, dl-cdn.alpinelinux.org,
 *    getcomposer.org, composer.github.io, pecl.php.net), so the build dies on
 *    `RUN apk update` (exit 2). None of those tools matter for this repo's
 *    workflow: PHP tests run via `wp eval-file` (no phpunit/composer) and
 *    xdebug/SPX stay off — so the steps are dropped, keeping the offline-safe
 *    parts (user creation, php.ini upload limits, sudoers entry).
 *
 * 2. ROOT — the sandbox runs as uid 0, and wp-env maps the host user into the
 *    containers. Apache hard-refuses to run as root (AH00526 at startup, the
 *    wordpress services exit 1), and wp-cli refuses every command without
 *    --allow-root. So: APACHE_RUN_USER/GROUP falls back to www-data when the
 *    host uid is 0, and the CLI images get ENV WP_CLI_ALLOW_ROOT=1.
 *
 * Idempotent (marker comment short-circuits re-runs). Re-apply after any
 * `npm ci`/`npm install` — scripts/cloud-setup.sh does this automatically.
 * Anchors are exact-match on the @wordpress/env source: an upstream upgrade
 * that reshapes either template fails loudly here instead of silently
 * generating a config that breaks again.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const MARKER = '/* cloud-offline-patch applied */';
const require = createRequire( import.meta.url );

// The package's `exports` map blocks deep subpath resolution, so resolve the
// package root via its exported package.json and join from there.
let pkgRoot;
try {
	pkgRoot = dirname( require.resolve( '@wordpress/env/package.json' ) );
} catch {
	console.error(
		'[wp-env-offline-patch] @wordpress/env not installed — run npm ci first.'
	);
	process.exit( 1 );
}

/**
 * Applies exact-match replacements to one file, failing loudly when an anchor
 * is missing or matches an unexpected number of times.
 *
 * @param {string} relPath      Path of the file inside @wordpress/env.
 * @param {Array}  replacements [anchor, replacement, label, expectedCount][].
 */
function patchFile( relPath, replacements ) {
	const target = join( pkgRoot, relPath );
	let source = readFileSync( target, 'utf8' );

	if ( source.includes( MARKER ) ) {
		console.log(
			`[wp-env-offline-patch] ${ relPath } already patched, skipping.`
		);
		return;
	}

	for ( const [ anchor, replacement, label, count = 1 ] of replacements ) {
		const found = source.split( anchor ).length - 1;
		if ( found !== count ) {
			console.error(
				`[wp-env-offline-patch] anchor for "${ label }" matched ` +
					`${ found }x (expected ${ count }x) in ${ relPath } — ` +
					'@wordpress/env changed; update this patch.'
			);
			process.exit( 1 );
		}
		source = source.split( anchor ).join( replacement );
	}

	writeFileSync( target, `${ MARKER }\n${ source }` );
	console.log( `[wp-env-offline-patch] patched ${ relPath }` );
}

// --- 1. Dockerfile generation: drop every network-dependent build step. ----
patchFile( 'lib/runtime/docker/init-config.js', [
	[
		// WordPress (debian) service: drop apt-get steps, keep the php.ini
		// touch (later RUN echo lines append to it) + the sudoers entry.
		`# Make sure we're working with the latest packages.
RUN apt-get clean
RUN apt-get -qy update

# Install some basic PHP dependencies.
RUN apt-get -qy install $PHPIZE_DEPS && touch /usr/local/etc/php/php.ini

# Install git
RUN apt-get -qy install git

# Set up sudo so they can have root access.
RUN apt-get -qy install sudo
RUN echo "#$HOST_UID ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers\`;`,
		`# Package installs skipped: apt repos are blocked by the sandbox egress policy.
RUN touch /usr/local/etc/php/php.ini
RUN echo "#$HOST_UID ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers || true\`;`,
		'wordpress apt block',
	],
	[
		// CLI (alpine) service: drop apk steps. WP_CLI_ALLOW_ROOT keeps
		// wp-cli from refusing every command when the host user is root.
		`# Make sure we're working with the latest packages.
RUN apk update

# Install some basic PHP dependencies.
RUN apk --no-cache add $PHPIZE_DEPS && touch /usr/local/etc/php/php.ini

# Set up sudo so they can have root access.
RUN apk --no-cache add sudo linux-headers
RUN echo "#$HOST_UID ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers\`;`,
		`# Package installs skipped: apk repos are blocked by the sandbox egress policy.
RUN touch /usr/local/etc/php/php.ini
RUN echo "#$HOST_UID ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers || true
ENV WP_CLI_ALLOW_ROOT=1\`;`,
		'cli apk block',
	],
	[
		`	// Make sure Composer is available for use in all services.
	dockerFileContent += \`
RUN curl -sS https://getcomposer.org/installer -o /tmp/composer-setup.php
RUN export COMPOSER_HASH=\\\`curl -sS https://composer.github.io/installer.sig\\\` && php -r "if (hash_file('SHA384', '/tmp/composer-setup.php') === '$COMPOSER_HASH') { echo 'Installer verified'; } else { echo 'Installer corrupt'; unlink('/tmp/composer-setup.php'); } echo PHP_EOL;"
RUN php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer
RUN rm /tmp/composer-setup.php\`;`,
		`	// Composer install skipped: getcomposer.org is blocked by the sandbox egress policy.`,
		'composer installer block',
	],
	[
		`	// Install any Composer packages we might need globally.
	// Make sure to do this as the user and ensure the binaries are available in the \$PATH.
	dockerFileContent += \`
USER $HOST_UID:$HOST_GID
ENV PATH="\\\${PATH}:/home/$HOST_USERNAME/.composer/vendor/bin"
RUN composer global require --dev phpunit/phpunit:"^5.7.21 || ^6.0 || ^7.0 || ^8.0 || ^9.0 || ^10.0"
USER root\`;`,
		`	// PHPUnit install skipped: packagist is blocked by the sandbox egress policy.`,
		'phpunit block',
	],
] );

// --- 2. Compose config: Apache cannot run as root (AH00526). ---------------
// When the host user is root, fall back to the image's stock www-data user.
// File-permission parity (the reason wp-env matches the host user) doesn't
// matter in a single-user sandbox; cloud-setup.sh opens up wp-content so
// www-data can still write uploads.
patchFile( 'lib/runtime/docker/build-docker-compose-config.js', [
	[
		`APACHE_RUN_USER: '#' + hostUser.uid,
					APACHE_RUN_GROUP: '#' + hostUser.gid,`,
		`APACHE_RUN_USER:
						String( hostUser.uid ) === '0'
							? 'www-data'
							: '#' + hostUser.uid,
					APACHE_RUN_GROUP:
						String( hostUser.gid ) === '0'
							? 'www-data'
							: '#' + hostUser.gid,`,
		'apache run user',
		2,
	],
] );

console.log( '[wp-env-offline-patch] done.' );
