---
name: wordpress-plugin-directory-guidelines
description: "Review WordPress plugins against the **18 WordPress.org Plugin Directory guidelines** before submission or after rejection. Covers GPL compliance (Guideline 1) — valid `License:` and `License URI:` headers, GPL-compatible bundled libraries (MIT, BSD, ISC, zlib, Boost, Apache-2.0/MPL-2.0 caveats), forbidden split-licensing, no obfuscated code; trialware/freemium rules (Guideline 5) — no time-bombed features, no 'preview' UI requiring purchase to function; plugin naming and trademark rules (Guideline 17) — minimum 5 alphanumeric chars, header/readme name match, trademark names only after `for`/`with`/`using`/`and`, slug constraints (lowercase, hyphenated, ≤50 chars, no blocked terms or trademark portmanteaus); developer responsibility (Guideline 4); upsell limits (Guideline 8); and the rest. Use whenever asked about WordPress.org submission, plugin rejection reasons, GPL compatibility for bundled libs, license headers, naming a plugin, picking a slug, premium/freemium/upsell flows, license-key check UX, or any question that maps to a guideline number — even if the user doesn't say 'guidelines'. Trigger on 'wp.org submission', 'plugin rejected', 'license header', 'GPL compatible', 'is this license OK for wp.org', 'rename my plugin', 'plugin slug', 'trialware', 'freemium', 'upsell', 'plugin trademark', 'WooCommerce in plugin name'. Pair with `wordpress-plugin-development` for the technical/build side; this skill owns the *distribution policy* side."
compatibility: "Targets WordPress 6.9+ (PHP 7.2.24+)."
---

## ⚠ Verify before asserting

Plugin Directory rules update without major-version cadence — wp.org plugin reviewers post changes on `make.wordpress.org/plugins/`. Before claiming a guideline says X or that a license is/isn't compatible, check live sources:

| Surface | Live source |
|---|---|
| Detailed plugin guidelines | `https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/` |
| Plugin Directory news/announcements | `https://make.wordpress.org/plugins/` |
| GPL compatibility list | `https://www.gnu.org/licenses/license-list.html` |
| GPL FAQ (edge cases) | `https://www.gnu.org/licenses/gpl-faq.html` |
| Trademark name list | `https://developer.wordpress.org/plugins/wordpress-org/common-issues/#using-trademarks-in-your-plugin-name` |

A negative claim ("this is/isn't allowed") for plugin submission requires citing the relevant guideline number AND confirming against the live policy page.

## Overview

Authoritative reference for the 18 WordPress.org Plugin Directory guidelines. Covers GPL licensing, plugin naming/trademark rules, trialware restrictions, and all other submission requirements.

## When to use

Use this skill when you need to:
- Review a WordPress plugin for compliance with the WordPress.org Plugin Directory guidelines
- Check GPL license compatibility for a plugin or its bundled libraries
- Verify license headers in plugin files
- Identify common guideline violations before submission
- Answer questions about what is or is not allowed on WordPress.org
- Evaluate premium/upsell flows, license checks, or freemium positioning
- Review "teaser" or "preview" UI for trialware violations

## Inputs required

- Plugin source code (or specific files to review)
- Optional: plugin readme and plugin header metadata for naming and license checks

## Procedure

1. Check the plugin's license header against the **Valid License Headers** section below.
2. Walk through the **18 Guidelines** checklist, paying special attention to Guidelines 1, 4, 5, 7, 8, and 17.
3. Confirm trialware/freemium compliance using the checklist in [guideline-review-checklist.md](references/guideline-review-checklist.md) (Guideline 5 section).
4. For bundled third-party code, verify license compatibility against **GPL-Compatible Licenses (Quick)** below.
5. Flag matches from **Common GPL Violations (Quick)** below.
6. For edge cases, consult the detailed references and the [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html).

## 18-Guideline Review Checklist

Use the detailed, per-guideline checklist in [guideline-review-checklist.md](references/guideline-review-checklist.md). Load this reference file only when a full guideline audit is requested.

## GPL Compliance (Guideline 1 in Detail)

Use [gpl-compliance.md](references/gpl-compliance.md) for full license tables, compatibility nuances, and examples. Keep this inline section as a quick decision aid.

### Verification (Licensing)

- Every licensing-related issue must cite **Guideline 1** and include the file path and exact license string.
- Confirm compatibility claims against **GPL-Compatible Licenses (Quick)** and escalate ambiguous licenses.

### Failure modes (Licensing)

- If a license is not clearly GPL-compatible, do not guess. Check the [GNU license list](https://www.gnu.org/licenses/license-list.html).
- For dual-license packages, verify both licenses and redistribution terms.

### Quick Reference: WordPress GPL Requirements

- WordPress is **GPLv2 or later**.
- Plugins distributed on WordPress.org must be 100% GPL-compatible (code and assets).
- Include a valid `License:` header and `License URI:` in the main plugin file.
- Do not add restrictions that conflict with GPL freedoms.

### Valid License Headers

## GPL Versions Summary

| Version | Year | Key Addition |
|---------|------|--------------|
| GPLv1 | 1989 | Base copyleft: share-alike for modifications |
| GPLv2 | 1991 | "Liberty or death" clause (Section 7), clearer distribution terms |
| GPLv3 | 2007 | Anti-tivoization, explicit patent grants, compatibility provisions |

WordPress uses **GPLv2 or later**, meaning plugins can use GPLv2, GPLv3, or "GPLv2 or later".

For full license texts, see:
- [GNU General Public License v1](https://www.gnu.org/licenses/gpl-1.0.html)
- [GNU General Public License v2](https://www.gnu.org/licenses/gpl-2.0.html)
- [GNU General Public License v3](https://www.gnu.org/licenses/gpl-3.0.html)

## License Compliance Checklist

When reviewing a plugin, verify:

- [ ] Main plugin file has a valid `License:` header (e.g., `GPL-2.0-or-later`, `GPL-2.0+`, `GPLv2 or later`)
- [ ] Main plugin file has a `License URI:` header pointing to the GPL text
- [ ] If bundled libraries exist, each has a GPL-compatible license
- [ ] No "split licensing" (e.g., code GPL but premium features proprietary)
- [ ] No additional restrictions beyond what GPL allows
- [ ] No clauses restricting commercial use, modification, or redistribution
- [ ] No obfuscated code (violates the spirit of source code availability)

## Valid License Headers for WordPress Plugins

```
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
```

```text
License: GPL-3.0-or-later
License URI: https://www.gnu.org/licenses/gpl-3.0.html
```

```text
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
```

### GPL-Compatible Licenses (Quick)

- Safe defaults: GPL-2.0-or-later, GPL-3.0-or-later.
- Commonly accepted permissive families: MIT/Expat, BSD, ISC, zlib, Boost.
- Conditional compatibility requires care: Apache-2.0 and MPL-2.0 (verify usage context).
- For full accepted and rejected identifiers, use [gpl-compliance.md](references/gpl-compliance.md).

### Common GPL Violations (Quick)

- Split licensing that restricts distributed code.
- Obfuscated or non-corresponding source distribution.
- Restrictive clauses (non-commercial, no-resale, forced backlink).
- Bundling GPL-incompatible libraries or assets.

## Plugin Naming Rules (Guideline 17)

Use [naming-rules.md](references/naming-rules.md) for full trademark lists, slug blocks, and naming examples. Keep this inline checklist for quick screening.

### Naming Checklist (Quick)

- Name is not a placeholder and has at least 5 alphanumeric characters.
- Header name and readme name match.
- Name is specific and function-related; avoid keyword stuffing.
- Trademark/project names appear only after connectors like `for`, `with`, `using`, `and`.
- No banned/discouraged terms or trademark portmanteaus.
- Slug is lowercase, hyphenated, <= 50 chars, and avoids blocked terms.
