# core:notices-snackbar

Prose accompanying `app.json#documentation` for the snackbar notice host.

## Overview

NoticesSnackbarApp is the transient sibling of `core:notices-banner`. Same underlying notice bus (`@wordpress/notices`); different filter (`type: 'snackbar'`); different visual primitive (`SnackbarList` — stacked auto-dismissing pills at the bottom of the screen).

The split between banner + snackbar maps cleanly to WordPress's notice contexts: success confirmations ("Saved.") are snackbars; sticky errors ("Save failed: <reason>") are banners. Apps pick by passing `{ type: 'snackbar' }` or omitting (which defaults to `'default'`).

## Architecture

Trivial — `useSelect(getNotices)` + `useDispatch(removeNotice)`, filter to snackbar, hand the array to `SnackbarList`. The package owns positioning, auto-dismiss timing, and animation.

## Rebuild guide

`SnackbarList` is the only legacy import here because WPDS 0.12 ships no snackbar primitive. A non-WPDS rebuild can use:

- Material's `Snackbar` (single) + a stacking wrapper.
- Tailwind: roll a positioned container + `setTimeout` per snackbar; not as nice but works.
- Sonner / React Hot Toast / similar — drop-in if your stack permits.

The contract is: stacked toasts at a screen edge, auto-dismiss with click-to-dismiss-earlier. Match the notice-bus filter so banner + snackbar share the bus.

## Known limitations

- **Single host per shell.** Two snackbar hosts would render notices twice.
- **No undo affordance.** `SnackbarList` supports per-snackbar actions; the shell doesn't expose this. A future trash-with-undo flow would need it.
- **Position is fixed by SnackbarList.** Bottom-center; not configurable.
- **Auto-dismiss timing is the package default.** Not per-notice customizable through the shell.
