-- StarterChef seed recipes.
-- These recipes are sourced from TheMealDB (https://www.themealdb.com/) for
-- demo/placeholder use. They should be reviewed and attributed correctly before
-- any public release. Run after the migrations, e.g. paste into the Supabase
-- SQL editor. Idempotent: safe to re-run.

insert into public.recipes (
  slug, title, description, minutes, difficulty, servings, why_good,
  icon, image_tint, ingredients, equipment, steps, tags, source
) values
(
  'teriyaki-chicken-casserole',
  'Teriyaki chicken casserole',
  'Shredded chicken, vegetables and brown rice baked in a sticky teriyaki sauce.',
  65, 'medium', 4,
  'Hearty one-dish dinner',
  'cooking-pot', 'from-flame-soft to-oat',
  array['soy sauce 3/4 cup', 'water 1/2 cup', 'brown sugar 1/4 cup', 'ground ginger 1/2 tsp', 'minced garlic 1/2 tsp', 'cornstarch 4 tbsp', 'chicken breasts 2', 'stir-fry vegetables 1 (12 oz) bag', 'brown rice 3 cups'],
  array['oven', '9x13-inch baking pan', 'small saucepan', 'mixing bowl'],
  '[
    {"index":1,"title":"Preheat and prep","instruction":"Preheat oven to 350°F. Spray a 9x13-inch baking pan with non-stick spray.","durationSeconds":300,"ingredients":[],"tip":"A hot oven helps the sauce thicken in the dish."},
    {"index":2,"title":"Make the sauce","instruction":"Combine soy sauce, 1/2 cup water, brown sugar, ginger and garlic in a small saucepan. Cover, bring to a boil over medium heat, then remove the lid and boil for one minute.","durationSeconds":300,"ingredients":["soy sauce 3/4 cup","water 1/2 cup","brown sugar 1/4 cup","ground ginger 1/2 tsp","minced garlic 1/2 tsp"]},
    {"index":3,"title":"Thicken the sauce","instruction":"Stir cornstarch and 2 tablespoons water until smooth. Add to the saucepan and cook until the sauce thickens, then remove from heat.","durationSeconds":120,"ingredients":["cornstarch 4 tbsp"]},
    {"index":4,"title":"Bake the chicken","instruction":"Place chicken breasts in the prepared pan, pour 1 cup of sauce over them, and bake for 35 minutes or until cooked through. Remove and shred with two forks.","durationSeconds":2100,"ingredients":["chicken breasts 2"]},
    {"index":5,"title":"Cook the vegetables","instruction":"Meanwhile, steam or cook the vegetables according to package directions.","durationSeconds":600,"ingredients":["stir-fry vegetables 1 (12 oz) bag"]},
    {"index":6,"title":"Combine and finish","instruction":"Add the cooked vegetables, rice, and most of the remaining sauce to the pan with the shredded chicken. Toss gently, return to the oven for 15 minutes, then let stand 5 minutes before serving. Drizzle with the reserved sauce.","durationSeconds":1200,"ingredients":["brown rice 3 cups"]}
  ]'::jsonb,
  array['dinner', 'casserole', 'chicken'],
  'TheMealDB'
),
(
  'pad-see-ew',
  'Pad see ew',
  'Wide rice noodles tossed with chicken, Chinese broccoli and a dark soy glaze.',
  25, 'easy', 2,
  'Faster than takeout',
  'utensils-crossed', 'from-oat to-oat-dark',
  array['rice stick noodles 6oz/180g', 'dark soy sauce 2 tbsp', 'oyster sauce 2 tbsp', 'soy sauce 2 tsp', 'white vinegar 2 tsp', 'sugar 2 tsp', 'water 2 tbsp', 'peanut oil 2 tbsp', 'garlic 2 cloves', 'chicken 1 cup', 'egg 1', 'Chinese broccoli 4 cups'],
  array['wok or large frying pan'],
  '[
    {"index":1,"title":"Mix the sauce","instruction":"Stir dark soy sauce, oyster sauce, soy sauce, vinegar, sugar and water together in a small bowl.","durationSeconds":60,"ingredients":["dark soy sauce 2 tbsp","oyster sauce 2 tbsp","soy sauce 2 tsp","white vinegar 2 tsp","sugar 2 tsp","water 2 tbsp"]},
    {"index":2,"title":"Fry garlic and chicken","instruction":"Heat oil in a wok over high heat. Add garlic, chicken and Chinese broccoli stems. Cook until the chicken is lightly golden.","durationSeconds":180,"ingredients":["peanut oil 2 tbsp","garlic 2 cloves","chicken 1 cup"]},
    {"index":3,"title":"Scramble the egg","instruction":"Push the chicken to the side, crack the egg into the wok and scramble it.","durationSeconds":60,"ingredients":["egg 1"],"tip":"A little char on the bottom adds authentic wok hei flavour."},
    {"index":4,"title":"Toss everything together","instruction":"Add the noodles, Chinese broccoli leaves and the sauce. Gently mix until the noodles are stained dark and the leaves are wilted. Serve immediately.","durationSeconds":120,"ingredients":["rice stick noodles 6oz/180g","Chinese broccoli 4 cups"]}
  ]'::jsonb,
  array['thai', 'noodles', 'quick'],
  'TheMealDB'
),
(
  'vegan-lasagna',
  'Vegan lasagna',
  'Layers of lentils, vegetables and spinach in a creamy dairy-free sauce.',
  55, 'medium', 4,
  'Plant-based comfort food',
  'cooking-pot', 'from-oat to-oat-dark',
  array['green or red lentils 1 cup', 'carrots 1', 'onion 1', 'zucchini 1 small', 'coriander a sprinkling', 'spinach 150g', 'lasagne sheets 10', 'vegan butter 35g', 'flour 4 tbsp', 'soya milk 300ml', 'mustard 1.5 tsp', 'vinegar 1 tsp'],
  array['oven', 'saucepan', 'frying pan', 'baking dish'],
  '[
    {"index":1,"title":"Preheat the oven","instruction":"Preheat oven to 180°C.","durationSeconds":60,"ingredients":[]},
    {"index":2,"title":"Simmer the lentil filling","instruction":"Boil vegetables for 5–7 minutes until soft. Add lentils and simmer gently until tender, about 20 minutes, adding a stock cube if desired.","durationSeconds":1800,"ingredients":["green or red lentils 1 cup","carrots 1","onion 1","zucchini 1 small","coriander a sprinkling"]},
    {"index":3,"title":"Blanch the spinach","instruction":"Blanch spinach leaves for a few minutes, then remove and set aside.","durationSeconds":180,"ingredients":["spinach 150g"]},
    {"index":4,"title":"Cook the pasta","instruction":"Top up the pan with water and cook the lasagne sheets. Drain and set aside.","durationSeconds":600,"ingredients":["lasagne sheets 10"]},
    {"index":5,"title":"Make the white sauce","instruction":"Melt vegan butter, stir in flour, then gradually whisk in soya milk, mustard and vinegar. Cook until smooth.","durationSeconds":300,"ingredients":["vegan butter 35g","flour 4 tbsp","soya milk 300ml","mustard 1.5 tsp","vinegar 1 tsp"]},
    {"index":6,"title":"Layer and bake","instruction":"Assemble the lasagna in a baking dish with lentil filling, spinach, lasagne sheets and white sauce. Bake for about 25 minutes until bubbling.","durationSeconds":1500,"ingredients":[]}
  ]'::jsonb,
  array['vegan', 'pasta', 'comfort'],
  'TheMealDB'
),
(
  'mediterranean-pasta-salad',
  'Mediterranean pasta salad',
  'Cold farfalle with mozzarella, tuna, tomatoes and basil — great for hot days.',
  30, 'easy', 4,
  'No reheating needed',
  'salad', 'from-flame-soft to-oat',
  array['mozzarella balls 200g', 'baby plum tomatoes 250g', 'fresh basil 1 bunch', 'farfalle 350g', 'extra virgin olive oil 3 tbsp', 'green olives 40g', 'tuna 200g', 'salt to taste', 'pepper to taste'],
  array['large saucepan', 'colander', 'salad bowl'],
  '[
    {"index":1,"title":"Boil the pasta","instruction":"Bring a large saucepan of salted water to the boil, add the pasta and cook for about 10 minutes or as directed on the packet.","durationSeconds":600,"ingredients":["farfalle 350g","salt to taste"]},
    {"index":2,"title":"Prep the vegetables","instruction":"Meanwhile, wash the tomatoes and cut them into quarters. Slice the olives and wash the basil.","durationSeconds":300,"ingredients":["baby plum tomatoes 250g","green olives 40g","fresh basil 1 bunch"]},
    {"index":3,"title":"Marinate the tomatoes","instruction":"Put the tomatoes in a salad bowl, tear basil leaves over them and add 1 tablespoon of olive oil. Mix.","durationSeconds":120,"ingredients":["extra virgin olive oil 3 tbsp"]},
    {"index":4,"title":"Cool the pasta","instruction":"Drain the pasta into a colander and run cold water over it to cool quickly.","durationSeconds":120,"ingredients":[]},
    {"index":5,"title":"Toss and rest","instruction":"Add the pasta, mozzarella balls, tuna and olives to the bowl. Mix well and let rest at least 30 minutes for the flavours to mingle.","durationSeconds":1800,"ingredients":["mozzarella balls 200g","tuna 200g"],"tip":"Resting at room temperature or in the fridge improves the flavour."},
    {"index":6,"title":"Season and serve","instruction":"Season generously with black pepper and drizzle with the remaining olive oil just before serving.","durationSeconds":60,"ingredients":["pepper to taste","extra virgin olive oil 3 tbsp"]}
  ]'::jsonb,
  array['cold', 'pasta', 'salad'],
  'TheMealDB'
),
(
  'chocolate-gateau',
  'Chocolate gateau',
  'A rich, flour-light chocolate cake baked in a round spring-form tin.',
  80, 'medium', 8,
  'Weekend baking project',
  'wheat', 'from-oat to-oat-dark',
  array['plain chocolate 250g', 'butter 175g', 'milk 2 tbsp', 'eggs 5', 'granulated sugar 175g', 'flour 125g'],
  array['oven', '8-inch round spring-form cake tin', 'mixing bowl', 'heatproof bowl'],
  '[
    {"index":1,"title":"Prep the tin and oven","instruction":"Preheat oven to 180°C/350°F/gas mark 4. Grease and line the base of an 8-inch round spring-form cake tin with baking parchment.","durationSeconds":300,"ingredients":[]},
    {"index":2,"title":"Melt the chocolate","instruction":"Break the chocolate into a heatproof bowl set over gently simmering water, and stir until melted. Alternatively, microwave in short bursts, stirring occasionally.","durationSeconds":300,"ingredients":["plain chocolate 250g"]},
    {"index":3,"title":"Cream butter and sugar","instruction":"Beat butter and sugar together until light and fluffy. Gradually beat in the eggs, adding a little flour if the mixture starts to curdle.","durationSeconds":300,"ingredients":["butter 175g","granulated sugar 175g","eggs 5"]},
    {"index":4,"title":"Fold in chocolate","instruction":"Fold in the remaining flour, the cooled melted chocolate and the milk. Mix until smooth.","durationSeconds":120,"ingredients":["flour 125g","milk 2 tbsp"]},
    {"index":5,"title":"Bake and cool","instruction":"Spread the mixture into the tin and bake for 50–55 minutes until firm in the centre and a skewer comes out clean. Cool for 10 minutes, then turn out and cool completely.","durationSeconds":3600,"ingredients":[]}
  ]'::jsonb,
  array['dessert', 'baking', 'chocolate'],
  'TheMealDB'
),
(
  'honey-teriyaki-salmon',
  'Honey teriyaki salmon',
  'Pan-fried salmon fillets coated in a glossy soy-sesame glaze.',
  20, 'easy', 2,
  'Quick weeknight fish',
  'egg', 'from-flame-soft to-oat',
  array['salmon 1 lb', 'olive oil 1 tbsp', 'soy sauce 2 tbsp', 'sake 2 tbsp', 'sesame seeds 4 tbsp'],
  array['frying pan', 'small bowl'],
  '[
    {"index":1,"title":"Make the glaze","instruction":"Mix soy sauce, sake and sesame seeds together in a small bowl until combined.","durationSeconds":60,"ingredients":["soy sauce 2 tbsp","sake 2 tbsp","sesame seeds 4 tbsp"]},
    {"index":2,"title":"Coat the salmon","instruction":"Pour the glaze over the salmon and turn to coat all sides.","durationSeconds":60,"ingredients":["salmon 1 lb"]},
    {"index":3,"title":"Pan-fry","instruction":"Heat olive oil in a skillet over medium-low heat. Pan-fry the salmon on both sides until cooked through and the glaze thickens.","durationSeconds":600,"ingredients":["olive oil 1 tbsp"],"tip":"Lower heat prevents the glaze from burning."},
    {"index":4,"title":"Serve","instruction":"Garnish with a little extra sesame seed if desired and serve immediately.","durationSeconds":60,"ingredients":[]}
  ]'::jsonb,
  array['fish', 'quick', 'asian'],
  'TheMealDB'
)
on conflict (slug) do nothing;
