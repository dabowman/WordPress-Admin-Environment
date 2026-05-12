# The home of the hackable internet

> *Working title — captures the ethos, probably not the published headline.*

The deeper I get into the WordPress Admin Shell project the more excited I get about it, and the more important I think it is. A couple of recent conversations made the *why* a lot clearer than I'd been able to articulate myself. Worth telling those first.

## Two conversations

Just before RSM I was at a family dinner with my cousin. He maintains the network and software for one of the colleges at the University of Utah — the quintessential in-house engineer who's built most of the system himself and deeply understands the organization. They run a number of WordPress sites. He openly hates WordPress and we always end up in nerd fights about it.

This time he was literally in the middle of building a custom CMS to replace their WordPress sites because he was tired of content creators breaking things. We talked through his challenges. Classic WordPress problems — the kind we see in VIP every day. All solvable with good roles, permissions, and tooling like the Block Governance plugin we shipped a while back.

Then I described what I was starting to build for RSM — a configurable shell that lets you ship whatever admin experience makes sense for your users on top of WordPress. He lit up. Giving his content team a stripped-down, locked-down interface without ditching WordPress was exactly what he wanted. He said if that existed, he would not only stop trashing their WordPress sites — he'd start centralizing *more* onto WordPress. He has a custom inventory tracking system he built for the University. Things that have nothing to do with content at all.

Fast forward a couple of weeks. I'm in NYC for the first week of AI enablement. Late, jet-lagged, hunting for food around midnight. Found an empanada place around the corner. The owner was friendly, heard I work for a software company, and immediately started telling me about how much he loves Claude Code and how many vibe-coded apps he's built. A scheduling app for his employees. An app for his flip phone that lets him call Claude for directions so he doesn't have to carry a smartphone. Clearly a hustler, clearly more tech-savvy than most. He cheerfully admitted the stuff he makes is janky, but it solves real problems for him and he likes that it's exactly what he wanted instead of whatever a SaaS product happens to offer. He's not afraid of making software. He likes the outcome more than anything he could have bought off the shelf.

Two very different people, same lesson.

## What I keep coming back to

**People aren't afraid of making their own software.** Given a low enough floor, they make tools that fit them. The vibe-coding wave already proved this — what felt like a hobbyist novelty turned out to be the way a huge slice of the world wanted to work as soon as the floor dropped.

**In the process of making their own software, they reach for meta-SaaS for everything underneath.** Hosting, auth, caching, media, a WYSIWYG editor, a database, scheduled jobs, a way to ship updates. To get to "software I own and shaped," they end up assembling a stack of rented services. They gain customization on the surface and trade away ownership of the substrate it runs on.

WordPress is the answer to that second problem, and it's been the answer for twenty years. Auth, users, roles, content modeling, a media library, a database, a REST API, a CLI, a cron system, a hosting story, an enormous extension ecosystem — all free, all hackable, all maintained by an enormous community, all battle-tested. Everything a custom web app actually needs, already built and proven. Forty percent of the web already trusts it.

When the internet was about *websites*, WordPress was the natural home for the generation of makers who wanted to build things on the internet. Things have moved beyond websites. People want to visualize data, track projects with a team, connect tools to their agents, host media, build small custom things for themselves. WordPress is the natural home for that work too. Same substrate, different surface.

## The admin is the wall

If you want to build something as a WordPress application, you have to go through wp-admin. That's fine if you're making a website. If you're not, it makes no sense. The substrate underneath is one of the most stable and flexible things on the open web, but the way you interact with it pre-decides that what you're making is a website.

My cousin called it Swiss-army syndrome. In the pursuit of being able to do everything, the admin has become too complicated for any one person to actually use. He's not wrong. That's most of what's wrong with wp-admin today.

If the admin became modular and cleanly customizable — if the *shell* that renders on top of WordPress could be different for different users and different kinds of work — the substrate underneath would finally be reachable for the things people are actually trying to build. WordPress would make good on its long-standing promise of being the operating system for the open web.

## What this means in practice

A WordPress admin where the unit of customization is small enough to match the unit of intent. Not "install an app." Not "configure a screen." Pin a button. Save a view. Compose a dashboard from things you already have. Ask an agent to assemble a tool from your site's data and capabilities. Share what you made with a teammate the way you'd share a Notion template or a LEGO build.

Every tool a user composes runs on the same primitives WordPress already exposes — REST calls, queries, capabilities, content. The agent is the translator between *what I want to do* and *the API call that does it*. The shell is the canvas it gets assembled on, the runtime it executes in, and the distribution channel it travels through when shared.

Same primitives whether you're pinning a shortcut, composing a view, or generating a custom dashboard with charts and an image generator. Same security model — a tool can never exceed what its author could do manually. Same artifact — an inspectable manifest, not opaque code, so what got made can be reviewed, forked, audited, or regenerated.

## What makes this safe to give to ordinary people

The hard part of "let ordinary people shape their admin" is not the UI. It's the model underneath that decides what they're allowed to touch and what their changes do to everyone else on the site.

The shell resolves every admin from six layered origins: **core**, **engine**, **plugin**, **site**, **role**, **user**. Each origin contributes a slice of declarative JSON. They merge in that order — each layer can override the previous, but only where the previous explicitly opted in. A site admin marks the sidebar branding as customizable; a role can change it; a user cannot reach past either. A plugin author marks a region as restricted; nothing below can lower the floor. Capabilities work the same way: the manifest declares the minimum cap to mount an app, and no install-level override can soften that. The merge is restrict-only by default and permissive only where someone with the authority to decide has said so.

That model — cascade with explicit opt-in to customization, plus capability gates that can only be raised — is what lets the same surface accept edits from a developer, a site owner, an administrator setting policy, and an end user pinning a button to their own view, without any of them being able to break the others. It's the same shape `theme.json` proved on the frontend. It's how shaping the admin can be a normal user action instead of a privilege held by whoever owns deploy.

## What makes this open at the design level

A substrate that ships with one look is not a substrate. It's a product.

The shell separates the chrome from the design system that paints it. Engines describe layout — regions, templates, how things compose. The design system is plugged into a seam: WPDS by default, but any engine can ship its own — Material, Tailwind tokens, a brand-locked palette, a customer's existing system. Author customization layers on top: seeds that derive a full palette from a few colors, scoped seeds per region or app, direct token overrides for the cases seeds can't reach, and W3C-standard primitive tokens as the bottom layer.

That means the substrate doesn't impose a visual identity on anyone who builds on it. A hosting company can ship the chrome that matches their product. An agency can ship a brand-locked shell for their clients. A plugin author can ship one that matches their existing UI. The shell is neutral the way the web platform is neutral — it provides the runtime; it doesn't tell you what your site is supposed to look like.

## Where this actually is today

The substrate is real. The vision on top of it is not all the way there yet, and it's worth being clear about which is which.

**Built and shipped (v2.0.0-beta.1).** Two tagged betas. A plugin that activates on any WordPress 6.7+ install and renders the admin from `admin.json`. The six-origin cascade with restrict-only merge and capability floors. Four-layer capability gating. Engine-pluggable `ThemeProvider` seam with WPDS as the default. Two engines in the box (a default chrome and a single-pane mobile layout). The four-tier styling model — seeds, scoped seeds, slot overrides, DTCG primitive tokens. URL-driven routing where the URL is the full app state. A default install shell (`wp-admin-default`) that mirrors wp-admin's nav and capability gating so the migration story is "the shell renders wp-admin by default, and you shape it from there." Sixteen native apps (posts, pages, media, users, comments, plugins, themes, settings, dashboard, site health, profile, and so on) backed by DataViews and `@wordpress/core-data`. An iframe escape hatch for every screen not yet ported, reachable from day one. The command palette. Keyboard bindings declared in `admin.json`. A dirty-state guard that intercepts in-shell navigation, browser back, and `beforeunload`. Six wired extension points — filter the merged config, filter per origin, register a `plugin:*` app, register a region template into an engine, register a whole engine, register a complete shell programmatically. 571 test assertions across schema, cascade, manifest, capability, runtime resolution, and a worked example from the spec. Manual a11y, keyboard, and perf passes signed off on 2026-05-06.

That's the substrate. It is the safe-edit, design-neutral, capability-honest layer the rest of the vision plugs into.

**Where the potential is, not yet built.** Three gaps separate "the substrate exists" from "ordinary people compose their own admin."

The first is the *authoring surface*. Today shells are JSON files edited by hand or registered programmatically. The cascade is ready to accept an end user pinning a button or saving a view — those edits would land in the user-origin slice, scoped by what site and role have marked customizable. There's just no in-product gesture wired to that slice yet. "Pin this," "save this view," "drop this widget on the dashboard" are UI surfaces that compile down to user-origin writes the resolver already knows how to merge.

The second is the *agent layer*. The shell is structured so an agent can produce a tool by emitting a manifest — admin.json fragments, app registrations, region edits — that goes through the same cascade and capability checks as any other origin. A tool generated by an agent cannot exceed what its invoker could do manually, because the cap floor it runs under is enforced at four layers it can't see past. The Abilities API gives core a way to expose verbs to an agent. None of the integration is built yet. The substrate's job was to make sure that when it is, the security and review story is already settled.

The third is *distribution*. Shells today ship bundled with the plugin or registered from disk. The vision asks for "share what you made with a teammate the way you'd share a Notion template" — export, import, fork, paste, gallery. The artifact is already the right shape: it's JSON, it's inspectable, it diffs, it's signed by the origin that registered it. What's missing is the surfaces that move bundles between sites — export to file, install from URL, a directory of community shells, role-scoped install.

Each of these is a separate piece of work. None of them require relitigating the substrate. That's the point of getting the substrate right first.

## Why now

Three things are true at once for the first time.

**The substrate is ready.** Twenty years of WordPress have produced a complete application platform — auth, data, capability, extension, addressable end-to-end via REST and WP-CLI. The block editor proved React-native admin experiences can compose against it.

**The audience is ready.** My cousin and the empanada-shop owner are the same person at different points on a curve. Forty percent of the web already trusts WordPress with their content. The slice of that population now making their own tools is exactly the audience this opening is for.

**The translation layer is ready.** Agents can now bridge intent and implementation at conversational speed. The thing that historically split *people who configure* from *people who use* — the technical knowledge required to assemble capability into a tool — is dissolving. Composition can happen on demand, at the moment of need, in the user's own words.

None of these alone is enough. Together they're a once-in-a-platform-generation opening.

## What we're claiming

WordPress becomes the most accessible app-building substrate in the world, because it inherits twenty years of capability and an enormous installed base, and because the shell makes that capability composable by ordinary people — under a merge model that lets them edit safely and a design seam that doesn't lock the look.

This is bigger than a better admin. A better admin is a refactor. This is a movement: WordPress as the place where the open web's tools are built, by the people who use them, on infrastructure they already own.

The home of the hackable internet — in the good way. Hackable as in *yours to shape*. Not yours to break.

## The test

Every architectural decision gets a single question: *does this make the platform more or less hospitable to ordinary people building their own software?*

That's the north star. The spec describes what gets built. This describes why it matters.
