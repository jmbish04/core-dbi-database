import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/search")({
  component: SearchPage,
});

function SearchPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Search</h1>
      <p>Global search interface coming soon.</p>
    </div>
  );
}
