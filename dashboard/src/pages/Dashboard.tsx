import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Activity,
  Bot,
  Command,
  Server,
  TrendingUp,
  Users,
} from 'lucide-react'
import { RefreshCw } from 'lucide-react'
import { formatNumber } from '../lib/utils'
import { apiService, type GuildStats } from '../services/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { 
  StatCardSkeleton, 
  ChartSkeleton, 

  useToast,
  toast
} from '../components/ui'

const mockCommandUsage = [
  { name: 'help', count: 450 },
  { name: 'play', count: 380 },
  { name: 'skip', count: 320 },
  { name: 'queue', count: 280 },
  { name: 'stop', count: 240 },
  { name: 'volume', count: 200 },
  { name: 'pause', count: 180 },
  { name: 'resume', count: 160 },
]

const mockActivityData = [
  { time: '00:00', commands: 120 },
  { time: '04:00', commands: 80 },
  { time: '08:00', commands: 200 },
  { time: '12:00', commands: 350 },
  { time: '16:00', commands: 420 },
  { time: '20:00', commands: 380 },
]

const mockGuildTypes = [
  { name: 'Gaming', value: 45, color: '#3b82f6' },
  { name: 'Music', value: 25, color: '#10b981' },
  { name: 'Community', value: 20, color: '#f59e0b' },
  { name: 'Other', value: 10, color: '#ef4444' },
]

function StatCard({ title, value, icon: Icon, trend, trendValue, isLoading }: {
  title: string
  value: string | number
  icon: any
  trend?: 'up' | 'down'
  trendValue?: string
  isLoading?: boolean
}) {
  if (isLoading) {
    return <StatCardSkeleton />
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-card-foreground">
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
          {trend && trendValue && (
            <div className={`flex items-center mt-1 text-sm ${
              trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              <TrendingUp className={`h-4 w-4 mr-1 ${
                trend === 'down' ? 'rotate-180' : ''
              }`} />
              {trendValue}
            </div>
          )}
        </div>
        <div className="p-3 bg-primary/10 rounded-lg">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<GuildStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [, setError] = useState<string | null>(null)
  const { addToast } = useToast()
  
  
  // Use the guild ID from environment
  const guildId = '1409723307489755270' // Guild ID from .env
  
  // WebSocket connection for real-time updates
  const { lastMessage, sendMessage } = useWebSocket('http://localhost:3002', {
    onOpen: () => {
      console.log('WebSocket connected');
      // Subscribe to dashboard updates for this guild
      sendMessage('subscribe:dashboard', guildId);
    },
    onClose: () => console.log('WebSocket disconnected'),
    onError: (error) => console.error('WebSocket error:', error),
  });
  
  const fetchStats = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      
      const guildStats = await apiService.getGuildStats(guildId)
      setStats(guildStats)
      setError(null)
      
      if (isManualRefresh) {
        addToast(toast.success('Dados atualizados com sucesso!'))
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
      setError('Falha ao carregar estatísticas')
      
      if (isManualRefresh) {
        addToast(toast.error('Erro ao atualizar dados', 'Tente novamente em alguns instantes'))
      }
      
      // Fallback to mock data
      setStats({
        users: { total: 15420, active: 12340 },
        economy: { totalXP: 156780, totalCoins: 45230, totalMessages: 2847 },
        engagement: { badges: 234, clips: 89, presenceSessions: 1456, quizzes: 67 }
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStats()
    
    // Refresh stats every 30 seconds
    const interval = setInterval(() => fetchStats(), 30000)
    return () => clearInterval(interval)
  }, [guildId])
  
  // Handle WebSocket messages for real-time updates
   useEffect(() => {
     if (lastMessage && lastMessage.type === 'stats') {
       setStats(lastMessage.data);
     }
   }, [lastMessage])

  return (
    <div className="space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral das estatísticas do servidor</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          disabled={loading || refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Stats Grid */}
      <div className="dashboard-stats">
        <StatCard
          title="Total de Usuários"
          value={stats?.users.total || 0}
          icon={Users}
          trend="up"
          trendValue="+12%"
          isLoading={loading}
        />
        <StatCard
          title="Usuários Ativos"
          value={stats?.users.active || 0}
          icon={Server}
          trend="up"
          trendValue="+5%"
          isLoading={loading}
        />
        <StatCard
          title="Mensagens Totais"
          value={stats?.economy.totalMessages || 0}
          icon={Command}
          trend="up"
          trendValue="+18%"
          isLoading={loading}
        />
        <StatCard
          title="XP Total"
          value={stats?.economy.totalXP || 0}
          icon={Activity}
          isLoading={loading}
        />
        <StatCard
          title="Moedas Totais"
          value={stats?.economy.totalCoins || 0}
          icon={Bot}
          isLoading={loading}
        />
        <StatCard
          title="Badges"
          value={stats?.engagement.badges || 0}
          icon={Command}
          isLoading={loading}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Command Usage Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-card-foreground mb-4">
              Comandos Mais Usados
            </h3>
            <div className="analytics-chart-container">
               <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mockCommandUsage}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Activity Chart */}
        {loading ? (
          <ChartSkeleton />
        ) : (
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-card-foreground mb-4">
              Atividade nas Últimas 24h
            </h3>
            <div className="analytics-chart-container">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={mockActivityData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="commands"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Guild Types and Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Guild Types */}
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-card-foreground mb-4">
            Tipos de Servidores
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={mockGuildTypes}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {mockGuildTypes.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {mockGuildTypes.map((type) => (
              <div key={type.name} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: type.color }}
                  />
                  <span className="text-sm text-muted-foreground">{type.name}</span>
                </div>
                <span className="text-sm font-medium text-card-foreground">
                  {type.value}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-card-foreground mb-4">
            Atividade Recente
          </h3>
          <div className="space-y-4">
            {[
              {
                action: 'Novo servidor adicionado',
                server: 'Gaming Community BR',
                time: '2 minutos atrás',
                type: 'success',
              },
              {
                action: 'Comando executado',
                server: 'Music Lovers',
                time: '5 minutos atrás',
                type: 'info',
              },
              {
                action: 'Usuário banido',
                server: 'Competitive Gaming',
                time: '12 minutos atrás',
                type: 'warning',
              },
              {
                action: 'Erro de comando',
                server: 'Casual Chat',
                time: '18 minutos atrás',
                type: 'error',
              },
            ].map((activity, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${
                  activity.type === 'success' ? 'bg-green-500' :
                  activity.type === 'info' ? 'bg-blue-500' :
                  activity.type === 'warning' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground">
                    {activity.action}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {activity.server}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {activity.time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}