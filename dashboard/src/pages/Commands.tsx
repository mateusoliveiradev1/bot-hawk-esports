import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Command,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  BarChart3,
} from 'lucide-react'
import { formatNumber, formatRelativeTime } from '../lib/utils'
import { apiService } from '../services/api'

const categoryColors = {
  Music: 'bg-purple-100 text-purple-800',
  Moderation: 'bg-red-100 text-red-800',
  Leveling: 'bg-green-100 text-green-800',
  Utility: 'bg-blue-100 text-blue-800',
  Fun: 'bg-yellow-100 text-yellow-800',
}

function getSuccessRateColor(rate: number) {
  if (rate >= 98) return 'text-success-600'
  if (rate >= 95) return 'text-warning-600'
  return 'text-error-600'
}

function getResponseTimeColor(time: number) {
  if (time <= 150) return 'text-success-600'
  if (time <= 300) return 'text-warning-600'
  return 'text-error-600'
}

export default function Commands() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  const { data: commands } = useQuery({
    queryKey: ['commands'],
    queryFn: () => apiService.getCommands(),
  })

  const filteredCommands = commands?.filter(command => {
    const matchesSearch = command.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         command.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = filterCategory === 'all' || command.category === filterCategory
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'enabled' && command.enabled) ||
                         (filterStatus === 'disabled' && !command.enabled)
    return matchesSearch && matchesCategory && matchesStatus
  }) || []

  const totalUsage = commands?.reduce((sum, cmd) => sum + cmd.usageCount, 0) || 0
  const avgSuccessRate = commands?.reduce((sum, cmd) => sum + cmd.successRate, 0) / (commands?.length || 1) || 0
  const avgResponseTime = commands?.reduce((sum, cmd) => sum + cmd.avgResponseTime, 0) / (commands?.length || 1) || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Comandos</h1>
          <p className="mt-1 text-sm text-secondary-600">
            Monitore o desempenho e uso dos comandos do bot
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Command className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Total de Comandos</p>
              <p className="text-2xl font-bold text-secondary-900">{commands?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-success-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Usos Totais</p>
              <p className="text-2xl font-bold text-secondary-900">{formatNumber(totalUsage)}</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-warning-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Taxa de Sucesso</p>
              <p className="text-2xl font-bold text-secondary-900">{avgSuccessRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Tempo Médio</p>
              <p className="text-2xl font-bold text-secondary-900">{Math.round(avgResponseTime)}ms</p>
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
              placeholder="Buscar comandos..."
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
                <option value="Music">Music</option>
                <option value="Moderation">Moderation</option>
                <option value="Leveling">Leveling</option>
                <option value="Utility">Utility</option>
                <option value="Fun">Fun</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <select
                className="input w-auto"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos os status</option>
                <option value="enabled">Habilitados</option>
                <option value="disabled">Desabilitados</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Commands Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-secondary-200">
            <thead className="bg-secondary-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Comando
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Usos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Taxa de Sucesso
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Tempo Médio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Último Uso
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-secondary-200">
              {filteredCommands.map((command) => (
                <tr key={command.id} className="hover:bg-secondary-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="flex items-center">
                        <code className="text-sm font-mono font-medium text-secondary-900 bg-secondary-100 px-2 py-1 rounded">
                          /{command.name}
                        </code>
                        {command.premium && (
                          <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Premium
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-secondary-500 mt-1">
                        {command.description}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      categoryColors[command.category as keyof typeof categoryColors]
                    }`}>
                      {command.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                    {formatNumber(command.usageCount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className={`text-sm font-medium ${getSuccessRateColor(command.successRate)}`}>
                        {command.successRate}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${getResponseTimeColor(command.avgResponseTime)}`}>
                      {command.avgResponseTime}ms
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-500">
                    {formatRelativeTime(command.lastUsed)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {command.enabled ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-success-500 mr-1" />
                          <span className="text-sm text-success-600">Ativo</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-error-500 mr-1" />
                          <span className="text-sm text-error-600">Inativo</span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredCommands.length === 0 && (
        <div className="card text-center py-12">
          <Command className="mx-auto h-12 w-12 text-secondary-400" />
          <h3 className="mt-4 text-lg font-medium text-secondary-900">
            Nenhum comando encontrado
          </h3>
          <p className="mt-2 text-sm text-secondary-500">
            Tente ajustar os filtros de busca para encontrar comandos.
          </p>
        </div>
      )}
    </div>
  )
}