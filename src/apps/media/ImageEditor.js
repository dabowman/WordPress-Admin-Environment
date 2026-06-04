import { useState, useRef, useEffect, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Button, Icon, Notice, Stack, Text } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import {
	rotateLeft,
	rotateRight,
	flipHorizontal,
	flipVertical,
	crop as cropIcon,
} from '@wordpress/icons';
import {
	rotateBy,
	buildModifiers,
	hasPendingEdits,
	displayDimensions,
	moveCrop,
	resizeCrop,
} from './imageEditorModel.mjs';

const FULL_CROP = { left: 0, top: 0, width: 100, height: 100 };
const CORNER_HANDLES = [ 'nw', 'ne', 'sw', 'se' ];

// The `/edit` `modifiers[]` enum only gained `flip` in WP 6.9; on 6.7/6.8 a
// flip emits `rest_invalid_param` and (per-item validation) fails the whole
// edit. PHP exposes the version signal so we hide the flip tools below 6.9 —
// crop / rotate work everywhere. Default to `false` (hide) when the flag is
// absent, so a stale/partial config never emits an edit the server rejects.
const SUPPORTS_FLIP = !! window.wpAdminWorkspaces?.supportsImageFlip;

/**
 * Inline image editor (#125) — crop / rotate / flip an attachment image and save
 * the result via `POST /wp/v2/media/{id}/edit`.
 *
 * Lives in the `MediaDetails` preview slot as its own sibling sub-component
 * (host-agnostic: renders in the details modal today, a region / inspector pane
 * later — see `docs/dataviews-interaction-patterns.md`). It owns only the canvas
 * preview + the transform controls; the **REST contract** (turning rotation /
 * flip / crop into the ordered `modifiers[]` array) is factored into the pure,
 * node-tested `imageEditorModel.mjs`.
 *
 * **Saves as a NEW attachment.** The `/edit` route always creates a brand-new
 * attachment (`unset($post->ID); wp_insert_attachment(...)` — there is no
 * in-place REST mode; see `docs/parity/media.md` blocker #1). So the editor's
 * success path hands the *new* attachment up via `onSaved(newAttachment)` and
 * the host re-points its references (the details host switches to the new id).
 * The UI says so explicitly ("Saves a copy — the original is kept").
 *
 * **Preview fidelity.** The canvas composes rotate → flip → crop in the SAME
 * order the controller applies the modifiers, so what the user sees is what the
 * server produces. The crop overlay's percentages are read against the canvas
 * (which carries the post-rotation bounding box), exactly the basis the
 * controller multiplies its crop percentages against.
 *
 * @param {Object}   root0
 * @param {Object}   root0.record   The image attachment entity record.
 * @param {Function} root0.onCancel Called to leave the editor without saving.
 * @param {Function} root0.onSaved  Called with the NEW attachment after a save.
 * @return {JSX.Element} The editor.
 */
export default function ImageEditor( { record, onCancel, onSaved } ) {
	const src = record?.source_url;
	const canvasRef = useRef();
	const stageRef = useRef();
	const imageRef = useRef( null );

	const [ natural, setNatural ] = useState( null );
	const [ rotation, setRotation ] = useState( 0 );
	const [ flipH, setFlipH ] = useState( false );
	const [ flipV, setFlipV ] = useState( false );
	const [ crop, setCrop ] = useState( null );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ error, setError ] = useState( null );

	// Load the source into an off-DOM Image so the canvas has pixel data + the
	// natural dimensions. No crossOrigin: we only DRAW to the canvas (never read
	// pixels back), so a tainted canvas still displays — CDN-hosted media works.
	useEffect( () => {
		if ( ! src ) {
			return undefined;
		}
		const img = new window.Image();
		img.onload = () => {
			imageRef.current = img;
			setNatural( {
				width: img.naturalWidth,
				height: img.naturalHeight,
			} );
		};
		img.onerror = () =>
			setError(
				__( 'Could not load the image to edit.', 'wp-admin-workspaces' )
			);
		img.src = src;
		return () => {
			img.onload = null;
			img.onerror = null;
		};
	}, [ src ] );

	// Repaint the canvas on every transform change. Sized to the post-rotation
	// bounding box; rotate (inner) then flip (outer) so a point is rotated first
	// and mirrored second — matching the controller's rotate→flip order.
	useEffect( () => {
		const canvas = canvasRef.current;
		const img = imageRef.current;
		if ( ! canvas || ! img || ! natural ) {
			return;
		}
		const { width, height } = displayDimensions(
			natural.width,
			natural.height,
			rotation
		);
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext( '2d' );
		ctx.clearRect( 0, 0, width, height );
		ctx.save();
		ctx.translate( width / 2, height / 2 );
		ctx.scale( flipH ? -1 : 1, flipV ? -1 : 1 );
		ctx.rotate( ( rotation * Math.PI ) / 180 );
		ctx.drawImage( img, -natural.width / 2, -natural.height / 2 );
		ctx.restore();
	}, [ natural, rotation, flipH, flipV ] );

	const cropActive = crop !== null;

	const toggleCrop = useCallback( () => {
		setCrop( ( current ) => ( current ? null : { ...FULL_CROP } ) );
	}, [] );

	const onSave = useCallback( async () => {
		const modifiers = buildModifiers( { rotation, flipH, flipV, crop } );
		if ( ! modifiers.length ) {
			return;
		}
		setIsSaving( true );
		setError( null );
		try {
			const result = await apiFetch( {
				path: `/wp/v2/media/${ record.id }/edit`,
				method: 'POST',
				data: { src: record.source_url, modifiers },
			} );
			onSaved?.( result );
		} catch ( err ) {
			setError(
				err?.message ||
					__(
						'Failed to save the edited image.',
						'wp-admin-workspaces'
					)
			);
		} finally {
			setIsSaving( false );
		}
	}, [ rotation, flipH, flipV, crop, record, onSaved ] );

	const canSave =
		! isSaving && hasPendingEdits( { rotation, flipH, flipV, crop } );

	return (
		<div className="wp-admin-workspaces-app-media__editor">
			<div className="wp-admin-workspaces-app-media__editor-stage">
				{ natural ? (
					// The frame hugs the canvas (shrink-to-fit) so the crop
					// overlay's percentages — and the drag basis (`stageRef`) —
					// align to the image, not the wider centering stage.
					<div
						className="wp-admin-workspaces-app-media__editor-frame"
						ref={ stageRef }
					>
						<canvas
							ref={ canvasRef }
							className="wp-admin-workspaces-app-media__editor-canvas"
						/>
						{ cropActive && (
							<CropOverlay
								crop={ crop }
								stageRef={ stageRef }
								onChange={ setCrop }
							/>
						) }
					</div>
				) : (
					<div className="wp-admin-workspaces-app__center">
						<Spinner />
					</div>
				) }
			</div>

			<Stack
				direction="row"
				gap="xs"
				wrap="wrap"
				className="wp-admin-workspaces-app-media__editor-tools"
			>
				<ToolButton
					icon={ rotateLeft }
					label={ __( 'Rotate left', 'wp-admin-workspaces' ) }
					onClick={ () => setRotation( ( r ) => rotateBy( r, -90 ) ) }
				/>
				<ToolButton
					icon={ rotateRight }
					label={ __( 'Rotate right', 'wp-admin-workspaces' ) }
					onClick={ () => setRotation( ( r ) => rotateBy( r, 90 ) ) }
				/>
				{ SUPPORTS_FLIP && (
					<>
						<ToolButton
							icon={ flipHorizontal }
							label={ __(
								'Flip horizontal',
								'wp-admin-workspaces'
							) }
							isToggle
							pressed={ flipH }
							onClick={ () => setFlipH( ( v ) => ! v ) }
						/>
						<ToolButton
							icon={ flipVertical }
							label={ __(
								'Flip vertical',
								'wp-admin-workspaces'
							) }
							isToggle
							pressed={ flipV }
							onClick={ () => setFlipV( ( v ) => ! v ) }
						/>
					</>
				) }
				<ToolButton
					icon={ cropIcon }
					label={ __( 'Crop', 'wp-admin-workspaces' ) }
					isToggle
					pressed={ cropActive }
					onClick={ toggleCrop }
				/>
			</Stack>

			{ error && (
				<Notice.Root intent="error">
					<Notice.Description>{ error }</Notice.Description>
				</Notice.Root>
			) }

			<Text variant="body-sm" className="wp-admin-workspaces-app__muted">
				{ __(
					'Saves a copy — the original attachment is kept.',
					'wp-admin-workspaces'
				) }
			</Text>

			<Stack direction="row" gap="sm" justify="flex-end">
				<Button
					tone="neutral"
					variant="minimal"
					onClick={ onCancel }
					size="compact"
				>
					{ __( 'Cancel', 'wp-admin-workspaces' ) }
				</Button>
				<Button
					tone="brand"
					variant="solid"
					onClick={ onSave }
					loading={ isSaving }
					disabled={ ! canSave }
					size="compact"
				>
					{ __( 'Save a copy', 'wp-admin-workspaces' ) }
				</Button>
			</Stack>
		</div>
	);
}

/**
 * A square icon tool button with an accessible label and an optional pressed
 * (toggled) state. `@wordpress/ui` `Button` has no `icon`/`label` props in 0.12,
 * so the icon is a child and the label rides `aria-label`. `aria-pressed` is
 * emitted ONLY for genuine toggles (flip / crop) — the momentary rotate buttons
 * pass `isToggle={ false }` so a screen reader doesn't announce them as toggle
 * buttons stuck in the "not pressed" state.
 *
 * @param {Object}   root0
 * @param {Object}   root0.icon       Icon element to render.
 * @param {string}   root0.label      Accessible label.
 * @param {Function} root0.onClick    Click handler.
 * @param {boolean}  [root0.isToggle] Whether the button is a toggle (emits `aria-pressed`).
 * @param {boolean}  [root0.pressed]  Toggle state (only meaningful when `isToggle`).
 * @return {JSX.Element} The button.
 */
function ToolButton( {
	icon,
	label,
	onClick,
	isToggle = false,
	pressed = false,
} ) {
	return (
		<Button
			tone="neutral"
			variant={ pressed ? 'solid' : 'outline' }
			size="compact"
			aria-label={ label }
			aria-pressed={ isToggle ? pressed : undefined }
			onClick={ onClick }
		>
			<Icon icon={ icon } size={ 18 } />
		</Button>
	);
}

/**
 * The crop selection overlaid on the canvas: a draggable box (move) with four
 * corner resize handles. All geometry is in percent of the stage, so it stays
 * aligned regardless of how the canvas is display-scaled, and the percentages
 * feed straight into the crop modifier. Pointer capture keeps a drag tracking
 * even when the cursor leaves the handle.
 *
 * @param {Object}   root0
 * @param {Object}   root0.crop     `{ left, top, width, height }` in percent.
 * @param {Object}   root0.stageRef Ref to the stage element (drag basis).
 * @param {Function} root0.onChange Receives the next crop on every drag step.
 * @return {JSX.Element} The overlay.
 */
function CropOverlay( { crop, stageRef, onChange } ) {
	const dragRef = useRef( null );

	const beginDrag = useCallback(
		( mode ) => ( event ) => {
			event.stopPropagation();
			event.currentTarget.setPointerCapture( event.pointerId );
			dragRef.current = {
				mode,
				startX: event.clientX,
				startY: event.clientY,
				startCrop: crop,
				rect: stageRef.current.getBoundingClientRect(),
			};
		},
		[ crop, stageRef ]
	);

	const onDrag = useCallback(
		( event ) => {
			const drag = dragRef.current;
			if ( ! drag || ! drag.rect.width || ! drag.rect.height ) {
				return;
			}
			const dxPct =
				( ( event.clientX - drag.startX ) / drag.rect.width ) * 100;
			const dyPct =
				( ( event.clientY - drag.startY ) / drag.rect.height ) * 100;
			onChange(
				drag.mode === 'move'
					? moveCrop( drag.startCrop, dxPct, dyPct )
					: resizeCrop( drag.mode, drag.startCrop, dxPct, dyPct )
			);
		},
		[ onChange ]
	);

	const endDrag = useCallback( ( event ) => {
		dragRef.current = null;
		try {
			event.currentTarget.releasePointerCapture( event.pointerId );
		} catch {
			// Pointer already released — nothing to do.
		}
	}, [] );

	const boxStyle = {
		left: `${ crop.left }%`,
		top: `${ crop.top }%`,
		width: `${ crop.width }%`,
		height: `${ crop.height }%`,
	};

	return (
		// `onDrag` / `endDrag` live on the box only; a handle drag's
		// `pointermove` / `pointerup` bubbles up to them (the handles are
		// children), so wiring them here too would fire each handler twice per
		// move. `beginDrag` stays per-element to distinguish move vs. resize.
		<div
			className="wp-admin-workspaces-app-media__crop-box"
			style={ boxStyle }
			onPointerDown={ beginDrag( 'move' ) }
			onPointerMove={ onDrag }
			onPointerUp={ endDrag }
			role="presentation"
		>
			{ CORNER_HANDLES.map( ( corner ) => (
				<span
					key={ corner }
					className={ `wp-admin-workspaces-app-media__crop-handle is-${ corner }` }
					onPointerDown={ beginDrag( corner ) }
					role="presentation"
				/>
			) ) }
		</div>
	);
}
