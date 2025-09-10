import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Save,
  RefreshCw,
  Shield,
  Bot,
  Database,
  Bell,
  Globe,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

// Real settings data will be fetched from API

type SettingsSection = 'bot' | 'database' | 'features' | 'notifications' | 'api';

interface BotSettings {
  features: Record<string, boolean>;
  notifications: Record<string, boolean>;
  [key: string]: any;
}

export default function Settings() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('bot');
  const [settings, setSettings] = useState<BotSettings>({
    features: {},
    notifications: {},
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suppress unused variable warnings for now
  void isLoading;
  void error;

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        throw new Error('Failed to fetch settings');
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Settings are managed locally with mockSettings

  const saveSettingsMutation = useMutation({
    mutationFn: (newSettings: typeof settings) => {
      // Simular salvamento
      return new Promise(resolve => {
        setTimeout(() => resolve(newSettings), 1000);
      });
    },
    onSuccess: () => {
      setHasChanges(false);
      // Mostrar notificação de sucesso
    },
  });

  const updateSetting = (section: keyof typeof settings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveSettingsMutation.mutate(settings);
  };

  const sections = [
    { id: 'bot' as const, name: 'Bot', icon: Bot },
    { id: 'database' as const, name: 'Banco de Dados', icon: Database },
    { id: 'features' as const, name: 'Recursos', icon: Shield },
    { id: 'notifications' as const, name: 'Notificações', icon: Bell },
    { id: 'api' as const, name: 'API', icon: Globe },
  ];

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-secondary-900'>Configurações</h1>
          <p className='mt-1 text-sm text-secondary-600'>
            Gerencie as configurações do bot e do sistema
          </p>
        </div>
        {hasChanges && (
          <div className='mt-4 sm:mt-0 flex items-center space-x-3'>
            <span className='text-sm text-warning-600 flex items-center'>
              <AlertTriangle className='h-4 w-4 mr-1' />
              Alterações não salvas
            </span>
            <button
              onClick={handleSave}
              disabled={saveSettingsMutation.isPending}
              className='btn btn-primary btn-sm'
            >
              {saveSettingsMutation.isPending ? (
                <RefreshCw className='h-4 w-4 mr-2 animate-spin' />
              ) : (
                <Save className='h-4 w-4 mr-2' />
              )}
              Salvar
            </button>
          </div>
        )}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-4 gap-6'>
        {/* Sidebar */}
        <div className='lg:col-span-1'>
          <nav className='settings-sidebar space-y-1'>
            {sections.map(section => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900'
                  }`}
                >
                  <section.icon
                    className={`mr-3 h-5 w-5 ${
                      isActive ? 'text-primary-500' : 'text-secondary-400'
                    }`}
                  />
                  {section.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className='lg:col-span-3'>
          <div className='card'>
            {/* Bot Settings */}
            {activeSection === 'bot' && (
              <div className='space-y-6'>
                <div>
                  <h3 className='text-lg font-semibold text-secondary-900 mb-4'>
                    Configurações do Bot
                  </h3>
                </div>

                <div className='form-grid cols-2 gap-6'>
                  <div>
                    <label className='label'>Nome do Bot</label>
                    <input
                      type='text'
                      className='input mt-1'
                      value={settings.bot.name}
                      onChange={e => updateSetting('bot', 'name', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className='label'>Status</label>
                    <select
                      className='input mt-1'
                      value={settings.bot.status}
                      onChange={e => updateSetting('bot', 'status', e.target.value)}
                    >
                      <option value='online'>Online</option>
                      <option value='idle'>Ausente</option>
                      <option value='dnd'>Não Perturbe</option>
                      <option value='invisible'>Invisível</option>
                    </select>
                  </div>
                  <div>
                    <label className='label'>Atividade</label>
                    <input
                      type='text'
                      className='input mt-1'
                      value={settings.bot.activity}
                      onChange={e => updateSetting('bot', 'activity', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className='label'>Prefixo</label>
                    <input
                      type='text'
                      className='input mt-1'
                      value={settings.bot.prefix}
                      onChange={e => updateSetting('bot', 'prefix', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className='label'>Idioma</label>
                    <select
                      className='input mt-1'
                      value={settings.bot.language}
                      onChange={e => updateSetting('bot', 'language', e.target.value)}
                    >
                      <option value='pt-BR'>Português (Brasil)</option>
                      <option value='en-US'>English (US)</option>
                      <option value='es-ES'>Español</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Database Settings */}
            {activeSection === 'database' && (
              <div className='space-y-6'>
                <div>
                  <h3 className='text-lg font-semibold text-secondary-900 mb-4'>
                    Configurações do Banco de Dados
                  </h3>
                </div>

                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
                  <div>
                    <label className='label'>Host</label>
                    <input
                      type='text'
                      className='input mt-1'
                      value={settings.database.host}
                      onChange={e => updateSetting('database', 'host', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className='label'>Porta</label>
                    <input
                      type='number'
                      className='input mt-1'
                      value={settings.database.port}
                      onChange={e => updateSetting('database', 'port', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className='label'>Nome do Banco</label>
                    <input
                      type='text'
                      className='input mt-1'
                      value={settings.database.name}
                      onChange={e => updateSetting('database', 'name', e.target.value)}
                    />
                  </div>
                  <div className='flex items-center'>
                    <input
                      type='checkbox'
                      id='ssl'
                      className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-secondary-300 rounded'
                      checked={settings.database.ssl}
                      onChange={e => updateSetting('database', 'ssl', e.target.checked)}
                    />
                    <label htmlFor='ssl' className='ml-2 text-sm text-secondary-900'>
                      Usar SSL
                    </label>
                  </div>
                </div>

                <div className='bg-secondary-50 p-4 rounded-lg'>
                  <div className='flex items-center'>
                    <CheckCircle className='h-5 w-5 text-success-500 mr-2' />
                    <span className='text-sm font-medium text-success-800'>
                      Conexão com o banco de dados ativa
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Features Settings */}
            {activeSection === 'features' && (
              <div className='space-y-6'>
                <div>
                  <h3 className='text-lg font-semibold text-secondary-900 mb-4'>Recursos do Bot</h3>
                </div>

                <div className='space-y-4'>
                  {Object.entries(settings.features).map(([key, value]) => (
                    <div key={key} className='flex items-center justify-between'>
                      <div>
                        <h4 className='text-sm font-medium text-secondary-900'>
                          {key === 'music'
                            ? 'Sistema de Música'
                            : key === 'moderation'
                              ? 'Moderação'
                              : key === 'leveling'
                                ? 'Sistema de Níveis'
                                : key === 'automod'
                                  ? 'Auto Moderação'
                                  : key === 'welcomeMessages'
                                    ? 'Mensagens de Boas-vindas'
                                    : key === 'logging'
                                      ? 'Sistema de Logs'
                                      : key}
                        </h4>
                        <p className='text-sm text-secondary-500'>
                          {key === 'music'
                            ? 'Permite reproduzir música nos canais de voz'
                            : key === 'moderation'
                              ? 'Comandos de moderação como ban, kick, mute'
                              : key === 'leveling'
                                ? 'Sistema de XP e níveis para usuários'
                                : key === 'automod'
                                  ? 'Moderação automática de mensagens'
                                  : key === 'welcomeMessages'
                                    ? 'Mensagens automáticas para novos membros'
                                    : key === 'logging'
                                      ? 'Registro de ações do servidor'
                                      : 'Recurso do bot'}
                        </p>
                      </div>
                      <label className='relative inline-flex items-center cursor-pointer'>
                        <input
                          type='checkbox'
                          className='sr-only peer'
                          checked={Boolean(value)}
                          onChange={e => updateSetting('features', key, e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notifications Settings */}
            {activeSection === 'notifications' && (
              <div className='space-y-6'>
                <div>
                  <h3 className='text-lg font-semibold text-secondary-900 mb-4'>
                    Configurações de Notificações
                  </h3>
                </div>

                <div className='space-y-4'>
                  {Object.entries(settings.notifications).map(([key, value]) => (
                    <div key={key} className='flex items-center justify-between'>
                      <div>
                        <h4 className='text-sm font-medium text-secondary-900'>
                          {key === 'errors'
                            ? 'Erros'
                            : key === 'warnings'
                              ? 'Avisos'
                              : key === 'newGuilds'
                                ? 'Novos Servidores'
                                : key === 'updates'
                                  ? 'Atualizações'
                                  : key}
                        </h4>
                        <p className='text-sm text-secondary-500'>
                          {key === 'errors'
                            ? 'Notificações de erros críticos'
                            : key === 'warnings'
                              ? 'Avisos importantes do sistema'
                              : key === 'newGuilds'
                                ? 'Quando o bot é adicionado a novos servidores'
                                : key === 'updates'
                                  ? 'Notificações de atualizações do bot'
                                  : 'Notificação'}
                        </p>
                      </div>
                      <label className='relative inline-flex items-center cursor-pointer'>
                        <input
                          type='checkbox'
                          className='sr-only peer'
                          checked={Boolean(value)}
                          onChange={e => updateSetting('notifications', key, e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-secondary-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-secondary-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* API Settings */}
            {activeSection === 'api' && (
              <div className='space-y-6'>
                <div>
                  <h3 className='text-lg font-semibold text-secondary-900 mb-4'>
                    Configurações da API
                  </h3>
                </div>

                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
                  <div>
                    <label className='label'>Rate Limit (req/min)</label>
                    <input
                      type='number'
                      className='input mt-1'
                      value={settings.api.rateLimit}
                      onChange={e => updateSetting('api', 'rateLimit', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className='label'>Timeout (ms)</label>
                    <input
                      type='number'
                      className='input mt-1'
                      value={settings.api.timeout}
                      onChange={e => updateSetting('api', 'timeout', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className='label'>Tentativas</label>
                    <input
                      type='number'
                      className='input mt-1'
                      value={settings.api.retries}
                      onChange={e => updateSetting('api', 'retries', parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className='bg-warning-50 p-4 rounded-lg'>
                  <div className='flex items-start'>
                    <AlertTriangle className='h-5 w-5 text-warning-500 mr-2 mt-0.5' />
                    <div>
                      <h4 className='text-sm font-medium text-warning-800'>
                        Configurações Avançadas
                      </h4>
                      <p className='text-sm text-warning-700 mt-1'>
                        Altere essas configurações apenas se souber o que está fazendo. Valores
                        incorretos podem afetar o desempenho do bot.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
