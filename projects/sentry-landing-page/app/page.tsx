export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-950 via-purple-900 to-black text-white">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            </svg>
          </div>
          <span className="text-2xl font-bold">Sentry</span>
        </div>
        <div className="hidden md:flex items-center space-x-8">
          <a href="#features" className="hover:text-purple-300 transition">Features</a>
          <a href="#pricing" className="hover:text-purple-300 transition">Pricing</a>
          <a href="#docs" className="hover:text-purple-300 transition">Docs</a>
          <a href="#" className="text-purple-400 hover:text-purple-300">Sign In</a>
          <button className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-semibold transition">
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
            Code breaks. Fix it faster.
          </h1>
          <p className="text-xl md:text-2xl text-purple-200 mb-10">
            Sentry helps developers monitor and fix crashes in real time.
            Iterate continuously. Boost workflow efficiency. Improve user satisfaction.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <button className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-lg font-semibold text-lg transition transform hover:scale-105">
              Start Free Trial
            </button>
            <button className="border border-purple-400 hover:bg-purple-900/50 px-8 py-4 rounded-lg font-semibold text-lg transition">
              Watch Demo
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
            <div>
              <div className="text-4xl font-bold text-purple-300">4M+</div>
              <div className="text-purple-400 mt-2">Developers</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-300">90K+</div>
              <div className="text-purple-400 mt-2">Organizations</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-300">3B+</div>
              <div className="text-purple-400 mt-2">Events/Month</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-300">99.9%</div>
              <div className="text-purple-400 mt-2">Uptime</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-6 py-20">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
          Everything you need to ship better code
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-purple-900/30 backdrop-blur p-8 rounded-2xl border border-purple-800 hover:border-purple-600 transition">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold mb-3">Error Monitoring</h3>
            <p className="text-purple-300">
              Get instant notifications when errors happen. See the full context with stack traces, breadcrumbs, and environment data.
            </p>
          </div>

          <div className="bg-purple-900/30 backdrop-blur p-8 rounded-2xl border border-purple-800 hover:border-purple-600 transition">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold mb-3">Performance Monitoring</h3>
            <p className="text-purple-300">
              Track application performance across your entire stack. Identify slow transactions and optimize what matters.
            </p>
          </div>

          <div className="bg-purple-900/30 backdrop-blur p-8 rounded-2xl border border-purple-800 hover:border-purple-600 transition">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold mb-3">Session Replay</h3>
            <p className="text-purple-300">
              Watch a video-like reproduction of your user sessions. See what happened before an error occurred.
            </p>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="container mx-auto px-6 py-20">
        <p className="text-center text-purple-400 mb-8">Trusted by industry leaders</p>
        <div className="flex flex-wrap justify-center items-center gap-12 opacity-60">
          <div className="text-2xl font-bold">Microsoft</div>
          <div className="text-2xl font-bold">Atlassian</div>
          <div className="text-2xl font-bold">Disney</div>
          <div className="text-2xl font-bold">Uber</div>
          <div className="text-2xl font-bold">Slack</div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-3xl p-12 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to get started?
          </h2>
          <p className="text-xl mb-8 text-purple-100">
            Join thousands of developers shipping better code with Sentry
          </p>
          <button className="bg-white text-purple-600 hover:bg-purple-50 px-8 py-4 rounded-lg font-semibold text-lg transition transform hover:scale-105">
            Start Free Trial - No Credit Card Required
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-12 border-t border-purple-800">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div>
            <h4 className="font-bold mb-4">Product</h4>
            <ul className="space-y-2 text-purple-300">
              <li><a href="#" className="hover:text-white">Error Monitoring</a></li>
              <li><a href="#" className="hover:text-white">Performance</a></li>
              <li><a href="#" className="hover:text-white">Session Replay</a></li>
              <li><a href="#" className="hover:text-white">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Developers</h4>
            <ul className="space-y-2 text-purple-300">
              <li><a href="#" className="hover:text-white">Documentation</a></li>
              <li><a href="#" className="hover:text-white">API Reference</a></li>
              <li><a href="#" className="hover:text-white">SDKs</a></li>
              <li><a href="#" className="hover:text-white">Integrations</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Company</h4>
            <ul className="space-y-2 text-purple-300">
              <li><a href="#" className="hover:text-white">About</a></li>
              <li><a href="#" className="hover:text-white">Blog</a></li>
              <li><a href="#" className="hover:text-white">Careers</a></li>
              <li><a href="#" className="hover:text-white">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Connect</h4>
            <ul className="space-y-2 text-purple-300">
              <li><a href="#" className="hover:text-white">GitHub</a></li>
              <li><a href="#" className="hover:text-white">Twitter</a></li>
              <li><a href="#" className="hover:text-white">Discord</a></li>
              <li><a href="#" className="hover:text-white">LinkedIn</a></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-purple-800 text-center text-purple-400">
          <p>&copy; 2025 Sentry. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
