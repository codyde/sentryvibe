import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Users, DollarSign, TrendingUp } from 'lucide-react'

function App() {
  const stats = [
    {
      title: 'Total Users',
      value: '2,543',
      change: '+12.5%',
      icon: Users,
      trend: 'up'
    },
    {
      title: 'Revenue',
      value: '$45,231',
      change: '+23.1%',
      icon: DollarSign,
      trend: 'up'
    },
    {
      title: 'Active Sessions',
      value: '573',
      change: '+8.2%',
      icon: Activity,
      trend: 'up'
    },
    {
      title: 'Growth Rate',
      value: '14.2%',
      change: '+4.3%',
      icon: TrendingUp,
      trend: 'up'
    }
  ]

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Hello World Dashboard</h1>
          <p className="text-muted-foreground">Welcome to your analytics overview</p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <Card key={index}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">{stat.change}</span> from last month
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Main Content Card */}
        <Card>
          <CardHeader>
            <CardTitle>Welcome Message</CardTitle>
            <CardDescription>
              This is your dashboard-style Hello World application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-lg">
                Hello, World! 👋
              </p>
              <p className="text-muted-foreground">
                This is a modern dashboard interface built with React, TypeScript, Vite, 
                Tailwind CSS, and shadcn/ui components. The cards above show example 
                metrics you might find in a real dashboard application.
              </p>
              <div className="flex gap-4 pt-4">
                <div className="flex-1 rounded-lg bg-primary/10 p-4">
                  <h3 className="font-semibold mb-2">Built With</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>⚛️ React 18</li>
                    <li>📘 TypeScript</li>
                    <li>⚡ Vite</li>
                    <li>🎨 Tailwind CSS</li>
                    <li>🧩 shadcn/ui</li>
                  </ul>
                </div>
                <div className="flex-1 rounded-lg bg-secondary p-4">
                  <h3 className="font-semibold mb-2">Features</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>✨ Modern UI Components</li>
                    <li>📊 Dashboard Layout</li>
                    <li>🎯 Responsive Design</li>
                    <li>🔧 Type-Safe</li>
                    <li>🚀 Fast Development</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App
