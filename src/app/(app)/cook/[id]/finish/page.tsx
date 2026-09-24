import { notFound } from "next/navigation";
import { BackButton } from "@/components/back-button";
import { FinishForm } from "./finish-form";
import { getSessionById } from "@/lib/session-events";

export const dynamic = "force-dynamic";

export default async function CookFinishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session || session.status === "abandoned") notFound();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <BackButton />
      <header className="flex flex-col gap-1">
        <p className="text-xs font-bold tracking-wide text-espresso-light uppercase">
          All done
        </p>
        <h1 className="text-2xl font-extrabold">How did it go?</h1>
      </header>
      <FinishForm
        sessionId={session.id}
        version={session.version}
        title={session.recipe.title ?? "Cooking session"}
      />
    </div>
  );
}
