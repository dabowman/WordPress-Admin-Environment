/**
 * Cart Summary Block - Frontend Interactivity
 * 
 * Imports the shared cart store and adds cart-summary specific functionality.
 */
import { store, getContext } from '@wordpress/interactivity';

// Import shared cart store
import '../shared-store.js';

// Cart summary specific store
store('shop/cart-summary', {
	callbacks: {
		/**
		 * Set the item index in context for data-wp-each items
		 * This is needed because data-wp-each doesn't automatically provide index
		 */
		setItemIndex() {
			const ctx = getContext();
			const { ref } = getElement();
			
			// Find index from sibling position
			if (ref && ref.parentElement) {
				const siblings = Array.from(ref.parentElement.children);
				ctx.itemIndex = siblings.indexOf(ref);
			}
		},
	},
});

// Need getElement for the callback
import { getElement } from '@wordpress/interactivity';
