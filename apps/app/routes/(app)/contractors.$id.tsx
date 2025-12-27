import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/contractors/$id")({
  component: ContractorPage,
});

function ContractorPage() {
  const { id } = Route.useParams();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Contractor Dossier: {id}</h1>
      <p>Contractor metrics and history coming soon.</p>
    </div>
  );
}
