/**
 * Initiative 006: each tool's HTML ships a static <h1> inside #root for
 * crawlers, and React replaces it on mount. The heading a visitor sees must
 * not change at that moment, so the static text is the mounted <h1>, word
 * for word.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FuelingPlanner } from '../../tools/FuelingPlanner'
import { HeatPlanner } from '../../tools/HeatPlanner'
import { MileagePlanner } from '../../tools/MileagePlanner'
import { Predictor } from '../../tools/Predictor'
import fuelingHtml from '../../../tools/fueling.html?raw'
import heatHtml from '../../../tools/heat.html?raw'
import mileageHtml from '../../../tools/mileage.html?raw'
import predictorHtml from '../../../tools/predictor.html?raw'

afterEach(cleanup)

const pages: [string, ReactElement, string][] = [
  ['fueling', <FuelingPlanner />, fuelingHtml],
  ['heat', <HeatPlanner />, heatHtml],
  ['mileage', <MileagePlanner />, mileageHtml],
  ['predictor', <Predictor />, predictorHtml],
]

describe('static heading matches the mounted heading', () => {
  it.each(pages)('%s', (_name, element, html) => {
    const staticH1 = new DOMParser().parseFromString(html, 'text/html').querySelector('#root h1')!.textContent
    const { container } = render(element)
    expect(container.querySelector('h1')!.textContent).toBe(staticH1)
  })
})
