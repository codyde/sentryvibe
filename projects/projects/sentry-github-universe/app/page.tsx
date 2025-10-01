export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-5xl mx-auto">
          {/* Logo */}
          <div className="flex justify-center mb-12">
            <div className="text-5xl md:text-6xl font-bold tracking-tight">
              <span className="text-white">Sentry</span>
            </div>
          </div>

          {/* Main Headline */}
          <div className="text-center mb-12">
            <div className="inline-block bg-purple-700/50 backdrop-blur-sm px-6 py-2 rounded-full text-sm md:text-base mb-6 border border-purple-400/30">
              📍 GitHub Universe 2025
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              Meet us at
              <br />
              <span className="bg-gradient-to-r from-pink-400 via-purple-300 to-indigo-400 bg-clip-text text-transparent">
                GitHub Universe
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-purple-200 mb-8 max-w-3xl mx-auto">
              Discover how Sentry helps developers ship better code faster with real-time error monitoring and performance insights
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <a
              href="#"
              className="px-8 py-4 bg-white text-purple-900 rounded-lg font-semibold text-lg hover:bg-purple-100 transition-all transform hover:scale-105 shadow-lg"
            >
              Visit Our Booth
            </a>
            <a
              href="#"
              className="px-8 py-4 bg-purple-700/50 backdrop-blur-sm border-2 border-purple-400/50 text-white rounded-lg font-semibold text-lg hover:bg-purple-600/50 transition-all transform hover:scale-105"
            >
              Schedule a Demo
            </a>
          </div>

          {/* Event Details */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">📅</div>
              <div className="text-lg font-semibold mb-2">When</div>
              <div className="text-purple-200">October 29-30, 2025</div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">📍</div>
              <div className="text-lg font-semibold mb-2">Where</div>
              <div className="text-purple-200">Fort Mason, San Francisco</div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
              <div className="text-3xl mb-3">🎯</div>
              <div className="text-lg font-semibold mb-2">Booth</div>
              <div className="text-purple-200">Find us at Booth #42</div>
            </div>
          </div>

          {/* What to Expect */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 md:p-12 border border-white/20">
            <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center">
              What to Expect at Our Booth
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex gap-4">
                <div className="text-2xl">🚀</div>
                <div>
                  <h3 className="font-semibold text-xl mb-2">Live Demos</h3>
                  <p className="text-purple-200">
                    See Sentry in action with personalized demos tailored to your tech stack
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">🎁</div>
                <div>
                  <h3 className="font-semibold text-xl mb-2">Exclusive Swag</h3>
                  <p className="text-purple-200">
                    Limited edition GitHub Universe swag for all visitors
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">👥</div>
                <div>
                  <h3 className="font-semibold text-xl mb-2">Meet the Team</h3>
                  <p className="text-purple-200">
                    Chat with Sentry engineers and learn best practices for error monitoring
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="text-2xl">🎮</div>
                <div>
                  <h3 className="font-semibold text-xl mb-2">Interactive Challenges</h3>
                  <p className="text-purple-200">
                    Participate in fun coding challenges and win prizes
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold mb-2">4M+</div>
              <div className="text-purple-300 text-sm">Developers</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold mb-2">100K+</div>
              <div className="text-purple-300 text-sm">Organizations</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold mb-2">3T+</div>
              <div className="text-purple-300 text-sm">Events/Month</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold mb-2">99.9%</div>
              <div className="text-purple-300 text-sm">Uptime</div>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="text-center mt-16 pt-16 border-t border-white/20">
            <p className="text-lg text-purple-200 mb-6">
              Can&apos;t wait to meet you? Start using Sentry today
            </p>
            <a
              href="https://sentry.io"
              className="inline-block px-8 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-lg font-semibold hover:from-pink-600 hover:to-purple-700 transition-all transform hover:scale-105"
            >
              Try Sentry Free
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
