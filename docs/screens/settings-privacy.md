# Screen Spec: Settings — Privacy

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/options-privacy.php` (Settings tab, custom handler), `wp-admin/privacy-policy-guide.php` (Policy Guide tab)
**Current shell coverage:** Not implemented in v1. Falls back to `iframe:options-privacy.php` when configured.

This spec describes the **semantic surface** of the Privacy Settings screen, which combines two tabs in a single navigation surface: Settings (page picker) and Policy Guide (suggested text). It is the only Settings screen that uses a different capability (`manage_privacy_options`) and the only one that creates a Page as a side effect.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `settings-privacy` |
| Display name | "Privacy" |
| Original URL | `/wp-admin/options-privacy.php` (Settings) and `?tab=policyguide` (Policy Guide) |
| Menu location | Settings → Privacy |
| Submenu items | N/A — secondary nav lives inside the screen |
| Parent app | `core:settings` |
| Sub-screens | "Settings" tab and "Policy Guide" tab (both rendered in the same app) |

Cross-link: `personal-data.md` (Personal Data Export and Erase Requests) for the related Tools-menu screens that handle GDPR data subject requests. This panel is about the policy page itself, not the request flow.

---

## 2. Purpose

Designate or create the page that holds the site's Privacy Policy, and provide an editorial guide with suggested policy text — including text contributed by active plugins via `wp_add_privacy_policy_content()`.

Jobs to be done:
- **Pick an existing page** — promote a draft/published page to be the official Privacy Policy.
- **Create a new page** — generate a new draft seeded with WordPress's default policy template plus plugin/theme additions.
- **Edit / preview** — link to the editor or front-end preview for the current policy.
- **Reference plugin disclosures** — read the suggested text plugins want included.
- **Copy guide text** — copy section-by-section into the policy editor.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `manage_privacy_options` | `options-privacy.php` line 12 |
| Set page | `manage_privacy_options` + nonce `set-privacy-page` | options-privacy.php line 53 |
| Create page | `manage_privacy_options` + nonce `create-privacy-page` | options-privacy.php line 81 |
| Edit policy page (linked out) | `edit_post` on that page | post.php editor |

`manage_privacy_options` is mapped to `manage_options` by default but can be granted independently — sites with a dedicated Privacy Officer role customize this.

**Permission-denied state:** `wp_die()` with translated string.

**Multisite:** Each site has its own Privacy Policy page. No network-level aggregation in this panel.

---

## 4. Data model

### Primary entity
- Custom post handler: `options-privacy.php` itself (NOT `options.php`).
- Two POST actions: `set-privacy-page`, `create-privacy-page`.

### REST-exposed fields

`wp_page_for_privacy_policy` is **not** registered in `register_initial_settings()`. Verify against `WP_REST_Settings_Controller::get_registered_options()` output — it is **not REST-exposed in core 6.9**. Treat it as a non-REST option.

### Non-REST options (gaps)

| Option | Form field | Type | Default | Notes |
|---|---|---|---|---|
| `wp_page_for_privacy_policy` | Privacy Policy page selector | int | 0 | Page ID; set via `update_option()` from the custom POST handler |

### Pages query
- Source: `wp_dropdown_pages(['post_status' => ['draft', 'publish'], 'show_option_none' => '— Select —', 'option_none_value' => 0])`.
- REST equivalent: `GET /wp/v2/pages?status=draft,publish&context=edit&per_page=100&_fields=id,title,status,parent`.
- Hierarchy preserved in display.
- Fallback: `_e('There are no pages.')` is rendered as the label when `! get_posts(['post_type'=>'page','posts_per_page'=>1])`.

### Privacy Policy Guide sections
- Source: `WP_Privacy_Policy_Content::get_default_content( true, false )` — built-in WordPress text.
- Plus `WP_Privacy_Policy_Content::privacy_policy_guide()` — iterates over registered plugin contributions added via `wp_add_privacy_policy_content( $plugin_name, $policy_text )`.
- Each section has:
  - Plugin name / source
  - Heading
  - Suggested policy text (HTML)
  - Optional "removed" indicator if the plugin is no longer active.
- Class: `wp-admin/includes/class-wp-privacy-policy-content.php`.

### Validation rules
- Selected page must exist (not deleted). If invalid, error notice: "The currently selected Privacy Policy page does not exist."
- Selected page must not be in Trash. If trashed, error notice with link to Pages → Trash for restoration.
- Selected page must not be the same as the homepage or posts page (warning surfaces in Reading Settings, not here).

---

## 5. Layout regions (semantic)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                       │
│  └─ Title ("Privacy")                                        │
├─────────────────────────────────────────────────────────────┤
│ TAB NAV                                                      │
│  ├─ Settings                                                 │
│  └─ Policy Guide                                             │
├─────────────────────────────────────────────────────────────┤
│ TAB: Settings                                                │
│  ├─ Description (3 paragraphs about responsibility)          │
│  ├─ "Need help?" link → Policy Guide tab                     │
│  ├─ Edit/View/Preview link to current policy (when set)      │
│  ├─ ┌─ Create a new Privacy Policy page                       │
│  │  └─ [Create button]                                       │
│  └─ ┌─ Change/Select Privacy Policy page                      │
│     ├─ [Page select]                                         │
│     └─ [Use This Page button]                                │
├─────────────────────────────────────────────────────────────┤
│ TAB: Policy Guide                                            │
│  ├─ Introduction paragraph(s)                                │
│  ├─ Accordion: "Privacy Policy Guide" (default content)      │
│  ├─ Section "Policies" header                                │
│  └─ Accordion list (one per plugin contribution)             │
│       ├─ Plugin name + heading                               │
│       ├─ Copy Suggested Text button                          │
│       └─ Suggested HTML (rendered)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading | Initial fetch | Skeleton |
| Idle, no policy set | `wp_page_for_privacy_policy === 0` | Show "Select a Privacy Policy page" + Create New |
| Idle, policy set + valid | Page exists and not trashed | Show Edit/View links + Change page |
| Policy page deleted | Stored ID does not resolve | Error notice: "The currently selected Privacy Policy page does not exist." |
| Policy page in Trash | `post_status === 'trash'` | Error notice with restore link |
| No pages exist | `get_posts(['post_type'=>'page'])` empty | "There are no pages." label; Create button still available |
| JavaScript disabled | `<noscript>` | Render error notice "The Privacy Settings require JavaScript." |
| Permission denied | `! manage_privacy_options` | 403 view |
| Plugin policy contribution removed | Plugin deactivated since adding content | Section shown with "removed" badge / strikethrough |

---

## 7. Actions

### Primary actions (Settings tab)
- **Create** — POST `action=create-privacy-page` with nonce `create-privacy-page`. Server inserts a new draft Page seeded with `WP_Privacy_Policy_Content::get_default_content()` and updates `wp_page_for_privacy_policy`. Redirects to `post.php?post={id}&action=edit`.
- **Use This Page** — POST `action=set-privacy-page` with nonce `set-privacy-page` and `page_for_privacy_policy={id}`. Updates the option. Stays on this screen.

### Secondary actions
- **Edit** — link to `post.php?post={id}&action=edit` (page editor).
- **View / Preview** — link to `get_permalink({id})` (front-end policy page).
- **Cancel page change** — N/A; no draft state, just immediate save.
- **Copy Suggested Text** — Policy Guide accordion; copies plugin-supplied HTML to clipboard. JS-driven; no server round-trip.

### Optimistic vs. blocking
- **Set page** — blocking; immediate redirect-back with success notice.
- **Create page** — blocking; redirects to editor.
- **Copy text** — optimistic.

---

## 8. Filters, sort, search, pagination

N/A.

---

## 9. Forms & inputs

### Tab navigation
- Type: secondary tab nav (`<nav>` with `role="tablist"`-like semantics in the original)
- Options: "Settings" (default), "Policy Guide"
- Original behavior: the whole page reloads with `?tab=policyguide` query param. Shell rebuild may render both tabs in a single SPA without reload.

### Create a new Privacy Policy page
- Type: form with single Submit button
- Action: `action=create-privacy-page`
- Nonce field required.
- Helper label flips:
  - Has pages: "Create a new Privacy Policy page"
  - No pages: "There are no pages."

### Change/Select Privacy Policy page
- Type: select + Submit
- Field name: `page_for_privacy_policy`
- Options: `wp_dropdown_pages` with statuses `['draft', 'publish']` and `option_none_value=0`
- Selected: current `wp_page_for_privacy_policy` value
- Validation: page must exist and not be trashed; client-side limited to non-zero check, server authoritative.
- Button label: "Use This Page" (primary)
- Visibility: only when at least one page exists (`$has_pages`).

### Save semantics
- Two distinct forms, each posting to `options-privacy.php` with its own nonce.
- For shell rebuild: implement a custom REST endpoint (`/wp-admin-shell/v1/settings/privacy`) wrapping both actions, with `manage_privacy_options` capability check.

---

## 10. Routing & URL state

Original URLs:
- `/wp-admin/options-privacy.php` — Settings tab
- `/wp-admin/options-privacy.php?tab=policyguide` — Policy Guide tab

Shell hash: `#/settings/privacy` (Settings tab) and `#/settings/privacy/guide` (Policy Guide tab) recommended.

Browser back/forward should switch tabs without losing accordion state if practical.

---

## 11. Inter-app navigation

### Outbound
| Trigger | Destination | Carry |
|---|---|---|
| Click "Edit" on current policy | `editor` app or post editor iframe | post id, post type=page |
| Click "View" / "Preview" on current policy | external (front-end) | page permalink |
| Click "Update your menus" link in success notice | Customizer → Menus | autofocus `nav_menus` panel |
| Click "restore the current page" in Trash error | `pages` app | `?status=trash` |
| Click "privacy policy guide" link | Policy Guide tab | tab switch |

### Inbound
- From `core:settings` host.
- From `personal-data.md` request flow (cross-link).
- From plugin onboarding wizards that prompt for privacy disclosures.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Set page success | Inline success notice: "Privacy Policy page updated successfully." |
| Set page success + theme supports menus | Notice extends with: "Remember to update your menus!" + Customizer link |
| Create page success | Redirect to editor; no in-screen notice (the next screen handles it) |
| Create page failure | Error notice: "Unable to create a Privacy Policy page." |
| Selected page deleted | Persistent error notice (re-rendered each load until fixed) |
| Selected page trashed | Persistent error notice with restore link |
| Copy guide text | Snackbar: "Copied" |
| JavaScript disabled | Error block via `<noscript>` notice |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move between tab links, page select, buttons |
| `Enter` / `Space` on tab link | Switch tab |
| `Enter` / `Space` on accordion trigger | Expand/collapse policy section |
| `Esc` | Close accordion if focused |

### ARIA & focus
- Tab nav: `<nav aria-label="Secondary menu">`. Each tab `<a>` carries `aria-current="true"` when active. (Original uses links, not button-tabs.)
- Accordion triggers: `<button aria-expanded="false|true" aria-controls="…">`. Panels: `<div id="…" hidden>`.
- Live region on Copy: `aria-live="polite"` announcing "Copied".
- Page select: `aria-describedby` to current-policy notice when selection mismatches state.
- All form submissions are POST forms with nonces (not AJAX) in core; rebuild may shift to fetch + custom endpoint.

---

## 14. Extension points (core hooks)

| Hook | Purpose | Recommendation |
|---|---|---|
| `wp_add_privacy_policy_content()` (function, not filter) | Plugins register suggested policy text | **Honor** — render in Policy Guide accordion |
| Filter on `WP_Privacy_Policy_Content::get_default_content` indirectly | Modify default policy content | Out of UI scope |

---

## 15. Mapping & implementation status

### Current shell coverage
- Not implemented; reserved as `core:settings-privacy` source slot.

### Gaps vs. this spec
| Gap | Priority | Notes |
|---|---|---|
| Tab navigation (Settings / Policy Guide) | High | Custom UI; not REST-driven |
| Page picker + Use This Page form | High | Non-REST option; needs shim |
| Create a new Privacy Policy page | High | Triggers `wp_insert_post` + redirect to editor |
| Selected page validity check (deleted / trashed) | High | Validate at load, surface error |
| Edit / View / Preview links to current policy | Medium | Inter-app navigation |
| Policy Guide accordion (default content) | Medium | Static content from `WP_Privacy_Policy_Content::get_default_content(true, false)` |
| Plugin-contributed policy sections | Medium | Iterate `WP_Privacy_Policy_Content::privacy_policy_guide()` |
| Copy Suggested Text button | Low | Clipboard API |
| `manage_privacy_options` capability respected (vs `manage_options`) | Medium | Distinct from other Settings panels |
| "Update your menus!" Customizer link | Low | Optional; Customizer is being phased out in shells |

### Acceptable interim
`iframe:options-privacy.php` covers full parity. Privacy Guide accordion is content-heavy and tightly coupled to plugin `add_privacy_policy_content` calls — iframe is reasonable for v1.

---

## 16. Out of scope

- **Personal data export / erase request flows** — covered by `personal-data.md` (separate spec for `tools.php?page=export_personal_data` and `?page=remove_personal_data`).
- **GDPR consent banner** — third-party plugin domain.
- **Cookie disclosure UI** — not part of WordPress core; plugin domain.
- **Network-level privacy policy** — multisite Network admin uses a different surface; out of scope.

---

## 17. Reference

- Original PHP form (Settings tab): `wp-admin/options-privacy.php`
- Original PHP form (Policy Guide tab): `wp-admin/privacy-policy-guide.php`
- Privacy content class: `wp-admin/includes/class-wp-privacy-policy-content.php`
- Function: `wp_add_privacy_policy_content( $plugin_name, $policy_text )` — used by plugins
- Settings registration: not in `register_initial_settings`. `wp_page_for_privacy_policy` is a plain option.
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php` (does NOT cover privacy)
- Documentation: `https://wordpress.org/documentation/article/settings-privacy-screen/`
- Current shell impl: not yet implemented.
- Related: `docs/screens/personal-data.md` for the request handling spec
