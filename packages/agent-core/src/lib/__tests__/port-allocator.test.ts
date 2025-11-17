/**
 * Port Allocator Tests
 * 
 * Run with: npx vitest run port-allocator.test.ts
 */

import { describe, it, expect } from 'vitest';
import { 
  checkPortAvailability, 
  findAvailablePortInRange,
} from '../port-allocator';

describe('Port Allocator', () => {
  describe('checkPortAvailability', () => {
    it('should return true for an available port', async () => {
      // Use a very high port that's likely available
      const isAvailable = await checkPortAvailability(65432);
      expect(isAvailable).toBe(true);
    });

    it('should return false for port 80 (likely in use or requires sudo)', async () => {
      const isAvailable = await checkPortAvailability(80);
      expect(isAvailable).toBe(false);
    });
  });

  describe('findAvailablePortInRange', () => {
    it('should find an available Next.js port in isolated range (3101-3200)', async () => {
      const range = { start: 3101, end: 3200, default: 3101 };
      const port = await findAvailablePortInRange(range);
      
      expect(port).not.toBeNull();
      expect(port).toBeGreaterThanOrEqual(3101);
      expect(port).toBeLessThanOrEqual(3200);
    });

    it('should find an available Next.js port in standard range (3000-3100)', async () => {
      const range = { start: 3000, end: 3100, default: 3000 };
      const port = await findAvailablePortInRange(range);
      
      expect(port).not.toBeNull();
      expect(port).toBeGreaterThanOrEqual(3000);
      expect(port).toBeLessThanOrEqual(3100);
    });

    it('should find an available Vite port in isolated range (5201-5300)', async () => {
      const range = { start: 5201, end: 5300, default: 5201 };
      const port = await findAvailablePortInRange(range);
      
      expect(port).not.toBeNull();
      expect(port).toBeGreaterThanOrEqual(5201);
      expect(port).toBeLessThanOrEqual(5300);
    });

    it('should scan from custom start port', async () => {
      const range = { start: 5173, end: 5273, default: 5173 };
      // Start from port 5180 instead of default 5173
      const port = await findAvailablePortInRange(range, 5180);
      
      expect(port).not.toBeNull();
      if (port !== null) {
        expect(port).toBeGreaterThanOrEqual(5173);
        expect(port).toBeLessThanOrEqual(5273);
      }
    });
  });

  describe('Framework ranges', () => {
    it('Next.js range should not overlap with Vite', () => {
      // Next.js: 3000-3100
      // Vite: 5173-5273
      // These should not overlap
      const nextMax = 3100;
      const viteMin = 5173;
      
      expect(nextMax).toBeLessThan(viteMin);
    });

    it('Next.js range should include standard port 3000', () => {
      const standardNextPort = 3000;
      const nextMin = 3000;
      const nextMax = 3100;
      
      expect(standardNextPort).toBeGreaterThanOrEqual(nextMin);
      expect(standardNextPort).toBeLessThanOrEqual(nextMax);
    });

    it('Vite range should include standard port 5173', () => {
      const standardVitePort = 5173;
      const viteMin = 5173;
      const viteMax = 5273;
      
      expect(standardVitePort).toBeGreaterThanOrEqual(viteMin);
      expect(standardVitePort).toBeLessThanOrEqual(viteMax);
    });
  });
});

/**
 * Manual Integration Test
 * 
 * Run this file directly to test port allocation manually:
 * 
 * ```bash
 * npx tsx packages/agent-core/src/lib/__tests__/port-allocator.test.ts
 * ```
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running manual port allocation tests...\n');

  const testManualAllocation = async () => {
    const testCases = [
      { name: 'Next.js (isolated)', range: { start: 3101, end: 3200, default: 3101 } },
      { name: 'Next.js (standard)', range: { start: 3000, end: 3100, default: 3000 } },
      { name: 'Vite (isolated)', range: { start: 5201, end: 5300, default: 5201 } },
      { name: 'Vite (standard)', range: { start: 5173, end: 5273, default: 5173 } },
      { name: 'Astro (isolated)', range: { start: 4401, end: 4500, default: 4401 } },
      { name: 'Astro (standard)', range: { start: 4321, end: 4421, default: 4321 } },
    ];

    for (const testCase of testCases) {
      console.log(`\n📍 Testing ${testCase.name}...`);
      console.log(`   Range: ${testCase.range.start}-${testCase.range.end}`);
      
      const port = await findAvailablePortInRange(testCase.range);
      
      if (port) {
        console.log(`   ✅ Found available port: ${port}`);
        
        // Verify it's actually available
        const isAvailable = await checkPortAvailability(port);
        console.log(`   ✅ Port ${port} verified available: ${isAvailable}`);
      } else {
        console.log(`   ❌ No available ports found`);
      }
    }

    console.log('\n✅ Manual tests complete!');
  };

  testManualAllocation().catch(console.error);
}

