-- Backfill hero images for the TheMealDB-sourced catalogue recipes.

update public.recipes set image_url = 'https://www.themealdb.com/images/media/meals/tqtywx1468317395.jpg' where slug = 'chocolate-gateau';
update public.recipes set image_url = 'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg' where slug = 'teriyaki-chicken-casserole';
update public.recipes set image_url = 'https://www.themealdb.com/images/media/meals/uuuspp1468263334.jpg' where slug = 'pad-see-ew';
update public.recipes set image_url = 'https://www.themealdb.com/images/media/meals/rvxxuy1468312893.jpg' where slug = 'vegan-lasagna';
update public.recipes set image_url = 'https://www.themealdb.com/images/media/meals/wvqpwt1468339226.jpg' where slug = 'mediterranean-pasta-salad';
update public.recipes set image_url = 'https://www.themealdb.com/images/media/meals/xxyupu1468262513.jpg' where slug = 'honey-teriyaki-salmon';
