import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/guide/glossary')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/guide/glossary"!</div>
}
