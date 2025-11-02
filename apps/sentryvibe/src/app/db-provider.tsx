'use client';

/**
 * TanStack DB Collection Initialization
 *
 * TanStack DB collections are global singletons - no provider needed!
 * Collections are imported and used directly in components.
 *
 * This file initializes collections that need setup on app start.
 */

import { useEffect } from 'react';

// Import collections to ensure they're initialized
import '@/collections/messageCollection';
import '@/collections/generationStateCollection';
import '@/collections/uiStateCollection';

/**
 * Initialize TanStack DB collections on app mount
 * This component doesn't render anything, just runs initialization
 */
export function DBInitializer() {
  useEffect(() => {
    console.log('✅ [TanStack DB] Collections initialized');
  }, []);

  return null;
}
