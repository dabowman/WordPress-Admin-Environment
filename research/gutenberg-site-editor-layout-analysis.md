# Gutenberg Site Editor Layout Analysis

Detailed analysis of the site editor's layout system in WordPress Gutenberg, compared to our WP Admin Shell implementation. The goal: adopt the site editor's design patterns as the default layout model for our shell, allowing users to extend its spatial metaphor across the entire admin.

## Site editor layout architecture

### The three-region model

The site editor uses a flexible three-region layout inside a dark `$gray-900` (#1e1e1e) chrome:

```
┌──────────────────────────────────────────────────────────────┐
│ edit-site-layout (background: $gray-900, height: 100%)      │
│ ┌──────────────┬──────────────────┬────────────────────────┐ │
│ │ Sidebar      │ Content area     │ Canvas/Preview         │ │
│ │ (300px)      │ (flex, optional) │ (flex-grow: 1)         │ │
│ │              │                  │                        │ │
│ │ SiteHub      │ PostList         │ ResizableFrame         │ │
│ │ NavScreens   │ DataViews        │ (rounded corners,      │ │
│ │ SaveHub      │ Pattern grid     │  drop shadow,          │ │
│ │              │                  │  12px padding from     │ │
│ │              │                  │  edges)                │ │
│ └──────────────┴──────────────────┴────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Key dimensions from `@wordpress/base-styles/_variables.scss`:
- `$nav-sidebar-width`: 300px
- `$header-height`: 64px (SiteHub)
- `$canvas-padding`: 16px (`$grid-unit-20`)
- `$sidebar-width`: 280px (right settings panel, inside editor)

### Two canvas modes

The layout toggles between **view** and **edit** modes via `?canvas=view|edit`:

**View mode** — Browse and manage. Sidebar visible, content area shows lists, canvas shows a preview in a floating rounded-corner frame with shadow.

**Edit mode** — Full-screen editing. Canvas expands to fill the viewport. Sidebar slides out (positioned `fixed` during exit animation). Uses CSS View Transitions (`view-transition-name: toggle`) for smooth morphing.

Our shell has no equivalent of this dual-mode concept. We're always in "view" mode conceptually, but individual apps (EditorApp, IframeApp) take over the full content area.

### Sidebar structure

The sidebar is a vertical flex column with three persistent regions:

```
┌────────────────┐
│ SiteHub (64px) │  Site icon (→ dashboard), site title (→ frontend), ⌘K button
├────────────────┤
│                │
│ SidebarContent │  Route-driven screens with slide animations
│ (flex-grow: 1) │  Back button + title + description + navigation items
│                │
├────────────────┤
│ SaveHub        │  Save/publish button with dirty-state awareness
├────────────────┤
│ SavePanel      │  Expandable multi-entity save review
└────────────────┘
```

#### SiteHub component

Top bar of the sidebar. Contains:

1. **Site icon** — Scaled to `0.5333` (34px rendered in 64px space) with `transform: scale(0.5333)`. Links to the WP dashboard (`__experimentalDashboardLink`). Focus ring uses `var(--wp-admin-theme-color)`.

2. **Site title** — `font-size: 15px`, `font-weight: 500`, `color: $gray-200`. Links to frontend in new tab. On hover, shows `↗` arrow character (`\2197`) via `::after` pseudo-element with opacity transition.

3. **Command palette button** — `search` icon, dispatches `commandsStore.open()`, shows `displayShortcut.primary('k')` as tooltip.

#### SidebarNavigationScreen

Each route renders a `SidebarNavigationScreen` — a reusable shell with:

- **Back button** (left chevron) — or dashboard link if `isRoot: true`
- **Title** — `Heading` component, `size: 20`, `color: #e0e0e0`, sticky at top with `$gray-900` background
- **Description** — secondary text in `$gray-400`
- **Content** — `ItemGroup` of `SidebarNavigationItem` components
- **Footer** — optional sticky bottom section with `border-top: 1px solid $gray-800`

#### SidebarNavigationItem

Uses `@wordpress/components` `Item` component:

```scss
color: $gray-600;                    // muted by default
padding: 10px 6px 10px 20px;
min-height: 40px ($grid-unit-50);

&:hover, &:focus {
  color: $gray-200;                  // brighten on interaction
}

&[aria-current="true"] {
  background: $gray-800;            // darker highlight for active
  color: $white;
  font-weight: 500;
}
```

Supports chevron indicator for drilldown (→), icon on left, and optional suffix.

#### Sidebar slide animations

Screen transitions use CSS keyframes, not JS animation:

```scss
@keyframes slide-from-right {
  from { transform: translateX(50px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}

@keyframes slide-from-left {
  from { transform: translateX(-50px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}

animation-duration: 0.14s;
animation-timing-function: ease-in-out;
```

Direction controlled by `SidebarNavigationContext`:
- `navigate('forward')` → `slide-from-right`
- `navigate('back')` → `slide-from-left`

After animation, focus is restored: back navigation focuses the element identified by `focusSelector`, forward navigation focuses the first tabbable element (usually the Back button).

### Content area

The middle column appears only in specific routes (pages list, patterns grid) and only in view mode:

```jsx
{ areas.content && canvas !== 'edit' && (
  <div className="edit-site-layout__area" style={{ maxWidth: widths?.content }}>
    { areas.content }
  </div>
)}
```

Styled with:
```scss
.edit-site-layout__area {
  flex-grow: 1;
  overflow: hidden;
  box-shadow: $elevation-x-small;
  border-radius: 8px;
  margin: $canvas-padding $canvas-padding $canvas-padding 0;
}
```

Content panels float inside the dark chrome with rounded corners and subtle shadows — same visual treatment as the canvas preview. This creates a consistent "cards on dark background" metaphor.

Route-specific width control: the pages route uses `widths.content = 380` when in list view, creating a narrow list + wide preview split.

### Canvas/Preview frame

The right column holds a `ResizableFrame` — an interactive, draggable preview of the site:

- **Default**: centered in container with padding, rounded corners (`$radius-large`), `box-shadow: $elevation-x-small`
- **Hover**: `box-shadow: $elevation-large` (lifts)
- **Edit mode**: expands to fill viewport, corners square off, shadows disappear
- **Resize handle**: drag to shrink preview width (responsive testing); keyboard-accessible with arrow keys
- **Snap threshold**: if dragged to within 200px of the sidebar edge, auto-transitions to edit mode

### Route system

Routes are registered as objects with `areas` — functions that return React elements for each region:

```javascript
export const pagesRoute = {
  name: 'pages',
  path: '/page',
  areas: {
    sidebar({ siteData }) { return <SidebarNavigationScreen ... /> },
    content({ siteData }) { return <PostList postType="page" /> },
    preview({ query })    { return <Editor /> },
    mobile({ siteData })  { return <MobilePagesView /> },
  },
  widths: {
    content({ query }) { return isList ? 380 : undefined },
  },
};
```

This is declarative and composable. Each route controls what appears in each region. The layout component just renders `areas.sidebar`, `areas.content`, `areas.preview` into the right slots.

### Animation and transitions

Three distinct animation systems:

1. **CSS keyframes** — Sidebar screen transitions (0.14s, ease-in-out)
2. **Framer Motion** (`AnimatePresence` + `motion.div`) — Sidebar enter/exit when switching canvas modes (0.3s, tween)
3. **react-spring** (`Controller`) — Canvas position/size FLIP animation (400ms, easeInOutQuint)
4. **CSS View Transitions** — Edit/view mode toggle morphing on the site icon

All respect `prefers-reduced-motion`.

### Dark chrome design language

The entire shell uses a dark theme:

| Element | Color | Token |
|---------|-------|-------|
| Shell background | #1e1e1e | `$gray-900` |
| Sidebar darker accents | #2f2f2f | `$gray-800` |
| Primary text | #e0e0e0 | `$gray-200` |
| Secondary text | #949494 | `$gray-400` |
| Muted text / icons | #757575 | `$gray-600` |
| Active item background | #2f2f2f | `$gray-800` |
| Active item text | #ffffff | `$white` |
| Content cards | `$elevation-x-small` shadow | Floating on dark bg |
| Admin theme color | varies | `var(--wp-admin-theme-color)` — used for focus rings |

Content areas (lists, editor) are light — they float as elevated cards on the dark background, creating visual hierarchy and spatial depth.

### Accessibility patterns

- **NavigableRegion** wraps each major area with ARIA landmarks and labels
- **useNavigateRegions** enables keyboard shortcuts to jump between regions
- Focus management after sidebar navigation (back → source element, forward → first tabbable)
- `VisuallyHidden` labels for non-obvious links (e.g., "opens in a new tab")
- `scrollbar-gutter: stable` prevents layout shift when content changes
- `contain: content` on sidebar for rendering performance isolation

---

## Comparison with our shell

### Layout structure

| Aspect | Site editor | Our shell |
|--------|------------|-----------|
| **Background** | Dark `$gray-900` chrome | Light `#f0f0f0` |
| **Sidebar width** | 300px fixed | 280px configurable via CSS var |
| **Sidebar header** | SiteHub: icon + title + ⌘K (64px) | Logo + title (variable height) |
| **Sidebar footer** | SaveHub (persistent save button) | None |
| **Content model** | Multi-area: sidebar + content + preview | Two-area: sidebar + single content |
| **Content styling** | Rounded cards floating on dark bg | Flat white fill |
| **Toolbar** | None (SiteHub is in sidebar) | 48px top bar (configurable) |
| **Canvas** | Resizable preview frame | N/A |
| **Edit mode** | Full-screen canvas takeover | N/A (apps fill content area) |

### Navigation

| Aspect | Site editor | Our shell |
|--------|------------|-----------|
| **Pattern** | Drill-down screens with back button | Flat list, all items visible |
| **Active state** | `$gray-800` bg + white text + medium weight | Accent color bg + white text |
| **Animation** | Slide left/right CSS keyframes (0.14s) | None |
| **Focus management** | Programmatic after navigation | Browser default |
| **Item height** | 40px (`$grid-unit-50`) | 36px |
| **Item padding** | 10px 6px 10px 20px | 8px 12px |
| **Item color (default)** | `$gray-600` → `$gray-200` on hover | `#ccc` → `#fff` on hover |
| **Groups** | Route-based screens | Inline labels + separators |
| **External links** | Not in sidebar nav | Supported (opens new tab) |

### Route system

| Aspect | Site editor | Our shell |
|--------|------------|-----------|
| **URL format** | Query params (`?p=/page&canvas=edit`) | Hash (`#/posts`, `#/editor/post/42`) |
| **Route definition** | Objects with `areas` functions per region | Config `applications` array with `source` string |
| **Region control** | Each route specifies what renders where | Single content area, app fills it |
| **Width control** | Per-route `widths` object | Fixed sidebar + flex content |
| **Mobile** | Separate `mobile` area per route | No mobile handling |

### Component patterns

| Aspect | Site editor | Our shell |
|--------|------------|-----------|
| **Motion library** | Framer Motion + react-spring + CSS keyframes | None |
| **Error handling** | `ErrorBoundary` wraps each region | None |
| **Loading state** | `useIsSiteEditorLoading` with debounce + timeout | Per-app spinners |
| **Plugin extensibility** | `SlotFillProvider` + `PluginArea` | None |
| **Notices** | `SnackbarNotices` from `@wordpress/notices` | Per-app inline notices |
| **Dirty state** | Global `__experimentalGetDirtyEntityRecords` | Per-app save logic |

---

## What to adopt

### Tier 1: Design language (high impact, achievable now)

**1. Dark chrome with elevated content cards**

The site editor's most distinctive design choice. Dark `$gray-900` outer shell with content areas rendered as floating cards with rounded corners and shadows.

Our shell already uses `#1e1e1e` for the sidebar but has a flat light background elsewhere. Adopting the dark chrome means:
- Change `wp-admin-shell-layout` background from `#f0f0f0` to `#1e1e1e`
- Add `border-radius: 8px`, `box-shadow`, and `margin` to the content area
- Content stays white/light — it floats on the dark background

This single change would make our shell visually match the site editor immediately.

**2. SiteHub-style sidebar header**

Replace our logo + title header with the site editor's pattern:
- Site icon (scaled, links to dashboard) on left
- Site title (links to frontend, shows `↗` on hover) center
- Command palette button (search icon) on right
- Fixed 64px height

This replaces our separate toolbar's command palette function and creates visual consistency.

**3. Sidebar typography and spacing**

Adopt the site editor's specific values:
- Nav items: `$gray-600` default → `$gray-200` hover → `$white` active
- Active state: `$gray-800` background (not accent color) + `font-weight: 500`
- Item height: 40px minimum
- Padding: `10px 6px 10px 20px`
- Title headings: `size: 20`, `color: #e0e0e0`
- Description text: `$gray-400`

Our current accent-color active state is more opinionated. The site editor's neutral active state is more flexible — it works regardless of branding. Consider making accent-color active state a config option, with the neutral `$gray-800` as default.

### Tier 2: Layout patterns (medium effort, high value)

**4. Route-driven area model**

The site editor's `areas` pattern is powerful:
```javascript
areas: {
  sidebar: () => <NavScreen />,
  content: () => <PostList />,
  preview: () => <Editor />,
}
```

Our shell could adopt this. Instead of one content region, routes could specify what renders in multiple areas. A `core:posts` route might show a narrow list in `content` and a post preview in `preview`. This is the heart of making the site editor pattern work for the whole admin.

This would require reworking `ShellContent` from a single-app renderer to a multi-area layout, and extending `admin.json` to support area mappings per route.

**5. Sidebar drill-down navigation**

Replace our flat nav list with the site editor's screen-based navigation:
- Root screen shows top-level sections (each with chevron →)
- Clicking drills into a sub-screen with back button (←)
- Slide animations (0.14s CSS keyframes)
- Focus restoration after navigation

wp-leftbar also uses this pattern (their "drilldown" folder type). Two independent implementations validating the same UX.

**6. Content area styling**

Content panels as floating cards:
```scss
.shell-content-area {
  flex-grow: 1;
  overflow: hidden;
  box-shadow: $elevation-x-small;
  border-radius: 8px;
  margin: 16px 16px 16px 0;
}
```

The gap between the sidebar and content card, plus the padding around the canvas, creates visual breathing room and spatial hierarchy.

### Tier 3: Behavioral patterns (higher effort)

**7. View/edit canvas modes**

When editing a post, the content area could expand to fill the viewport (edit mode), hiding the sidebar. A back button or escape returns to view mode. This matches the site editor's `?canvas=edit` behavior.

Would require:
- Canvas mode state management
- Sidebar exit animation (Framer Motion or CSS transitions)
- View-transition-name for smooth icon morphing

**8. NavigableRegion accessibility**

Wrap sidebar, content, and preview areas in `NavigableRegion` components with ARIA labels. Add `useNavigateRegions` for keyboard region jumping. This is an accessibility improvement that matches the site editor's patterns.

**9. Global save hub**

Instead of per-app save logic, track dirty entity records globally using `__experimentalGetDirtyEntityRecords`. Show a persistent save button in the sidebar footer (SaveHub pattern). This is how the site editor handles saves — one place to review and commit all changes.

**10. Error boundaries per region**

Wrap each area in `ErrorBoundary` so a crash in one region doesn't take down the whole shell. The site editor does this for sidebar, content, and preview independently.

### What NOT to adopt

- **ResizableFrame** — Responsive preview testing is specific to the site editor's use case. Our shell manages admin apps, not site appearance.
- **react-spring** for FLIP animations — Over-engineered for our needs. CSS transitions are sufficient.
- **CSS View Transitions** — Limited browser support and specific to the edit/view toggle. Not worth the complexity yet.
- **Theme preview mode** — Site-editor-specific feature.
- **SlotFill plugin extensibility** — Important long-term but not for MVP. Our config-driven approach is simpler.

---

## Summary: The vision

The site editor's layout creates a spatial hierarchy:

> Dark chrome → floating content cards → full-screen editor

This metaphor can extend to the entire admin. Instead of just "Design" (styles, templates, pages), the sidebar could organize the full admin: Content, Media, Users, Settings, Plugins — each with drill-down sub-screens. Content areas float as cards on the dark background. Editing anything transitions to full-screen. The ⌘K palette connects everything.

The key insight: **the site editor already IS a configurable admin shell** — just one hardcoded to design tasks. Our project makes that pattern generic and user-configurable via `admin.json`.
