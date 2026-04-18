import { Router } from 'express'

const router = Router()

// Placeholder - will be replaced with real order creation
router.post('/', (req, res) => {
  res.status(201).json({ id: 'placeholder-order-id', status: 'created' })
})

export default router
