import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/requests/$requestId")({
  component: RequestDetailsPage,
});

function RequestDetailsPage() {
  const { requestId } = Route.useParams();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Request Details: {requestId}</h1>
      <p>Live console and results dashboard coming soon.</p>
    </div>
  );
}
