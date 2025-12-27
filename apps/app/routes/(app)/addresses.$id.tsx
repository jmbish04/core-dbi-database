import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(app)/addresses/$id")({
  component: AddressPage,
});

function AddressPage() {
  const { id } = Route.useParams();
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Address Dossier: {id}</h1>
      <p>Permit history and map view coming soon.</p>
    </div>
  );
}
