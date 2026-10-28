// Suggested search phrases for the navbar dropdown. Matching is local: no AI
// call, so suggestions appear instantly as the shopper types.
// Only pet types the shop sells are listed (dog, cat, bird, fish).

const PHRASES = [
  'food for dog',
  'food for puppy',
  'food for senior dog',
  'food for adult dog',
  'food for cat',
  'food for kitten',
  'food for senior cat',
  'food for adult cat',
  'dog food for sensitive stomach',
  'cat food for sensitive stomach',
  'dog food for dental health',
  'dog food for joint care',
  'dog food for weight control',
  'dog food for heart health',
  'cat food for urinary health',
  'cat food for kidney care',
  'cat food for weight control',
  'cat food for diabetes',
  'cat food for liver care',
  'grain free dog food',
  'grain free cat food',
  'chicken free dog food',
  'chicken free cat food',
  'dental treats for dog',
  'dental treats for cat',
  'bird food for parrot',
  'bird seed',
  'fish food for goldfish',
]

// Number of single-character changes needed to turn a into b.
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

// Matches a typed word against a phrase word: prefix match, or one typo allowed
// (so "fod" still finds "food").
function tokenMatchesWord(token, word) {
  if (word.startsWith(token)) return true
  if (token.length < 3) return false
  return editDistance(token, word.slice(0, token.length)) <= 1
}

// Returns up to `limit` phrases that match every word typed so far.
export function suggestPhrases(query, limit = 6) {
  const q = (query || '').trim().toLowerCase()
  if (q.length < 2) return []
  const tokens = q.split(/\s+/)
  const matches = PHRASES.filter((phrase) => {
    const words = phrase.split(' ')
    return tokens.every((t) => words.some((w) => tokenMatchesWord(t, w)))
  })
  // phrases that start with what was typed come first
  matches.sort((a, b) => Number(!a.startsWith(q)) - Number(!b.startsWith(q)))
  return matches.slice(0, limit)
}
