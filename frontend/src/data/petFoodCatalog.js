// curated catalog for the pet food recommendation engine
// each product carries species, lifeStage, healthTags (conditions it's GOOD for),
// avoidFor (conditions it should NOT be given to), and excludedAllergens (ingredients it contains)
// the recommendation engine matches a pet's profile against these fields
export const PET_FOOD_CATALOG = [
  {
    id: 101,
    name: 'Royal Canin Renal Support Dog Food',
    price: 1250,
    image: '/categoryshop/dog.jpg',
    species: ['dog'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['kidney-safe', 'urinary-support'],
    avoidFor: ['none'],
    ingredients: ['chicken', 'rice'],
    brand: 'Royal Canin',
    description: 'Therapeutic diet formulated to support kidney function in adult and senior dogs.',
  },
  {
    id: 102,
    name: 'Hill\'s Prescription Diet w/d Multi-Benefit',
    price: 1650,
    image: '/categoryshop/dog.png',
    species: ['dog'],
    lifeStage: ['adult'],
    healthTags: ['diabetes-safe', 'weight-management', 'dental'],
    avoidFor: [],
    ingredients: ['chicken', 'grain'],
    brand: 'Hill\'s',
    description: 'Low-fat, high-fiber formula supporting glucose control and healthy weight.',
  },
  {
    id: 103,
    name: 'Purina Pro Plan Sensitive Skin & Stomach',
    price: 980,
    image: '/categoryshop/dog.jpg',
    species: ['dog'],
    lifeStage: ['adult'],
    healthTags: ['sensitive-stomach', 'allergy-friendly'],
    avoidFor: [],
    ingredients: ['salmon', 'rice'],
    brand: 'Purina',
    description: 'Salmon-first, gentle recipe for dogs with sensitive digestion and itchy skin.',
  },
  {
    id: 104,
    name: 'Pedigree Puppy Complete Nutrition',
    price: 450,
    image: '/categoryshop/dog.png',
    species: ['dog'],
    lifeStage: ['puppy'],
    healthTags: ['healthy', 'growth-support'],
    avoidFor: ['diabetes', 'kidney', 'weight-management'],
    ingredients: ['chicken', 'beef', 'grain'],
    brand: 'Pedigree',
    description: 'Balanced nutrition for fast-growing puppies up to 12 months.',
  },
  {
    id: 105,
    name: 'Royal Canin Senior Dog 7+ Years',
    price: 920,
    image: '/categoryshop/dog.jpg',
    species: ['dog'],
    lifeStage: ['senior'],
    healthTags: ['joint-support', 'heart-support', 'healthy'],
    avoidFor: [],
    ingredients: ['chicken', 'rice'],
    brand: 'Royal Canin',
    description: 'Tailored for senior dogs with joint and heart-health nutrients.',
  },
  {
    id: 106,
    name: 'Whiskers Grain-Free Adult Dog',
    price: 780,
    image: '/categoryshop/dog.png',
    species: ['dog'],
    lifeStage: ['adult'],
    healthTags: ['allergy-friendly', 'grain-free'],
    avoidFor: [],
    ingredients: ['lamb', 'sweet potato'],
    brand: 'Whiskers',
    description: 'Hypoallergenic grain-free recipe for dogs with food sensitivities.',
  },
  {
    id: 107,
    name: 'Hill\'s Science Diet Adult Healthy Mobility',
    price: 1120,
    image: '/categoryshop/dog.jpg',
    species: ['dog'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['joint-support', 'weight-management'],
    avoidFor: [],
    ingredients: ['chicken', 'rice'],
    brand: 'Hill\'s',
    description: 'Supports joint mobility and healthy weight with glucosamine and L-carnitine.',
  },
  {
    id: 108,
    name: 'Pedigree Dentastix Oral Care',
    price: 280,
    image: '/categoryshop/dog.png',
    species: ['dog'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['dental'],
    avoidFor: ['diabetes', 'weight-management'],
    ingredients: ['grain', 'chicken'],
    brand: 'Pedigree',
    description: 'Daily dental chew that reduces tartar build-up.',
  },
  {
    id: 109,
    name: 'Purina Beneful Healthy Weight',
    price: 650,
    image: '/categoryshop/dog.jpg',
    species: ['dog'],
    lifeStage: ['adult'],
    healthTags: ['weight-management', 'heart-support'],
    avoidFor: [],
    ingredients: ['chicken', 'rice'],
    brand: 'Purina',
    description: 'Reduced-calorie formula for dogs needing weight control.',
  },
  {
    id: 110,
    name: 'Whiskers Liver Care Diet',
    price: 1380,
    image: '/categoryshop/dog.png',
    species: ['dog'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['liver-support'],
    avoidFor: [],
    ingredients: ['fish', 'rice'],
    brand: 'Whiskers',
    description: 'Low-copper, hepatic-support diet for dogs with liver conditions.',
  },

  {
    id: 111,
    name: 'Royal Canin Urinary SO Cat',
    price: 1180,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['urinary-support', 'kidney-safe'],
    avoidFor: [],
    ingredients: ['chicken'],
    brand: 'Royal Canin',
    description: 'Veterinary diet that helps dissolve and prevent struvite stones.',
  },
  {
    id: 112,
    name: 'Hill\'s Prescription Diet m/d Diabetic',
    price: 1520,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['diabetes-safe', 'weight-management'],
    avoidFor: [],
    ingredients: ['chicken'],
    brand: 'Hill\'s',
    description: 'Low-carb, high-protein formula for diabetic and overweight cats.',
  },
  {
    id: 113,
    name: 'Whiskas Kitten Complete',
    price: 380,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['kitten'],
    healthTags: ['healthy', 'growth-support'],
    avoidFor: ['diabetes', 'kidney', 'weight-management'],
    ingredients: ['chicken', 'fish', 'grain'],
    brand: 'Whiskas',
    description: 'Essential nutrition for kittens during their first 12 months.',
  },
  {
    id: 114,
    name: 'Purina Pro Plan Sensitive Skin Cat',
    price: 890,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult'],
    healthTags: ['sensitive-stomach', 'allergy-friendly'],
    avoidFor: [],
    ingredients: ['salmon', 'rice'],
    brand: 'Purina',
    description: 'Hydrolyzed protein and omega-rich recipe for sensitive cats.',
  },
  {
    id: 115,
    name: 'Royal Canin Hairball Care Cat',
    price: 720,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult'],
    healthTags: ['healthy', 'hairball-control'],
    avoidFor: [],
    ingredients: ['chicken'],
    brand: 'Royal Canin',
    description: 'High-fiber formula that helps move hair through the digestive tract.',
  },
  {
    id: 116,
    name: 'Whiskers Senior Cat 11+',
    price: 850,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['senior'],
    healthTags: ['kidney-safe', 'joint-support'],
    avoidFor: [],
    ingredients: ['chicken'],
    brand: 'Whiskers',
    description: 'Gentle senior recipe with reduced phosphorus for kidney health.',
  },
  {
    id: 117,
    name: 'Hill\'s Science Diet Dental Care Cat',
    price: 980,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['dental'],
    avoidFor: [],
    ingredients: ['chicken', 'rice'],
    brand: 'Hill\'s',
    description: 'Unique kibble texture that cleans teeth with every bite.',
  },
  {
    id: 118,
    name: 'Ciao Grain-Free Tuna Cat Food',
    price: 560,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult'],
    healthTags: ['allergy-friendly', 'grain-free'],
    avoidFor: [],
    ingredients: ['fish'],
    brand: 'Ciao',
    description: 'Grain-free tuna recipe for cats with dietary sensitivities.',
  },
  {
    id: 119,
    name: 'Purina Feline Renal Formula',
    price: 1280,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['kidney-safe'],
    avoidFor: [],
    ingredients: ['chicken'],
    brand: 'Purina',
    description: 'Low-phosphorus therapeutic diet for cats with kidney disease.',
  },
  {
    id: 120,
    name: 'Whiskers Weight Control Cat',
    price: 680,
    image: '/categoryshop/cat.jpg',
    species: ['cat'],
    lifeStage: ['adult'],
    healthTags: ['weight-management', 'diabetes-safe'],
    avoidFor: [],
    ingredients: ['chicken', 'fish'],
    brand: 'Whiskers',
    description: 'Reduced calorie formula that helps cats maintain an ideal weight.',
  },

  {
    id: 121,
    name: 'Avian Plus Complete Pellet',
    price: 420,
    image: '/categoryshop/berd.jpg',
    species: ['bird'],
    lifeStage: ['juvenile', 'adult'],
    healthTags: ['healthy'],
    avoidFor: [],
    ingredients: ['grain', 'seeds'],
    brand: 'Avian Plus',
    description: 'Complete pelleted diet for parrots, cockatiels, and budgies.',
  },
  {
    id: 122,
    name: 'Avian Plus Senior Bird Blend',
    price: 480,
    image: '/categoryshop/berd.jpg',
    species: ['bird'],
    lifeStage: ['senior'],
    healthTags: ['joint-support', 'heart-support'],
    avoidFor: [],
    ingredients: ['seeds', 'dried-fruit'],
    brand: 'Avian Plus',
    description: 'Enriched with omega-3 for aging birds.',
  },
  {
    id: 123,
    name: 'Whiskers Bird Egg-Food Juvenile',
    price: 320,
    image: '/categoryshop/berd.jpg',
    species: ['bird'],
    lifeStage: ['juvenile'],
    healthTags: ['growth-support', 'healthy'],
    avoidFor: ['weight-management'],
    ingredients: ['egg', 'grain'],
    brand: 'Whiskers',
    description: 'High-protein egg food for young and breeding birds.',
  },
  {
    id: 124,
    name: 'Avian Plus Liver & Kidney Support',
    price: 560,
    image: '/categoryshop/berd.jpg',
    species: ['bird'],
    lifeStage: ['adult', 'senior'],
    healthTags: ['liver-support', 'kidney-safe'],
    avoidFor: [],
    ingredients: ['seeds', 'herbs'],
    brand: 'Avian Plus',
    description: 'Herbal blend supporting avian liver and kidney function.',
  },

  {
    id: 125,
    name: 'Aqua Pro Tropical Flakes',
    price: 220,
    image: '/categoryshop/fish.png',
    species: ['fish'],
    lifeStage: ['juvenile', 'adult'],
    healthTags: ['healthy'],
    avoidFor: [],
    ingredients: ['fish-meal', 'shrimp'],
    brand: 'Aqua Pro',
    description: 'Daily flake diet for tropical freshwater fish.',
  },
  {
    id: 126,
    name: 'Aqua Pro Goldfish Weight Control',
    price: 260,
    image: '/categoryshop/fish.png',
    species: ['fish'],
    lifeStage: ['adult'],
    healthTags: ['weight-management', 'healthy'],
    avoidFor: [],
    ingredients: ['fish-meal', 'vegetable'],
    brand: 'Aqua Pro',
    description: 'Reduced-protein formula to prevent overfeeding goldfish.',
  },
  {
    id: 127,
    name: 'Aqua Pro Growth Pellets Juvenile',
    price: 290,
    image: '/categoryshop/fish.png',
    species: ['fish'],
    lifeStage: ['juvenile'],
    healthTags: ['growth-support'],
    avoidFor: ['weight-management'],
    ingredients: ['fish-meal', 'squid'],
    brand: 'Aqua Pro',
    description: 'High-protein pellets for rapidly growing juvenile fish.',
  },
  {
    id: 128,
    name: 'Aqua Pro Sensitive Formula',
    price: 310,
    image: '/categoryshop/fish.png',
    species: ['fish'],
    lifeStage: ['adult'],
    healthTags: ['sensitive-stomach', 'allergy-friendly'],
    avoidFor: [],
    ingredients: ['vegetable', 'spirulina'],
    brand: 'Aqua Pro',
    description: 'Plant-based formula for fish with digestive sensitivities.',
  },

  {
    id: 129,
    name: 'Whiskers Multi-Vitamin Drops (Dog)',
    price: 380,
    image: '/categoryshop/all.png',
    species: ['dog'],
    lifeStage: ['adult', 'senior', 'puppy'],
    healthTags: ['healthy', 'heart-support'],
    avoidFor: [],
    ingredients: ['fish-oil'],
    brand: 'Whiskers',
    description: 'Daily vitamin supplement mixed into food.',
  },
  {
    id: 130,
    name: 'Whiskers Multi-Vitamin Drops (Cat)',
    price: 380,
    image: '/categoryshop/all.png',
    species: ['cat'],
    lifeStage: ['adult', 'senior', 'kitten'],
    healthTags: ['healthy', 'heart-support'],
    avoidFor: [],
    ingredients: ['fish-oil'],
    brand: 'Whiskers',
    description: 'Daily feline vitamin supplement with taurine.',
  },
]

// the scoring function at the heart of the recommendation engine
// takes a pet profile and returns products sorted by relevance
// rules:
//   1. HARD EXCLUDE if product.species doesn't include the pet's species
//   2. HARD EXCLUDE if product.avoidFor includes the pet's health condition
//   3. HARD EXCLUDE if product.ingredients contains any of the pet's allergies
//   4. score +3 if product.lifeStage matches pet's life stage
//   5. score +5 for each matching healthTag to the pet's health condition
//   6. score +1 baseline if the pet is 'healthy' (so general products still appear)
export function recommendFor(pet) {
  if (!pet || !pet.species) return []

  const scored = PET_FOOD_CATALOG
    .filter((product) => product.species.includes(pet.species))
    .filter((product) => {
      if (pet.healthCondition && pet.healthCondition !== 'healthy') {
        if (product.avoidFor.includes(pet.healthCondition)) return false
      }
      return true
    })
    .filter((product) => {
      if (!pet.allergies || pet.allergies.length === 0) return true
      if (pet.allergies.includes('none')) return true
      return !pet.allergies.some((allergen) => product.ingredients.includes(allergen))
    })
    .map((product) => {
      let score = 0
      const reasons = []

      if (pet.lifeStage && product.lifeStage.includes(pet.lifeStage)) {
        score += 3
        reasons.push(`Suitable for ${pet.lifeStage} ${pet.species}`)
      }

      if (pet.healthCondition && pet.healthCondition !== 'healthy') {
        const healthMatches = product.healthTags.filter((tag) => {
          if (pet.healthCondition === 'diabetes' && tag === 'diabetes-safe') return true
          if (pet.healthCondition === 'kidney' && (tag === 'kidney-safe' || tag === 'urinary-support')) return true
          if (pet.healthCondition === 'urinary' && tag === 'urinary-support') return true
          if (pet.healthCondition === 'sensitive-stomach' && tag === 'sensitive-stomach') return true
          if (pet.healthCondition === 'weight-management' && tag === 'weight-management') return true
          if (pet.healthCondition === 'dental' && tag === 'dental') return true
          if (pet.healthCondition === 'joint' && tag === 'joint-support') return true
          if (pet.healthCondition === 'heart' && tag === 'heart-support') return true
          if (pet.healthCondition === 'liver' && tag === 'liver-support') return true
          if (pet.healthCondition === 'allergy-prone' && tag === 'allergy-friendly') return true
          return false
        })
        if (healthMatches.length > 0) {
          score += 5 * healthMatches.length
          reasons.push(`Formulated for ${pet.healthCondition.replace('-', ' ')} support`)
        }
      }

      if (pet.healthCondition === 'healthy' && product.healthTags.includes('healthy')) {
        score += 1
        reasons.push('General wellness formula')
      }

      if (pet.allergies && pet.allergies.length > 0 && !pet.allergies.includes('none')) {
        if (product.healthTags.includes('allergy-friendly')) {
          score += 2
          reasons.push('Allergy-friendly recipe')
        }
      }

      return { ...product, score, reasons }
    })
    .filter((product) => product.score > 0)
    .sort((a, b) => b.score - a.score)
    
  return scored
}
