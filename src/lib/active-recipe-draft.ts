import { getApiErrorMessage } from "@/lib/client-api-error";

export type ActiveRecipeDraft = {
  draftId: string;
  kind: string;
  status: string;
  updatedAt: string;
};

export async function loadActiveRecipeDraft(): Promise<ActiveRecipeDraft | null> {
  const response = await fetch("/api/recipe-drafts", { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      await getApiErrorMessage(response, "Could not find your active review"),
    );
  const body = (await response.json()) as {
    activeDraft?: ActiveRecipeDraft | null;
  };
  return body.activeDraft ?? null;
}
