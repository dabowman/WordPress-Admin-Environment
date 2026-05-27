/**
 * Basic Toggle Block - Frontend Interactivity
 */
import { store, getContext } from '@wordpress/interactivity';

store('NAMESPACE/toggle', {
	actions: {
		toggle() {
			const context = getContext();
			context.isOpen = !context.isOpen;
		},
	},
});
