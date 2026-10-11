// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { setProductSeo } from './seo.js'

describe('setProductSeo', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[property="og:title"], meta[property="og:description"], meta[property="og:image"], meta[property="og:type"]').forEach((el) => el.remove())
    document.title = ''
  })

  it('sets a unique product title and description', () => {
    const cleanup = setProductSeo({ name: 'Royal Canin Puppy', price: 1200, image_url: 'https://x/p.png' })
    expect(document.title).toContain('Royal Canin Puppy')
    const desc = document.head.querySelector('meta[name="description"]').getAttribute('content')
    expect(desc).toContain('Royal Canin Puppy')
    cleanup()
  })

  it('adds og:image only when an image_url exists', () => {
    const cleanup = setProductSeo({ name: 'NoImg', price: 10 })
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull()
    cleanup()

    const cleanup2 = setProductSeo({ name: 'WithImg', price: 10, image_url: 'https://x/p.png' })
    expect(document.head.querySelector('meta[property="og:image"]').getAttribute('content')).toBe('https://x/p.png')
    cleanup2()
  })

  it('cleanup restores the default title', () => {
    const cleanup = setProductSeo({ name: 'Temp', price: 5 })
    cleanup()
    expect(document.title).not.toContain('Temp')
  })
})
