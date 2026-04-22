import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AgingDecorations, CobwebCorner, DustOverlay, DUST_PARTICLES_LIGHT, DUST_PARTICLES_HEAVY } from './AgingOverlays'

describe('AgingDecorations', () => {
  describe('level 0 and 1', () => {
    it('renders null for level 0', () => {
      const { container } = render(<AgingDecorations level={0} />)
      expect(container.firstChild).toBeNull()
    })

    it('renders dust overlay for level 1', () => {
      const { container } = render(<AgingDecorations level={1} />)
      const particles = container.querySelectorAll('[class*="bg-gray-500"]')
      expect(particles.length).toBeGreaterThan(0)
    })
  })

  describe('level 2', () => {
    it('renders dust overlay with particles', () => {
      const { container } = render(<AgingDecorations level={2} />)
      const particles = container.querySelectorAll('[class*="bg-gray-500"]')
      expect(particles.length).toBeGreaterThan(0)
    })

    it('renders 2 cobwebs at top-left and bottom-right with variant light', () => {
      const { container } = render(<AgingDecorations level={2} />)
      const cobwebs = container.querySelectorAll('svg[viewBox="0 0 48 48"]')
      expect(cobwebs).toHaveLength(2)
      
      const topLeft = cobwebs[0]
      expect(topLeft).toHaveClass('top-0', 'left-0')
      
      const bottomRight = cobwebs[1]
      expect(bottomRight).toHaveClass('bottom-0', 'right-0')
    })
  })

  describe('level 3', () => {
    it('renders dust overlay with particles', () => {
      const { container } = render(<AgingDecorations level={3} />)
      const particles = container.querySelectorAll('[class*="bg-gray-500"]')
      expect(particles.length).toBeGreaterThan(0)
    })

    it('renders 4 cobwebs at all corners with variant heavy', () => {
      const { container } = render(<AgingDecorations level={3} />)
      const cobwebs = container.querySelectorAll('svg[viewBox="0 0 48 48"]')
      expect(cobwebs).toHaveLength(4)
      
      const positions = Array.from(cobwebs).map(svg => {
        const classStr = svg.getAttribute('class') || ''
        if (classStr.includes('top-0') && classStr.includes('left-0')) return 'top-left'
        if (classStr.includes('top-0') && classStr.includes('right-0')) return 'top-right'
        if (classStr.includes('bottom-0') && classStr.includes('left-0')) return 'bottom-left'
        if (classStr.includes('bottom-0') && classStr.includes('right-0')) return 'bottom-right'
        return 'unknown'
      })
      
      expect(positions).toContain('top-left')
      expect(positions).toContain('top-right')
      expect(positions).toContain('bottom-left')
      expect(positions).toContain('bottom-right')
    })
  })
})

describe('CobwebCorner', () => {
  describe('position transforms', () => {
    it('applies no transform for top-left position', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveStyle({ transform: '' })
    })

    it('applies scaleX(-1) for top-right position', () => {
      const { container } = render(<CobwebCorner position="top-right" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveStyle({ transform: 'scaleX(-1)' })
    })

    it('applies scaleY(-1) for bottom-left position', () => {
      const { container } = render(<CobwebCorner position="bottom-left" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveStyle({ transform: 'scaleY(-1)' })
    })

    it('applies scale(-1) for bottom-right position', () => {
      const { container } = render(<CobwebCorner position="bottom-right" />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveStyle({ transform: 'scale(-1)' })
    })
  })

  describe('geometric pattern', () => {
    it('has multiple path elements for multi-strand pattern', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const paths = container.querySelectorAll('path')
      expect(paths.length).toBeGreaterThanOrEqual(3)
    })

    it('has path elements with varying stroke widths', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const paths = container.querySelectorAll('path')
      const strokeWidths = Array.from(paths).map(p => p.getAttribute('stroke-width'))
      
      const hasVaryingStrokes = strokeWidths.some(sw => sw !== '1')
      expect(hasVaryingStrokes).toBe(true)
    })
  })

  describe('gradient opacity', () => {
    it('has a linearGradient element for opacity fade', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const gradient = container.querySelector('linearGradient')
      expect(gradient).toBeInTheDocument()
    })

    it('gradient has gradientUnits set to userSpaceOnUse', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const gradient = container.querySelector('linearGradient')
      expect(gradient).toHaveAttribute('gradientUnits', 'userSpaceOnUse')
    })

    it('gradient has stop elements for opacity transition', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const stops = container.querySelectorAll('stop')
      expect(stops.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('drop shadow', () => {
    it('has a filter element with feDropShadow', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const filter = container.querySelector('filter')
      expect(filter).toBeInTheDocument()
    })

    it('filter contains feDropShadow element', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const dropShadow = container.querySelector('feDropShadow')
      expect(dropShadow).toBeInTheDocument()
    })

    it('paths reference the drop shadow filter', () => {
      const { container } = render(<CobwebCorner position="top-left" />)
      const filterUrl = container.querySelector('filter')?.id
      const group = container.querySelector('g')
      
      const filterAttr = group?.getAttribute('filter')
      const hasFilterRef = filterAttr?.includes(filterUrl || '')
      expect(hasFilterRef).toBe(true)
    })
  })

  describe('variant prop', () => {
    it('renders both variants with same number of strands but different patterns', () => {
      const { container: lightContainer } = render(<CobwebCorner position="top-left" variant="light" />)
      const { container: heavyContainer } = render(<CobwebCorner position="top-left" variant="heavy" />)
      
      const lightPaths = lightContainer.querySelectorAll('path')
      const heavyPaths = heavyContainer.querySelectorAll('path')
      
      expect(lightPaths.length).toBe(5)
      expect(heavyPaths.length).toBe(5)
    })
  })
})

describe('DustOverlay', () => {
  it('renders particle elements', () => {
    const { container } = render(<DustOverlay />)
    const particles = container.querySelectorAll('[class*="bg-gray-500"]')
    expect(particles.length).toBeGreaterThan(0)
  })

  it('accepts custom opacity prop', () => {
    const { container } = render(<DustOverlay opacity={0.5} />)
    const particles = container.querySelectorAll('[class*="bg-gray-500"]')
    expect(particles.length).toBeGreaterThan(0)
    
    const firstParticle = particles[0] as HTMLElement
    const style = firstParticle.getAttribute('style') || ''
    expect(style).toContain('opacity')
  })

  it('renders particles with irregular shapes', () => {
    const { container } = render(<DustOverlay />)
    const particles = container.querySelectorAll('[class*="bg-gray-500"]')
    
    const firstParticle = particles[0] as HTMLElement
    const style = firstParticle.getAttribute('style') || ''
    expect(style).toContain('border-radius')
    expect(style).toContain('rotate')
  })

  it('uses different particle sets for different patterns', () => {
    const { container: lightContainer } = render(<DustOverlay particles={DUST_PARTICLES_LIGHT} />)
    const { container: heavyContainer } = render(<DustOverlay particles={DUST_PARTICLES_HEAVY} />)
    
    const lightParticles = lightContainer.querySelectorAll('[class*="bg-gray-500"]')
    const heavyParticles = heavyContainer.querySelectorAll('[class*="bg-gray-500"]')
    
    expect(lightParticles.length).toBe(10)
    expect(heavyParticles.length).toBe(25)
    expect(heavyParticles.length).toBeGreaterThan(lightParticles.length)
  })
})