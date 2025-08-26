import { ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

interface PageTransitionProps {
  children: ReactNode
  className?: string
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState('fadeIn')

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage('fadeOut')
    }
  }, [location, displayLocation])

  return (
    <div
      className={`transition-all duration-300 ease-in-out ${
        transitionStage === 'fadeOut' ? 'opacity-0 transform translate-y-2' : 'opacity-100 transform translate-y-0'
      } ${className}`}
      onTransitionEnd={() => {
        if (transitionStage === 'fadeOut') {
          setDisplayLocation(location)
          setTransitionStage('fadeIn')
        }
      }}
    >
      {children}
    </div>
  )
}

// Componente para animações de slide
export function SlideTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState('slideIn')

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage('slideOut')
    }
  }, [location, displayLocation])

  return (
    <div
      className={`transition-all duration-500 ease-in-out ${
        transitionStage === 'slideOut' 
          ? 'opacity-0 transform -translate-x-full' 
          : 'opacity-100 transform translate-x-0'
      } ${className}`}
      onTransitionEnd={() => {
        if (transitionStage === 'slideOut') {
          setDisplayLocation(location)
          setTransitionStage('slideIn')
        }
      }}
    >
      {children}
    </div>
  )
}

// Componente para animações de escala
export function ScaleTransition({ children, className = '' }: PageTransitionProps) {
  const location = useLocation()
  const [displayLocation, setDisplayLocation] = useState(location)
  const [transitionStage, setTransitionStage] = useState('scaleIn')

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage('scaleOut')
    }
  }, [location, displayLocation])

  return (
    <div
      className={`transition-all duration-400 ease-in-out ${
        transitionStage === 'scaleOut' 
          ? 'opacity-0 transform scale-95' 
          : 'opacity-100 transform scale-100'
      } ${className}`}
      onTransitionEnd={() => {
        if (transitionStage === 'scaleOut') {
          setDisplayLocation(location)
          setTransitionStage('scaleIn')
        }
      }}
    >
      {children}
    </div>
  )
}

// Hook para detectar mudanças de rota
export function useRouteTransition() {
  const location = useLocation()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [previousLocation, setPreviousLocation] = useState(location)

  useEffect(() => {
    if (location.pathname !== previousLocation.pathname) {
      setIsTransitioning(true)
      setPreviousLocation(location)
      
      // Reset transition state after animation
      const timer = setTimeout(() => {
        setIsTransitioning(false)
      }, 300)
      
      return () => clearTimeout(timer)
    }
  }, [location, previousLocation])

  return { isTransitioning, previousLocation }
}

// Componente de loading para transições
export function TransitionLoader() {
  return (
    <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent z-50">
      <div className="h-full bg-primary animate-pulse" />
    </div>
  )
}

// Componente wrapper para páginas com animação
export function AnimatedPage({ children, animation = 'fade' }: {
  children: ReactNode
  animation?: 'fade' | 'slide' | 'scale'
}) {
  const TransitionComponent = {
    fade: PageTransition,
    slide: SlideTransition,
    scale: ScaleTransition,
  }[animation]

  return (
    <TransitionComponent className="min-h-screen">
      {children}
    </TransitionComponent>
  )
}

// Componente para animações de navegação
export function NavigationTransition({ children }: { children: ReactNode }) {
  const { isTransitioning } = useRouteTransition()

  return (
    <div className="relative">
      {isTransitioning && <TransitionLoader />}
      <div className={`transition-opacity duration-200 ${
        isTransitioning ? 'opacity-75' : 'opacity-100'
      }`}>
        {children}
      </div>
    </div>
  )
}