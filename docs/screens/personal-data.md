# Screen Spec: Personal Data Requests

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/export-personal-data.php` + `wp-admin/erase-personal-data.php` + `wp-admin/includes/privacy-tools.php` + `wp-admin/includes/class-wp-privacy-data-export-requests-list-table.php` + `wp-admin/includes/class-wp-privacy-data-removal-requests-list-table.php` + `wp-admin/includes/class-wp-privacy-requests-table.php`
**Current shell coverage:** None. Bundled `developer-admin.json` exposes the originals via `iframe:export-personal-data.php` and `iframe:erase-personal-data.php`.

This spec covers two parallel sub-screens that share an almost identical UI surface and underlying data model. They differ only in action verb (export vs. erase), success email content, and bulk-action labels. One combined spec; per-sub-screen differences called out where relevant.

---

## 1. Identity

| Sub-screen | Slug | Display name | Original URL | Menu location |
|---|---|---|---|---|
| Export Personal Data | `personal-data-export` | "Export Personal Data" | `/wp-admin/export-personal-data.php` | Sub-item of "Tools" menu |
| Erase Personal Data | `personal-data-erase` | "Erase Personal Data" | `/wp-admin/erase-personal-data.php` | Sub-item of "Tools" menu |

| Field | Value |
|---|---|
| Parent app | `tools` group |
| Sub-screens | None |

The two screens are distinct admin URLs but render through identical infrastructure (a shared abstract `WP_Privacy_Requests_Table` class with two concrete subclasses). For shell purposes, this could be a single app with a "type" config, or two registered apps that share a renderer.

A user can land on either by typing an email/username, deciding which action to request, then submitting. Each request creates a `user_request` post with status `request-pending` until the user confirms via emailed link.

---

## 2. Purpose

Comply with privacy laws (GDPR, CCPA) by letting site administrators handle data subject access and erasure requests for users whose data lives in WordPress.

Jobs to be done:
- **Receive a "give me my data" request** — admin enters the user's email, system emails them a confirmation link, user clicks it → admin generates ZIP → emails the ZIP.
- **Receive an "erase my data" request** — same opening flow → admin runs erasure → comments anonymize, profile data deletes (or anonymizes), user-uploaded media flagged for review.
- **Track outstanding requests** — list table with status, email, type, created date, next steps.
- **Resend a confirmation email** — when user lost the link.
- **Mark a request as completed** — manual override when admin processed it offline.
- **Bulk delete old requests** — clean up the queue.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View Export screen | `export_others_personal_data` | `export-personal-data.php` line 12 |
| View Erase screen | `erase_others_personal_data` AND `delete_users` | `erase-personal-data.php` line 12 |
| Submit new request (export) | `export_others_personal_data` + nonce `personal-data-request` | privacy-tools.php `_wp_personal_data_handle_actions` |
| Submit new request (erase) | `erase_others_personal_data` + `delete_users` + nonce | (same) |
| Resend confirmation email | (same caps as screen) + nonce `bulk-privacy_requests` | privacy-tools.php |
| Bulk: resend confirmations | (same) | `WP_Privacy_Requests_Table::process_bulk_action` |
| Bulk: mark requests complete | (same) | (same) |
| Bulk: delete requests | (same) | (same) |
| Confirm request (user-facing email link) | hash equality (no cap; runs on `wp-login.php?action=privacy_key_request`) | `wp_validate_user_request_key` |
| Generate export ZIP | (system, post-confirmation) | `wp_privacy_generate_personal_data_export_file()` |
| Run erasure | (system, post-confirmation) | `wp_privacy_personal_data_erasers` filter callbacks |
| Cleanup expired requests | (auto, on screen render) | `_wp_personal_data_cleanup_requests` |

Default caps (`export_others_personal_data`, `erase_others_personal_data`) granted to administrators in non-multisite. In multisite, only network admins by default; per-site admins do not have them.

**Permission-denied state:** core uses `wp_die( 'Sorry, you are not allowed to {export|erase} personal data on this site.' )`. Shell renders 403 view.

**Multisite:** `manage_privacy_options` is granted to super-admins only. Per-site admins cannot process privacy requests in core multisite. This is a known compliance limitation.

Tied to: **Settings → Privacy** (`options-privacy.php`) — sets the privacy policy page. Cross-link in shell config so privacy admins can move between the three screens.

---

## 4. Data model

### Primary entity

**Type:** `user_request` post type (`wp-includes/post.php` line 284).

| Property | Value |
|---|---|
| `public` | `false` |
| `show_in_rest` | (not set — defaults false) |
| Visibility via REST | **None.** Cannot be queried via `/wp/v2/user_request` |

This is the central gap: **all CRUD on privacy requests must go through admin-ajax or custom shell endpoints.**

### Per-request fields (stored on `user_request` post)

| Field | Storage | Notes |
|---|---|---|
| `id` | `ID` | post id |
| `email` | `post_title` | the requester's email |
| `action_name` | `post_name` | `export_personal_data` or `remove_personal_data` |
| `status` | `post_status` | one of `request-pending`, `request-confirmed`, `request-failed`, `request-completed` |
| `created_timestamp` | `post_date_gmt` | as Unix timestamp via `strtotime` |
| `confirmed_timestamp` | meta `_wp_user_request_confirmed_timestamp` | |
| `completed_timestamp` | meta `_wp_user_request_completed_timestamp` | |
| `request_data` | `post_content_filtered` (serialized) | extra context (e.g. confirm key) |
| `confirm_key` | `post_password` | random key for confirmation URL hash |

### Request statuses

| Status | Meaning |
|---|---|
| `request-pending` | Awaiting confirmation email click |
| `request-confirmed` | User clicked confirm link; admin can now process |
| `request-failed` | Confirmation expired (default 1 day) or processing errored |
| `request-completed` | Admin processed (export ZIP delivered or erasure ran) |

Statuses live as registered post statuses (not built-in `publish/draft/etc.`). `_wp_privacy_statuses()` returns the four.

### Aggregate counts (per status)

Read via custom SQL in `WP_Privacy_Requests_Table::get_request_counts()` — direct `$wpdb->get_results` on `wp_posts`. **No REST endpoint.** Same gap as posts list aggregate counts (see `posts.md`).

### REST coverage summary

**None for the primary entity.** All flows currently use:
- `_wp_personal_data_handle_actions()` consumes `$_POST` from form on screen.
- `process_bulk_action()` consumes `$_REQUEST['action']` and `$_REQUEST['request_id']`.
- Email confirmation goes through `wp-login.php?action=privacy_key_request&...` (logged-out flow).
- Export ZIP generation is async via WP Cron (`wp_privacy_generate_personal_data_export_file`).
- Erasure is async via WP Cron (`wp_privacy_personal_data_erasers` callbacks).

Rebuild requires custom shell endpoints (`/wp-admin-shell/v1/privacy-requests/*`) wrapping the existing PHP functions. None of this is in core REST today.

### Email content (server-only)

Filters available:
- `user_request_action_email_content` / `_subject` / `_headers` (the confirmation email).
- `wp_privacy_personal_data_email_content` / `_subject` / `_headers` (the export-ready email).
- `delete_site_email_content` is unrelated (Tools / Delete Site).

These run entirely server-side. Shell does not display email contents.

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  ├─ Title ("Export Personal Data" / "Erase Personal Data")   │
│  └─ Intro paragraph (compliance context)                     │
├─────────────────────────────────────────────────────────────┤
│ ADD REQUEST FORM                                             │
│  ├─ Heading ("Add Data Export Request" / "Erasure Request")  │
│  ├─ Username or email address (text input, required)         │
│  ├─ Confirmation email (checkbox, default checked)           │
│  └─ Submit ("Send Request")                                  │
├─────────────────────────────────────────────────────────────┤
│ STATUS FILTER TABS                                           │
│  └─ All | Pending | Confirmed | Completed | Failed           │
│      Each with count                                         │
├─────────────────────────────────────────────────────────────┤
│ SEARCH BOX                                                   │
│  └─ "Search Requests" (filters by email)                     │
├─────────────────────────────────────────────────────────────┤
│ BULK ACTION ROW                                              │
│  └─ "Resend confirmations" / "Mark complete" / "Delete"      │
├─────────────────────────────────────────────────────────────┤
│ DATA TABLE                                                   │
│  └─ Columns:                                                 │
│      ├─ select-all checkbox                                  │
│      ├─ Requester (primary; email; with row actions)         │
│      ├─ Status (badge: Pending / Confirmed / Completed / …)  │
│      ├─ Requested (date)                                     │
│      └─ Next Steps (per-status action buttons)               │
├─────────────────────────────────────────────────────────────┤
│ FOOTER                                                       │
│  └─ Pagination (per_page default 20)                         │
└─────────────────────────────────────────────────────────────┘
```

The "Next Steps" column shows status-dependent action buttons:
- **Pending** → "Resend email" link.
- **Confirmed** → "Download export" / "Force erase data" + "Send to user" buttons.
- **Failed** → "Retry" link.
- **Completed** → success indicator with completed timestamp.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton rows |
| Empty (no requests ever) | `total === 0` and no filters | "No personal data requests found." |
| Empty (filtered) | filter yields 0 | "No requests match" + "Clear filters" |
| Form: invalid email/username | Submit with bad input | Inline error: "Unable to add this request. A valid email address or username must be supplied." |
| Form: duplicate request | Same email + same action_name still pending | Error: "An export/erasure request for this email is already pending or has been confirmed." |
| Form: success (pending) | Submit with `send_confirmation_email` checked | Inline success: "Confirmation request initiated successfully." |
| Form: success (skipped confirmation) | Submit with checkbox unchecked | "Request added successfully." (status starts as `confirmed`) |
| Per-row: confirmation email pending | Status = `request-pending` | Status badge "Pending"; row action: "Resend email" |
| Per-row: confirmed, ready to process | Status = `request-confirmed` | Action button: "Download personal data" / "Force erase personal data" |
| Per-row: export in progress | Cron job picked up the request | Action button: "Email data" / "Generating…" |
| Per-row: erasure in progress | Cron running | "Erasure pending" + retry link |
| Per-row: completed | Status = `request-completed` | Completed timestamp |
| Per-row: failed | Status = `request-failed` | "Failed" badge; "Retry" action |
| Permission denied | User lacks cap | 403 view |

---

## 7. Actions

### Add Request form

| Action | Cap | Endpoint / form |
|---|---|---|
| Submit (export) | `export_others_personal_data` | `POST export-personal-data.php` with `action=add_export_personal_data_request`, `type_of_action=export_personal_data`, `username_or_email_for_privacy_request`, optional `send_confirmation_email`, nonce `personal-data-request` |
| Submit (erase) | `erase_others_personal_data` AND `delete_users` | `POST erase-personal-data.php` with `action=add_remove_personal_data_request`, `type_of_action=remove_personal_data`, etc. |

### Per-row actions

Implemented as `column_email` row actions and "Next Steps" column inline buttons.

| Action | When | Endpoint |
|---|---|---|
| Resend email | Status = `request-pending` | `POST` with `privacy_action_email_retry[{id}]=resend` and nonce `bulk-privacy_requests` |
| Download personal data | Export, Status = `request-confirmed` | Async cron-driven; UI fetches `wp_privacy_exports_url() + {file}.zip` once ready |
| Email data to user | Export, Status = `request-confirmed`, file ready | Triggers `wp_privacy_send_personal_data_export_email()` via admin-ajax |
| Force erase personal data | Erasure, Status = `request-confirmed` | Spawns cron loop calling each registered eraser |
| Send to user (erasure complete confirmation) | Erasure, Status = `request-completed` | Sends final notification email |
| Retry | Status = `request-failed` | Re-runs cron job |
| Remove request (single) | Any | `DELETE` post |

### Bulk actions

Selection model: checkbox per row + select-all-on-page.

| Bulk action | Cap | Behavior |
|---|---|---|
| Resend confirmation requests | `export_others_personal_data` / `erase_others_personal_data` | For each selected pending request, re-send confirmation email |
| Mark requests as completed | (same) | For each selected, set status `request-completed` |
| Delete requests | (same) | `wp_delete_post( id, true )` (force) per selected |

### Optimistic vs. blocking

- **Add request** — blocking (creates DB row, sends email). User waits ~1s.
- **Resend email** — fast, blocking.
- **Mark complete** — fast.
- **Delete request** — fast.
- **Force erase** — non-blocking (kicks off cron); UI must poll for completion.
- **Generate export ZIP** — non-blocking (cron); UI polls.

---

## 8. Filters, sort, search, pagination

### Filters

| Filter | Field | Operators | Source |
|---|---|---|---|
| Status | `post_status` | `is` | Hard-coded enum: `request-pending`, `request-confirmed`, `request-completed`, `request-failed` |

Status counts visible per-tab from the views row.

### Sort

| Column | Direction default |
|---|---|
| Requested timestamp | `desc` (default) |
| Requester (email) | `asc` |
| Status | (sortable) |

### Search

Single text input filters by email substring. Maps to `WP_Query` `s` against `post_title`.

### Pagination

- Default: 20 per page (`add_screen_option('per_page', ['default' => 20])`).
- User-customizable via Screen Options (`export_personal_data_requests_per_page` / `remove_personal_data_requests_per_page` user meta).
- Shell rebuild: ignore Screen Options for v1; default 20.

---

## 9. Forms & inputs

### Add request form (both screens)

| Field | Type | Required | Notes |
|---|---|---|---|
| `username_or_email_for_privacy_request` | text | yes | Either a WP username or any email address (validates via `is_email` first; falls back to `get_user_by('login')`) |
| `send_confirmation_email` | checkbox | no | Default checked. When unchecked, status starts at `confirmed` (admin-only flow without user confirmation — useful for known-administrator-driven workflows) |
| `_wpnonce` | hidden | yes | `personal-data-request` |
| `action` | hidden | yes | `add_export_personal_data_request` or `add_remove_personal_data_request` |
| `type_of_action` | hidden | yes | `export_personal_data` or `remove_personal_data` |

### Bulk action

Form-encoded with `request_id[]` array of post ids, `action` enum (`resend`, `complete`, `delete`), nonce `bulk-privacy_requests`.

### Search

| Field | Type | Notes |
|---|---|---|
| `s` | text | Standard WP_Query search |
| Hidden inputs preserve `filter-status`, `orderby`, `order` | hidden | Single-page form |

Validation: server-side only. Client-side: required-field guard on email/username; checkbox for at least one row when bulk-acting.

---

## 10. Routing & URL state

Original wp-admin URL params:
- `?paged={n}` — pagination
- `?filter-status={status}` — status filter
- `?orderby={column}&order={asc|desc}` — sort
- `?s={query}` — search
- (Per-screen path: `export-personal-data.php` vs. `erase-personal-data.php`)

Recommended shell URLs:
- `#/personal-data/export?status=pending&page=2&search=alice`
- `#/personal-data/erase?status=confirmed`

(Or as separate apps: `#/personal-data-export` / `#/personal-data-erase` — depends on shell config decision.)

URL state must round-trip filter/sort/search/page on refresh and back/forward.

---

## 11. Inter-app navigation

### Outbound

| Trigger | Destination | Carry |
|---|---|---|
| Help link "Privacy Policy Guide" | `options-privacy.php?tab=policyguide` | (none) |
| Help link "Documentation on plugin data" | external | new tab |
| "Edit Privacy settings" (when surfaced) | Settings → Privacy | (none) |

### Inbound

- Tools menu → Export / Erase Personal Data.
- Settings → Privacy "Manage requests" link → these screens.
- Cross-link from `tools.md` (Available Tools card).
- Cross-link from `export.md` (the site-wide export, not personal-scope).
- (Programmatic) Plugin code calling `wp_create_user_request()` directly creates rows that appear here.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Form submit success (pending) | Inline notice "Confirmation request initiated successfully." |
| Form submit success (skip-confirm) | Inline notice "Request added successfully." |
| Form submit invalid email | Inline error "Unable to add this request. A valid email address or username must be supplied." |
| Bulk resend success | "{N} confirmation requests re-sent successfully." |
| Bulk resend partial failure | "{X} re-sent. {Y} failed to resend." |
| Bulk complete success | "{N} requests marked as complete." |
| Bulk delete success | "{N} requests deleted successfully." |
| Single resend success | "Confirmation request sent again successfully." |
| Single resend failure | Returned `WP_Error` message |
| Per-row export ready | "Personal data export sent to {email}" snackbar |
| Per-row erasure complete | Inline status update; "Send confirmation to user" surfaced |

All wp-admin notices use `add_settings_error()` + `settings_errors()` rendering. Rebuild should map to `core/notices` dispatchers (`createSuccessNotice`, `createErrorNotice`).

---

## 13. Accessibility & keyboard

### Keyboard

| Key | Action |
|---|---|
| `Tab` | Move through form → status tabs → search → bulk action → table |
| `Space` on row checkbox | Toggle selection |
| `Enter` on submit | Submit form |
| `Esc` | (no per-screen action; modal confirmations focus-trap) |

### ARIA & focus

- Form: `<form class="wp-privacy-request-form">` with table-based layout (legacy `<table class="form-table">`); rebuild should switch to fieldset + label pairs.
- Status tabs: `role="tablist"` (rebuild adds; core uses unstyled link list).
- Required input has `required` attribute.
- Bulk action select has explicit `<label>` (visually hidden).
- Each table row's primary cell has row actions revealed on hover/focus.
- Action buttons in "Next Steps" column have descriptive `aria-label` (e.g. "Resend confirmation email to alice@example.com").
- After bulk action: focus moves to the success/error notice; live region announces.
- After delete: focus moves to next row (or first row).

### Screen reader

- Status badges include text (not just color) — "Pending", "Confirmed", "Completed", "Failed".
- Date cells use `<time datetime="...">` for parseable timestamps.
- Confirmation request status announced after submit.

### Note on multisite-only `manage_privacy_options` cap

In multisite, only super-admins can access these screens. Per-site admins see a 403. This must be communicated clearly in the shell — either hide the menu items entirely (preferred) or render a "managed at network level" empty state.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_privacy_personal_data_exporters` (filter) | Register data exporters (per-plugin) | **Preserve** at PHP layer — this is how every plugin contributes to exports |
| `wp_privacy_personal_data_erasers` (filter) | Register data erasers | **Preserve** |
| `wp_privacy_personal_data_export_file_created` (action) | Hook ZIP creation | Preserve |
| `wp_privacy_personal_data_email_to` (filter) | Override notification recipient | Preserve |
| `wp_privacy_personal_data_email_content` / `_subject` / `_headers` | Customize export email | Preserve |
| `user_request_action_email_*` | Customize confirmation email | Preserve |
| `wp_privacy_export_expiration` | Override ZIP expiration | Preserve |
| `bulk_actions-{screen-id}` | Add bulk actions | Replace with shell `actions` registry, `supportsBulk: true` |
| `manage_{screen-id}_columns` | Add table columns | Replace with shell `fields` extensibility |

Plugin compatibility note: WooCommerce, BuddyPress, MailPoet, Yoast, etc. all hook into `wp_privacy_personal_data_exporters` to include their data. Preserving the PHP-layer hook is essential — the shell rebuild's "Force download personal data" action must run server-side `wp_privacy_personal_data_export_file()` which fans out to all registered exporters.

---

## 15. Mapping & implementation status

### Current shell coverage
- **Source:** none.
- **What works:** `iframe:export-personal-data.php` and `iframe:erase-personal-data.php` work in `developer-admin` shell.

### Gaps vs. this spec

| Gap | Priority | Notes |
|---|---|---|
| Register `core:personal-data-export` AppSource | Medium | Compliance-critical; relatively rarely visited |
| Register `core:personal-data-erase` AppSource | Medium | Same |
| Custom REST endpoint `GET /wp-admin-shell/v1/privacy-requests` | High | `user_request` post type is not REST-public; must wrap |
| Custom REST endpoint `POST /wp-admin-shell/v1/privacy-requests` (create) | High | |
| Custom REST endpoint `PATCH .../privacy-requests/{id}` (resend, mark-complete, retry) | High | |
| Custom REST endpoint `DELETE .../privacy-requests/{id}` | High | |
| Custom REST endpoint for force-export trigger | Medium | Wraps cron job kickoff |
| Custom REST endpoint for force-erasure trigger | Medium | Same |
| Native list table with status tabs + counts | Medium | Reuses DataViews patterns from posts spec |
| Status filter URL state | Medium | |
| Bulk action progress UI | Medium | Same shape as posts bulk |
| Async export-ZIP polling | Medium | Heuristic on `_wp_user_request_completed_timestamp` meta |
| Email confirmation deep-link handling | High | The user-facing confirmation URL (`wp-login.php?action=privacy_key_request&...`) is logged-out; shell must not block it |
| Multisite: hide menu items for non-super-admins | High | Cap-aware navigation prune |
| Failed-request retry UX | Low | |
| Per-status badge | Low | |
| Empty state messaging | Low | |

### Acceptable interim
`iframe:export-personal-data.php` / `iframe:erase-personal-data.php` are the v1 implementation. These screens are infrastructure; iframing is acceptable indefinitely.

The user-facing **email confirmation page** (`wp-login.php?action=privacy_key_request`) is **not** part of these screens — it is a logged-out flow. Shell should pass through to PHP unmodified.

---

## 16. Out of scope

- **Privacy Policy page editor / generator** — separate Settings → Privacy screen (`options-privacy.php`).
- **Privacy Policy Guide** (`?tab=policyguide`) — documentation surface; defer to separate spec or iframe.
- **User-facing self-service privacy portal** (where end-users initiate their own requests) — not in core; plugin territory.
- **Auto-deletion of inactive accounts** — not in core.
- **Data retention policy automation** — not in core.
- **Cookie consent banner / cookie policy** — not in core.
- **Logged-out email confirmation page** (`wp-login.php?action=privacy_key_request`) — handled by core; shell doesn't intercept.
- **WP_Cron status / monitoring** for the export/erasure cron jobs — separate concern; cross-link to Site Health "Scheduled events" test.
- **"Send to user" email customization UI** — server-side filters only, no admin UI.

---

## 17. Reference

- Original PHP: `wp-admin/export-personal-data.php`, `wp-admin/erase-personal-data.php`
- Helpers: `wp-admin/includes/privacy-tools.php` (`_wp_personal_data_handle_actions`, `_wp_personal_data_cleanup_requests`, `wp_privacy_generate_personal_data_export_file`, `wp_privacy_send_personal_data_export_email`, `wp_privacy_process_personal_data_export_page`)
- List table base class: `wp-admin/includes/class-wp-privacy-requests-table.php`
- List table subclasses: `wp-admin/includes/class-wp-privacy-data-export-requests-list-table.php`, `wp-admin/includes/class-wp-privacy-data-removal-requests-list-table.php`
- Post type registration: `wp-includes/post.php` (`user_request`)
- Request creator: `wp_create_user_request()` in `wp-includes/user.php`
- Email validator: `wp_validate_user_request_key()` in `wp-includes/user.php`
- User-facing confirmation: `wp-login.php?action=privacy_key_request`
- Cron events: `wp_privacy_delete_old_export_files`, `wp_privacy_delete_old_export_files_lock`
- Defaults: export expires in 3 days (`wp_privacy_export_expiration` filter); pending request expires in 1 day (`user_request_key_expiration`)
- WP-CLI: no direct equivalent (no `wp privacy` command set in core; `wp post create --post_type=user_request` is possible but discouraged)
- Help docs:
  - `https://wordpress.org/documentation/article/tools-export-personal-data-screen/`
  - `https://wordpress.org/documentation/article/tools-erase-personal-data-screen/`
- Cross-link: Settings → Privacy (`options-privacy.php`) — sets the privacy policy page; not covered by this spec
- Cross-link: `export.md` — the site-wide WXR export (different scope)
- Cross-link: `tools.md` — both screens are reachable from the Tools menu landing
- Plugin docs: `https://developer.wordpress.org/plugins/privacy/`
