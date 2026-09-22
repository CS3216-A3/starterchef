import { notFound, redirect } from "next/navigation";
import { getRecipeBySlug, getUser } from "@/lib/data";
import { RecipeEditForm } from "./recipe-edit-form";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, user] = await Promise.all([getRecipeBySlug(id), getUser()]);

  if (!recipe) notFound();
  if (!user || recipe.user_id !== user.id) {
    redirect("/recipes");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Edit recipe</h1>
        <p className="mt-1 font-semibold text-espresso-light">
          Fix ingredients, steps, or serving size before you cook.
        </p>
      </div>
      <RecipeEditForm recipe={recipe} />
    </div>
  );
}
