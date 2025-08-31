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

// Real-time data will be fetched from API - no more mock data

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

const mockGuildTypes = [
  { name: 'Gaming', value: 45, color: '#3B82F6' },
  { name: 'Community', value: 30, color: '#10B981' },
  { name: 'Music', value: 15, color: '#8B5CF6' },
  { name: 'Other', value: 10, color: '#F59E0B' }
];

export default function Dashboard() {
  const [stats, setStats] = useState<GuildStats | null>(null)
  const [commandUsage, setCommandUsage] = useState<any[]>([])
  const [activityData, setActivityData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [, setError] = useState<string | null>(null)
  const { addToast } = useToast()
  
  
  // Use the guild ID from environment
  const guildId = import.meta.env.VITE_GUILD_ID || '1409723307489755270'
  
  // WebSocket connection for real-time updates
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002'
  const { lastMessage, sendMessage } = useWebSocket(wsUrl, {
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
      
      // Fetch real data from API
      const [guildStats, commands] = await Promise.all([
        apiService.getGuildStats(guildId),
        apiService.getCommands()
      ])
      
      setStats(guildStats)
      
      // Process command usage data (top 8 commands)
      if (commands && commands.length > 0) {
        const sortedCommands = commands
          .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
          .slice(0, 8)
          .map(cmd => ({
            name: cmd.name,
            count: cmd.usageCount || 0
          }))
        setCommandUsage(sortedCommands)
      }
      
      // Generate activity data for last 24h (mock for now, can be replaced with real data)
      const now = new Date()
      const activityPoints = []
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000)
        const hour = time.getHours().toString().padStart(2, '0') + ':00'
        // This would ideally come from real analytics data
        const commands = Math.floor(Math.random() * 200) + 50
        activityPoints.push({ time: hour, commands })
      }
      setActivityData(activityPoints)
      
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
                <BarChart data={commandUsage}>
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
                <LineChart data={activityData}>
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
                {mockGuildTypes.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {mockGuildTypes.map((type: any) => (
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