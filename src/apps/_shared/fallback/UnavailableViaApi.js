import { useState, useCallback, useEffect, useRef } from '@wordpress/element';
import { Button, Stack, Text, Notice } from '@wordpress/ui';
import { __, sprintf } from '@wordpress/i18n';
import { buildOptionCliCommand } from './buildOptionCliCommand.mjs';
import './index.css';

/**
 * Tiered "no-API fallback" affordance for wp-admin capabilities that have no
 * REST surface. Renders three tiers, degrading by reach:
 *
 * 1. Classic-screen link — a plain `<a href>` handled by the capture-phase
 *    admin-link interceptor / `legacy_path` routing. The universal floor.
 * 2. Copy-paste WP-CLI command — pre-filled with the option name + value (or
 *    the given `command`). Always uses `wp option update`, never raw SQL.
 * 3. Agent prompt — an advisory paste-to-agent instruction. No privileged
 *    execution from the workspace.
 *
 * Two shapes:
 *
 * - `kind="option"` — for writable WordPress options. Pre-fills the CLI
 *   command with the value the user entered so they don't have to retype it.
 *   `agentPrompt` defaults to a sensible instruction if omitted.
 *
 * - `kind="action"` — for non-option capabilities (session destroy, password
 *   reset, etc.). The caller supplies the full `command` string and, if
 *   relevant, an explicit `agentPrompt`.
 *
 * @param {Object} root0
 * @param {string} root0.kind          `"option"` | `"action"`.
 * @param {string} [root0.name]        Option name (kind="option" only).
 * @param {string} [root0.value]       Current / entered value (kind="option" only).
 * @param {string} [root0.command]     Full CLI command (kind="action" only, or
 *                                     overrides the generated command in kind="option").
 * @param {string} [root0.agentPrompt] Paste-to-agent instruction. Defaults to a
 *                                     sensible string when omitted for kind="option".
 * @param {string} root0.classicPath   Classic wp-admin path, e.g. `options-writing.php`.
 *                                     The capture-phase interceptor maps it to a workspace
 *                                     route when available, or passes through to classic.
 * @param {string} [root0.label]       Human-readable text for the classic-screen link.
 *                                     Defaults to a generic "Open the classic screen" string
 *                                     when omitted — the raw `classicPath` filename is never
 *                                     used as visible/accessible link text (it's meaningless
 *                                     to a screen reader). The filename rides the anchor's
 *                                     `title` attribute instead.
 * @return {JSX.Element} The fallback affordance.
 */
export function UnavailableViaApi( {
	kind,
	name,
	value,
	command,
	agentPrompt,
	classicPath,
	label,
} ) {
	const [ copied, setCopied ] = useState( false );
	const [ agentCopied, setAgentCopied ] = useState( false );

	// Track the "Copied!" reset timers so they can be cleared on unmount —
	// without this, a state update can fire after the component is gone.
	const cliTimerRef = useRef();
	const agentTimerRef = useRef();
	useEffect( () => {
		return () => {
			clearTimeout( cliTimerRef.current );
			clearTimeout( agentTimerRef.current );
		};
	}, [] );

	// Tier 2: CLI command —————————————————————————————————————————————————
	// For kind="option" we generate the command from name + value unless the
	// caller overrides it. For kind="action" the caller always supplies it.
	const cliCommand =
		command ??
		( kind === 'option' && name !== undefined
			? buildOptionCliCommand( name, String( value ?? '' ) )
			: '' );

	// Tier 3: Agent prompt ————————————————————————————————————————————————
	// Default for kind="option" is a self-explanatory instruction that names
	// the specific wp option update command so the agent doesn't have to infer.
	const resolvedAgentPrompt =
		agentPrompt ??
		( kind === 'option' && name !== undefined
			? sprintf(
					/* translators: 1: option name, 2: option value */
					__(
						'Set the WordPress option `%1$s` to `%2$s` using `wp option update`.',
						'wp-admin-workspaces'
					),
					name,
					String( value ?? '' )
			  )
			: '' );

	const handleCopyCli = useCallback( async () => {
		// `navigator.clipboard` is undefined on insecure (HTTP) origins, so
		// guard before touching `.writeText` — otherwise this throws a
		// synchronous TypeError. The command stays visible in the <code>
		// element for manual selection when the API is unavailable.
		if ( ! cliCommand || ! navigator.clipboard ) {
			return;
		}
		try {
			await navigator.clipboard.writeText( cliCommand );
			setCopied( true );
			clearTimeout( cliTimerRef.current );
			cliTimerRef.current = setTimeout( () => setCopied( false ), 2000 );
		} catch {
			// Clipboard access denied — silently ignore; the command is still
			// visible in the <code> element for manual selection.
		}
	}, [ cliCommand ] );

	const handleCopyAgent = useCallback( async () => {
		if ( ! resolvedAgentPrompt || ! navigator.clipboard ) {
			return;
		}
		try {
			await navigator.clipboard.writeText( resolvedAgentPrompt );
			setAgentCopied( true );
			clearTimeout( agentTimerRef.current );
			agentTimerRef.current = setTimeout(
				() => setAgentCopied( false ),
				2000
			);
		} catch {
			// Clipboard access denied — silently ignore; the prompt is still
			// visible for manual selection.
		}
	}, [ resolvedAgentPrompt ] );

	// Build the classic-screen href. The capture-phase admin-link interceptor
	// (`src/runtime/navigation/adminLinkInterceptor`) inspects real <a href>
	// clicks and maps /wp-admin/... hrefs to workspace routes via legacy_path.
	// Using a real anchor (not window.location.assign) is required so the
	// interceptor sees the click.
	//
	// Derive the admin base from `window.wpAdminWorkspaces.adminUrl` (the same
	// global the interceptor reads) so sites running wp-admin under a custom
	// path still resolve; fall back to `/wp-admin/` only if absent. Join with
	// a single slash so neither side double-slashes.
	const adminBase = (
		window.wpAdminWorkspaces?.adminUrl || '/wp-admin/'
	).replace( /\/+$/, '' );
	const classicHref = classicPath
		? `${ adminBase }/${ classicPath.replace( /^\/+/, '' ) }`
		: `${ adminBase }/`;

	// Human-readable link text. Never render the raw `classicPath` filename
	// (e.g. `options-writing.php`) as the accessible name — it's meaningless to
	// a screen reader. The filename rides the anchor's `title` attribute.
	//
	// The kind-derived default is settings-flavored for kind="option" and
	// neutral for kind="action"; an explicit `label` prop always wins.
	const classicLabel =
		label ||
		( kind === 'option'
			? __( 'Open the classic settings screen', 'wp-admin-workspaces' )
			: __( 'Open the classic screen', 'wp-admin-workspaces' ) );

	// Lead-in explanation, also kind-aware: settings-flavored for kind="option",
	// neutral for kind="action".
	const leadIn =
		kind === 'option'
			? __(
					'This setting isn’t writable through the workspace API. Use one of the options below to make the change.',
					'wp-admin-workspaces'
			  )
			: __(
					'This change isn’t available through the workspace API. Use one of the options below to make the change.',
					'wp-admin-workspaces'
			  );

	return (
		<div className="wp-admin-workspaces-unavailable-via-api">
			{ /* The Notice.Root carries ONLY the short inline explanation
			     lead-in. With intent="info" the notice renders role="status"
			     (an aria-live="polite" region), so it must stay free of
			     interactive content and of any nested aria-live region. The
			     three tiers below — including their own per-button
			     aria-live="polite" "Copied!" spans — live in a SIBLING
			     <section> OUTSIDE this live region. */ }
			<Notice.Root intent="info">
				<Notice.Description>{ leadIn }</Notice.Description>
			</Notice.Root>

			{ /* Interactive tiers — a plain styled container, NOT a live
			     region. This is where the value preview, classic-screen link,
			     WP-CLI command + Copy button, and agent prompt + Copy button
			     live, so the inner aria-live="polite" status spans are the
			     ONLY live regions in the tree. */ }
			<section className="wp-admin-workspaces-unavailable-via-api__tiers">
				<Stack direction="column" gap="md">
					{ /* Show the entered value when kind="option" so the user
					     can confirm what they were about to save. */ }
					{ kind === 'option' &&
						value !== undefined &&
						value !== '' && (
							<Text variant="body-sm">
								<strong>
									{ __( 'Value:', 'wp-admin-workspaces' ) }
								</strong>{ ' ' }
								<code className="wp-admin-workspaces-unavailable-via-api__code">
									{ String( value ) }
								</code>
							</Text>
						) }

					{ /* Tier 1 — Classic screen link */ }
					<Stack direction="column" gap="xs">
						<Text variant="body-sm">
							<strong>
								{ __(
									'Classic screen',
									'wp-admin-workspaces'
								) }
							</strong>{ ' ' }
							{ kind === 'option'
								? __(
										'Open the classic settings screen',
										'wp-admin-workspaces'
								  )
								: __(
										'Open the classic screen',
										'wp-admin-workspaces'
								  ) }
						</Text>
						{ /* Plain <a href> — the interceptor handles routing.
						     The visible/accessible text is a human-readable
						     label; the raw path filename rides the `title`
						     attribute. */ }
						<a
							href={ classicHref }
							title={ classicPath || undefined }
						>
							{ classicLabel }
						</a>
					</Stack>

					{ /* Tier 2 — WP-CLI copy-paste */ }
					{ cliCommand && (
						<Stack direction="column" gap="xs">
							<Text variant="body-sm">
								<strong>
									{ __( 'WP-CLI', 'wp-admin-workspaces' ) }
								</strong>{ ' ' }
								{ __(
									'Run this WP-CLI command',
									'wp-admin-workspaces'
								) }
							</Text>
							<Stack direction="row" gap="sm" align="center">
								<code className="wp-admin-workspaces-unavailable-via-api__code">
									{ cliCommand }
								</code>
								<Button
									variant="outline"
									tone="neutral"
									size="compact"
									onClick={ handleCopyCli }
								>
									{ copied
										? __( 'Copied!', 'wp-admin-workspaces' )
										: __( 'Copy', 'wp-admin-workspaces' ) }
								</Button>
								{ /* sr-only live region so assistive tech
								     hears the copy succeed — the button label
								     flip is visual-only. */ }
								<span
									className="wp-admin-workspaces-unavailable-via-api__status"
									aria-live="polite"
								>
									{ copied
										? __(
												'Command copied to clipboard',
												'wp-admin-workspaces'
										  )
										: '' }
								</span>
							</Stack>
						</Stack>
					) }

					{ /* Tier 3 — Agent prompt */ }
					{ resolvedAgentPrompt && (
						<Stack direction="column" gap="xs">
							<Text variant="body-sm">
								<strong>
									{ __(
										'Coding agent',
										'wp-admin-workspaces'
									) }
								</strong>{ ' ' }
								{ __(
									'Paste this prompt into your coding agent',
									'wp-admin-workspaces'
								) }
							</Text>
							<Stack direction="row" gap="sm" align="center">
								<span className="wp-admin-workspaces-unavailable-via-api__agent-prompt">
									{ resolvedAgentPrompt }
								</span>
								<Button
									variant="outline"
									tone="neutral"
									size="compact"
									onClick={ handleCopyAgent }
								>
									{ agentCopied
										? __( 'Copied!', 'wp-admin-workspaces' )
										: __( 'Copy', 'wp-admin-workspaces' ) }
								</Button>
								{ /* sr-only live region so assistive tech
								     hears the copy succeed — the button label
								     flip is visual-only. */ }
								<span
									className="wp-admin-workspaces-unavailable-via-api__status"
									aria-live="polite"
								>
									{ agentCopied
										? __(
												'Prompt copied to clipboard',
												'wp-admin-workspaces'
										  )
										: '' }
								</span>
							</Stack>
						</Stack>
					) }
				</Stack>
			</section>
		</div>
	);
}
