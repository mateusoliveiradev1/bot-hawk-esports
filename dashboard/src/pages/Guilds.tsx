import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Filter,
  MoreVertical,
  Server,
  Users,
  Crown,
  Calendar,
  Activity,
  TrendingUp,
} from 'lucide-react'
import { formatNumber, formatRelativeTime } from '../lib/utils'

// Mock data
const mockGuilds = [
  {
    id: '1',
    name: 'Gaming Community BR',
    icon: null,
    memberCount: 1250,
    owner: 'João#1234',
    joinedAt: '2024-01-15T10:30:00Z',
    lastActivity: '2024-01-20T14:22:00Z',
    commandsUsed: 2847,
    category: 'Gaming',
    premium: true,
    features: ['music', 'moderation', 'leveling'],
  },
  {
    id: '2',
    name: 'Music Lovers',
    icon: null,
    memberCount: 890,
    owner: 'Maria#5678',
    joinedAt: '2024-01-10T08:15:00Z',
    lastActivity: '2024-01-20T12:45:00Z',
    commandsUsed: 1456,
    category: 'Music',
    premium: false,
    features: ['music'],
  },
  {
    id: '3',
    name: 'Competitive Gaming',
    icon: null,
    memberCount: 2100,
    owner: 'Pedro#9012',
    joinedAt: '2024-01-05T16:20:00Z',
    lastActivity: '2024-01-19T20:10:00Z',
    commandsUsed: 3921,
    category: 'Gaming',
    premium: true,
    features: ['music', 'moderation', 'leveling', 'tournaments'],
  },
]

const categoryColors = {
  Gaming: 'bg-blue-100 text-blue-800',
  Music: 'bg-purple-100 text-purple-800',
  Community: 'bg-green-100 text-green-800',
  Other: 'bg-secondary-100 text-secondary-800',
}

const featureIcons = {
  music: '🎵',
  moderation: '🛡️',
  leveling: '📈',
  tournaments: '🏆',
}

export default function Guilds() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterPremium, setFilterPremium] = useState('all')

  const { data: guilds } = useQuery({
    queryKey: ['guilds'],
    queryFn: () => Promise.resolve(mockGuilds),
  })

  const filteredGuilds = guilds?.filter(guild => {
    const matchesSearch = guild.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         guild.owner.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || guild.category === filterCategory
    const matchesPremium = filterPremium === 'all' || 
                          (filterPremium === 'premium' && guild.premium) ||
                          (filterPremium === 'free' && !guild.premium)
    return matchesSearch && matchesCategory && matchesPremium
  }) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Servidores</h1>
          <p className="mt-1 text-sm text-secondary-600">
            Gerencie e visualize informações dos servidores onde o bot está ativo
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Server className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Total de Servidores</p>
              <p className="text-2xl font-bold text-secondary-900">89</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-success-100 rounded-lg">
              <Users className="h-6 w-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Total de Membros</p>
              <p className="text-2xl font-bold text-secondary-900">156K</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-warning-100 rounded-lg">
              <Crown className="h-6 w-6 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Servidores Premium</p>
              <p className="text-2xl font-bold text-secondary-900">23</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Crescimento Mensal</p>
              <p className="text-2xl font-bold text-secondary-900">+12%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Buscar servidores..."
              className="input pl-10 w-full sm:w-80"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-secondary-400" />
              <select
                className="input w-auto"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">Todas as categorias</option>
                <option value="Gaming">Gaming</option>
                <option value="Music">Music</option>
                <option value="Community">Community</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <select
                className="input w-auto"
                value={filterPremium}
                onChange={(e) => setFilterPremium(e.target.value)}
              >
                <option value="all">Todos os planos</option>
                <option value="premium">Premium</option>
                <option value="free">Gratuito</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Guilds Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {filteredGuilds.map((guild) => (
          <div key={guild.id} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Server className="h-6 w-6 text-primary-600" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-secondary-900 truncate">
                    {guild.name}
                  </h3>
                  <p className="text-sm text-secondary-500">
                    Por {guild.owner}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {guild.premium && (
                  <Crown className="h-4 w-4 text-warning-500" />
                )}
                <button className="text-secondary-400 hover:text-secondary-600">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-600">Membros</span>
                <span className="text-sm font-medium text-secondary-900">
                  {formatNumber(guild.memberCount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-600">Comandos Usados</span>
                <span className="text-sm font-medium text-secondary-900">
                  {formatNumber(guild.commandsUsed)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-secondary-600">Última Atividade</span>
                <span className="text-sm font-medium text-secondary-900">
                  {formatRelativeTime(guild.lastActivity)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                categoryColors[guild.category as keyof typeof categoryColors]
              }`}>
                {guild.category}
              </span>
              <div className="flex items-center space-x-1">
                {guild.features.map((feature) => (
                  <span
                    key={feature}
                    className="text-sm"
                    title={feature}
                  >
                    {featureIcons[feature as keyof typeof featureIcons]}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-secondary-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-secondary-500">
                  Adicionado {formatRelativeTime(guild.joinedAt)}
                </span>
                <div className="flex items-center space-x-1">
                  <Activity className="h-3 w-3 text-success-500" />
                  <span className="text-xs text-success-600">Ativo</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredGuilds.length === 0 && (
        <div className="card text-center py-12">
          <Server className="mx-auto h-12 w-12 text-secondary-400" />
          <h3 className="mt-4 text-lg font-medium text-secondary-900">
            Nenhum servidor encontrado
          </h3>
          <p className="mt-2 text-sm text-secondary-500">
            Tente ajustar os filtros de busca para encontrar servidores.
          </p>
        </div>
      )}
    </div>
  )
}