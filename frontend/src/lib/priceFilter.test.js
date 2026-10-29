import { describe, test, expect } from 'vitest'
import { priceCeilingFor, sliderValueFor, maxPriceFromSlider, matchesMaxPrice, MIN_CEILING } from './priceFilter'

describe('priceCeilingFor', () => {
  test('rounds the catalog maximum up to the next 500', () => {
    expect(priceCeilingFor([{ price: 3400 }, { price: 6000 }])).toBe(6000)
    expect(priceCeilingFor([{ price: 3401 }])).toBe(3500)
  })

  test('never drops below the floor for a small or empty catalog', () => {
    expect(priceCeilingFor([])).toBe(MIN_CEILING)
    expect(priceCeilingFor([{ price: 45 }])).toBe(MIN_CEILING)
  })

  test('ignores missing and malformed prices', () => {
    expect(priceCeilingFor([{ price: null }, { price: 'abc' }, { price: 1200 }])).toBe(1500)
  })
})

describe('sliderValueFor', () => {
  test('"all" sits at the end of the track', () => {
    expect(sliderValueFor('all', 6000)).toBe(6000)
  })

  test('a numeric cap keeps its position', () => {
    expect(sliderValueFor('600', 6000)).toBe(600)
  })

  test('a cap above the ceiling, or junk, falls back to the end', () => {
    expect(sliderValueFor('9000', 6000)).toBe(6000)
    expect(sliderValueFor('oops', 6000)).toBe(6000)
  })
})

describe('maxPriceFromSlider', () => {
  test('the end of the track means "no limit" so the URL stays clean', () => {
    expect(maxPriceFromSlider(6000, 6000)).toBe('all')
    expect(maxPriceFromSlider(6000, 6000)).not.toBe('6000')
  })

  test('anywhere else stores a rounded number string', () => {
    expect(maxPriceFromSlider(600, 6000)).toBe('600')
    expect(maxPriceFromSlider(624.6, 6000)).toBe('625')
  })
})

describe('matchesMaxPrice', () => {
  test('no cap matches everything, including unpriced rows', () => {
    expect(matchesMaxPrice(0, 'all')).toBe(true)
    expect(matchesMaxPrice(5000, 'all')).toBe(true)
  })

  test('a cap excludes pricier and unpriced products', () => {
    expect(matchesMaxPrice(300, '600')).toBe(true)
    expect(matchesMaxPrice(600, '600')).toBe(true)
    expect(matchesMaxPrice(601, '600')).toBe(false)
    expect(matchesMaxPrice(0, '600')).toBe(false)
  })

  test('legacy deep-link values still work as plain caps', () => {
    expect(matchesMaxPrice(250, '300')).toBe(true)
    expect(matchesMaxPrice(1500, '1000')).toBe(false)
  })
})
