# core:notices-banner

Prose accompanying `app.json#documentation` for the persistent banner notice host.

## Overview

NoticesBannerApp consumes `@wordpress/notices` filtered to `type: 'default'` and renders each as a `Notice.Root`. The notice bus is the shell's primary cross-app messaging channel — apps fire `createNotice('error', message)` from anywhere; the banner host (mounted once per shell) surfaces them in the configured region.

No data ownership: the app is a renderer. State lives in `@wordpress/notices`; updates flow through `useSelect` + `useDispatch`.

## Rebuild guide

The notice-bus pattern is reusable across frameworks — Redux + a slice, Zustand store, Pinia, etc. The contract is:

- A central store with `notices: []` shape, each `{ id, type ('default'|'snackbar'), status ('info'|'warning'|'success'|'error'), content, isDismissible }`.
- A `createNotice(status, content, options)` dispatch.
- A `removeNotice(id)` dispatch for dismissals.
- Filtered rendering: banner host listens for `type: 'default'`; snackbar host listens for `type: 'snackbar'`.

A non-WPDS rebuild needs a Notice / Alert primitive with intent variants + a close affordance. Material has `Alert`, Tailwind needs hand-rolled — both are standard fare.

## Known limitations

- **No notice grouping.** Five repeated errors render as five banners. wp-admin's notices collapse duplicates; the shell doesn't.
- **No order control.** Notices render in arrival order. No priority / pinned-at-top semantics.
- **No auto-dismiss for non-snackbar notices.** Banner notices are sticky until the user dismisses (or another notice with the same id arrives).
- **`Notice.Description` accepts strings only by convention.** Rich content (links inside notices) requires either authoring HTML or composing through `Notice.Actions`.
