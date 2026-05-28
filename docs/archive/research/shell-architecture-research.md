# Shell Architecture Research
## How configurable environments structure themselves — and what WordPress can learn

---

## The core abstraction

Every shell environment, regardless of domain, solves the same problem: **separate the interface from the system it controls.** The system provides capabilities (files, processes, windows, content, data). The shell provides the interaction model — how you navigate, invoke, compose, and perceive those capabilities. When this separation is clean, you can swap the shell without changing the system, and extend the shell without breaking it.

Three architectural layers recur across every environment studied:

1. **System layer** — the kernel, API, or data model (Linux kernel, WordPress REST API, language server protocol)
2. **Shell layer** — the navigation, layout, chrome, and interaction patterns (GNOME Shell, bash, VS Code workbench)
3. **Configuration/theming layer** — the declarative description of what the shell looks like and how it behaves (dotfiles, theme.json, KDE Global Themes, VS Code settings.json)

The most successful environments make layer 3 powerful enough that most customization never requires touching layer 2.

---

## Linux desktop environments

### GNOME Shell

GNOME Shell is the most tightly opinionated of the major DEs. Its architecture separates the **compositor** (Mutter, which manages windows and rendering via Wayland/X11) from the **shell UI** (written in JavaScript using GJS bindings to the GNOME platform). Extensions are JavaScript modules that load directly into the shell process — they effectively become part of GNOME Shell at runtime, with access to the same APIs the shell itself uses.

Key architectural patterns:

- **Clutter/St widget toolkit**: The shell UI is built on Clutter (low-level actor model for compositing) and St (higher-level widgets with CSS support). This means the shell's visual layer is styled via CSS, separate from the widget logic.
- **Extensions as code injection**: GNOME extensions aren't sandboxed. They can modify, replace, or wrap any part of the shell UI — panels, menus, the overview, workspace management, notifications. This is extremely powerful but fragile; extensions frequently break across GNOME versions because there's no stable extension API contract.
- **No declarative configuration**: GNOME deliberately doesn't offer a configuration file for shell layout. Customization happens through dconf/gsettings (programmatic key-value store) or through extensions. There's no equivalent of "here's a JSON file describing my shell."

**Lesson for WordPress**: GNOME's extension model proves that injecting arbitrary code into the shell is powerful but creates an ecosystem fragility problem — the exact same problem WordPress has with `admin_menu` hooks and PHP-based admin customization today. A WordPress shell needs a more stable API contract.

### KDE Plasma

KDE Plasma takes the opposite approach from GNOME: maximum modularity and declarative configuration. Plasma's architecture is built around several distinct, swappable layers:

- **KWin** (compositor/window manager) — handles windows, compositing, effects, and desktop switching. Can be replaced independently (people run i3 or Sway with Plasma's other components).
- **Plasma Shell** — the panel, system tray, desktop containment, and widget hosting. Written in QML (Qt's declarative UI language).
- **Plasmoids** (widgets) — self-contained QML applications that can be embedded in panels, the desktop, or dashboards.
- **Global Themes** (formerly "Look and Feel" packages) — declarative bundles that package together a panel layout template, icon theme, Plasma style, color scheme, task switcher, splash screen, and lock screen theme. Applying a Global Theme can completely transform the shell experience.
- **Layout templates** — JavaScript files (`org.kde.plasma.desktop-layout.js`) that programmatically construct panel configurations, widget placement, and desktop organization. These are executed when a theme is applied.

Key architectural patterns:

- **Package-based extensibility**: Everything — themes, widgets, layouts, wallpaper engines, window decorations — is a "package" with a standard directory structure and metadata. Packages are installed to well-known filesystem paths and discovered automatically.
- **Declarative + imperative hybrid**: Visual styling is declarative (SVG themes, color scheme INI files, QML). Layout is imperative-declarative (JavaScript layout scripts that call APIs like `panel.addWidget("org.kde.plasma.systemtray")`).
- **Separation of shell definition from shell appearance**: Plasma distinguishes between the "shell definition" (which panels exist, what widgets they contain, how they're arranged) and the "shell look and feel" (colors, icons, visual styling). These are independent packages that can be mixed.

**Lesson for WordPress**: KDE's Global Theme concept is the closest existing analog to what a "WordPress admin environment" package would look like — a single installable bundle that declares the entire admin experience: navigation structure, screen layout, toolbar configuration, color scheme, and typography. The JavaScript layout script pattern (imperative code that builds the shell using a high-level API) maps directly to how a WordPress shell configuration could work.

### COSMIC (System76)

COSMIC is the newest entrant, built from scratch in Rust using the Iced toolkit. System76 explicitly cited GNOME's extension fragility and limited customizability as motivation.

Key architectural patterns:

- **Same toolkit everywhere**: The compositor, shell, and applications all use the same Rust/Iced toolkit. This means the skills and patterns for building an applet are identical to building an app or modifying the shell itself.
- **Modular architecture for branded experiences**: System76 explicitly designed COSMIC so that other companies or projects could build "branded user experiences" on top of it. Panels, applets, theming, tiling, the launcher, app library, keyboard shortcuts, and workspaces are all independently configurable.
- **Custom theming system**: Rather than inheriting GTK theming or Qt theming, COSMIC has its own theming engine with organization color palette support that doesn't compromise readability.
- **Epoch-based roadmap**: Feature development is organized into "Epochs" (6–8 month cycles), with rolling weekly releases. This is notable because it treats the shell as a product with its own release cadence, independent of the OS.

**Lesson for WordPress**: COSMIC's "branded experiences" framing is exactly the WordPress shell use case. Their explicit goal — letting organizations create custom OS experiences with their own branding and workflow — maps directly to letting WordPress agencies or SaaS builders create custom admin experiences for their clients.

### Tiling window managers (Hyprland, Sway, i3)

Tiling WMs represent the minimal end of the shell spectrum: no desktop, no widgets, just window management + a status bar + a launcher, all driven by configuration files.

Key architectural patterns:

- **Plain-text declarative configuration**: Hyprland uses `~/.config/hypr/hyprland.conf`, Sway uses `~/.config/sway/config`. These are human-readable files that declare keybindings, layouts, window rules, monitor configuration, and startup programs. Changes are live-reloaded.
- **IPC (Inter-Process Communication) as the extension model**: Rather than an extension API, tiling WMs expose Unix sockets or CLI tools for control. Hyprland has `hyprctl` and two Unix sockets that broadcast events (focus changes, window creation, workspace switches). Any language can interact with the WM by sending/receiving messages over these sockets.
- **Composable tooling**: The status bar (Waybar), launcher (wofi/rofi), notification daemon (mako/dunst), and other shell components are separate programs that communicate via IPC. The WM doesn't own these — you pick and compose them. Waybar's configuration is a separate `config.jsonc` with modules declared for left/center/right regions.
- **Layout as a first-class concept**: Tiling WMs treat layout algorithms as pluggable. Hyprland ships two built-in layouts (dwindle and master) and supports additional layouts as plugins.

**Lesson for WordPress**: The IPC model is deeply relevant. WordPress already has its IPC equivalent — the REST API and WP-CLI. The composable tooling pattern (status bar, launcher, and notification daemon as independent programs) maps to WordPress admin components (admin bar, sidebar nav, notices system, editor) as independent, swappable modules that communicate through a shared protocol rather than being hardcoded together.

---

## Terminal shells

### Bash/Zsh: The dotfile paradigm

Traditional Unix shells configure themselves through dotfiles (`.bashrc`, `.zshrc`) — imperative scripts that run at startup and set up the environment. This pattern has several properties:

- **Configuration is code**: Your shell config is a program that runs. It can conditionally load plugins, set variables based on context, and compose behaviors dynamically.
- **Plugin managers as ecosystem enablers**: Oh My Zsh, Zinit, Fisher (for fish) — these are package managers for shell configuration. They solve the discovery, installation, versioning, and dependency management problems that emerge when configuration is code.
- **Prompt as a composable UI**: Tools like Starship provide a cross-shell prompt configuration in TOML format — a declarative layer on top of the imperative shell. This is the "theme.json for your terminal prompt."

### Fish: Sensible defaults + web-based configuration

Fish's innovation is shipping with good defaults (autosuggestions, syntax highlighting, smart completions) that other shells require plugins to achieve. Its configuration is split between a config file and a web-based configuration UI (`fish_config`) that lets you preview and select themes, functions, and completions from a browser interface.

**Lesson for WordPress**: Fish's philosophy — make the default experience great without requiring configuration, but expose configuration for those who want it — is a strong model for a WordPress shell. The default wp-admin should be good enough for most users, but the shell framework should make it easy to customize for those who need to.

### Nushell: Structured data as the interface contract

Nushell represents a philosophical break from POSIX shells. Instead of passing text between commands, it passes structured data (tables, records, lists). Commands have typed inputs and outputs. The shell understands JSON, YAML, TOML, CSV, and SQLite natively.

Key insight: **When the data contract between shell components is structured rather than text, components can evolve independently without breaking each other.** POSIX shells' reliance on text parsing means that changing a command's output format breaks every downstream script. Nushell's structured approach means the shape of the data is the contract, not the formatting.

**Lesson for WordPress**: This is directly analogous to the difference between WordPress admin's current approach (PHP rendering HTML strings that get concatenated) and a shell that communicates through the REST API's structured JSON responses. A WordPress shell built on structured data contracts (the REST API schema) would be far more resilient to changes in the underlying system than one built on HTML scraping or PHP hooks.

---

## Application shells: VS Code

VS Code is arguably the most relevant precedent for a WordPress admin shell because it's a web-based application (Electron) that solved exactly the problem of making a complex workspace extensible without letting extensions destabilize the host.

### Workbench architecture

VS Code's UI is organized into named regions — the **workbench**:

- **Activity Bar** — the leftmost icon rail, where extensions register view containers
- **Primary Sidebar** — renders views associated with the active view container
- **Secondary Sidebar** — additional views, user-configurable
- **Editor Group** — the central area where editors, webviews, and custom editors render
- **Panel** — bottom area for terminal, problems, output
- **Status Bar** — contextual information and extension-contributed items

Each region is a container that accepts **contributions** — declared in the extension's `package.json` manifest file. Extensions declare what they contribute (a view container, a tree view, a command, a status bar item) and VS Code places those contributions into the appropriate regions.

### Key architectural patterns

- **Manifest-driven contribution**: Extensions declare their UI contributions in `package.json` using a structured schema. The extension doesn't imperatively create UI — it declares what it provides, and the workbench places it. This is a **declarative shell configuration** model.
- **Extension Host isolation**: Extensions run in a separate process from the workbench. They cannot access the DOM. They communicate through a message-passing API. This prevents extensions from destabilizing the UI and allows VS Code to change its internal DOM structure without breaking extensions.
- **Activation events**: Extensions aren't loaded until they're needed. They declare activation triggers (a command is executed, a file type is opened, a view is revealed) and VS Code loads them just-in-time.
- **Contribution points as the extension surface**: The set of things extensions can contribute is explicitly defined and versioned: view containers, views, commands, menus, keybindings, themes, webviews, custom editors. This bounded surface area is what makes the ecosystem stable.
- **Webviews as the escape hatch**: When the standard contribution points aren't enough, extensions can create a Webview — a sandboxed iframe with full HTML/CSS/JS — that renders in an editor tab or sidebar. This is the "custom admin page" equivalent.

**Lesson for WordPress**: VS Code's architecture is the strongest model for a WordPress admin shell. The manifest-driven contribution model (extensions declare what they provide in a structured file, the workbench places them) maps directly to a WordPress plugin declaring its admin shell contributions in a structured configuration. The extension host isolation pattern solves the stability problem. The webview escape hatch ensures that custom screens can still exist when the standard regions aren't sufficient.

---

## Synthesis: Patterns that recur across all environments

| Pattern | Linux DE | Terminal Shell | VS Code | WordPress Analog |
|---|---|---|---|---|
| **Named layout regions** | Panels, desktop, system tray | Prompt segments (left, right, transient) | Activity bar, sidebar, editor, panel, status bar | Admin bar, sidebar nav, screen area, notices |
| **Declarative configuration** | KDE Global Themes, Hyprland conf | Starship TOML, fish config | settings.json, package.json contributions | `theme.json` (exists for frontend, not admin) |
| **Package/bundle system** | KDE packages, GNOME extensions | Oh My Zsh plugins, Fisher packages | Extension VSIX packages | Plugins (but no admin shell packaging) |
| **IPC / message protocol** | D-Bus, Wayland protocol, Unix sockets | Pipes, structured data (Nushell) | Extension Host API, message passing | REST API, WP-CLI (exists, unused for shell) |
| **Theming separate from layout** | Plasma Style vs. Layout Template | Prompt theme vs. shell config | Color theme vs. workbench layout | Block theme vs. admin theme (admin doesn't exist) |
| **Sandboxing/isolation** | KDE out-of-process extensions, Wayland protocol isolation | N/A | Extension Host process | No admin extension isolation currently |
| **Sensible defaults** | GNOME's opinionated defaults, Fish's out-of-box experience | Fish autosuggestions | VS Code ships usable without extensions | wp-admin is the default (but not swappable) |
| **Escape hatches** | GNOME: full JS injection; KDE: QML widgets | Shell functions, external commands | Webviews (sandboxed HTML/CSS/JS) | Custom admin pages (PHP, no framework) |

---

## Implications for a WordPress admin shell

Based on these patterns, a WordPress admin shell architecture would need:

1. **A shell manifest format** — analogous to VS Code's `package.json` contributions or KDE's Global Theme packages. A structured file (JSON, likely extending or paralleling `theme.json`) that declares: what navigation items exist, what screen regions are available, what toolbar actions appear, what the default route is, how the editor chrome behaves.

2. **Named, composable layout regions** — like VS Code's workbench regions or Waybar's left/center/right modules. The admin shell defines a set of regions (navigation, toolbar, main content, secondary panel, status) that "applications" (the editor, media library, settings screens, custom plugin screens) mount into.

3. **An application registry** — the set of available "admin applications" (post editor, media library, site settings, plugin manager, custom screens) registered with the shell, each with metadata about its capabilities, required permissions, and preferred region.

4. **IPC through the REST API** — the shell communicates with WordPress through the REST API, not through PHP template rendering. This is what makes the shell swappable — the same REST API serves wp-admin, Calypso, WP-CLI, and any custom shell.

5. **A theming layer independent of layout** — like KDE's separation of Plasma Style from Layout Template. An admin shell's visual appearance (colors, typography, spacing, density) should be configurable independently from its structural layout (what regions exist, what goes where).

6. **Extension/contribution isolation** — plugins that contribute to the shell should do so through declared contribution points (like VS Code) rather than arbitrary code injection (like GNOME extensions or WordPress's current `admin_menu` hooks). This makes the shell resilient to plugin conflicts.

7. **The block editor as an embeddable application** — the `@wordpress/edit-post` and `@wordpress/edit-site` packages already function as self-contained React applications. A shell architecture would treat the editor as one of several "applications" that mounts into the shell's content region, not as the thing the shell is built around.

8. **Sensible defaults with progressive customization** — like Fish's philosophy. The default shell should be wp-admin as it exists (or better). Custom shells should be installable as packages, like KDE Global Themes or VS Code extension packs.
