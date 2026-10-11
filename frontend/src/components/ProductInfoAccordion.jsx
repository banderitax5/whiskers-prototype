import { useState, useId } from 'react'
import { formatContent } from '../lib/productInfo.js'

// renders the blocks produced by formatContent: paragraphs, bullet lists and
// pipe-delimited tables (first row is the header)
function SectionContent({ content }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      {formatContent(content).map((block, i) => {
        if (block.type === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={i} className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    {block.header.map((cell, j) => (
                      <th key={j} scope="col" className="border border-gray-200 dark:border-gray-700 px-3 py-2 font-semibold text-gray-800 dark:text-gray-100">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-gray-700 dark:text-gray-300">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return (
          <div key={i} className="space-y-1">
            {block.lines.map((line, j) => <p key={j}>{line}</p>)}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Collapsible product information sections, styled after the common pet-food
 * detail pattern (uppercase label, +/- toggle, divider rules).
 *
 * Accessibility: each header is a real button carrying aria-expanded and
 * aria-controls; each panel is a labelled region kept in the DOM and toggled
 * with `hidden`, so the aria-controls target always exists. One panel is open
 * at a time and clicking an open one closes it.
 */
export default function ProductInfoAccordion({ sections }) {
  const [openIndex, setOpenIndex] = useState(0)
  const uid = useId()

  if (!Array.isArray(sections) || sections.length === 0) return null

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      {sections.map((section, index) => {
        const open = openIndex === index
        const buttonId = `${uid}-tab-${index}`
        const panelId = `${uid}-panel-${index}`
        return (
          <div key={`${section.label}-${index}`} className="border-t border-gray-200 dark:border-gray-700">
            <h3 className="m-0">
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? -1 : index)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-900 transition-colors hover:text-[#0b2e59] dark:text-gray-100 dark:hover:text-blue-400 sm:text-sm"
              >
                <span>{section.label}</span>
                <span aria-hidden="true" className="shrink-0 text-base font-normal leading-none text-gray-500 dark:text-gray-400">
                  {open ? '\u2212' : '+'}
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className="pb-4">
              <SectionContent content={section.content} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
