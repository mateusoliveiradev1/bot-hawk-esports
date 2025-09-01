import { useState, useEffect } from 'react';
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
  AreaChart,
  Area,
} from 'recharts';
import {

  TrendingUp,
  Users,
  Command,
  Server,
  Activity,
} from 'lucide-react';
import { formatNumber } from '../lib/utils';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useDashboardWebSocket } from '../hooks/useWebSocket';

// Real analytics data will be fetched from API

export default function Analytics() {
  const { user } = useAuth();
  const { stats } = useDashboardWebSocket(user?.guildId || '');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Suppress unused variable warnings for now
  void stats;
  void isLoading;
  void error;
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [hourlyActivity, setHourlyActivity] = useState<any[]>([]);
  const [commandCategories, setCommandCategories] = useState<any[]>([]);
  const [topCommands, setTopCommands] = useState<any[]>([]);
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState('7d');

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch analytics data from API
      const response = await apiService.get('/stats/analytics');
      
      if (response.success) {
        const data = response.data as any;
        
        // Set daily stats (last 7 days)
        setDailyStats(data.dailyStats || []);
        
        // Set hourly activity (last 24 hours)
        setHourlyActivity(data.hourlyActivity || []);
        
        // Set command categories
        setCommandCategories(data.commandCategories || []);
        
        // Set top commands
        setTopCommands(data.topCommands || []);
        
        // Set growth data
        setGrowthData(data.growthData || []);
      }
      
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to fetch analytics data:', err);
      setError('Failed to fetch analytics data');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, timeRange]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900">Analytics</h1>
          <p className="mt-1 text-sm text-secondary-600">
            Análise detalhada do desempenho e uso do bot
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <select
            className="input w-auto"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Users className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Usuários Ativos</p>
              <p className="text-2xl font-bold text-secondary-900">15.4K</p>
              <div className="flex items-center mt-1 text-sm text-success-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                +12.5%
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-success-100 rounded-lg">
              <Command className="h-6 w-6 text-success-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Comandos/Dia</p>
              <p className="text-2xl font-bold text-secondary-900">4.5K</p>
              <div className="flex items-center mt-1 text-sm text-success-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                +8.3%
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-warning-100 rounded-lg">
              <Server className="h-6 w-6 text-warning-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Servidores Ativos</p>
              <p className="text-2xl font-bold text-secondary-900">89</p>
              <div className="flex items-center mt-1 text-sm text-success-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                +2.3%
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-secondary-600">Taxa de Engajamento</p>
              <p className="text-2xl font-bold text-secondary-900">73.2%</p>
              <div className="flex items-center mt-1 text-sm text-success-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                +5.1%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily Activity Trend */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Atividade Diária
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
              />
              <Area
                type="monotone"
                dataKey="commands"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.6}
                name="Comandos"
              />
              <Area
                type="monotone"
                dataKey="users"
                stackId="2"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.6}
                name="Usuários"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Activity */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Atividade por Hora (24h)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="commands"
                stroke="#8b5cf6"
                strokeWidth={3}
                dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                name="Comandos"
              />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                name="Usuários"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Secondary Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Command Categories */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Categorias de Comandos
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={commandCategories}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {commandCategories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {commandCategories.map((category) => (
              <div key={category.name} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm text-secondary-600">{category.name}</span>
                </div>
                <span className="text-sm font-medium text-secondary-900">
                  {category.value}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Commands */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Comandos Mais Usados
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topCommands} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={60} />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Growth Trend */}
        <div className="card">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">
            Crescimento (6 meses)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
             <LineChart data={growthData}>
               <CartesianGrid strokeDasharray="3 3" />
               <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                name="Usuários"
              />
              <Line
                type="monotone"
                dataKey="guilds"
                stroke="#ef4444"
                strokeWidth={3}
                dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                name="Servidores"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Stats Table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">
          Estatísticas Detalhadas
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-secondary-200">
            <thead className="bg-secondary-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Usuários Ativos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Comandos Executados
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Servidores
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-secondary-500 uppercase tracking-wider">
                  Taxa de Crescimento
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-secondary-200">
              {dailyStats?.map((stat, index) => {
                const prevStat = dailyStats[index - 1];
                const growthRate = prevStat ? 
                  ((stat.users - prevStat.users) / prevStat.users * 100).toFixed(1) : '0.0';
                
                return (
                  <tr key={stat.date} className="hover:bg-secondary-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-secondary-900">
                      {new Date(stat.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      {formatNumber(stat.users)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      {formatNumber(stat.commands)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                      {stat.guilds}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`${parseFloat(growthRate) >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                        {parseFloat(growthRate) >= 0 ? '+' : ''}{growthRate}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}