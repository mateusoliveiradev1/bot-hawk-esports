import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import '../styles/onboarding.css';
import {
  Bot,
  Server,
  Users,
  Shield,
  Music,
  Trophy,
  Gamepad2,
  BarChart3,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Zap,
  Crown,
  Star,
  Play,
  Pause,
  Volume2,
  LogIn,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import Navigation from '../components/Navigation';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  content: React.ReactNode;
}

const features = [
  {
    icon: Music,
    title: 'Sistema de Música',
    description: 'Reproduza música de alta qualidade com controles avançados',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Trophy,
    title: 'Rankings & Badges',
    description: 'Sistema completo de conquistas e classificações',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Gamepad2,
    title: 'Integração PUBG',
    description: 'Estatísticas em tempo real e análise de performance',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Shield,
    title: 'Segurança Avançada',
    description: 'Proteção anti-bot e autenticação 2FA',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: BarChart3,
    title: 'Analytics Detalhados',
    description: 'Insights profundos sobre atividade do servidor',
    color: 'from-indigo-500 to-purple-500',
  },
  {
    icon: Users,
    title: 'Gestão de Membros',
    description: 'Ferramentas completas de moderação e engajamento',
    color: 'from-red-500 to-pink-500',
  },
];

const stats = [
  { label: 'Servidores Ativos', value: '2,500+', icon: Server },
  { label: 'Usuários Registrados', value: '150K+', icon: Users },
  { label: 'Comandos Executados', value: '5M+', icon: Zap },
  { label: 'Uptime', value: '99.9%', icon: CheckCircle },
];

const testimonials = [
  {
    name: 'João Silva',
    role: 'Admin - Gaming Community BR',
    avatar: '🎮',
    text: 'O Hawk Esports transformou completamente nosso servidor. A integração com PUBG é perfeita!',
  },
  {
    name: 'Maria Santos',
    role: 'Owner - Music Lovers',
    avatar: '🎵',
    text: 'Sistema de música incrível e analytics detalhados. Nossos membros adoram!',
  },
  {
    name: 'Pedro Costa',
    role: 'Moderador - Competitive Gaming',
    avatar: '🏆',
    text: 'As ferramentas de moderação e o sistema de badges aumentaram muito o engajamento.',
  },
];

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => (prev >= 100 ? 0 : prev + 1));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  const steps: OnboardingStep[] = [
    {
      id: 0,
      title: 'Bem-vindo ao Hawk Esports',
      description: 'O bot Discord mais completo para comunidades gaming',
      icon: Bot,
      content: (
        <div className='text-center space-y-8'>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className='relative mx-auto w-32 h-32 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center'
          >
            <Bot className='w-16 h-16 text-white' />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className='absolute inset-0 border-4 border-dashed border-purple-300 rounded-full'
            />
          </motion.div>

          <div className='space-y-4'>
            <h2 className='text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent'>
              Hawk Esports Bot
            </h2>
            <p className='text-xl text-gray-600 max-w-2xl mx-auto'>
              Transforme seu servidor Discord em uma experiência gaming completa com recursos
              avançados de música, estatísticas PUBG, rankings e muito mais.
            </p>
          </div>

          <div className='grid grid-cols-2 md:grid-cols-4 gap-6'>
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className='text-center'
              >
                <div className='w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-purple-100 to-blue-100 rounded-lg flex items-center justify-center'>
                  <stat.icon className='w-6 h-6 text-purple-600' />
                </div>
                <div className='text-2xl font-bold text-gray-900'>{stat.value}</div>
                <div className='text-sm text-gray-600'>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 1,
      title: 'Recursos Incríveis',
      description: 'Descubra tudo que o Hawk Esports pode fazer pelo seu servidor',
      icon: Sparkles,
      content: (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className='relative overflow-hidden'
            >
              <Card className='h-full border-0 shadow-lg hover:shadow-xl transition-all duration-300'>
                <CardHeader className='pb-4'>
                  <div
                    className={`w-12 h-12 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}
                  >
                    <feature.icon className='w-6 h-6 text-white' />
                  </div>
                  <CardTitle className='text-lg'>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className='text-gray-600'>{feature.description}</CardDescription>
                </CardContent>
                <div
                  className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${feature.color} opacity-10 rounded-full -mr-10 -mt-10`}
                />
              </Card>
            </motion.div>
          ))}
        </div>
      ),
    },
    {
      id: 2,
      title: 'Demonstração Interativa',
      description: 'Veja o bot em ação com nossa demo interativa',
      icon: Play,
      content: (
        <div className='space-y-8'>
          <div className='bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 text-white'>
            <div className='flex items-center justify-between mb-4'>
              <div className='flex items-center space-x-3'>
                <div className='w-3 h-3 bg-red-500 rounded-full' />
                <div className='w-3 h-3 bg-yellow-500 rounded-full' />
                <div className='w-3 h-3 bg-green-500 rounded-full' />
              </div>
              <Badge variant='secondary' className='bg-purple-600 text-white'>
                Demo Interativa
              </Badge>
            </div>

            <div className='space-y-4'>
              <div className='flex items-center space-x-3'>
                <div className='w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center'>
                  <Bot className='w-4 h-4' />
                </div>
                <div className='flex-1'>
                  <div className='bg-gray-700 rounded-lg p-3'>
                    <p className='text-sm'>
                      🎵 Tocando agora: <strong>Imagine Dragons - Believer</strong>
                    </p>
                    <div className='flex items-center space-x-2 mt-2'>
                      <Button
                        size='sm'
                        variant='ghost'
                        className='text-white hover:bg-gray-600'
                        onClick={() => setIsPlaying(!isPlaying)}
                      >
                        {isPlaying ? <Pause className='w-4 h-4' /> : <Play className='w-4 h-4' />}
                      </Button>
                      <Progress value={progress} className='flex-1 h-2' />
                      <Volume2 className='w-4 h-4' />
                    </div>
                  </div>
                </div>
              </div>

              <div className='flex items-center space-x-3'>
                <div className='w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center'>
                  <Trophy className='w-4 h-4' />
                </div>
                <div className='flex-1'>
                  <div className='bg-gray-700 rounded-lg p-3'>
                    <p className='text-sm'>
                      🏆 <strong>João#1234</strong> conquistou o badge{' '}
                      <strong>"Chicken Dinner Master"</strong>!
                    </p>
                  </div>
                </div>
              </div>

              <div className='flex items-center space-x-3'>
                <div className='w-8 h-8 bg-green-600 rounded-full flex items-center justify-center'>
                  <Gamepad2 className='w-4 h-4' />
                </div>
                <div className='flex-1'>
                  <div className='bg-gray-700 rounded-lg p-3'>
                    <p className='text-sm'>
                      📊 Estatísticas PUBG atualizadas para <strong>PlayerPro</strong>
                    </p>
                    <div className='grid grid-cols-3 gap-4 mt-2 text-xs'>
                      <div>
                        K/D: <strong>2.34</strong>
                      </div>
                      <div>
                        Wins: <strong>127</strong>
                      </div>
                      <div>
                        Rank: <strong>Diamond</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className='text-center'>
            <p className='text-gray-600 mb-4'>
              Esta é apenas uma pequena amostra do que o Hawk Esports pode fazer!
            </p>
            <Button className='bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'>
              Ver Todos os Recursos
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      title: 'O que nossos usuários dizem',
      description: 'Depoimentos reais de administradores que usam o Hawk Esports',
      icon: Star,
      content: (
        <div className='space-y-6'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.2 }}
              >
                <Card className='h-full border-0 shadow-lg'>
                  <CardContent className='p-6'>
                    <div className='flex items-center space-x-3 mb-4'>
                      <div className='w-12 h-12 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center text-2xl'>
                        {testimonial.avatar}
                      </div>
                      <div>
                        <div className='font-semibold text-gray-900'>{testimonial.name}</div>
                        <div className='text-sm text-gray-600'>{testimonial.role}</div>
                      </div>
                    </div>
                    <p className='text-gray-700 italic'>"{testimonial.text}"</p>
                    <div className='flex items-center space-x-1 mt-4'>
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className='w-4 h-4 fill-yellow-400 text-yellow-400' />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className='text-center bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-8'>
            <Crown className='w-12 h-12 text-purple-600 mx-auto mb-4' />
            <h3 className='text-2xl font-bold text-gray-900 mb-2'>
              Junte-se a milhares de servidores
            </h3>
            <p className='text-gray-600 mb-6'>
              Mais de 2.500 servidores já confiam no Hawk Esports para elevar sua experiência
              Discord
            </p>
            <div className='flex items-center justify-center space-x-8'>
              <div className='text-center'>
                <div className='text-3xl font-bold text-purple-600'>99.9%</div>
                <div className='text-sm text-gray-600'>Uptime</div>
              </div>
              <div className='text-center'>
                <div className='text-3xl font-bold text-blue-600'>24/7</div>
                <div className='text-sm text-gray-600'>Suporte</div>
              </div>
              <div className='text-center'>
                <div className='text-3xl font-bold text-green-600'>5M+</div>
                <div className='text-sm text-gray-600'>Comandos</div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      title: 'Pronto para começar?',
      description: 'Configure o Hawk Esports em seu servidor em poucos cliques',
      icon: CheckCircle,
      content: (
        <div className='text-center space-y-8'>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className='relative mx-auto w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center'
          >
            <CheckCircle className='w-12 h-12 text-white' />
          </motion.div>

          <div className='space-y-4'>
            <h2 className='text-3xl font-bold text-gray-900'>Tudo pronto para decolar! 🚀</h2>
            <p className='text-xl text-gray-600 max-w-2xl mx-auto'>
              Clique no botão abaixo para adicionar o Hawk Esports ao seu servidor Discord e começar
              a transformar sua comunidade.
            </p>
          </div>

          <div className='space-y-4'>
            <div className='flex flex-col sm:flex-row gap-4 justify-center'>
              <Button
                size='lg'
                className='bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300'
                onClick={() =>
                  window.open(
                    'https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=8&scope=bot%20applications.commands',
                    '_blank'
                  )
                }
              >
                <Bot className='w-6 h-6 mr-2' />
                Adicionar ao Discord
              </Button>

              <Button
                size='lg'
                variant='outline'
                className='border-2 border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300'
                onClick={() => navigate('/dashboard')}
              >
                <LogIn className='w-6 h-6 mr-2' />
                Acessar Dashboard
              </Button>
            </div>

            <div className='flex items-center justify-center space-x-6 text-sm text-gray-600'>
              <div className='flex items-center space-x-2'>
                <CheckCircle className='w-4 h-4 text-green-500' />
                <span>Configuração automática</span>
              </div>
              <div className='flex items-center space-x-2'>
                <CheckCircle className='w-4 h-4 text-green-500' />
                <span>Suporte 24/7</span>
              </div>
              <div className='flex items-center space-x-2'>
                <CheckCircle className='w-4 h-4 text-green-500' />
                <span>Sempre gratuito</span>
              </div>
            </div>
          </div>

          <div className='bg-gray-50 rounded-xl p-6'>
            <h3 className='font-semibold text-gray-900 mb-3'>Próximos passos:</h3>
            <div className='space-y-2 text-left'>
              <div className='flex items-center space-x-3'>
                <div className='w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold'>
                  1
                </div>
                <span className='text-gray-700'>Adicione o bot ao seu servidor</span>
              </div>
              <div className='flex items-center space-x-3'>
                <div className='w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold'>
                  2
                </div>
                <span className='text-gray-700'>
                  Execute <code className='bg-gray-200 px-2 py-1 rounded text-sm'>/bootstrap</code>{' '}
                  para configuração automática
                </span>
              </div>
              <div className='flex items-center space-x-3'>
                <div className='w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold'>
                  3
                </div>
                <span className='text-gray-700'>Acesse o dashboard para personalizar</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50'>
      {/* Navigation */}
      <Navigation variant='onboarding' />

      {/* Progress Bar */}
      <div className='bg-white/50 backdrop-blur-sm border-b border-gray-100'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-center py-3'>
            <div className='flex items-center space-x-4'>
              <div className='text-sm text-gray-600'>
                Passo {currentStep + 1} de {steps.length}
              </div>
              <div className='w-48'>
                <Progress value={((currentStep + 1) / steps.length) * 100} className='h-2' />
              </div>
              <div className='text-sm font-medium text-purple-600'>
                {Math.round(((currentStep + 1) / steps.length) * 100)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12'>
        <AnimatePresence mode='wait'>
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className='space-y-8'
          >
            {/* Step Header */}
            <div className='text-center space-y-4'>
              <div className='flex items-center justify-center space-x-2'>
                {React.createElement(steps[currentStep].icon, {
                  className: 'w-8 h-8 text-purple-600',
                })}
                <h2 className='text-3xl font-bold text-gray-900'>{steps[currentStep].title}</h2>
              </div>
              <p className='text-xl text-gray-600 max-w-3xl mx-auto'>
                {steps[currentStep].description}
              </p>
            </div>

            {/* Step Content */}
            <div className='max-w-6xl mx-auto'>{steps[currentStep].content}</div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className='flex items-center justify-between mt-12'>
          <Button
            variant='outline'
            onClick={prevStep}
            disabled={currentStep === 0}
            className='flex items-center space-x-2'
          >
            <ArrowLeft className='w-4 h-4' />
            <span>Anterior</span>
          </Button>

          {/* Step Indicators */}
          <div className='flex items-center space-x-2'>
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => goToStep(index)}
                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  index === currentStep
                    ? 'bg-purple-600 scale-125'
                    : index < currentStep
                      ? 'bg-green-500'
                      : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          <Button
            onClick={nextStep}
            disabled={currentStep === steps.length - 1}
            className='flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
          >
            <span>Próximo</span>
            <ArrowRight className='w-4 h-4' />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
