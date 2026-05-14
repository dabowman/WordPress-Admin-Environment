<?php
/**
 * core:desktop chromeless bridge.
 *
 * Emits the JS bridge inside chromeless admin pages. The bridge runs
 * inside the iframe and posts messages to the parent shell window for
 * observability + chrome interception. Parent-side handler stub lives
 * in `src/apps/desktop-iframe/index.js`.
 *
 * Port of `desktop-mode/includes/render/chromeless-bridge.php` with
 * namespace rename `desktop_mode_` → `wp_admin_shell_` and
 * `desktop-mode-*` → `wp-admin-shell-*`. Split across three commits per
 * the engine port plan:
 *
 *   - P2.T4-A (this file): sub-systems 1–5
 *       1. Top-window escape hatch
 *       2. window error + unhandledrejection → postMessage
 *       3. fetch() wrap → postMessage on completion
 *       4. XMLHttpRequest wrap → postMessage on load/error
 *       5. navigator.sendBeacon wrap → postMessage on call
 *   - P2.T4-B: sub-systems 6–10 (auth-check, menu-changed, handshake,
 *     external-link interception, focus-request).
 *   - P2.T4-C: sub-systems 11–14 (command harvest, screen-meta detect,
 *     auth-check recovery, instrument-set listener).
 *
 * Privacy: request / response bodies are NEVER captured. Only method,
 * URL, status, duration. Monitor widgets that want the full payload
 * must ship a deeper wrapper themselves and own that consent
 * conversation.
 *
 * @package WP_Admin_Shell
 * @since   2.x
 */

defined( 'ABSPATH' ) || exit;

/**
 * Emit the chromeless bridge script.
 *
 * Heredoc'd JS runs once at footer time inside the iframe's document.
 * The IIFE wraps the whole bridge so it leaves no globals behind.
 */
function wp_admin_shell_chromeless_bridge_script() {
	if ( ! wp_admin_shell_is_chromeless_request() ) {
		return;
	}

	$js = <<<'JS'
//# sourceURL=wp-admin-shell-chromeless-bridge.js
( function () {
	'use strict';

	/*
	 * Sub-system 1 — Top-window escape hatch.
	 *
	 * A chromeless page is only meant to live inside a desktop-engine
	 * iframe. If the top window IS this page, the user ended up here
	 * directly (bookmark, stale link, redirect glitch). Without an
	 * admin bar there's no toggle to exit chromeless, so strip the
	 * flag and reload as classic admin.
	 */
	if ( ! window.parent || window.parent === window ) {
		try {
			var here = new URL( window.location.href );
			if ( here.searchParams.has( 'wp_admin_shell_chromeless' ) ) {
				here.searchParams.delete( 'wp_admin_shell_chromeless' );
				window.location.replace( here.toString() );
			}
		} catch ( err ) {
			/* URL parse failure — let the broken state stand rather
			 * than navigate somewhere worse. */
		}
		return;
	}

	var ORIGIN = window.location.origin;

	function post( payload ) {
		try {
			window.parent.postMessage( payload, ORIGIN );
		} catch ( _err ) {
			/* relay failure must not compound the original event. */
		}
	}

	/*
	 * Sub-system 0 — init ping. Posts as soon as the bridge runs so the
	 * parent can confirm the iframe is wired even before the first
	 * network event fires. P2.T4-B + T4-C extend with `pagenow` /
	 * `hookSuffix` from the page context once the handshake handler
	 * lands on the parent side.
	 */
	post( {
		type: 'wp-admin-shell-iframe-ready',
		url: window.location.href,
		userAgent: navigator.userAgent,
	} );

	/*
	 * Sub-system 2 — window error + unhandledrejection listeners.
	 *
	 * Everything admin-interesting (REST failures from Gutenberg,
	 * admin-ajax 500s, plugin console warnings) fires inside the
	 * iframe. Relay to the shell so monitor/debug widgets see the
	 * actual error surface, not just the shell's own errors.
	 */
	try {
		window.addEventListener( 'error', function ( e ) {
			post( {
				type: 'wp-admin-shell-iframe-error',
				kind: 'error',
				message: e && e.message ? String( e.message ) : '',
				filename: e && e.filename ? String( e.filename ) : null,
				lineno: e && typeof e.lineno === 'number' ? e.lineno : null,
				colno: e && typeof e.colno === 'number' ? e.colno : null,
				stack: e && e.error && e.error.stack
					? String( e.error.stack )
					: null,
			} );
		} );
		window.addEventListener( 'unhandledrejection', function ( e ) {
			var reason = e && e.reason;
			var message = '';
			var stack = null;
			if ( reason instanceof Error ) {
				message = reason.message || '';
				stack = reason.stack || null;
			} else if ( typeof reason === 'string' ) {
				message = reason;
			} else {
				try {
					message = JSON.stringify( reason );
				} catch ( _err ) {
					message = String( reason );
				}
			}
			post( {
				type: 'wp-admin-shell-iframe-error',
				kind: 'unhandledrejection',
				message: message,
				stack: stack,
			} );
		} );
	} catch ( _err ) {
		/* listener-attach failure — observability degrades silently. */
	}

	/*
	 * Sub-system 3 — fetch() wrap.
	 *
	 * Every completed request posts `wp-admin-shell-iframe-network`
	 * with { method, url, status, duration, failed }. Bodies are
	 * NEVER captured. Wraps in-place; preserves the original fetch as
	 * the underlying call so we don't change behavior.
	 */
	try {
		var origFetch = window.fetch;
		if ( typeof origFetch === 'function' ) {
			window.fetch = function wpAdminShellFetchWrap( input, init ) {
				var startedAt = ( window.performance && performance.now )
					? performance.now()
					: Date.now();
				var method = 'GET';
				var url = '';
				if ( typeof input === 'string' ) {
					url = input;
				} else if ( input && typeof input.url === 'string' ) {
					url = input.url;
				}
				if ( init && typeof init.method === 'string' ) {
					method = init.method.toUpperCase();
				} else if ( input && typeof input.method === 'string' ) {
					method = input.method.toUpperCase();
				}

				return origFetch
					.apply( this, arguments )
					.then(
						function ( response ) {
							var duration =
								( ( window.performance && performance.now )
									? performance.now()
									: Date.now() ) - startedAt;
							post( {
								type: 'wp-admin-shell-iframe-network',
								transport: 'fetch',
								method: method,
								url: url,
								status: response && typeof response.status === 'number'
									? response.status
									: 0,
								duration: Math.round( duration ),
								failed: response ? ! response.ok : true,
							} );
							return response;
						},
						function ( err ) {
							var duration =
								( ( window.performance && performance.now )
									? performance.now()
									: Date.now() ) - startedAt;
							post( {
								type: 'wp-admin-shell-iframe-network',
								transport: 'fetch',
								method: method,
								url: url,
								status: 0,
								duration: Math.round( duration ),
								failed: true,
								error: err && err.message
									? String( err.message )
									: '',
							} );
							throw err;
						}
					);
			};
		}
	} catch ( _err ) {
		/* wrap-install failure — network observability degrades. */
	}

	/*
	 * Sub-system 4 — XMLHttpRequest.prototype wrap.
	 *
	 * Same shape as the fetch wrap. We patch open() to record the
	 * method + url, and send() to start the timer + attach a load/
	 * loadend/error listener that posts on settlement. Privacy: no
	 * bodies, no headers — method, url, status, duration only.
	 */
	try {
		var XHR = window.XMLHttpRequest;
		if ( XHR && XHR.prototype ) {
			var proto = XHR.prototype;
			var origOpen = proto.open;
			var origSend = proto.send;
			proto.open = function ( method, url ) {
				try {
					this.__wpAdminShellNet = {
						method: typeof method === 'string'
							? method.toUpperCase()
							: 'GET',
						url: typeof url === 'string' ? url : '',
					};
				} catch ( _err ) { /* swallow */ }
				return origOpen.apply( this, arguments );
			};
			proto.send = function () {
				var info = this.__wpAdminShellNet || {};
				var startedAt = ( window.performance && performance.now )
					? performance.now()
					: Date.now();
				var fired = false;
				var settle = function ( failed ) {
					if ( fired ) {
						return;
					}
					fired = true;
					var duration =
						( ( window.performance && performance.now )
							? performance.now()
							: Date.now() ) - startedAt;
					post( {
						type: 'wp-admin-shell-iframe-network',
						transport: 'xhr',
						method: info.method || 'GET',
						url: info.url || '',
						status: typeof this.status === 'number' ? this.status : 0,
						duration: Math.round( duration ),
						failed: failed || this.status >= 400 || this.status === 0,
					} );
				}.bind( this );
				try {
					this.addEventListener( 'load', function () { settle( false ); } );
					this.addEventListener( 'error', function () { settle( true ); } );
					this.addEventListener( 'abort', function () { settle( true ); } );
					this.addEventListener( 'timeout', function () { settle( true ); } );
				} catch ( _err ) { /* swallow */ }
				return origSend.apply( this, arguments );
			};
		}
	} catch ( _err ) {
		/* XHR-wrap failure — XHR observability degrades. */
	}

	/*
	 * Sub-system 5 — navigator.sendBeacon wrap.
	 *
	 * Beacons fire at unload / visibility-change and we never get a
	 * meaningful return value to wait on, so we post immediately with
	 * the boolean the call returns. URL only; no payload.
	 */
	try {
		if (
			navigator &&
			typeof navigator.sendBeacon === 'function'
		) {
			var origBeacon = navigator.sendBeacon.bind( navigator );
			navigator.sendBeacon = function ( url ) {
				var ok = false;
				try {
					ok = origBeacon.apply( navigator, arguments );
				} catch ( err ) {
					post( {
						type: 'wp-admin-shell-iframe-network',
						transport: 'beacon',
						method: 'POST',
						url: typeof url === 'string' ? url : '',
						status: 0,
						duration: 0,
						failed: true,
						error: err && err.message ? String( err.message ) : '',
					} );
					throw err;
				}
				post( {
					type: 'wp-admin-shell-iframe-network',
					transport: 'beacon',
					method: 'POST',
					url: typeof url === 'string' ? url : '',
					status: ok ? 204 : 0,
					duration: 0,
					failed: ! ok,
				} );
				return ok;
			};
		}
	} catch ( _err ) {
		/* beacon-wrap failure — beacon observability degrades. */
	}

	/* Sub-systems 6–14 land in P2.T4-B / P2.T4-C commits. */
} )();
JS;

	wp_print_inline_script_tag( $js );
}
