/**
 * Filter Search Block - Frontend Interactivity
 * 
 * Features:
 * - Debounced search input
 * - Async REST API fetching
 * - Loading and error states
 * - data-wp-each for results
 */
import { store } from '@wordpress/interactivity';

let debounceTimer = null;
let abortController = null;

const { state } = store('NAMESPACE/filter-search', {
	state: {
		// Derived: check if search term meets minimum
		get canSearch() {
			return state.searchTerm.length >= state.minChars;
		},
		
		// Derived: result count for screen readers
		get resultCount() {
			return state.results.length;
		},
	},

	actions: {
		handleSearch(event) {
			const query = event.target.value.trim();
			state.searchTerm = query;
			state.error = null;
			
			// Clear previous debounce
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			
			// Abort previous request
			if (abortController) {
				abortController.abort();
			}
			
			// Clear results if below minimum
			if (query.length < state.minChars) {
				state.results = [];
				state.hasSearched = false;
				state.isSearching = false;
				return;
			}
			
			// Debounce search
			debounceTimer = setTimeout(() => {
				// Use generator for async with scope preservation
				store('NAMESPACE/filter-search').actions.performSearch();
			}, 300);
		},

		/**
		 * Perform the actual search
		 * Using generator function for proper async scope handling
		 */
		*performSearch() {
			if (!state.canSearch) return;
			
			state.isSearching = true;
			state.error = null;
			
			// Create new abort controller for this request
			abortController = new AbortController();
			
			try {
				const url = new URL(state.restUrl);
				url.searchParams.set('search', state.searchTerm);
				url.searchParams.set('per_page', '10');
				url.searchParams.set('_embed', 'true');
				
				const response = yield fetch(url.toString(), {
					signal: abortController.signal,
					headers: {
						'Content-Type': 'application/json',
					},
				});
				
				if (!response.ok) {
					throw new Error(`Search failed: ${response.status}`);
				}
				
				const data = yield response.json();
				state.results = data;
				state.hasSearched = true;
			} catch (error) {
				// Ignore abort errors
				if (error.name === 'AbortError') {
					return;
				}
				
				state.error = 'Search failed. Please try again.';
				state.results = [];
				console.error('Search error:', error);
			} finally {
				state.isSearching = false;
				abortController = null;
			}
		},

		/**
		 * Clear search and results
		 */
		clearSearch() {
			state.searchTerm = '';
			state.results = [];
			state.hasSearched = false;
			state.error = null;
			
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			if (abortController) {
				abortController.abort();
			}
		},
	},
});
