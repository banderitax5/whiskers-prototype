import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// `touch-action: pan-x` on a horizontal card row tells the browser that only
// sideways panning is allowed inside it, so a vertical swipe that starts on a
// product card scrolls NOTHING - the page freezes under the finger. That is
// exactly what happened on the home rows (`touch-pan-x`), and no unit test
// caught it because jsdom does not scroll.
//
// The rule: shopper-facing surfaces never restrict touch-action. The browser
// already locks to an axis on its own once the gesture is clear, so sideways
// swipes still move a carousel and up/down swipes still scroll the page.
// Admin surfaces may use touch-none (the drag handles need it).
const SRC = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const RESTRICTED = /touch-(pan-x|pan-y|pan-left|pan-right|pan-up|pan-down|none)\b/

function shopperFacingFiles() {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      // Admin surfaces are allowed to own their gestures (drag handles).
      else if (/\.jsx?$/.test(entry.name) && !/^(Admin|admin)/.test(entry.name)) files.push(full)
    }
  }
  for (const sub of ['pages', 'components']) walk(path.join(SRC, sub))
  return files
}

// Prose about the bug is not a class name (the comment above documents it).
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n')
}

describe('shopper-facing scroll surfaces', () => {
  test('never restrict touch-action', () => {
    const offenders = shopperFacingFiles().filter((file) =>
      RESTRICTED.test(stripComments(readFileSync(file, 'utf8')))
    )
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })

  test('the home product row stays a horizontal scroller', () => {
    // The guard above is only meaningful while the row really is a scroller;
    // if this ever stops being overflow-x-auto, the test above proves nothing.
    const home = stripComments(readFileSync(path.join(SRC, 'pages', 'Home.jsx'), 'utf8'))
    const row = home.split('\n').find((line) => line.includes('CARD_ROW} overflow-x-auto'))
    expect(row).toBeTruthy()
    expect(row).toContain('overflow-x-auto')
  })
})
