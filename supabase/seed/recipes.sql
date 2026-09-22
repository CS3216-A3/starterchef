-- StarterChef seed recipes.
-- These six recipes are common beginner-friendly dishes included only as
-- placeholder/demo data. Their original authors and licenses are unknown.
-- Do not treat them as public-domain or project-original. Replace them
-- with properly attributed recipes before any public release.
-- Run after the migrations, e.g. paste into the Supabase SQL editor.
-- Idempotent: safe to re-run.

insert into public.recipes (
  slug, title, description, minutes, difficulty, servings, why_good,
  icon, image_tint, ingredients, equipment, steps, tags, source, license
) values
(
  'tomato-egg-stir-fry',
  'Tomato egg stir-fry',
  'Soft scrambled eggs folded through a sweet-tangy tomato sauce, served over rice.',
  15, 'easy', 2,
  'Uses your eggs and tomatoes',
  'cooking-pot', 'from-flame-soft to-oat',
  array['3 eggs', '2 tomatoes', '1 tbsp oil', '1 tsp sugar', 'salt', 'cooked rice', 'spring onion (optional)'],
  array['frying pan', 'bowl', 'spatula'],
  '[
    {"index":1,"title":"Beat the eggs","instruction":"Crack 3 eggs into a bowl, add a pinch of salt, and beat until just combined.","ingredients":["3 eggs","Pinch of salt"],"tip":"Don''t over-beat — a few streaks of white are fine."},
    {"index":2,"title":"Scramble and set aside","instruction":"Heat oil in the pan, pour in the eggs, and scramble gently until just set. Remove to a plate.","durationSeconds":90,"ingredients":["1 tbsp oil"]},
    {"index":3,"title":"Soften the tomatoes","instruction":"Add the chopped tomatoes to the pan and stir gently until they release their juices.","durationSeconds":120,"ingredients":["2 tomatoes"],"tip":"A splash of water helps them break down faster."},
    {"index":4,"title":"Season the sauce","instruction":"Add a pinch of sugar and salt. Taste — it should be slightly sweet and tangy.","ingredients":["1 tsp sugar","Salt to taste"]},
    {"index":5,"title":"Combine eggs and tomatoes","instruction":"Return the eggs to the pan and fold through the tomato sauce.","durationSeconds":60,"ingredients":["Cooked eggs"]},
    {"index":6,"title":"Serve","instruction":"Spoon over hot rice and garnish with spring onion if you have it.","ingredients":["Cooked rice","Spring onion (optional)"]}
  ]'::jsonb,
  array['quick', 'vegetarian', 'one-pan'],
  'Unknown — verify before publication', 'Unknown — verify before publication'
),
(
  'garlic-butter-mushrooms',
  'Garlic butter mushrooms on toast',
  'Golden mushrooms sautéed in garlic butter, piled onto crusty toast.',
  12, 'easy', 1,
  'Made in one pan',
  'utensils-crossed', 'from-oat to-oat-dark',
  array['200g mushrooms', '2 cloves garlic', '1 tbsp butter', '1 slice bread', 'salt', 'pepper', 'parsley (optional)'],
  array['frying pan', 'toaster'],
  '[
    {"index":1,"title":"Prep the mushrooms","instruction":"Wipe the mushrooms clean and slice them thickly — they shrink a lot.","ingredients":["200g mushrooms"]},
    {"index":2,"title":"Sizzle in butter","instruction":"Melt butter in a hot pan, add mushrooms, and leave them alone for 2 minutes so they brown.","durationSeconds":180,"ingredients":["1 tbsp butter"],"tip":"Crowding makes them steam — cook in two batches if needed."},
    {"index":3,"title":"Add garlic","instruction":"Stir in the minced garlic, salt, and pepper and cook 1 more minute until fragrant.","durationSeconds":60,"ingredients":["2 cloves garlic","Salt","Pepper"]},
    {"index":4,"title":"Toast and serve","instruction":"Toast the bread, pile the mushrooms on top, and scatter with parsley.","ingredients":["1 slice bread","Parsley (optional)"]}
  ]'::jsonb,
  array['quick', 'vegetarian'],
  'Unknown — verify before publication', 'Unknown — verify before publication'
),
(
  'mushroom-noodles',
  'One-pan mushroom noodles',
  'Slippery noodles and browned mushrooms in a glossy soy-garlic sauce.',
  20, 'easy', 2,
  'Made in one pan',
  'utensils-crossed', 'from-oat to-oat-dark',
  array['2 portions noodles', '200g mushrooms', '2 cloves garlic', '2 tbsp soy sauce', '1 tsp sesame oil', '1 tsp sugar', 'spring onion (optional)'],
  array['frying pan or wok', 'pot'],
  '[
    {"index":1,"title":"Cook the noodles","instruction":"Boil the noodles one minute shy of the packet time, drain, and rinse briefly.","durationSeconds":240,"ingredients":["2 portions noodles"],"tip":"Slightly underdone noodles finish cooking in the sauce."},
    {"index":2,"title":"Brown the mushrooms","instruction":"Sear sliced mushrooms in a hot oiled pan until golden at the edges.","durationSeconds":180,"ingredients":["200g mushrooms","1 tbsp oil"]},
    {"index":3,"title":"Build the sauce","instruction":"Add garlic, soy sauce, sugar, and a splash of noodle water; stir until glossy.","durationSeconds":90,"ingredients":["2 cloves garlic","2 tbsp soy sauce","1 tsp sugar"]},
    {"index":4,"title":"Toss together","instruction":"Add the noodles and toss until every strand is coated. Finish with sesame oil.","durationSeconds":60,"ingredients":["1 tsp sesame oil","Spring onion (optional)"]}
  ]'::jsonb,
  array['one-pan', 'vegetarian'],
  'Unknown — verify before publication', 'Unknown — verify before publication'
),
(
  'anything-fried-rice',
  'Whatever-you-have fried rice',
  'The clean-out-the-fridge classic: day-old rice, an egg, and any odds and ends.',
  20, 'easy', 2,
  'Clears out your leftover rice',
  'cooking-pot', 'from-flame-soft to-oat',
  array['2 cups cooked rice (day-old is best)', '2 eggs', '1 cup mixed veg or leftovers', '2 tbsp soy sauce', '1 clove garlic', 'oil'],
  array['frying pan or wok', 'spatula'],
  '[
    {"index":1,"title":"Scramble the egg","instruction":"Fry the beaten eggs in a little oil until just set, then break into pieces and set aside.","durationSeconds":90,"ingredients":["2 eggs","1 tsp oil"]},
    {"index":2,"title":"Fry the aromatics","instruction":"Add a little more oil, fry the garlic and any veg or leftover protein until hot.","durationSeconds":120,"ingredients":["1 clove garlic","1 cup mixed veg"]},
    {"index":3,"title":"Add the rice","instruction":"Tip in the rice, press out the clumps, and let it sit 30 seconds at a time so it fries, not steams.","durationSeconds":180,"ingredients":["2 cups cooked rice"],"tip":"Day-old rice fries best — fresh rice turns mushy."},
    {"index":4,"title":"Season and serve","instruction":"Add soy sauce around the edge of the pan, return the egg, toss, and taste for salt.","durationSeconds":60,"ingredients":["2 tbsp soy sauce"]}
  ]'::jsonb,
  array['quick', 'leftovers'],
  'Unknown — verify before publication', 'Unknown — verify before publication'
),
(
  'creamy-pantry-pasta',
  'Creamy pantry pasta',
  'A silky garlic-parmesan sauce built from butter, milk, and starchy pasta water.',
  25, 'easy', 2,
  'All pantry staples',
  'wheat', 'from-oat to-oat-dark',
  array['200g pasta', '2 tbsp butter', '2 cloves garlic', '150ml milk', '30g grated parmesan', 'salt', 'pepper'],
  array['pot', 'frying pan'],
  '[
    {"index":1,"title":"Boil the pasta","instruction":"Cook the pasta in well-salted water until al dente. Save a cup of the pasta water.","durationSeconds":600,"ingredients":["200g pasta","Salt"],"tip":"The starchy water is what makes the sauce cling."},
    {"index":2,"title":"Start the sauce","instruction":"Melt butter in a pan and gently fry the garlic for a minute — no browning.","durationSeconds":60,"ingredients":["2 tbsp butter","2 cloves garlic"]},
    {"index":3,"title":"Make it creamy","instruction":"Pour in the milk and a splash of pasta water; simmer until slightly thickened.","durationSeconds":120,"ingredients":["150ml milk","Pasta water"]},
    {"index":4,"title":"Bring it together","instruction":"Toss in the pasta and parmesan, loosen with pasta water until glossy, and season.","durationSeconds":90,"ingredients":["30g parmesan","Pepper"]}
  ]'::jsonb,
  array['vegetarian', 'comfort'],
  'Unknown — verify before publication', 'Unknown — verify before publication'
),
(
  'sheet-pan-sausage-veg',
  'Sheet-pan sausage & veg',
  'Chop, season, roast — a hands-off tray of crispy-edged vegetables and sausage.',
  35, 'medium', 2,
  'Nearly zero active work',
  'drumstick', 'from-flame-soft to-oat',
  array['2 sausages', '1 potato', '1 carrot', '1 onion', '2 tbsp oil', 'salt', 'pepper', 'dried herbs'],
  array['oven', 'baking tray'],
  '[
    {"index":1,"title":"Heat the oven","instruction":"Heat the oven to 200°C (fan 180°C) and put the empty tray in to warm up.","durationSeconds":300,"ingredients":[],"tip":"A hot tray jump-starts the crisping."},
    {"index":2,"title":"Chop everything","instruction":"Cut the potato, carrot, and onion into bite-size chunks; leave the sausages whole.","ingredients":["1 potato","1 carrot","1 onion","2 sausages"]},
    {"index":3,"title":"Season on the tray","instruction":"Toss the veg with oil, salt, pepper, and herbs right on the tray, then nestle in the sausages.","ingredients":["2 tbsp oil","Salt","Pepper","Dried herbs"]},
    {"index":4,"title":"Roast","instruction":"Roast 25–30 minutes, turning once, until the veg are golden and sausages are cooked through.","durationSeconds":1500,"ingredients":[]},
    {"index":5,"title":"Rest and serve","instruction":"Rest 2 minutes, then serve straight from the tray — fewer dishes.","durationSeconds":120,"ingredients":[]}
  ]'::jsonb,
  array['hands-off', 'oven'],
  'Unknown — verify before publication', 'Unknown — verify before publication'
)
on conflict (slug) do nothing;
