// Local capture harness only: production components, synthetic props and mocked
// API responses. This file is never routed or shipped with the application.
import { createRoot } from "react-dom/client";
import { CookingPot } from "lucide-react";
import { ScanKitchenButton } from "@/components/scan-kitchen-button";
import { RecipeCard } from "@/components/recipe-card";
import { CookAssist } from "@/components/cook-assist";
import { CookStepNavigation } from "@/components/cook-step-navigation";
import { Logo } from "@/components/logo";
import LandingPage from "@/app/(marketing)/page";
import MarketingLayout from "@/app/(marketing)/layout";

const view = new URLSearchParams(location.search).get("view");
const instruction =
  "Warm the oil in a frying pan over medium heat. Add the chopped tomatoes and stir until they begin to soften.";
const recipe = {
  id: "demo-recipe",
  slug: "tomato-egg-rice",
  title: "Tomato & egg rice",
  minutes: 15,
  difficultyLabel: "Easy",
  servings: 1,
  whyGood: "Uses your tomatoes, eggs and rice. Just one pan.",
  icon: CookingPot,
  iconName: "cooking-pot",
  imageTint: "oat",
  imageUrl: null,
  ingredients: ["2 eggs", "1 tomato", "Cooked rice", "Oil"],
  steps: [
    { index: 1, title: "Prep your ingredients" },
    { index: 2, title: "Soften the tomatoes" },
    { index: 3, title: "Add the eggs" },
    { index: 4, title: "Serve over rice" },
  ],
};

function Preview() {
  if (view === "landing")
    return (
      <MarketingLayout>
        <LandingPage />
      </MarketingLayout>
    );
  return (
    <main id="capture" className="mx-auto flex max-w-lg flex-col gap-5 p-5">
      <Logo />
      {view === "scan" ? (
        <>
          <header>
            <h1 className="text-2xl font-extrabold">
              Review your kitchen scan
            </h1>
            <p className="mt-1 text-sm font-semibold text-espresso-light">
              You choose what goes into your inventory.
            </p>
          </header>
          <ScanKitchenButton />
        </>
      ) : view === "recipe" ? (
        <>
          <header>
            <h1 className="text-2xl font-extrabold">
              A meal that fits your kitchen
            </h1>
            <p className="mt-1 text-sm font-semibold text-espresso-light">
              A simple starting point for tonight.
            </p>
          </header>
          <RecipeCard recipe={{ ...recipe, primaryCta: true }} />
        </>
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <p className="text-xs font-bold tracking-wide text-espresso-light uppercase">
              Tomato & egg rice
            </p>
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-extrabold">Step 2 of 4</h1>
              <span className="text-sm font-extrabold text-flame">50%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-oat"
              role="progressbar"
              aria-label="Cooking progress"
              aria-valuenow={50}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full w-1/2 rounded-full bg-flame" />
            </div>
          </header>
          <section className="flex flex-col gap-2">
            <h2 className="text-2xl font-extrabold">Soften the tomatoes</h2>
            <p className="leading-relaxed font-semibold text-espresso-light">
              {instruction}
            </p>
          </section>
          <CookAssist
            sessionId="demo-session"
            recipeId={null}
            stepIndex={2}
            currentInstruction={instruction}
            totalSteps={4}
            durationSeconds={180}
            version={1}
            timerState={{ status: "idle" }}
          />
          <CookStepNavigation
            sessionId="demo-session"
            currentStep={2}
            totalSteps={4}
            version={1}
          />
        </>
      )}
      <p className="text-xs font-semibold text-espresso-light">
        Illustrative demo · sample recipe and AI results
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
