<?php
/**
 * Cart Summary Block - Server-side render
 * Displays cart contents from shared shop/cart store
 */
?>

<aside
	data-wp-interactive="shop/cart-summary"
	<?php echo get_block_wrapper_attributes( array( 'class' => 'wp-block-cart-summary' ) ); ?>
>
	<!-- Cart Toggle Button -->
	<button
		class="wp-block-cart-summary__toggle"
		data-wp-on-async--click="shop/cart::actions.toggleCart"
		type="button"
		aria-label="Toggle cart"
	>
		<span class="wp-block-cart-summary__icon">🛒</span>
		<span
			class="wp-block-cart-summary__count"
			data-wp-text="shop/cart::state.itemCount"
			data-wp-bind--hidden="shop/cart::state.isEmpty"
		></span>
	</button>

	<!-- Cart Drawer -->
	<div
		class="wp-block-cart-summary__drawer"
		data-wp-class--is-open="shop/cart::state.isCartOpen"
		data-wp-bind--hidden="!shop/cart::state.isCartOpen"
	>
		<header class="wp-block-cart-summary__header">
			<h2 class="wp-block-cart-summary__title">Your Cart</h2>
			<button
				class="wp-block-cart-summary__close"
				data-wp-on-async--click="shop/cart::actions.closeCart"
				type="button"
				aria-label="Close cart"
			>
				×
			</button>
		</header>

		<!-- Empty State -->
		<div
			class="wp-block-cart-summary__empty"
			data-wp-bind--hidden="!shop/cart::state.isEmpty"
		>
			<p>Your cart is empty</p>
		</div>

		<!-- Cart Items -->
		<ul
			class="wp-block-cart-summary__items"
			data-wp-bind--hidden="shop/cart::state.isEmpty"
		>
			<template data-wp-each--item="shop/cart::state.items">
				<li
					class="wp-block-cart-summary__item"
					data-wp-context='{"itemIndex": 0}'
					data-wp-init="callbacks.setItemIndex"
				>
					<img
						class="wp-block-cart-summary__item-image"
						data-wp-bind--src="context.item.image"
						data-wp-bind--alt="context.item.name"
					/>
					<div class="wp-block-cart-summary__item-details">
						<span
							class="wp-block-cart-summary__item-name"
							data-wp-text="context.item.name"
						></span>
						<span
							class="wp-block-cart-summary__item-price"
							data-wp-text="'$' + context.item.price.toFixed(2)"
						></span>
					</div>
					<button
						class="wp-block-cart-summary__remove"
						data-wp-on-async--click="shop/cart::actions.removeFromCart"
						type="button"
						aria-label="Remove item"
					>
						×
					</button>
				</li>
			</template>
		</ul>

		<!-- Cart Footer -->
		<footer
			class="wp-block-cart-summary__footer"
			data-wp-bind--hidden="shop/cart::state.isEmpty"
		>
			<div class="wp-block-cart-summary__total">
				<span>Total:</span>
				<span data-wp-text="shop/cart::state.formattedTotal"></span>
			</div>
			<button
				class="wp-block-cart-summary__checkout"
				type="button"
			>
				Checkout
			</button>
			<button
				class="wp-block-cart-summary__clear"
				data-wp-on-async--click="shop/cart::actions.clearCart"
				type="button"
			>
				Clear Cart
			</button>
		</footer>
	</div>
</aside>
