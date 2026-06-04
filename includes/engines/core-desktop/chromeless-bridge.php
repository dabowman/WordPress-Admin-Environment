<?php
/**
 * core:desktop chromeless bridge.
 *
 * Emits the JS bridge inside chromeless admin pages. The bridge runs
 * inside the iframe and posts messages to the parent workspace window for
 * observability + chrome interception. Parent-side handler stub lives
 * in `src/apps/desktop-iframe/index.js`.
 *
 * Port of `desktop-mode/includes/render/chromeless-bridge.php` with
 * namespace rename `desktop_mode_` → `wp_admin_workspaces_` and
 * `desktop-mode-*` → `wp-admin-workspaces-*`. Split across three commits per
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
 * @package WP_Admin_Workspaces
 * @since   2.x
 */

defined( 'ABSPATH' ) || exit;

/**
 * Emit the chromeless bridge script.
 *
 * Heredoc'd JS runs once at footer time inside the iframe's document.
 * The IIFE wraps the whole bridge so it leaves no globals behind.
 */
function wp_admin_workspaces_chromeless_bridge_script() {
	if ( ! wp_admin_workspaces_is_chromeless_request() ) {
		return;
	}

	$js = <<<'JS'
//# sourceURL=wp-admin-workspaces-chromeless-bridge.js
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
			if ( here.searchParams.has( 'wp_admin_workspaces_chromeless' ) ) {
				here.searchParams.delete( 'wp_admin_workspaces_chromeless' );
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
		type: 'wp-admin-workspaces-iframe-ready',
		url: window.location.href,
		userAgent: navigator.userAgent,
	} );

	/*
	 * Sub-system 2 — window error + unhandledrejection listeners.
	 *
	 * Everything admin-interesting (REST failures from Gutenberg,
	 * admin-ajax 500s, plugin console warnings) fires inside the
	 * iframe. Relay to the workspace so monitor/debug widgets see the
	 * actual error surface, not just the workspace's own errors.
	 */
	try {
		window.addEventListener( 'error', function ( e ) {
			post( {
				type: 'wp-admin-workspaces-iframe-error',
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
				type: 'wp-admin-workspaces-iframe-error',
				kind: 'unhandledrejection',
				message: message,
				stack: stack,
			} );
		} );
	} catch ( _err ) {
		/* listener-attach failure — observability degrades silently. */
	}

	/*
	 * Sub-system 6 — auth-check force on 401/403.
	 *
	 * When an admin-side request returns 401/403 the session is likely
	 * toast. Force `wp.heartbeat.connectNow()` instead of waiting up to
	 * 60s for the next tick to surface core's auth-check modal. 5s
	 * cooldown debounces storms when many requests fail at once.
	 * Same-origin gate so we don't react to third-party 403s; skip
	 * heartbeat / wp-login URLs to avoid recursion.
	 */
	var authCheckCooldownUntil = 0;
	function maybeForceAuthCheck( status, url ) {
		if ( status !== 401 && status !== 403 ) {
			return;
		}
		var urlStr = String( url || '' );
		if ( ! urlStr ) {
			return;
		}
		try {
			var resolved = new URL( urlStr, window.location.href );
			if ( resolved.origin !== window.location.origin ) {
				return;
			}
			if (
				resolved.pathname.indexOf( '/wp-admin/admin-ajax.php' ) !== -1 &&
				/(?:^|&|\?)action=heartbeat(?:&|$)/.test( resolved.search )
			) {
				return;
			}
			if ( resolved.pathname.indexOf( '/wp-login.php' ) !== -1 ) {
				return;
			}
		} catch ( _err ) {
			return;
		}
		var now = Date.now();
		if ( now < authCheckCooldownUntil ) {
			return;
		}
		authCheckCooldownUntil = now + 5000;
		try {
			if (
				window.wp &&
				window.wp.heartbeat &&
				typeof window.wp.heartbeat.connectNow === 'function'
			) {
				window.wp.heartbeat.connectNow();
			}
		} catch ( _err ) { /* swallow */ }
	}

	/*
	 * Sub-system 3 — fetch() wrap.
	 *
	 * Every completed request posts `wp-admin-workspaces-iframe-network`
	 * with { method, url, status, duration, failed }. Bodies are
	 * NEVER captured. Wraps in-place; preserves the original fetch as
	 * the underlying call so we don't change behavior.
	 */
	try {
		var origFetch = window.fetch;
		if ( typeof origFetch === 'function' ) {
			window.fetch = function wpAdminWorkspacesFetchWrap( input, init ) {
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
							var status = response && typeof response.status === 'number'
								? response.status
								: 0;
							post( {
								type: 'wp-admin-workspaces-iframe-network',
								transport: 'fetch',
								method: method,
								url: url,
								status: status,
								duration: Math.round( duration ),
								failed: response ? ! response.ok : true,
							} );
							maybeForceAuthCheck( status, url );
							return response;
						},
						function ( err ) {
							var duration =
								( ( window.performance && performance.now )
									? performance.now()
									: Date.now() ) - startedAt;
							post( {
								type: 'wp-admin-workspaces-iframe-network',
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
					this.__wpAdminWorkspacesNet = {
						method: typeof method === 'string'
							? method.toUpperCase()
							: 'GET',
						url: typeof url === 'string' ? url : '',
					};
				} catch ( _err ) { /* swallow */ }
				return origOpen.apply( this, arguments );
			};
			proto.send = function () {
				var info = this.__wpAdminWorkspacesNet || {};
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
					var status = typeof this.status === 'number' ? this.status : 0;
					post( {
						type: 'wp-admin-workspaces-iframe-network',
						transport: 'xhr',
						method: info.method || 'GET',
						url: info.url || '',
						status: status,
						duration: Math.round( duration ),
						failed: failed || status >= 400 || status === 0,
					} );
					maybeForceAuthCheck( status, info.url || '' );
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
						type: 'wp-admin-workspaces-iframe-network',
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
					type: 'wp-admin-workspaces-iframe-network',
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

	/*
	 * Sub-system 7 — menu-changed signal.
	 *
	 * Fires on admin pages whose completion commonly mutates the WP
	 * menu globals (plugin activate/deactivate, install, theme switch).
	 * The parent workspace uses our workspace.json, not WP's $menu, but plugin
	 * authors who extend the workspace via `wp_admin_workspaces_register_app()`
	 * during one of those flows want a hook to refetch state. Payload
	 * deliberately omits the full $menu serialization upstream ships
	 * (~140 LOC) — the workspace isn't a $menu mirror, so the signal alone
	 * is the contract.
	 */
	try {
		var pagenow = '';
		if ( typeof window.pagenow === 'string' ) {
			pagenow = window.pagenow;
		} else if ( document.body && document.body.className ) {
			// pagenow-* body class is set by WP for every admin page.
			var match = /(?:^|\s)pagenow-([a-z0-9_-]+)(?:\s|$)/.exec(
				document.body.className
			);
			if ( match ) {
				pagenow = match[ 1 ];
			}
		}
		var menuMutatingPages = [
			'plugins',
			'plugin-install',
			'update',
			'themes',
		];
		if ( menuMutatingPages.indexOf( pagenow ) !== -1 ) {
			post( {
				type: 'wp-admin-workspaces-menu-changed',
				pagenow: pagenow,
			} );
		}
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 8 — bridge handshake (minimal MVP).
	 *
	 * Parent ↔ iframe handshake: parent posts
	 * `wp-admin-workspaces-bridge-hello` after the iframe-ready signal, and
	 * the iframe replies with `wp-admin-workspaces-bridge-ack`. Full
	 * topic-based publish / subscribe channel system from upstream
	 * (~200 LOC) defers to a follow-up — the ack is enough to satisfy
	 * the "is this iframe reachable" probe parent widgets need.
	 */
	try {
		window.addEventListener( 'message', function ( e ) {
			if ( e.source !== window.parent ) {
				return;
			}
			var data = e.data;
			if ( ! data || typeof data !== 'object' ) {
				return;
			}
			if ( data.type === 'wp-admin-workspaces-bridge-hello' ) {
				post( {
					type: 'wp-admin-workspaces-bridge-ack',
					url: window.location.href,
				} );
			}
		} );
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 9 — link interception.
	 *
	 *   - `<a target="_blank">` / external host → post
	 *     `wp-admin-workspaces-external-link`; parent decides whether to
	 *     open as a closeable sub-tab or hand to the OS.
	 *   - Same-origin wp-admin links inside the iframe → post
	 *     `wp-admin-workspaces-admin-link`; parent decides whether to open
	 *     as a new window, route through the dock, or let the iframe
	 *     navigate in place. Modifier-key clicks (cmd/ctrl/middle)
	 *     pass through native so "open in new tab" still works.
	 */
	try {
		document.addEventListener(
			'click',
			function ( e ) {
				// Pass through modifier-key clicks.
				if (
					e.defaultPrevented ||
					e.button !== 0 ||
					e.metaKey ||
					e.ctrlKey ||
					e.shiftKey ||
					e.altKey
				) {
					return;
				}
				var link =
					e.target instanceof Element
						? e.target.closest( 'a' )
						: null;
				if ( ! link ) {
					return;
				}
				var href = link.getAttribute( 'href' );
				if ( ! href || href.charAt( 0 ) === '#' ) {
					return;
				}
				var target = link.getAttribute( 'target' );
				// `target=_parent` / `target=_top` are WP's "break out of
				// modal" idiom (plugin-install Replace/Cancel buttons,
				// etc.). In our workspace context the iframe-fallback IS
				// the modal — the analogous behavior is "navigate the
				// iframe itself" so the action's full URL (including any
				// nonce + action params we'd otherwise drop) is preserved
				// and the user stays in the workspace. The bridge posts
				// admin-link / external-link up with `target` included;
				// the parent's classifier (iframeBridge.mjs) routes the
				// parent / top variants to an iframe navigation rather
				// than to the workspace.
				var absolute;
				try {
					absolute = new URL(
						href,
						window.location.href
					).toString();
				} catch ( _err ) {
					return;
				}
				var parsed;
				try {
					parsed = new URL( absolute );
				} catch ( _err ) {
					return;
				}
				var isExternal =
					parsed.origin !== window.location.origin ||
					target === '_blank';
				var label =
					( link.textContent || '' ).trim() ||
					link.getAttribute( 'title' ) ||
					link.getAttribute( 'aria-label' ) ||
					absolute;
				if ( isExternal ) {
					e.preventDefault();
					post( {
						type: 'wp-admin-workspaces-external-link',
						url: absolute,
						label: label.slice( 0, 80 ),
						target: target || '_self',
					} );
					return;
				}
				// Same-origin admin link — only intercept if it points
				// into wp-admin (skip frontend links the user can stay
				// in the iframe for).
				if (
					parsed.pathname.indexOf( '/wp-admin/' ) === -1
				) {
					return;
				}
				e.preventDefault();
				post( {
					type: 'wp-admin-workspaces-admin-link',
					url: absolute,
					label: label.slice( 0, 80 ),
					target: target || '_self',
				} );
			},
			true
		);
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 10 — focus-request bridge.
	 *
	 * Pointerdown events don't cross the iframe boundary, so a click
	 * inside an iframe doesn't surface to the parent's focusin
	 * listener. Without this, the only way to raise an iframe window
	 * would be clicking its title bar. Post a focus-request on every
	 * pointerdown; parent's WindowManager treats it as a focusWindow()
	 * call. Capture phase so the signal fires before any
	 * stopPropagation inside the page's own handlers.
	 */
	try {
		document.addEventListener(
			'pointerdown',
			function () {
				post( { type: 'wp-admin-workspaces-focus-request' } );
			},
			true
		);
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 11 — command-palette harvest (STUB).
	 *
	 * Upstream `desktop-mode` ports ~500 LOC of `wp.data.select('core/
	 * commands')` + `wp.element.renderToString` + a React-mounted
	 * harvester for tier-3 loader commands (e.g. `core/block-editor/
	 * selected-block-commands`). Plan §D2 explicitly accepts the WP-
	 * minor breakage risk that comes with those private APIs. For now
	 * the bridge ships a listener stub that acknowledges the subscribe
	 * request and posts an empty list — the parent's `core:command-
	 * palette` app isn't wired to consume iframe commands yet either,
	 * so deferring the harvester does not regress any user-visible
	 * surface. Full port follows the parent palette consumer wiring.
	 */
	try {
		window.addEventListener( 'message', function ( e ) {
			if ( e.source !== window.parent ) {
				return;
			}
			var data = e.data;
			if (
				! data ||
				typeof data !== 'object' ||
				data.type !== 'wp-admin-workspaces-commands-subscribe'
			) {
				return;
			}
			post( {
				type: 'wp-admin-workspaces-commands-list',
				commands: [],
				stub: true,
			} );
		} );
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 12 — screen-meta detection.
	 *
	 * Detects whether the current admin page renders Screen Options /
	 * Help in `#screen-meta-links`. Posts `wp-admin-workspaces-screen-meta`
	 * once with the list of available panels so the parent can show a
	 * matching control on the window's titlebar. Tracks aria-expanded
	 * via MutationObserver and posts `wp-admin-workspaces-screen-meta-state`
	 * with the currently-open panel (or `null`) on every change.
	 */
	try {
		var screenLinks = document.getElementById( 'screen-meta-links' );
		if ( screenLinks ) {
			var screenOptionsBtn = document.getElementById(
				'show-settings-link'
			);
			var helpBtn = document.getElementById( 'contextual-help-link' );
			var panels = [];
			if ( screenOptionsBtn ) {
				panels.push( 'screen-options' );
			}
			if ( helpBtn ) {
				panels.push( 'help' );
			}
			if ( panels.length > 0 ) {
				post( {
					type: 'wp-admin-workspaces-screen-meta',
					panels: panels,
				} );
				var getOpenPanel = function () {
					if (
						screenOptionsBtn &&
						screenOptionsBtn.getAttribute( 'aria-expanded' ) ===
							'true'
					) {
						return 'screen-options';
					}
					if (
						helpBtn &&
						helpBtn.getAttribute( 'aria-expanded' ) === 'true'
					) {
						return 'help';
					}
					return null;
				};
				var reportState = function () {
					post( {
						type: 'wp-admin-workspaces-screen-meta-state',
						open: getOpenPanel(),
					} );
				};
				reportState();
				var observer = new MutationObserver( reportState );
				if ( screenOptionsBtn ) {
					observer.observe( screenOptionsBtn, {
						attributes: true,
						attributeFilter: [ 'aria-expanded' ],
					} );
				}
				if ( helpBtn ) {
					observer.observe( helpBtn, {
						attributes: true,
						attributeFilter: [ 'aria-expanded' ],
					} );
				}
			}
		}
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 13 — auth-check recovery via jQuery heartbeat-tick.
	 *
	 * When the user's session expires while a chromeless window is
	 * open, core's `wp-auth-check.js` shows its login iframe inside
	 * the page. After re-auth the auth cookie is fresh but every
	 * per-page nonce cached in JS globals is stale (`wpApiSettings.
	 * nonce`, `_wpUpdatesSettings.ajax_nonce`, etc.). The next mutating
	 * action surfaces as "Cookie check failed" — misleading; the
	 * cookie is fine.
	 *
	 * Watch jQuery's `heartbeat-tick`. If we see `wp-auth-check: false`
	 * (modal opens) and then later see it flip back to `true` (user
	 * re-authed), reload the iframe so its nonces regenerate from the
	 * fresh session. Per-iframe scope — each chromeless window carries
	 * its own jQuery + heartbeat stack + nonce cache. Siblings recover
	 * on their own next tick.
	 */
	( function _installAuthCheckRecovery() {
		var attached = false;
		var sawLoggedOut = false;
		function attach() {
			if ( attached || ! window.jQuery ) {
				return;
			}
			attached = true;
			window
				.jQuery( document )
				.on(
					'heartbeat-tick.wpAdminWorkspacesAuthRecover',
					function ( ev, data ) {
						if (
							! data ||
							typeof data !== 'object' ||
							! ( 'wp-auth-check' in data )
						) {
							return;
						}
						if ( data[ 'wp-auth-check' ] === false ) {
							sawLoggedOut = true;
							return;
						}
						if (
							sawLoggedOut &&
							data[ 'wp-auth-check' ] === true
						) {
							sawLoggedOut = false;
							post( { type: 'wp-admin-workspaces-reauth-detected' } );
							try {
								window.location.reload();
							} catch ( _err ) { /* swallow */ }
						}
					}
				);
		}
		attach();
		if ( document.readyState === 'loading' ) {
			document.addEventListener( 'DOMContentLoaded', attach, {
				once: true,
			} );
		}
		window.addEventListener( 'load', attach, { once: true } );
	} )();

	/*
	 * Sub-system 14 — instrument-set listener (devtools header
	 * injection slot).
	 *
	 * Maintains a mutable `window.__wpAdminWorkspacesInstrument = { headers,
	 * observe }` slot the parent workspace overwrites via
	 * `wp-admin-workspaces-instrument-set`. Headers are pre-merged by the
	 * parent (RFC 7230 §3.2.2 join applied there). `observe: true`
	 * opts into deeper observability — request + response headers in
	 * network reports — when devtools widgets request it.
	 *
	 * Integration of those headers into the fetch / XHR wraps defers
	 * to a follow-up. The storage + listener alone close sub-system
	 * 14's contract — a parent-side widget can push headers and read
	 * them back via the iframe's `__wpAdminWorkspacesInstrument` global
	 * even before the wrap consumes them.
	 */
	window.__wpAdminWorkspacesInstrument = window.__wpAdminWorkspacesInstrument || {
		headers: {},
		observe: false,
	};
	try {
		window.addEventListener( 'message', function ( ev ) {
			if (
				ev.origin !== window.location.origin ||
				ev.source !== window.parent
			) {
				return;
			}
			var d = ev && ev.data;
			if (
				! d ||
				typeof d !== 'object' ||
				d.type !== 'wp-admin-workspaces-instrument-set'
			) {
				return;
			}
			window.__wpAdminWorkspacesInstrument = {
				headers:
					d.headers && typeof d.headers === 'object' ? d.headers : {},
				observe: !! d.observe,
			};
		} );
	} catch ( _err ) { /* swallow */ }

	/*
	 * Sub-system 15 — block-editor dirty-state relay.
	 *
	 * The workspace's `core:dirty-state` service guards intra-workspace
	 * navigation (a sidebar click) the way the browser's `beforeunload`
	 * guards a tab close. A native app reports through `useDirtyState`;
	 * an iframed editor can't — its unsaved state lives in the iframe's
	 * own `core/editor` store, invisible to the parent's NavigationGuard.
	 *
	 * Bridge it: subscribe to `wp.data` and post
	 * `wp-admin-workspaces-dirty-state { dirty }` to the parent on every
	 * `isEditedPostDirty()` transition. The parent (`core:editor`'s
	 * `installIframeBridge( { onDirty } )`) maps it onto `setDirty()`.
	 *
	 * Guarded on the `core/editor` store existing, so this is a no-op on
	 * every non-editor iframe page the bridge also injects into. Polls
	 * for the store because `wp.data`/`core/editor` register after this
	 * footer script runs; gives up after ~10s (40 × 250ms) on a page
	 * that never registers it.
	 */
	( function _installDirtyStateRelay() {
		function hasEditorStore() {
			return !! (
				window.wp &&
				window.wp.data &&
				typeof window.wp.data.select === 'function' &&
				window.wp.data.select( 'core/editor' ) &&
				typeof window.wp.data
					.select( 'core/editor' )
					.isEditedPostDirty === 'function'
			);
		}
		function subscribe() {
			var lastDirty = null;
			function report() {
				try {
					var dirty = !! window.wp.data
						.select( 'core/editor' )
						.isEditedPostDirty();
					if ( dirty === lastDirty ) {
						return;
					}
					lastDirty = dirty;
					post( {
						type: 'wp-admin-workspaces-dirty-state',
						dirty: dirty,
					} );
				} catch ( _err ) { /* store gone mid-teardown — swallow */ }
			}
			try {
				// Scope the listener to core/editor so it fires only on
				// editor transitions, not every store mutation on a
				// heavy editor page (keystrokes, selection moves, REST
				// resolutions across all stores). Older wp.data ignores
				// the 2nd arg and subscribes globally — still correct,
				// just chattier. Not unsubscribed: the subscription
				// lives for the iframe document's lifetime.
				window.wp.data.subscribe( report, 'core/editor' );
				report();
			} catch ( _err ) { /* swallow */ }
		}
		if ( hasEditorStore() ) {
			subscribe();
			return;
		}
		var tries = 0;
		var timer = window.setInterval( function () {
			tries++;
			if ( hasEditorStore() ) {
				window.clearInterval( timer );
				subscribe();
			} else if ( tries > 40 ) {
				// ~10s at 250ms — not an editor page, stop polling.
				window.clearInterval( timer );
			}
		}, 250 );
	} )();
} )();
JS;

	wp_print_inline_script_tag( $js );
}
