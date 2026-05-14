import { Header } from './Header'

interface PageContainerProps {
  title: string
  description?: string
  actions?: React.ReactNode
  helpContent?: React.ReactNode
  children: React.ReactNode
}

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
