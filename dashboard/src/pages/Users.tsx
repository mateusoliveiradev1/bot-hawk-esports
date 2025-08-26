import { useState, useEffect } from 'react'
import {
  Search,
  Filter,
  MoreVertical,
  Shield,
  User,
  Calendar,
  Activity,
} from 'lucide-react'
import { formatDate, formatRelativeTime } from '../lib/utils'
import { apiService, type Guild } from '../services/api'

// Mock data removed - using guild.users instead

const statusColors = {
  online: 'bg-success-500',
  away: 'bg-warning-500',
  offline: 'bg-secondary-400',
}

// Badge colors removed - not currently used

export default function Users() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [guild, setGuild] = useState<Guild | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Use the guild ID from environment
  const guildId = '1409723307489755270' // Guild ID from .env
  
  useEffect(() => {
    const fetchGuildData = async () => {
      try {
        setLoading(true)
        const guildData = await apiService.getGuild(guildId)
        setGuild(guildData)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch guild data:', err)
        setError('Falha ao carregar dados dos usuários')
        // Fallback to mock data
        setGuild({
          id: guildId,
          name: 'Mock Guild',
          memberCount: 3,
          config: {},
          users: [
            {
              user: {
                id: '1',
                username: 'João',
                discriminator: '1234',
                level: 15,
                totalXp: 125430,
                coins: 2450,
                lastSeen: '2024-01-20T14:22:00Z',
                joinedAt: '2024-01-15T10:30:00Z'
              },
              isActive: true,
              joinedAt: '2024-01-15T10:30:00Z'
            },
            {
              user: {
                id: '2',
                username: 'Maria',
                discriminator: '5678',
                level: 8,
                totalXp: 89230,
                coins: 1890,
                lastSeen: '2024-01-20T12:45:00Z',
                joinedAt: '2024-01-10T08:15:00Z'
              },
              isActive: true,
              joinedAt: '2024-01-10T08:15:00Z'
            }
          ]
        })
      } finally {
        setLoading(false)
      }
    }
    
    fetchGuildData()
    
    // Refresh data every 60 seconds
    const interval = setInterval(fetchGuildData, 60000)
    return () => clearInterval(interval)
  }, [guildId])

  const users = guild?.users || []

  // Remove the problematic useQuery since we're using guild.users directly
   // const { data: mockUsers } = useQuery({
   //   queryKey: ['users'],
   //   queryFn: () => Promise.resolve(mockUsers),
   // });

  const filteredUsers = users.filter(userGuild => {
    const user = userGuild.user
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase())
    const isOnline = user.lastSeen && new Date(user.lastSeen) > new Date(Date.now() - 5 * 60 * 1000)
    const status = userGuild.isActive ? (isOnline ? 'online' : 'offline') : 'offline'
    const matchesStatus = filterStatus === 'all' || status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Usuários</h1>
          <p className="mt-1 text-sm text-secondary-600">
            Gerencie e visualize informações dos usuários do bot
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <User className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Total de Usuários</p>
              <p className="text-2xl font-bold text-secondary-900">15,420</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-success-100 rounded-lg">
              <Activity className="h-6 w-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Usuários Ativos</p>
              <p className="text-2xl font-bold text-secondary-900">8,234</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-warning-100 rounded-lg">
              <Shield className="h-6 w-6 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Usuários Premium</p>
              <p className="text-2xl font-bold text-secondary-900">1,567</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Calendar className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Novos Hoje</p>
              <p className="text-2xl font-bold text-secondary-900">47</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Buscar usuários..."
              className="input pl-10 w-full sm:w-80"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-secondary-400" />
              <select
                className="input w-auto"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos os status</option>
                <option value="online">Online</option>
                <option value="away">Ausente</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card">
        {error && (
          <div className="px-6 py-4 border-b border-secondary-200">
            <div className="text-sm text-red-600">
              {error} - Exibindo dados de exemplo
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="text-secondary-500">Carregando usuários...</div>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-secondary-200">
              <thead className="bg-secondary-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Usuário
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Level
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    XP Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Moedas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                    Último Acesso
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-secondary-200">
                {filteredUsers.map((userGuild) => {
                  const user = userGuild.user
                  const isOnline = user.lastSeen && new Date(user.lastSeen) > new Date(Date.now() - 5 * 60 * 1000)
                  const status = userGuild.isActive ? (isOnline ? 'online' : 'offline') : 'offline'
                  
                  return (
                    <tr key={user.id} className="hover:bg-secondary-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            {user.avatar ? (
                              <img className="h-10 w-10 rounded-full" src={user.avatar} alt="" />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                                <User className="h-5 w-5 text-primary-600" />
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-secondary-900">
                              {user.username}#{user.discriminator}
                            </div>
                            <div className="text-sm text-secondary-500">
                              Membro desde {formatDate(userGuild.joinedAt)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`h-2 w-2 rounded-full mr-2 ${statusColors[status as keyof typeof statusColors] || 'bg-secondary-400'}`} />
                          <span className="text-sm text-secondary-900 capitalize">
                            {status === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                        {user.level}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                        {user.totalXp.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                        {user.coins.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-500">
                        {user.lastSeen ? formatRelativeTime(user.lastSeen) : 'Nunca'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-secondary-400 hover:text-secondary-600">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}