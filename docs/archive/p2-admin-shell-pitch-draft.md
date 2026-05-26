# An admin shell for WordPress

WordPress has spent the last several years trying to figure out what its admin should look like. Calypso. Calypsoify. Untangling. The Hosting Dashboard. The Multi-site Dashboard. Next Admin. CIAB Admin. The OmniBar. Each is a serious attempt by talented people to solve a real problem, and each has produced design work and architectural insight the project would benefit from shipping.

Most of it hasn't shipped. Or has shipped to a narrow audience. Or has shipped and then been undone.

The admin shell isn't another redesign. It's a config layer that sits between WordPress and whatever interface renders on top of it — the same pattern the project already accepted on the front end with block themes and `theme.json`. The goal is to make the design work that's already happened available to anyone, on any install.

## What the shell actually is

A shell is the orchestration layer between WordPress's capabilities and the interface used to manage them. Linux has GNOME and KDE. The frontend has block themes. The admin doesn't have an equivalent.

The shell is driven by `admin.json` — the admin equivalent of `theme.json`. Where `theme.json` declares how the frontend looks, `admin.json` declares the regions of the admin, which applications mount where, and how the chrome is styled.

The runtime reads the file, renders the configured layout using `@wordpress/components`, mounts applications into the content region, and lets everything talk to WordPress through the REST API and `@wordpress/core-data`. Applications are either native React (DataViews-driven post lists, the block editor, the media library) or iframed legacy screens. The legacy iframe is a feature, not a compromise — every existing wp-admin page is reachable from day one.

Multiple `admin.json` files can coexist on a single install. Different shells for different people, all on the same WordPress.

The full technical design spec is in progress and will be published separately. This post is about what the shell *is for*.

## What it unlocks for past and present work

**Untangling Calypso.** The cross-context IA that Lucas and the team have been refining in FigJam — Simple Calypso, Simple wp-admin, Atomic, Jetpack self-hosted reconciled into one — has been blocked on the question of where it ships. It ships in a shell. The shell is the rendering target. One configuration declares the unified IA, and the same admin renders consistently across every context, without porting screens one at a time.

**Next Admin / CIAB Admin.** Riad's team built almost exactly the architecture the shell needs — a SPA on `@wordpress/components`, DataViews-driven, REST-only, route-synced, with extensible filter-based view configuration. None of that work has to be thrown away. The View Configuration API is the server-side counterpart to `admin.json`'s declarative shape. They compose naturally. Work that was paused can move into a vehicle that doesn't depend on a single product launch to justify itself.

**Multi-site Dashboard and the OmniBar.** The chrome inconsistency between MSD and wp-admin is shipping pressure right now. Phil described it directly: the OmniBar changes as users switch between contexts. A shell solves that by *being* the chrome — one render path for the admin frame, configurable per environment.

**The Core admin redesign.** The shell sits above Core. It consumes `@wordpress/components`, `@wordpress/core-data`, the command palette, the Abilities API, DataViews, DataForm. Every improvement Core ships in 7.0, 7.1, and beyond automatically lands in the shell. It's not a competing track.

**Plugin authors and hosts.** The Abilities API, the command palette, and the entity layer already give plugins programmatic access to the admin. The shell exposes that access declaratively. Hosts can ship their own shell. Agencies can ship a client shell. Plugin authors can register applications without owning the chrome.

## Why this is worth doing now

The conversation about what the WordPress admin should be has been hard to resolve, and it's been hard for a reason: there isn't a single right answer. The premise that there is one might be the thing holding the work back. Different users genuinely need different admins.

We already accepted this on the frontend. A small business site, a publisher, a portfolio, and an enterprise CMS all run WordPress with completely different themes, and nobody thinks that's strange. The frontend is configurable, the backend isn't, and that asymmetry is at the root of most of the friction we keep running into.

`theme.json` was the moment the frontend stopped requiring everyone to agree on what a website looks like. `admin.json` could be that moment for the admin.

## What exists today

A working MVP plugin. Activates on any WordPress 6.7+ install, mounts into wp-admin, and renders three different shell configurations from bundled `admin.json` files: a focused content-author shell, a branded client portal, and a developer admin with everything turned on. Native applications for posts, pages, the block editor, media, and user profiles. Iframed legacy screens for everything else. Cmd+K command palette scoped to the active shell. Build is ~16KB JS, ~4.5KB CSS.

It uses only `@wordpress/*` packages and the design system that already exists. No new component library, no new data layer, no new admin pattern. Just the building blocks the project has been investing in for years, composed in a way that makes them addressable as a unit.

## What I'd like

Feedback — especially from anyone who's worked on the projects above. Your design work, architectural decisions, and the lessons you've taken from them are the foundation this is built on. If the shape of `admin.json` is wrong, I want to hear about it before the spec is published. If the shell could plug into Untangling's IA work, the View Configuration API, or the OmniBar in a way I haven't thought of, I want to hear that too.

The idea was sparked by a plugin Joen presented at the design meetup that let users customize the wp-admin sidebar and top bar. That demo, plus the realization that Linux has had configurable desktop environments for thirty years and WordPress's admin still doesn't, is most of why this exists.

Repo: https://github.com/dabowman/WordPress-Admin-Environment

The full design spec will be the next post.

cc: @youknowriad @copons @morddeth @oandregal @arasaraskocaoglan @themeshaper @joen @annezazu @jboland8 @emdashcodes @matiasventura @m
