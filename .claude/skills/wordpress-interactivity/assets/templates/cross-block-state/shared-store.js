/**
 * Shared Cart Store
 * 
 * This store is shared across multiple blocks (product-card, cart-summary, etc.)
 * Import this file in any block that needs cart functionality.
 * 
 * Namespace: shop/cart
 */
import { store, getContext } from '@wordpress/interactivity';

export const { state, actions } = store('shop/cart', {
	state: {
		items: [],
		isCartOpen: false,
		
		// Derived state
		get itemCount() {
			return state.items.length;
		},
		
		get uniqueItemCount() {
			return new Set(state.items.map(item => item.id)).size;
		},
		
		get subtotal() {
			return state.items.reduce((sum, item) => sum + item.price, 0);
		},
		
		get total() {
			// Add tax, shipping, etc. here
			return state.subtotal;
		},
		
		get formattedTotal() {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
			}).format(state.total);
		},
		
		get isEmpty() {
			return state.items.length === 0;
		},
		
		// Context-aware: check if current product is in cart
		get isInCart() {
			const { productId } = getContext();
			return state.items.some(item => item.id === productId);
		},
		
		// Context-aware: get quantity of current product
		get currentProductQuantity() {
			const { productId } = getContext();
			return state.items.filter(item => item.id === productId).length;
		},
	},

	actions: {
		/**
		 * Add product to cart
		 * Expects context to have: productId, productName, productPrice, productImage
		 */
		addToCart() {
			const context = getContext();
			
			const item = {
				id: context.productId,
				name: context.productName,
				price: context.productPrice,
				image: context.productImage,
				addedAt: Date.now(),
			};
			
			// Immutable update
			state.items = [...state.items, item];
			
			// Open cart drawer
			state.isCartOpen = true;
		},

		/**
		 * Remove item from cart by index
		 */
		removeFromCart() {
			const { itemIndex } = getContext();
			state.items = state.items.filter((_, i) => i !== itemIndex);
		},

		/**
		 * Remove all instances of a product
		 */
		removeProduct() {
			const { productId } = getContext();
			state.items = state.items.filter(item => item.id !== productId);
		},

		/**
		 * Clear entire cart
		 */
		clearCart() {
			state.items = [];
		},

		/**
		 * Toggle cart drawer
		 */
		toggleCart() {
			state.isCartOpen = !state.isCartOpen;
		},

		/**
		 * Open cart drawer
		 */
		openCart() {
			state.isCartOpen = true;
		},

		/**
		 * Close cart drawer
		 */
		closeCart() {
			state.isCartOpen = false;
		},
	},
});
