<?php
/**
 * Modal Dialog Block - Server-side render
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content.
 * @var WP_Block $block      Block instance.
 */

$trigger_text = $attributes['triggerText'] ?? 'Open Modal';
$modal_title  = $attributes['modalTitle'] ?? 'Modal Title';
$modal_id     = wp_unique_id( 'modal-' );

$context = array(
	'isOpen'  => false,
	'modalId' => $modal_id,
);
?>

<div
	data-wp-interactive="NAMESPACE/modal"
	<?php echo wp_interactivity_data_wp_context( $context ); ?>
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-modal' ) ); ?>
>
	<!-- Trigger Button -->
	<button
		class="wp-block-modal__trigger"
		data-wp-on-async--click="actions.open"
		type="button"
		aria-haspopup="dialog"
	>
		<?php echo esc_html( $trigger_text ); ?>
	</button>

	<!-- Modal Dialog -->
	<dialog
		id="<?php echo esc_attr( $modal_id ); ?>"
		class="wp-block-modal__dialog"
		data-wp-bind--open="context.isOpen"
		data-wp-watch="callbacks.syncDialog"
		data-wp-on--close="actions.handleClose"
		data-wp-on-document--keydown="actions.handleKeydown"
		aria-labelledby="<?php echo esc_attr( $modal_id ); ?>-title"
	>
		<div class="wp-block-modal__content">
			<!-- Header -->
			<header class="wp-block-modal__header">
				<h2 
					id="<?php echo esc_attr( $modal_id ); ?>-title"
					class="wp-block-modal__title"
				>
					<?php echo esc_html( $modal_title ); ?>
				</h2>
				<button
					class="wp-block-modal__close"
					data-wp-on-async--click="actions.close"
					type="button"
					aria-label="Close modal"
				>
					<span aria-hidden="true">×</span>
				</button>
			</header>

			<!-- Body -->
			<div class="wp-block-modal__body">
				<?php echo $content; ?>
			</div>

			<!-- Footer (optional) -->
			<footer class="wp-block-modal__footer">
				<button
					class="wp-block-modal__button wp-block-modal__button--secondary"
					data-wp-on-async--click="actions.close"
					type="button"
				>
					Cancel
				</button>
				<button
					class="wp-block-modal__button wp-block-modal__button--primary"
					data-wp-on-async--click="actions.confirm"
					type="button"
				>
					Confirm
				</button>
			</footer>
		</div>
	</dialog>
</div>
