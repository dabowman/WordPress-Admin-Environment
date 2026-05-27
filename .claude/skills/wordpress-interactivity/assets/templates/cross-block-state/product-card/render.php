<?php
/**
 * Product Card Block - Server-side render
 * Uses shared shop/cart store for cart functionality
 */

$product_id    = $attributes['productId'] ?? 0;
$product_name  = $attributes['productName'] ?? 'Product';
$product_price = $attributes['productPrice'] ?? 0;
$product_image = $attributes['productImage'] ?? '';

// Context provides product data to the shared store actions
$context = array(
	'productId'    => $product_id,
	'productName'  => $product_name,
	'productPrice' => $product_price,
	'productImage' => $product_image,
);

// Format price for display
$formatted_price = number_format( $product_price, 2 );
?>

<article
	data-wp-interactive="shop/product-card"
	<?php echo wp_interactivity_data_wp_context( $context ); ?>
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-product-card' ) ); ?>
>
	<?php if ( $product_image ) : ?>
		<img
			src="<?php echo esc_url( $product_image ); ?>"
			alt="<?php echo esc_attr( $product_name ); ?>"
			class="wp-block-product-card__image"
		/>
	<?php endif; ?>

	<div class="wp-block-product-card__content">
		<h3 class="wp-block-product-card__title">
			<?php echo esc_html( $product_name ); ?>
		</h3>
		
		<p class="wp-block-product-card__price">
			$<?php echo esc_html( $formatted_price ); ?>
		</p>

		<!-- Uses shared cart store via cross-namespace reference -->
		<button
			class="wp-block-product-card__add-to-cart"
			data-wp-on-async--click="shop/cart::actions.addToCart"
			data-wp-class--is-in-cart="shop/cart::state.isInCart"
			type="button"
		>
			<span data-wp-text="shop/cart::state.isInCart ? 'In Cart (' + shop/cart::state.currentProductQuantity + ')' : 'Add to Cart'"></span>
		</button>
	</div>
</article>
