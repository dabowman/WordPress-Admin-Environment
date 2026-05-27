#!/usr/bin/env python3
"""
WordPress Block Markup Validator

Validates serialized Gutenberg block markup without requiring WordPress.
Checks delimiter syntax, JSON validity, nesting, class patterns, and common errors.

Usage:
    python validate_blocks.py --file content.html
    echo '<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->' | python validate_blocks.py --stdin
"""

import re
import json
import sys
import argparse
from dataclasses import dataclass, field
from typing import Optional

# Regex for opening/self-closing block delimiters
# The attrs pattern handles nested JSON (e.g. {"style":{"color":{"text":"#000"}}})
# by matching everything up to the closing } that is followed by whitespace + -->
OPEN_RE = re.compile(
    r'<!--\s+wp:'
    r'(?P<bname>[a-z][a-z0-9_-]*(?:/[a-z][a-z0-9_-]*)?)'
    r'(?:\s+(?P<attrs>\{(?:[^}]|}(?!\s+/?>--))*\}))?'
    r'\s+(?P<void>/)?-->',
    re.DOTALL
)

# Regex for closing block delimiters
CLOSE_RE = re.compile(
    r'<!--\s+/wp:(?P<bname>[a-z][a-z0-9_-]*(?:/[a-z][a-z0-9_-]*)?)\s+-->'
)

# Regex to detect core/ prefix (which should not be used)
CORE_PREFIX_RE = re.compile(r'<!--\s+(?:/)?wp:core/')

# Blocks that should always be self-closing (dynamic, no save output)
TRULY_VOID = {
    'archives', 'avatar', 'block', 'calendar', 'categories',
    'footnotes', 'latest-comments', 'latest-posts', 'loginout',
    'page-list', 'pattern', 'rss', 'search', 'nextpage',
    'site-logo', 'site-tagline', 'site-title', 'social-link',
    'tag-cloud', 'template-part',
    'post-author', 'post-author-biography', 'post-author-name',
    'post-comments-count', 'post-comments-form', 'post-comments-link',
    'post-content', 'post-date', 'post-excerpt',
    'post-featured-image', 'post-navigation-link',
    'post-terms', 'post-title', 'read-more',
    'comment-author-name', 'comment-content', 'comment-date',
    'comment-edit-link', 'comment-reply-link',
    'comments-pagination-next', 'comments-pagination-numbers',
    'comments-pagination-previous', 'comments-title',
    'query-pagination-next', 'query-pagination-numbers',
    'query-pagination-previous', 'query-title', 'query-total',
}

# Known sourced attributes that must NOT appear in comment JSON
SOURCED_ATTRS = {
    'paragraph': {'content'},
    'heading': {'content'},
    'list-item': {'content'},
    'code': {'content'},
    'preformatted': {'content'},
    'verse': {'content'},
    'pullquote': {'citation', 'value'},
    'quote': {'citation'},
    'image': {'url', 'alt', 'caption', 'title', 'href', 'rel', 'linkClass', 'linkTarget'},
    'audio': {'src', 'caption'},
    'video': {'src', 'caption', 'poster'},
    'button': {'text', 'url', 'linkTarget', 'rel', 'title'},
    'file': {'href', 'fileName', 'textLinkHref', 'textLinkTarget'},
    'embed': {'caption'},
    'table': {'caption', 'head', 'body', 'foot'},
    'media-text': {'mediaUrl', 'mediaAlt', 'href', 'rel', 'linkClass', 'linkTarget'},
}


@dataclass
class Issue:
    severity: str
    message: str
    line: Optional[int] = None
    block_name: Optional[str] = None

    def __str__(self):
        parts = []
        parts.append("[" + self.severity.upper() + "]")
        if self.block_name:
            parts.append("(" + self.block_name + ")")
        if self.line:
            parts.append("line " + str(self.line))
        parts.append(self.message)
        return " ".join(parts)


@dataclass
class Result:
    issues: list = field(default_factory=list)
    block_count: int = 0
    valid: bool = True

    def add(self, severity, message, line=None, block_name=None):
        self.issues.append(Issue(severity, message, line, block_name))
        if severity == "error":
            self.valid = False

    def summary(self):
        errors = sum(1 for i in self.issues if i.severity == "error")
        warnings = sum(1 for i in self.issues if i.severity == "warning")
        infos = sum(1 for i in self.issues if i.severity == "info")
        if self.valid:
            status = "VALID"
            icon = "+"
        else:
            status = "INVALID"
            icon = "x"
        return (
            "\n[" + icon + "] " + status + " - " + str(self.block_count) + " blocks, " +
            str(errors) + " errors, " + str(warnings) + " warnings, " + str(infos) + " info"
        )


def line_at(content, pos):
    return content[:pos].count('\n') + 1


def strip_core(name):
    if name.startswith('core/'):
        return name[5:]
    return name


def validate(content):
    result = Result()

    if not content or not content.strip():
        result.add("info", "Empty content")
        return result

    # 1. Check for core/ prefix
    for m in CORE_PREFIX_RE.finditer(content):
        result.add("error", "Delimiter uses 'core/' prefix - must be omitted",
                    line_at(content, m.start()))

    # 2. Find all delimiters
    opens = list(OPEN_RE.finditer(content))
    closes = list(CLOSE_RE.finditer(content))
    result.block_count = len(opens)

    if result.block_count == 0:
        if content.strip():
            result.add("info", "No block delimiters found - classic (non-block) content")
        return result

    # 3. Validate each opening delimiter
    for m in opens:
        name = m.group('bname')
        attrs_str = m.group('attrs')
        is_void = m.group('void') is not None
        ln = line_at(content, m.start())
        cn = strip_core(name)

        # Validate JSON
        attrs = {}
        if attrs_str:
            try:
                attrs = json.loads(attrs_str)
                if not isinstance(attrs, dict):
                    result.add("error", "Attributes must be a JSON object", ln, name)
                    attrs = {}
            except json.JSONDecodeError as e:
                result.add("error", "Invalid JSON: " + str(e), ln, name)

            # Check for sourced attributes
            if cn in SOURCED_ATTRS:
                for a in SOURCED_ATTRS[cn]:
                    if a in attrs:
                        result.add("error",
                                   "Sourced attribute '" + a + "' must not be in comment JSON",
                                   ln, name)

            # Check style object
            if 'style' in attrs and isinstance(attrs['style'], dict):
                typo = attrs['style'].get('typography', {})
                if isinstance(typo, dict):
                    for k, v in typo.items():
                        if isinstance(v, (int, float)) and k != 'lineHeight':
                            result.add("warning",
                                       "style.typography." + k + " should be string with unit",
                                       ln, name)

        # Check void
        if not is_void and cn in TRULY_VOID:
            result.add("warning",
                       "'" + name + "' is dynamic and should use self-closing /-->",
                       ln, name)

    # 4. Validate nesting
    all_delims = []
    for m in opens:
        all_delims.append(('open', m.group('bname'), m.start(),
                           m.group('void') is not None))
    for m in closes:
        all_delims.append(('close', m.group('bname'), m.start(), False))
    all_delims.sort(key=lambda x: x[2])

    stack = []
    for dtype, dname, dpos, is_void in all_delims:
        ln = line_at(content, dpos)
        if dtype == 'open' and not is_void:
            stack.append((dname, ln))
        elif dtype == 'close':
            if not stack:
                result.add("error",
                           "Closing '" + dname + "' with no matching opener", ln, dname)
            else:
                open_name, open_ln = stack.pop()
                if open_name != dname:
                    result.add("error",
                               "Mismatched: opened '" + open_name + "' (line " +
                               str(open_ln) + ") but closed '" + dname + "'",
                               ln, dname)

    for open_name, open_ln in stack:
        result.add("error", "'" + open_name + "' at line " + str(open_ln) + " never closed",
                    block_name=open_name)

    # 5. Check inner HTML
    check_inner_html(content, opens, result)

    return result


def check_inner_html(content, opens, result):
    for m in opens:
        name = m.group('bname')
        if m.group('void'):
            continue

        ln = line_at(content, m.start())
        cn = strip_core(name)
        start = m.end()

        # Find matching close
        close_pat = re.compile(r'<!--\s+/wp:' + re.escape(name) + r'\s+-->')
        close_m = close_pat.search(content, start)
        if not close_m:
            continue

        inner = content[start:close_m.start()]

        # Heading: must have wp-block-heading class on the h element
        if cn == 'heading':
            h_tag = re.search(r'<h[1-6][^>]*>', inner)
            if h_tag and 'wp-block-heading' not in h_tag.group():
                result.add("error",
                           "Heading must have 'wp-block-heading' class (WP 6.2+)",
                           ln, name)

        # Image checks
        if cn == 'image':
            if '<figure' in inner and 'wp-block-image' not in inner:
                result.add("error", "Image <figure> must have 'wp-block-image' class",
                           ln, name)
            img_m = re.search(r'<img\b[^>]*>', inner)
            if img_m:
                tag = img_m.group()
                stripped = tag.rstrip('>').rstrip()
                if not stripped.endswith('/'):
                    result.add("error", "<img> must be self-closing: <img ... />",
                               ln, name)

        # Separator checks
        if cn == 'separator' and '<hr' in inner:
            if 'has-alpha-channel-opacity' not in inner:
                result.add("error",
                           "<hr> must have 'has-alpha-channel-opacity' class",
                           ln, name)
            hr_m = re.search(r'<hr\b[^>]*>', inner)
            if hr_m:
                tag = hr_m.group()
                stripped = tag.rstrip('>').rstrip()
                if not stripped.endswith('/'):
                    result.add("error", "<hr> must be self-closing: <hr ... />",
                               ln, name)

        # Button: check wp-element-button
        if cn == 'button' and '<a' in inner:
            if 'wp-element-button' not in inner:
                result.add("error",
                           "Button <a> must have 'wp-element-button' class (WP 6.1+)",
                           ln, name)

        # Figcaption: check wp-element-caption
        if '<figcaption' in inner and 'wp-element-caption' not in inner:
            result.add("error",
                       "<figcaption> must have 'wp-element-caption' class (WP 6.1+)",
                       ln, name)

        # Style attribute spacing
        for sm in re.finditer(r'style="([^"]*)"', inner):
            val = sm.group(1)
            if re.search(r':\s+', val):
                result.add("warning",
                           "Style has space after colon (validation risk): '" + val + "'",
                           ln, name)


def main():
    parser = argparse.ArgumentParser(description="Validate WordPress block markup")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--file', '-f', help='File with block markup')
    group.add_argument('--stdin', action='store_true', help='Read from stdin')
    group.add_argument('content', nargs='?', help='Markup string')
    args = parser.parse_args()

    if args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            content = f.read()
    elif args.stdin:
        content = sys.stdin.read()
    else:
        content = args.content

    result = validate(content)
    for issue in result.issues:
        print(issue)
    print(result.summary())
    sys.exit(0 if result.valid else 1)


if __name__ == '__main__':
    main()
