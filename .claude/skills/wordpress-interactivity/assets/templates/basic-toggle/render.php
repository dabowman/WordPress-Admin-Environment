<?php
/**
 * Basic Toggle Block - Server-side render
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content.
 * @var WP_Block $block      Block instance.
 */

$button_text = $attributes['buttonText'] ?? 'Toggle';
$start_open  = $attributes['startOpen'] ?? false;

$context = array(
	'isOpen' => $start_open,
);
?>

<div
	data-wp-interactive="NAMESPACE/toggle"
	<?php echo wp_interactivity_data_wp_context( $context ); ?>
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-toggle' ) ); ?>
>
	<button
		class="wp-block-toggle__button"
		data-wp-on-async--click="actions.toggle"
		data-wp-bind--aria-expanded="context.isOpen"
		data-wp-class--is-active="context.isOpen"
		type="button"
	>
		<span data-wp-text="context.isOpen ? 'Hide' : '<?php echo esc_attr( $button_text ); ?>'"></span>
		<span class="wp-block-toggle__icon" aria-hidden="true">
			<span data-wp-text="context.isOpen ? '−' : '+'"></span>
		</span>
	</button>

	<div
		class="wp-block-toggle__content"
		data-wp-bind--hidden="!context.isOpen"
		data-wp-class--is-visible="context.isOpen"
	>
		<?php echo $content; ?>
	</div>
</div>
