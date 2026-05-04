# Schema Exercise — Findings

Writing the JSON Schemas for `app.json`, `engine.json`, and `admin.json` forced every implicit rule from the spec into explicit machine-readable form. This is a record of what the exercise revealed: gaps it found, decisions it forced, and what the runtime must do that the schema cannot.

---

## Gaps the exercise surfaced in the spec

### 1. Role inheritance for nested children was implicit

The spec says regions may inherit `role` from their template, and that templates may declare nested children that get full region treatment when instantiated. But the spec didn't spell out what happens for a *child* region declared in admin.json under a parent that uses a template — does the child inherit anything from the corresponding template-shipped child? In practice, yes (otherwise admin.json would have to redeclare every template child verbatim), but the spec didn't say so explicitly.

**Resolution.** Document the inheritance chain: a nested child whose parent uses `template` looks up its name in the parent template's `regions` block; if found, the role/platform/default-style of that template-child becomes the inheritance base. If not found, the child is a from-scratch declaration and must declare role itself. Spec §5.5 needs this paragraph added.

### 2. `role` resolvability is not statically checkable

The `if no template, then role required` rule from the earlier draft fails for nested children that inherit context from parents. JSON Schema can't reach across documents (or even across sibling fields in many cases) to determine whether a child's role is resolvable.

**Resolution.** Drop role-required-as-static-rule. Schema validates structural shape; runtime validates resolvability at mount time, with a clear error message if a region's role cannot be resolved (no template, no inherited child, no explicit role declaration). The schema description for the `region` def documents this division of labor.

### 3. `$wpds` should be required, not optional

The earlier draft wrote `$wpds` as a required top-level field but the prose around it was permissive ("pin the WPDS slot matrix"). Without a pin, the `core` baseline can't load and styles can't validate. The schema makes this concrete: `required: ["version", "$wpds", "name", "engine", "regions"]`. The spec text already implied this; the schema makes it official.

### 4. Region platform `block-navigation-on-dirty` should require `dirty-state` at the region level too

The app manifest enforces this conditional; the region's platform block should mirror it. Without the rule, a region could declare "block navigation on dirty" without any source of dirty state, which is meaningless. The schema enforces both.

### 5. `config` outside an `app`-bearing region is meaningless

A region with `accepts-target` (routable) receives its config from the matching route entry. A region with a fixed `app` receives its config from the region declaration's `config` field. A region with neither — pure chrome with no app — has no use for `config`. The schema enforces: `if config, then app required`. This catches a real authoring mistake (declaring config on a routable region thinking it'll pass through).

---

## Decisions the schema-writing process forced

### 1. Drop `iframe:{url}` as a magic ID format

When writing the namespaced-id pattern, the only clean options were `core:{name}` and `plugin:{slug}/{name}`. Adding a third pattern for `iframe:{url}` would either weaken the pattern (allowing arbitrary characters) or special-case it (separate pattern alternation). Neither is good. The cleaner architecture: legacy PHP screens are wrapped by thin apps (with normal `core:` or `plugin:` ids) that internally use an SDK helper to render the legacy content. This was already partially in the spec; the schema forced us to commit. (Spec already updated.)

### 2. `default-arrangement` is a string identifier, not an enum

Tempting to enum it (`wp-chrome | floating-windows | tiling-dwindle | single-pane`), but doing so would prevent plugin-contributed engines from naming their own algorithms. Better: kebab-case slug, schema validates format only. New algorithm names accumulate in the field's effective vocabulary as engines ship.

### 3. The CSS `layout` allowlist is genuinely small

When I sat down to enumerate it, the layout-relevant CSS subset is ~20 properties. The decoration set (`background`, `border`, `color`, `padding`, `margin`, `box-shadow`, `outline`, `opacity`, `transform`, `transition`, `animation`...) is hundreds. Keeping `layout` strict (additionalProperties: false, full enumeration) and `style` permissive (additionalProperties: true) is the right division. Authors get tooling feedback on layout typos; decoration is unconstrained because constraining it would be either incomplete or freeze the schema to current CSS.

### 4. Style tree is loose on purpose

I considered enumerating the WPDS slot matrix (~150 slots) in the schema. It would give authors per-slot tooling support but would freeze the schema to a specific WPDS version. Wrong tradeoff: WPDS bumps with WordPress versions, and we already have `$wpds` as a runtime pin. The schema declares the top-level shape (`color`, `dimension`, `border`, etc., plus `chrome`, `regions`, `applications`); per-slot validation runs at runtime against the pinned matrix. Authors get IDE feedback via a runtime-generated companion schema (per-version), not this static document.

### 5. Pattern properties everywhere named slugs appear

Region ids, route patterns, bindings (well, array, but each entry has `shortcut`/`invoke`), template ids, app ids — all use kebab-case patterns. The schema enforces this strictly. The cost: an author who typed `MainContent` instead of `main-content` gets a schema error. The benefit: consistent naming everywhere, no accidental camelCase leak. The earlier draft had `userCustomizable` and `userSwitchable` in camelCase; we caught those during the consistency pass and the schemas hold the line.

### 6. `dismiss-on` is a closed enum

Initially I wrote it as `array of string` permissively. Then I asked: what would `dismiss-on: ["banana"]` do? The runtime doesn't know how to dismiss on banana. So it's a closed set: `Escape`, `backdrop-click`, `outside-click`, `navigation`. Adding new triggers requires a spec amendment, which is fine — the trigger set is small and stable.

### 7. App config schema is a separate document, validated separately

The `config-schema` field on app manifests is itself a JSON Schema. I considered referencing the meta-schema (`https://json-schema.org/draft/2020-12/schema`) so the field's contents are validated as a JSON Schema. Decided against: most validators don't recurse meta-schemas reliably, and the runtime validates app config against `config-schema` at mount time anyway. Documented as "should be a valid JSON Schema" without enforcing.

---

## What the runtime must validate that the schema cannot

These are the validation rules the runtime is responsible for, because they require resolution across documents or runtime context:

1. **`role` resolvability.** Every region must have a resolvable role at mount time, via direct declaration, template inheritance, or template-child inheritance.

2. **`engine` references a registered engine.** The schema validates the id format; the runtime checks that an engine with that id is registered.

3. **`template` references an engine-shipped template.** Schema validates the id format; runtime checks the template exists in the active engine's manifest.

4. **`app` references a registered app.** Same as engine.

5. **Route `target` resolves to an `accepts-target` region.** Schema validates target format; runtime checks at least one region has matching `accepts-target`.

6. **Default route is a valid route pattern.** Schema doesn't cross-check `default-route` against `routes` patterns; runtime warns if no match (doesn't reject — falls back to first permitted route).

7. **App config validates against the app's `config-schema`.** Schema declares config is an object; runtime resolves the app's `config-schema` and validates the merged config.

8. **WPDS slot validation.** Schema accepts any structure under `styles`; runtime validates against the WPDS matrix at the pinned `$wpds` version, with the runtime-generated companion schema providing IDE feedback.

9. **Token alias resolvability.** Schema accepts curly-brace strings; runtime resolves them against the merged tokens.json and detects cycles.

10. **Capability gate.** Schema validates capability format; runtime checks `canUser()` per-request.

11. **Binding `invoke` references a triggerable app.** Schema validates id format; runtime checks the app exists and has `platform.triggerable: true`.

12. **One region per shell uses `_self` as accepts-target.** Convention, not strict requirement; runtime warns if multiple. (Schema can't enforce because it would require uniqueness across patternProperties values.)

13. **Plugin extending an engine declares templates the engine renders correctly.** Out of schema scope entirely.

This division of labor matches the prior-art precedent (`theme.json` schema validates structure; `WP_Theme_JSON_Resolver` validates resolvability) and is the right shape.

---

## Schema files produced

- **`admin-app-v1.json`** — 12 top-level properties. Validates app manifests. Tested against 10 cases (5 valid, 5 invalid). All pass.
- **`admin-engine-v1.json`** — 9 top-level properties. Validates engine manifests including nested region templates. Tested against 6 cases. All pass.
- **`admin-v1.json`** — 12 top-level properties (including `$schema`). Validates admin.json install configs. Tested against 17 cases (5 valid, 12 invalid). All pass.

All three schemas are valid JSON Schema 2020-12, structurally correct against the meta-schema.

---

## Recommended next steps

1. **Add a paragraph to spec §5.5** documenting the role inheritance chain for nested children explicitly.
2. **Update spec §5** to note that role resolvability is runtime-validated, not schema-validated, and explain why.
3. **Build the runtime resolver** — the validation layer the schema deferred to. Start with role resolution since it's the most complex.
4. **Build the runtime-generated companion schema** for WPDS slot validation against the pinned `$wpds` version, so authors get full IDE support including slot-name autocomplete.
5. **Wire up live IDE validation** in development environments by hosting the schemas at the `schemas.wp.org` URLs (or temporarily serving from the plugin repo) and referencing via `$schema` in example admin.json files.
