"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/button";
import { DeleteRecipeButton } from "@/components/delete-recipe-button";
import {
  updateUserRecipe,
  uploadRecipeImage,
} from "@/app/(app)/recipes/actions";
import type { RecipeRow } from "@/lib/types";

export function RecipeEditForm({ recipe }: { recipe: RecipeRow }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description);
  const [minutes, setMinutes] = useState(String(recipe.minutes));
  const [difficulty, setDifficulty] = useState(recipe.difficulty);
  const [servings, setServings] = useState(String(recipe.servings));
  const [ingredients, setIngredients] = useState(recipe.ingredients.join("\n"));
  const [equipment, setEquipment] = useState(recipe.equipment.join("\n"));
  const [tags, setTags] = useState(recipe.tags.join(", "));
  const [imageUrl, setImageUrl] = useState(
    recipe.image_reference ?? recipe.image_url ?? "",
  );
  const [imagePreview, setImagePreview] = useState(recipe.image_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [steps, setSteps] = useState(
    recipe.steps.map((s) => ({
      index: s.index,
      title: s.title,
      instruction: s.instruction,
      durationSeconds: s.durationSeconds ?? "",
      ingredientsUsed: s.ingredients.join("\n"),
      tip: s.tip ?? "",
    })),
  );

  function updateStep(index: number, patch: Partial<(typeof steps)[0]>) {
    setSteps((prev) =>
      prev.map((s) => (s.index === index ? { ...s, ...patch } : s)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await updateUserRecipe({
      id: recipe.id,
      title: title.trim(),
      description: description.trim(),
      minutes: Number(minutes),
      difficulty,
      servings: Number(servings),
      ingredients: ingredients
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      equipment: equipment
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      imageUrl: imageUrl.trim() || "",
      steps: steps.map((s) => ({
        index: s.index,
        title: s.title.trim(),
        instruction: s.instruction.trim(),
        durationSeconds: s.durationSeconds
          ? Number(s.durationSeconds)
          : undefined,
        ingredientsUsed: s.ingredientsUsed
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
        tip: s.tip.trim() || undefined,
      })),
    });

    setLoading(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }

    router.push("/recipes");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Link
        href={`/recipes/${recipe.slug}`}
        className="text-sm font-bold text-flame-ink underline"
      >
        Want an AI adaptation? Request a reviewed draft on the recipe page.
      </Link>
      <TextField label="Title" value={title} onChange={setTitle} required />
      <TextArea
        label="Description"
        value={description}
        onChange={setDescription}
        rows={2}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Minutes"
          type="number"
          value={minutes}
          onChange={setMinutes}
          required
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-bold">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as "easy" | "medium" | "hard")
            }
            className="rounded-xl border-2 border-espresso/10 bg-card p-2 text-sm font-semibold outline-none focus:border-flame"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <TextField
          label="Servings"
          type="number"
          value={servings}
          onChange={setServings}
          required
        />
      </div>

      <TextArea
        label="Ingredients (one per line)"
        value={ingredients}
        onChange={setIngredients}
        rows={6}
      />
      <TextArea
        label="Equipment (one per line)"
        value={equipment}
        onChange={setEquipment}
        rows={3}
      />
      <TextField
        label="Tags (comma separated)"
        value={tags}
        onChange={setTags}
      />

      <div className="flex flex-col gap-2">
        <TextField
          label="Cover image URL"
          value={imageUrl}
          onChange={(value) => {
            setImageUrl(value);
            setImagePreview(value);
          }}
          placeholder="https://… or upload below"
        />
        <input
          type="file"
          accept="image/*"
          className="text-sm font-semibold file:mr-3 file:rounded-full file:bg-flame file:px-4 file:py-2 file:text-espresso"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            const formData = new FormData();
            formData.set("file", file);
            formData.set("recipeId", recipe.id);
            formData.set("name", "hero");
            const result = await uploadRecipeImage(formData);
            setUploading(false);
            if ("error" in result && result.error) {
              setError(result.error);
            } else if ("url" in result && result.url && result.path) {
              setImageUrl(result.path);
              setImagePreview(result.url);
            }
          }}
        />
        {uploading && (
          <p className="text-xs font-semibold text-espresso-light">
            Uploading…
          </p>
        )}
        {imagePreview && (
          <div className="relative aspect-[16/9] max-w-xs overflow-hidden rounded-2xl ring-1 ring-oat">
            <Image
              src={imagePreview}
              alt="Cover preview"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Steps</h2>
        {steps.map((step) => (
          <div
            key={step.index}
            className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-oat"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-flame text-sm font-extrabold text-espresso">
                {step.index}
              </span>
              <TextField
                label=""
                value={step.title}
                onChange={(v) => updateStep(step.index, { title: v })}
                placeholder="Step title"
                required
              />
            </div>
            <TextArea
              label="Instruction"
              value={step.instruction}
              onChange={(v) => updateStep(step.index, { instruction: v })}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Duration (seconds)"
                type="number"
                value={String(step.durationSeconds)}
                onChange={(v) => updateStep(step.index, { durationSeconds: v })}
              />
              <TextField
                label="Tip"
                value={step.tip}
                onChange={(v) => updateStep(step.index, { tip: v })}
              />
            </div>
            <TextArea
              label="Ingredients used in this step (one per line)"
              value={step.ingredientsUsed}
              onChange={(v) => updateStep(step.index, { ingredientsUsed: v })}
              rows={2}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => router.push("/recipes")}
        >
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      )}

      <DeleteRecipeButton recipeId={recipe.id} recipeTitle={recipe.title} />
    </form>
  );
}
function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="rounded-xl border-2 border-espresso/10 bg-card p-2 text-sm font-semibold outline-none focus:border-flame"
      />
    </label>
  );
}
function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="rounded-xl border-2 border-espresso/10 bg-card p-2 text-sm font-semibold outline-none focus:border-flame"
      />
    </label>
  );
}
