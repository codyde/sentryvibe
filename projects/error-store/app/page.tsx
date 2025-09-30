'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ErrorProduct {
  id: string;
  name: string;
  price: number;
  description: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  category: string;
  stackTrace: string;
  image: string;
}

const errorProducts: ErrorProduct[] = [
  {
    id: '1',
    name: 'Classic Null Pointer',
    price: 49.99,
    description: 'The timeless error that has plagued developers since the dawn of time. Guaranteed to crash your app at the worst possible moment.',
    severity: 'critical',
    category: 'Runtime Errors',
    stackTrace: 'TypeError: Cannot read property \'x\' of null',
    image: '❌'
  },
  {
    id: '2',
    name: 'Memory Leak Special',
    price: 299.99,
    description: 'Watch your RAM disappear faster than your coffee on Monday morning. Premium quality memory leak, tested on production.',
    severity: 'critical',
    category: 'Performance',
    stackTrace: 'Error: JavaScript heap out of memory',
    image: '💾'
  },
  {
    id: '3',
    name: 'Race Condition Deluxe',
    price: 199.99,
    description: 'Sometimes it works, sometimes it doesn\'t. The perfect error for keeping your users on their toes!',
    severity: 'error',
    category: 'Concurrency',
    stackTrace: 'UnhandledPromiseRejectionWarning: Race condition detected',
    image: '🏎️'
  },
  {
    id: '4',
    name: 'Infinite Loop Premium',
    price: 149.99,
    description: 'Goes on forever, just like your debugging sessions. CPU usage: 100%. Hope: 0%.',
    severity: 'critical',
    category: 'Logic Errors',
    stackTrace: 'RangeError: Maximum call stack size exceeded',
    image: '♾️'
  },
  {
    id: '5',
    name: 'CORS Error Bundle',
    price: 79.99,
    description: 'Block all your API requests with style. Comes with cryptic browser console messages.',
    severity: 'error',
    category: 'Network',
    stackTrace: 'Access to fetch has been blocked by CORS policy',
    image: '🚫'
  },
  {
    id: '6',
    name: 'Division by Zero',
    price: 39.99,
    description: 'A mathematical impossibility turned runtime reality. Creates infinite values on demand.',
    severity: 'warning',
    category: 'Math Errors',
    stackTrace: 'Warning: Division by zero results in Infinity',
    image: '➗'
  },
  {
    id: '7',
    name: '404 Not Found Collector\'s Edition',
    price: 29.99,
    description: 'Make any resource mysteriously disappear. Limited edition with custom error pages.',
    severity: 'error',
    category: 'Network',
    stackTrace: 'Error 404: The requested resource was not found',
    image: '🔍'
  },
  {
    id: '8',
    name: 'SQL Injection Vulnerability',
    price: 999.99,
    description: 'Drop tables like it\'s hot. Bobby Tables\' favorite error. (Educational purposes only!)',
    severity: 'critical',
    category: 'Security',
    stackTrace: 'SQLError: Syntax error or access violation',
    image: '💉'
  },
  {
    id: '9',
    name: 'Deprecated API Warning',
    price: 9.99,
    description: 'Gentle reminder that your code is outdated. Comes with passive-aggressive console messages.',
    severity: 'warning',
    category: 'Deprecation',
    stackTrace: 'DeprecationWarning: This API is no longer supported',
    image: '⚠️'
  }
];

export default function Home() {
  const [cart, setCart] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const addToCart = (productId: string) => {
    setCart([...cart, productId]);
  };

  const filteredProducts = filter === 'all' 
    ? errorProducts 
    : errorProducts.filter(p => p.severity === filter);

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'error': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
                💥 ErrorMart
              </h1>
              <p className="text-gray-600 mt-1">Premium Errors for Discerning Developers</p>
            </div>
            <div className="relative">
              <button className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors">
                🛒 Cart ({cart.length})
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-5xl font-bold mb-4">🔥 Flash Sale on Critical Errors!</h2>
          <p className="text-xl mb-6">Free shipping on all stack traces over $100</p>
          <button className="bg-white text-red-600 px-8 py-3 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors">
            Shop Now
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow p-4 flex gap-3 flex-wrap">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            All Errors
          </button>
          <button 
            onClick={() => setFilter('critical')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'critical' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
          >
            Critical
          </button>
          <button 
            onClick={() => setFilter('error')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'error' ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
          >
            Error
          </button>
          <button 
            onClick={() => setFilter('warning')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === 'warning' ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
          >
            Warning
          </button>
        </div>
      </div>

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <div 
              key={product.id} 
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow border border-gray-200"
            >
              {/* Product Image */}
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 h-48 flex items-center justify-center text-8xl">
                {product.image}
              </div>
              
              {/* Product Info */}
              <div className="p-6">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(product.severity)}`}>
                    {product.severity.toUpperCase()}
                  </span>
                </div>
                
                <p className="text-gray-600 text-sm mb-3 line-clamp-3">{product.description}</p>
                
                <div className="mb-4 p-3 bg-gray-900 rounded-lg">
                  <code className="text-xs text-green-400 font-mono">{product.stackTrace}</code>
                </div>
                
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-500">{product.category}</p>
                    <p className="text-2xl font-bold text-gray-900">${product.price}</p>
                  </div>
                  <button 
                    onClick={() => addToCart(product.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-bold text-lg mb-4">About ErrorMart</h4>
              <p className="text-gray-400 text-sm">
                Your one-stop shop for premium software errors. In business since stack overflow existed.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Categories</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Runtime Errors</li>
                <li>Compilation Errors</li>
                <li>Logic Errors</li>
                <li>Security Issues</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Stack Overflow</li>
                <li>GitHub Issues</li>
                <li>Prayer</li>
                <li>Rubber Duck</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Newsletter</h4>
              <p className="text-gray-400 text-sm mb-3">Subscribe for daily error alerts!</p>
              <input 
                type="email" 
                placeholder="your@email.com" 
                className="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700"
              />
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
            © 2024 ErrorMart. All bugs reserved. | Powered by mistakes and coffee ☕
          </div>
        </div>
      </footer>
    </div>
  );
}
