/**
 * Shared page layout — a shell-local port of `@wordpress/admin-ui`'s `Page`.
 *
 * Owns the whole app surface: a flex column with an optional header (title /
 * subtitle / right-aligned actions, divided by a bottom border) above a content
 * area. The prop shape deliberately mirrors `@wordpress/admin-ui` `Page`
 * (`title` / `subTitle` / `actions` / `badges` / `children` / `hasPadding` /
 * `headingLevel`) so that, once WordPress core ships `wp.adminUi` +
 * `wp.styleRuntime` as runtime externals and we move to `@wordpress/ui` 0.14+,
 * swapping this for the upstream component is a near-mechanical change.
 *
 * Two upstream features are intentionally dropped: the `NavigableRegion`
 * landmark (the kernel's region wrapper already supplies `role`, and apps must
 * not double the landmark) and the `SidebarToggleSlot` (it assumes the
 * admin-ui Layout). `before` is a shell-local addition — a left-of-title slot
 * for headers that lead with controls instead of a title (e.g. media filters).
 *
 * Content sizing: full-bleed by default (the content area is a flex column so a
 * `DataViews` table fills the region); pass `hasPadding` for native / form
 * screens that want the themeable inset + their own scroll.
 *
 * App-space, WPDS-flavored — the kernel stays DS-neutral.
 *
 * @param {Object}      root0                Props.
 * @param {*}           [root0.title]        Page title (rendered as a heading).
 * @param {*}           [root0.subTitle]     Secondary line beneath the title.
 * @param {*}           [root0.actions]      Right-aligned action node(s) — typically `<Button>`(s).
 * @param {*}           [root0.badges]       Inline node(s) after the title (e.g. a `<Badge>`).
 * @param {*}           [root0.before]       Left-of-title content (e.g. filter controls). Shell-local extension.
 * @param {*}           root0.children       Content area.
 * @param {string}      [root0.className]    Extra class names for the root element.
 * @param {boolean}     [root0.hasPadding]   Inset + scroll the content area. Default `false` (full-bleed).
 * @param {1|2|3|4|5|6} [root0.headingLevel] Heading tag level for the title. Default `2`.
 */
import './Page.css';
import { Stack, Text } from '@wordpress/ui';
import { pageClasses, pageHasHeader, headingTag } from './pageClasses.mjs';

export function Page( {
	title,
	subTitle,
	actions,
	badges,
	before,
	children,
	className = '',
	hasPadding = false,
	headingLevel = 2,
} ) {
	const HeadingTag = headingTag( headingLevel );
	const hasHeader = pageHasHeader( {
		title,
		subTitle,
		actions,
		badges,
		before,
	} );
	const { root: rootClass, content: contentClass } = pageClasses( {
		className,
		hasPadding,
	} );

	return (
		<div className={ rootClass }>
			{ hasHeader ? (
				<header className="wp-admin-shell-page__header">
					<div className="wp-admin-shell-page__header-content">
						{ before }
						{ title ? (
							<Text
								className="wp-admin-shell-page__title"
								render={ <HeadingTag /> }
								variant="heading-lg"
							>
								{ title }
							</Text>
						) : null }
						{ badges }
						{ actions ? (
							<Stack
								direction="row"
								align="center"
								gap="sm"
								className="wp-admin-shell-page__actions"
							>
								{ actions }
							</Stack>
						) : null }
					</div>
					{ subTitle ? (
						<Text
							render={ <p /> }
							variant="body-md"
							className="wp-admin-shell-page__subtitle"
						>
							{ subTitle }
						</Text>
					) : null }
				</header>
			) : null }
			<div className={ contentClass }>{ children }</div>
		</div>
	);
}
