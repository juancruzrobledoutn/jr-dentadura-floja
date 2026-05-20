import { Header } from './Header'

interface PageContainerProps {
  title: string
  description?: string
  actions?: React.ReactNode
  helpContent?: React.ReactNode
  children: React.ReactNode
}

/**
 * Standard chrome for every Dashboard page.
 *
 * Every new Dashboard page MUST pass `helpContent={helpContent.<key>}` where
 * `<key>` is the camelCase entry registered in `Dashboard/src/utils/helpContent.tsx`
 * and declared in the `DashboardPageKey` literal union there. The page-level
 * help button rendered by the embedded `Header` opens a modal showing that
 * content.
 *
 * If your page also exposes a create/edit `<Modal>`-wrapped form, add an inline
 * `<HelpButton size="sm" .../>` at the top of the form body to document the
 * fields the form collects.
 *
 * Pattern reference: `.agents/skills/help-system-content/SKILL.md`
 * Coverage test: `Dashboard/src/test/helpContent.test.ts` (asserts one entry per
 * DashboardPageKey member; CI fails the PR if a new page lands without a key).
 */
export function PageContainer({
  title,
  description,
  actions,
  helpContent,
  children,
}: PageContainerProps) {
  return (
    <>
      <Header title={title} description={description} actions={actions} helpContent={helpContent} />
      <div className="p-6">{children}</div>
    </>
  )
}
