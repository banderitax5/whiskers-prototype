import { Router } from 'express'
import { supabaseAuth, supabaseAdmin } from '../config/supabase.js'
import { encryptText } from '../utils/encryption.js'
import { loginLimiter, signupLimiter } from '../middleware/rateLimiter.js'

const router = Router()

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return res.status(401).json({ error: error.message })
    res.json({ session: data.session })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/signup', signupLimiter, async (req, res) => {
  const { email, password, firstName, lastName } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  try {
    const { data, error: authError } = await supabaseAuth.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName?.trim() || '',
          last_name: lastName?.trim() || '',
        },
      },
    })
    if (authError) throw authError
    if (!data.session) {
      return res.status(400).json({ error: 'Signup failed, no session returned' })
    }

    const userId = data.user.id
    const userEmail = data.user.email

    // Wait for the database trigger to create the bare profile row
    await new Promise(r => setTimeout(r, 500))

    const { data: updated } = await supabaseAdmin
      .from('profiles')
      .update({
        email: encryptText(userEmail),
        first_name: encryptText(firstName?.trim()),
        last_name: encryptText(lastName?.trim()),
        role: 'user',
      })
      .eq('id', userId)
      .select()

    if (!updated || updated.length === 0) {
      console.log('Profile update returned 0 rows, falling back to upsert')
      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          email: encryptText(userEmail),
          first_name: encryptText(firstName?.trim()),
          last_name: encryptText(lastName?.trim()),
          role: 'user',
        }, { onConflict: 'id' })
      if (upsertError) console.error('Profile upsert failed:', upsertError.message)
    }

    res.status(201).json({ session: data.session })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ error: err.message || 'Server error' })
  }
})

export default router
