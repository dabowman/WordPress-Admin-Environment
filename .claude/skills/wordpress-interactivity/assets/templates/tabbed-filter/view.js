/**
 * Tabbed Filter Posts Block - Client-side interactivity
 * 
 * Handles category filtering with URL updates.
 * Uses replace: true to avoid cluttering browser history with filter changes.
 */

import { 
    store, 
    getElement, 
    getServerState,
    withSyncEvent 
} from '@wordpress/interactivity';

const { state, actions } = store('myplugin/tabbed-filter', {
    state: {
        activeCategory: '',
        isFiltering: false,
        postCount: 0,
    },

    actions: {
        /**
         * Apply a category filter
         * 
         * Navigates to filtered URL, replacing current history entry
         * so back button returns to pre-filter state.
         */
        applyFilter: withSyncEvent(function* (event) {
            event.preventDefault();
            
            const href = event.target.closest('a')?.href;
            if (!href) return;
            
            state.isFiltering = true;
            
            try {
                const { actions: routerActions } = yield import('@wordpress/interactivity-router');
                
                yield routerActions.navigate(href, {
                    // Replace history entry - don't add filter changes to history
                    replace: true,
                    // Use default loading animation
                    loadingAnimation: true,
                });
                
                // Sync state from server
                const serverState = getServerState();
                if (serverState.activeCategory !== undefined) {
                    state.activeCategory = serverState.activeCategory;
                }
                if (serverState.postCount !== undefined) {
                    state.postCount = serverState.postCount;
                }
                
                // Announce filter change for screen readers
                actions.announceFilterChange();
                
            } catch (error) {
                console.error('Filter navigation failed:', error);
                // Fallback to full page navigation
                window.location.href = href;
            } finally {
                state.isFiltering = false;
            }
        }),

        /**
         * Prefetch filter results on hover
         * 
         * Uses async function since we don't need sync event access
         */
        prefetchFilter: async () => {
            const { ref } = getElement();
            const href = ref.closest('a')?.href;
            
            if (!href) return;
            
            try {
                const { actions: routerActions } = await import('@wordpress/interactivity-router');
                routerActions.prefetch(href);
            } catch (error) {
                // Prefetch failure is non-critical
            }
        },

        /**
         * Announce filter change for accessibility
         */
        announceFilterChange() {
            const category = state.activeCategory || 'all categories';
            const count = state.postCount;
            const message = `Showing ${count} posts in ${category}`;
            
            const announcer = document.getElementById('wp-a11y-speak-polite');
            if (announcer) {
                announcer.textContent = message;
            }
        },
    },

    callbacks: {
        /**
         * Update active tab styling based on URL
         * 
         * Called after navigation to ensure correct tab is highlighted
         */
        syncActiveTab() {
            const serverState = getServerState();
            if (serverState.activeCategory !== undefined) {
                state.activeCategory = serverState.activeCategory;
            }
        },
    },
});

// Handle keyboard navigation between tabs
document.addEventListener('keydown', (event) => {
    const target = event.target;
    
    // Only handle if focus is on a filter tab
    if (!target.classList.contains('filter-tab')) return;
    
    const tabs = Array.from(document.querySelectorAll('.filter-tab'));
    const currentIndex = tabs.indexOf(target);
    
    let newIndex = currentIndex;
    
    switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
            newIndex = (currentIndex + 1) % tabs.length;
            break;
        case 'ArrowLeft':
        case 'ArrowUp':
            newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            break;
        case 'Home':
            newIndex = 0;
            break;
        case 'End':
            newIndex = tabs.length - 1;
            break;
        default:
            return;
    }
    
    event.preventDefault();
    tabs[newIndex].focus();
});
