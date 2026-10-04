import supabase from './supabase'

// logs the top suggestion for a pet so the admin can see which conditions
// and foods are trending
// supabase.insert() returns { data, error } instead of throwing, so the
// error property has to be checked explicitly
export async function logTopRecommendation({ pet, topProduct }) {
  if (!pet || !topProduct) return

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return

    const { error } = await supabase
      .from('recommendation')
      .insert({
        id: userId,
        prod_id: topProduct.prod_id || null,
        pet_condition: pet.healthCondition || 'healthy',
        suggested_food: topProduct.name,
        reco_date: new Date().toISOString(),
      })
      .select()

    if (error) {
      console.error('Recommendation logging failed:', error)
    }
  } catch (err) {
    console.error('Unexpected error in recommendation logging:', err)
  }
}
