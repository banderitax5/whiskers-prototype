import { Router } from 'express'

const router = Router()

// Placeholder - will be replaced when product menu is hooked up to the database
router.get('/', (_, res) => {
  res.json({ items: [], page: 1, pageSize: 20, total: 0 })
})

export default router
