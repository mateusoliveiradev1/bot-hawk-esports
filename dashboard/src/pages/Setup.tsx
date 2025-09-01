import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Users,
  Shield,
  Music,
  Trophy,
  Settings,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Copy,
  ExternalLink,
  AlertCircle,
  Sparkles,
  Zap,
  Crown,
  Play,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import Navigation from '../components/Navigation';

interface SetupStep {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  content: React.ReactNode;
}

const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [botAdded, setBotAdded] = useState(false);
  // Server selection removed - not currently used;
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const markStepComplete = (stepId: number) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };

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

  const steps: SetupStep[] = [
    {
      id: 0,
      title: 'Bem-vindo ao Setup',
      description: 'Vamos configurar o Hawk Esports no seu servidor',
      icon: Sparkles,
      content: (
        <div className="text-center space-y-8">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', duration: 1 }}
            className="relative mx-auto w-32 h-32 bg-gradient-to-br from-purple-600 to-blue-600 rounded-full flex items-center justify-center"
          >
            <Bot className="w-16 h-16 text-white" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 border-4 border-dashed border-purple-300 rounded-full"
            />
          </motion.div>
          
          <div className="space-y-4">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Configuração Inicial
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Em poucos passos, você terá o Hawk Esports funcionando perfeitamente no seu servidor Discord.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50"
            >
              <Bot className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Adicionar Bot</h3>
              <p className="text-sm text-gray-600">Convide o bot para seu servidor</p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50"
            >
              <Settings className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Configurar</h3>
              <p className="text-sm text-gray-600">Personalize as funcionalidades</p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50"
            >
              <Play className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Ativar</h3>
              <p className="text-sm text-gray-600">Comece a usar o bot</p>
            </motion.div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center space-x-3 mb-3">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-900">Tempo estimado: 5 minutos</span>
            </div>
            <p className="text-blue-700 text-sm">
              Este processo é rápido e fácil. Você pode pausar e continuar a qualquer momento.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 1,
      title: 'Adicionar Bot ao Servidor',
      description: 'Convide o Hawk Esports para o seu servidor Discord',
      icon: Bot,
      content: (
        <div className="space-y-8">
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.8 }}
              className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4"
            >
              <Bot className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Adicionar o Bot</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Clique no botão abaixo para abrir o Discord e adicionar o Hawk Esports ao seu servidor.
            </p>
          </div>

          <div className="max-w-md mx-auto space-y-6">
            <Card className="border-2 border-purple-200 bg-purple-50/50">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center space-x-2">
                  <Shield className="w-5 h-5 text-purple-600" />
                  <span>Permissões Necessárias</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Gerenciar mensagens</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Conectar e falar em canais de voz</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Usar comandos de barra</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Gerenciar cargos (opcional)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center space-y-4">
              <Button
                size="lg"
                className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl"
                onClick={() => {
                  window.open('https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_ID&permissions=8&scope=bot%20applications.commands', '_blank');
                  setBotAdded(true);
                  markStepComplete(1);
                }}
              >
                <ExternalLink className="w-5 h-5" />
                <span>Adicionar ao Discord</span>
              </Button>
              
              {botAdded && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center space-x-2 text-green-600"
                >
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Bot adicionado com sucesso!</span>
                </motion.div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Problemas para adicionar?</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>• Certifique-se de ter permissões de administrador no servidor</p>
              <p>• Verifique se o servidor não atingiu o limite de bots</p>
              <p>• Entre em contato conosco se precisar de ajuda</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      title: 'Configuração Inicial',
      description: 'Execute o comando de configuração automática',
      icon: Settings,
      content: (
        <div className="space-y-8">
          <div className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.8 }}
              className="w-20 h-20 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4"
            >
              <Settings className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Configuração Automática</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Execute este comando no seu servidor para configurar automaticamente o Hawk Esports.
            </p>
          </div>

          <div className="max-w-2xl mx-auto space-y-6">
            <Card className="border-2 border-blue-200 bg-blue-50/50">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-blue-600" />
                  <span>Comando de Setup</span>
                </CardTitle>
                <CardDescription>
                  Copie e execute este comando em qualquer canal do seu servidor
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-green-400 flex items-center justify-between">
                  <code className="text-lg">/setup bootstrap</code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard('/setup bootstrap')}
                    className="ml-4 border-gray-600 text-gray-300 hover:bg-gray-800"
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Music className="w-5 h-5 text-purple-600" />
                    <span>Sistema de Música</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">
                    Configuração automática dos canais de música e comandos de reprodução.
                  </p>
                  <Badge variant="secondary">Incluído</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-yellow-600" />
                    <span>Sistema de Níveis</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">
                    Ativação do sistema de XP, níveis e recompensas para membros.
                  </p>
                  <Badge variant="secondary">Incluído</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    <span>Auto Moderação</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">
                    Filtros automáticos de spam, palavrões e proteção contra raids.
                  </p>
                  <Badge variant="secondary">Incluído</Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center space-x-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <span>Mensagens de Boas-vindas</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">
                    Mensagens automáticas para novos membros e sistema de verificação.
                  </p>
                  <Badge variant="secondary">Incluído</Badge>
                </CardContent>
              </Card>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-3">
                <Crown className="w-5 h-5 text-amber-600" />
                <span className="font-medium text-amber-900">Dica Pro</span>
              </div>
              <p className="text-amber-700 text-sm">
                Após executar o comando, você pode personalizar todas as configurações através deste dashboard.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      title: 'Tudo Pronto!',
      description: 'Seu servidor está configurado e pronto para usar',
      icon: CheckCircle,
      content: (
        <div className="text-center space-y-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="relative mx-auto w-32 h-32 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center"
          >
            <CheckCircle className="w-16 h-16 text-white" />
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-green-400/30 rounded-full"
            />
          </motion.div>
          
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-gray-900">
              🎉 Configuração Concluída!
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              O Hawk Esports está agora ativo no seu servidor e pronto para elevar a experiência da sua comunidade.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50 shadow-lg"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Music className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Sistema de Música</h3>
              <p className="text-sm text-gray-600 mb-3">Reproduza música de alta qualidade</p>
              <Badge className="bg-green-100 text-green-800">Ativo</Badge>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50 shadow-lg"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Sistema de Níveis</h3>
              <p className="text-sm text-gray-600 mb-3">XP e rankings para membros</p>
              <Badge className="bg-green-100 text-green-800">Ativo</Badge>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50 shadow-lg"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Auto Moderação</h3>
              <p className="text-sm text-gray-600 mb-3">Proteção automática do servidor</p>
              <Badge className="bg-green-100 text-green-800">Ativo</Badge>
            </motion.div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                onClick={() => navigate('/dashboard')}
              >
                <Settings className="w-6 h-6 mr-2" />
                Acessar Dashboard
              </Button>
              
              <Button 
                size="lg" 
                variant="outline"
                className="border-2 border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                onClick={() => navigate('/settings')}
              >
                <Crown className="w-6 h-6 mr-2" />
                Personalizar
              </Button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Próximos passos recomendados:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="font-medium text-gray-900">Personalize as configurações</p>
                  <p className="text-sm text-gray-600">Ajuste o bot às necessidades do seu servidor</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="font-medium text-gray-900">Explore os comandos</p>
                  <p className="text-sm text-gray-600">Digite <code className="bg-gray-200 px-1 rounded text-xs">/help</code> para ver todos os comandos</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">3</div>
                <div>
                  <p className="font-medium text-gray-900">Configure canais específicos</p>
                  <p className="text-sm text-gray-600">Defina canais para música, logs e boas-vindas</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">4</div>
                <div>
                  <p className="font-medium text-gray-900">Monitore as estatísticas</p>
                  <p className="text-sm text-gray-600">Acompanhe o engajamento através do dashboard</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Navigation */}
      <Navigation variant="minimal" />
      
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -100, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-200/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 100, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
        />
      </div>

      <div className="relative pt-20 pb-12 px-4">
        {/* Progress Bar */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-600">
              Passo {currentStep + 1} de {steps.length}
            </div>
            <div className="text-sm font-medium text-gray-600">
              {Math.round(progress)}% concluído
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div 
              className="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Step Content */}
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-8 md:p-12"
            >
              <div className="text-center mb-8">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center">
                    {React.createElement(steps[currentStep].icon, { className: 'w-6 h-6 text-white' })}
                  </div>
                  <div className="text-left">
                    <h1 className="text-3xl font-bold text-gray-900">{steps[currentStep].title}</h1>
                    <p className="text-gray-600">{steps[currentStep].description}</p>
                  </div>
                </div>
              </div>
              
              <div className="mb-8">
                {steps[currentStep].content}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="max-w-4xl mx-auto mt-8">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Anterior</span>
            </Button>

            {/* Step Indicators */}
            <div className="flex items-center space-x-2">
              {steps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToStep(index)}
                  className={`w-3 h-3 rounded-full transition-all duration-200 ${
                    index === currentStep
                      ? 'bg-purple-600 scale-125'
                      : completedSteps.includes(index)
                      ? 'bg-green-500'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>

            <Button
              onClick={currentStep === steps.length - 1 ? () => navigate('/dashboard') : nextStep}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <span>{currentStep === steps.length - 1 ? 'Finalizar' : 'Próximo'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Setup;