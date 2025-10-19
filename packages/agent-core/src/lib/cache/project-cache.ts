import type { Project } from '../db/schema';

/**
 * Simple in-memory cache for project data with TTL support
 * Reduces database load from SSE polling endpoints
 */

interface CacheEntry {
  data: Project;
  expiresAt: number;
}

class ProjectCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTTL = 5000; // 5 seconds default TTL

  /**
   * Get a project from cache
   * @param projectId - The project ID
   * @returns The cached project or null if not found/expired
   */
  get(projectId: string): Project | null {
    const entry = this.cache.get(projectId);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(projectId);
      return null;
    }

    return entry.data;
  }

  /**
   * Set a project in cache
   * @param projectId - The project ID
   * @param data - The project data
   * @param ttl - Time to live in milliseconds (default: 5000ms)
   */
  set(projectId: string, data: Project, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL);
    this.cache.set(projectId, { data, expiresAt });
  }

  /**
   * Invalidate (remove) a project from cache
   * @param projectId - The project ID
   */
  invalidate(projectId: string): void {
    this.cache.delete(projectId);
  }

  /**
   * Clear all cached projects
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean up expired entries (optional maintenance)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
export const projectCache = new ProjectCache();

// Optional: Run cleanup every 60 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    projectCache.cleanup();
  }, 60000);
}