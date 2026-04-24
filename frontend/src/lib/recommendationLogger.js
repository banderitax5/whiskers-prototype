import supabase from './supabase'

// logs a single recommendation row to the supabase `recommendation` table
// called when a user views a pet's recommendations so the admin
// can later analyze which conditions and foods are trending
// IMPORTANT: supabase.insert() does NOT throw on errors - it returns { data, error }
// so we must check the error property explicitly, not rely on try/catch alone
export async function logTopRecommendation({ userId, pet, topProduct }) {
  if (!userId || !pet || !topProduct) {
    return
  }

  const payload = {
    id: userId,
    prod_id: null,
    pet_condition: pet.healthCondition,
    suggested_food: topProduct.name,
  }

  try {
    const { error } = await supabase
      .from('recommendation')
      .insert(payload)
      .select()

    if (error) {
      console.error('Recommendation logging failed:', error)
    }
  } catch (err) {
    console.error('Unexpected error in recommendation logging:', err)
  }
}
