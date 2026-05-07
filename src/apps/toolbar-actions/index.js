import { IconButton, Stack } from '@wordpress/ui';

import { resolveIcon } from '../../runtime/config/iconMap';

/**
 * core:toolbar-actions — renders left + right action clusters in a
 * toolbar region. Each action is one of:
 *
 *   - { href, icon, label, external? } — link (in-shell when href
 *     starts with `#`; external when `external: true` opens in a new
 *     tab via target="_blank")
 *   - { command, icon, label }         — built-in command (currently
 *     `core/new-post` / `core/new-page`); resolved via a known-href map
 *
 * IconButton's `label` prop doubles as the assistive-tech label and
 * the tooltip. `render={<a/>}` swaps the underlying element for an
 * anchor so middle-click / Cmd-click / right-click → "Copy link"
 * work natively.
 */

const COMMAND_HREFS = {
	'core/new-post': '#/posts/new',
	'core/new-page': '#/pages/new',
};

export default function ToolbarActionsApp( { config = {} } ) {
	const left = Array.isArray( config.left ) ? config.left : [];
	const right = Array.isArray( config.right ) ? config.right : [];

	if ( ! left.length && ! right.length ) {
		return null;
	}

	return (
		<Stack direction="row" gap="md" align="center" style={ { flex: 1 } }>
			<Stack direction="row" gap="xs">
				{ left.map( ( action, i ) =>
					renderAction( action, `left-${ i }` )
				) }
			</Stack>

			<div style={ { flex: 1 } } />

			<Stack direction="row" gap="xs">
				{ right.map( ( action, i ) =>
					renderAction( action, `right-${ i }` )
				) }
			</Stack>
		</Stack>
	);
}

function renderAction( action, key ) {
	const href = action.href || COMMAND_HREFS[ action.command ];
	if ( ! href ) {
		return null;
	}
	const isExternal = !! action.external;
	return (
		<IconButton
			key={ key }
			tone="neutral"
			variant="minimal"
			size="compact"
			icon={ resolveIcon( action.icon ) }
			label={ action.label }
			render={
				<a
					href={ href }
					target={ isExternal ? '_blank' : undefined }
					rel={ isExternal ? 'noopener noreferrer' : undefined }
				/>
			}
		/>
	);
}
