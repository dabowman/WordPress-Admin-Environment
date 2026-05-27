/**
 * Product Card Block - Frontend Interactivity
 * 
 * Imports the shared cart store for add-to-cart functionality.
 * The cart store is defined in ../shared-store.js
 */
import { store } from '@wordpress/interactivity';

// Import shared cart store - this merges with existing store
import '../shared-store.js';

// Product card specific store (optional - for product-specific features)
store('shop/product-card', {
	// Product-specific state and actions can go here
	// The cart functionality comes from shop/cart namespace
});
