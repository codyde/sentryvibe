import { useState } from 'react'

function App() {
  const [clicked, setClicked] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div 
          className="bg-white border-8 border-black p-12 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transform hover:translate-x-1 hover:translate-y-1 hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
          onClick={() => setClicked(!clicked)}
        >
          <h1 className="text-7xl font-black mb-8 leading-none">
            <span className="text-sentry-purple">Hi</span>{' '}
            <span className="text-sentry-pink">Serge</span>
            <br />
            <span className="text-sentry-orange">&</span>{' '}
            <span className="text-sentry-purple">Paul</span>
            <span className="text-sentry-orange">!</span>
          </h1>
          
          <div className="space-y-4">
            <div className="bg-sentry-purple border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-white font-bold text-2xl">Welcome to Sentry</p>
            </div>
            
            <div className="bg-sentry-pink border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-white font-bold text-2xl">Performance monitoring</p>
            </div>
            
            <div className="bg-sentry-orange border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-white font-bold text-2xl">Error tracking</p>
            </div>
          </div>

          {clicked && (
            <div className="mt-8 bg-sentry-yellow border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] animate-pulse">
              <p className="text-black font-black text-3xl text-center">🎉 CLICKED! 🎉</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App