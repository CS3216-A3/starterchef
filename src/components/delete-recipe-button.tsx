"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/button";
import { deleteUserRecipe } from "@/app/(app)/recipes/actions";

/** Delete a user-owned recipe after an explicit confirmation. */
export function DeleteRecipeButton({
  recipeId,
  recipeTitle,
}: {
  recipeId: string;
  recipeTitle: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUserRecipe(recipeId);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.push("/recipes");
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" /> Delete recipe
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 p-3 ring-1 ring-red-100">
      <p className="text-sm font-bold text-red-700">
        Delete “{recipeTitle}” permanently?
      </p>
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={handleDelete}
        className="bg-red-600 hover:bg-red-700"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Keep it
      </Button>
      {error && <p className="text-xs font-bold text-red-700">{error}</p>}
    </div>
  );
}
