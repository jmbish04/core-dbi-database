import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/knowledge")({
  component: KnowledgePage,
});

function KnowledgePage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Knowledge Base</h1>
      <p>Fact management interface coming soon.</p>
    </div>
  );
}
