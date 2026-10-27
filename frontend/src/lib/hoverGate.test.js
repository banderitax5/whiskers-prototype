import { describe, it, expect } from 'vitest'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../../tailwind.config.js'

// Regression guard for the touch-screen hover bug.
//
// A phone reports `(hover: none) and (pointer: coarse)`, but Chrome keeps a
// tapped element in the `:hover` state until the next tap. Every card that
// scaled on hover therefore zoomed in when a shopper tried to swipe the grid,
// and the jump looked like the scroll had been swallowed.
//
// The fix is Tailwind's `future.hoverOnlyWhenSupported` flag, which compiles
// `hover:` - and `group-hover:`, which Tailwind builds from the same
// pseudo-variant - inside `@media (hover: hover) and (pointer: fine)`.
// These tests compile the real config and read the real output, so they fail if
// the flag is removed or a Tailwind upgrade stops applying it to group-hover.

const PROBE = '<div class="group hover:scale-105 hover:shadow-md group-hover:scale-105 active:scale-95"></div>'

// selector -> the at-rule params wrapping it ([] when the rule is unconditional)
function mediaBySelector(css) {
  const root = postcss.parse(css)
  const found = new Map()
  root.walkRules((rule) => {
    const media = []
    for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
      if (node.type === 'atrule' && node.name === 'media') media.push(node.params)
    }
    found.set(rule.selector, media)
  })
  return found
}

async function compile() {
  const result = await postcss([
    tailwindcss({ ...config, content: [{ raw: PROBE, extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })
  return mediaBySelector(result.css)
}

describe('hover utilities only exist for real pointers', () => {
  it('keeps the hoverOnlyWhenSupported flag enabled', () => {
    expect(config.future?.hoverOnlyWhenSupported).toBe(true)
  })

  it('wraps hover: and group-hover: in a hover-capable-pointer media query', async () => {
    const rules = await compile()

    const hoverRule = rules.get('.hover\\:scale-105:hover')
    const shadowRule = rules.get('.hover\\:shadow-md:hover')
    const groupRule = rules.get('.group:hover .group-hover\\:scale-105')

    for (const [name, media] of [
      ['hover:scale-105', hoverRule],
      ['hover:shadow-md', shadowRule],
      ['group-hover:scale-105', groupRule],
    ]) {
      expect(media, `${name} was not generated at all`).toBeDefined()
      expect(media.join(' '), `${name} is not gated on a hover-capable pointer`).toMatch(
        /\(hover: hover\)/
      )
      expect(media.join(' '), `${name} is not gated on a fine pointer`).toMatch(/\(pointer: fine\)/)
    }
  })

  it('leaves active: (press feedback) ungated so phones still react to taps', async () => {
    const rules = await compile()

    const activeRule = rules.get('.active\\:scale-95:active')
    expect(activeRule, 'active:scale-95 was not generated at all').toBeDefined()
    expect(activeRule, 'active: must not be gated on hover').toEqual([])
  })
})
