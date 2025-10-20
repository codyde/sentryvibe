"use client"

import { useEffect, useState } from "react"

/**
 * Hook to ensure safe portal rendering by checking DOM availability.
 * This prevents "Target container is not a DOM element" errors during Fast Refresh.
 * 
 * @returns boolean indicating if it's safe to render portals
 */
export function useSafePortal(): boolean {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // Only set mounted after the client-side hydration is complete
    setIsMounted(true)
    
    return () => {
      setIsMounted(false)
    }
  }, [])

  return isMounted && typeof document !== "undefined"
}