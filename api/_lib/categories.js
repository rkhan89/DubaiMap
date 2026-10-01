// Google Places types → Koko categories. The first matching type wins, in the order Google
// lists them (most specific first). Mirrored in the place_type_categories table
// (supabase/migrations/0002_share.sql) so it can be read or changed without a deploy.
export const TYPE_TO_CATEGORY = {
  coffee_shop:'coffee', cafe:'coffee', coffee_roastery:'coffee', coffee_stand:'coffee',
  tea_house:'karak',
  dessert_shop:'dessert', dessert_restaurant:'dessert', bakery:'dessert', confectionery:'dessert', chocolate_shop:'dessert',
  donut_shop:'dessert', candy_store:'dessert', cake_shop:'dessert', pastry_shop:'dessert',
  ice_cream_shop:'icecream', frozen_yogurt_shop:'froyo', gelato_shop:'icecream',
  hookah_bar:'shisha',
  acai_shop:'acai', juice_shop:'acai', smoothie_shop:'acai',
  hamburger_restaurant:'burger',
  fast_food_restaurant:'fastfood', sandwich_shop:'fastfood', chicken_restaurant:'fastfood', hot_dog_restaurant:'fastfood',
  pizza_restaurant:'pizza', italian_restaurant:'pizza',
  cafeteria:'cafeteria', diner:'cafeteria', food_court:'cafeteria', breakfast_restaurant:'cafeteria', brunch_restaurant:'cafeteria',
  middle_eastern_restaurant:'restaurant', lebanese_restaurant:'restaurant', indian_restaurant:'restaurant', pakistani_restaurant:'restaurant',
  turkish_restaurant:'restaurant', afghani_restaurant:'restaurant', persian_restaurant:'restaurant', restaurant:'restaurant',
};
export function categoryFor(types){
  for (const t of types||[]) if (TYPE_TO_CATEGORY[t]) return TYPE_TO_CATEGORY[t];
  return null;
}
