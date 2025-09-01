import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import {
  Spinner,
  LoadingDots,
  PulseLoader,
  WaveSpinner,
  GrowSpinner,
  OrbitSpinner,
  ScaleSpinner,
  DNASpinner,
  HeartbeatSpinner,
  LoadingOverlay,
  FullPageLoader,
  InlineLoader,
  AnimatedAlert,
  ProgressFeedback,
  StatusBadge,
  LoadingState,
  ShimmerSkeleton,
  EnhancedToastProvider,
  useEnhancedToast,
  InlineNotification,
} from './ui';
import { Play, Pause, RefreshCw } from 'lucide-react';

const LoadingShowcaseContent: React.FC = () => {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showFullPage, setShowFullPage] = useState(false);
  const [progress] = useState(45);
  const [status, setStatus] = useState<'online' | 'offline' | 'busy' | 'away'>('online');
  const { addToast } = useEnhancedToast();

  const handleShowToast = (type: 'success' | 'error' | 'warning' | 'info') => {
    const messages = {
      success: 'Operação realizada com sucesso!',
      error: 'Ocorreu um erro durante a operação.',
      warning: 'Atenção: Verifique os dados inseridos.',
      info: 'Informação importante sobre o sistema.',
    };

    addToast({
      type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      message: messages[type],
      action: {
        label: 'Desfazer',
        onClick: () => console.log('Ação desfeita'),
      },
    });
  };

  const loadingMessages = [
    'Carregando dados do servidor...',
    'Processando informações...',
    'Sincronizando com a API...',
    'Finalizando operação...',
  ];

  return (
    <div className="space-y-8 p-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Componentes de Loading e Feedback</h1>
        <p className="text-muted-foreground">
          Demonstração dos novos componentes visuais aprimorados
        </p>
      </div>

      {/* Spinners Básicos */}
      <Card>
        <CardHeader>
          <CardTitle>Spinners Básicos</CardTitle>
          <CardDescription>
            Componentes de loading tradicionais com diferentes tamanhos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="loading-showcase-grid cols-4 gap-6">
            <div className="text-center space-y-2">
              <Spinner size="sm" />
              <p className="text-xs text-muted-foreground">Spinner SM</p>
            </div>
            <div className="text-center space-y-2">
              <Spinner size="md" />
              <p className="text-xs text-muted-foreground">Spinner MD</p>
            </div>
            <div className="text-center space-y-2">
              <LoadingDots />
              <p className="text-xs text-muted-foreground">Loading Dots</p>
            </div>
            <div className="text-center space-y-2">
              <PulseLoader />
              <p className="text-xs text-muted-foreground">Pulse Loader</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spinners Avançados */}
      <Card>
        <CardHeader>
          <CardTitle>Spinners Avançados</CardTitle>
          <CardDescription>
            Novos componentes de loading com animações criativas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="loading-showcase-grid cols-6 gap-6">
            <div className="text-center space-y-2">
              <WaveSpinner size="md" color="primary" />
              <p className="text-xs text-muted-foreground">Wave</p>
            </div>
            <div className="text-center space-y-2">
              <GrowSpinner size="md" color="success" />
              <p className="text-xs text-muted-foreground">Grow</p>
            </div>
            <div className="text-center space-y-2">
              <OrbitSpinner size="md" color="warning" />
              <p className="text-xs text-muted-foreground">Orbit</p>
            </div>
            <div className="text-center space-y-2">
              <ScaleSpinner size="md" color="error" />
              <p className="text-xs text-muted-foreground">Scale</p>
            </div>
            <div className="text-center space-y-2">
              <DNASpinner size="md" color="secondary" />
              <p className="text-xs text-muted-foreground">DNA</p>
            </div>
            <div className="text-center space-y-2">
              <HeartbeatSpinner size="md" color="primary" />
              <p className="text-xs text-muted-foreground">Heartbeat</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading Overlays */}
      <Card>
        <CardHeader>
          <CardTitle>Loading Overlays</CardTitle>
          <CardDescription>
            Sobreposições de loading para diferentes contextos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <Button
                onClick={() => setShowOverlay(true)}
                variant="outline"
              >
                <Play className="w-4 h-4 mr-2" />
                Mostrar Overlay
              </Button>
              <Button
                onClick={() => setShowFullPage(true)}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Mostrar Full Page
              </Button>
            </div>

            <LoadingOverlay
              isLoading={showOverlay}
              message="Carregando dados..."
            >
              <div className="h-32 bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">
                  Conteúdo que será coberto pelo overlay
                </p>
              </div>
            </LoadingOverlay>

            {showOverlay && (
              <Button
                onClick={() => setShowOverlay(false)}
                size="sm"
                variant="ghost"
              >
                <Pause className="w-4 h-4 mr-2" />
                Parar Overlay
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Inline Loaders */}
      <Card>
        <CardHeader>
          <CardTitle>Inline Loaders</CardTitle>
          <CardDescription>
            Componentes de loading para uso inline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <InlineLoader
              size="sm"
              variant="spinner"
              message="Salvando alterações..."
            />
            <InlineLoader
              size="md"
              variant="dots"
              message="Processando dados..."
            />
            <InlineLoader
              size="lg"
              variant="pulse"
              message="Sincronizando..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress e Status */}
      <Card>
        <CardHeader>
          <CardTitle>Progress e Status</CardTitle>
          <CardDescription>
            Componentes de progresso e indicadores de status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <ProgressFeedback
                value={progress}
                label="Upload de arquivo"
                variant="default"
                showPercentage
              />
              <ProgressFeedback
                value={75}
                label="Processamento"
                variant="success"
                showPercentage
              />
              <ProgressFeedback
                value={30}
                label="Sincronização"
                variant="warning"
                showPercentage
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <StatusBadge status={status} animated />
              <Button
                onClick={() => {
                  const statuses: Array<'online' | 'offline' | 'busy' | 'away'> = ['online', 'offline', 'busy', 'away'];
                  const currentIndex = statuses.indexOf(status);
                  const nextIndex = (currentIndex + 1) % statuses.length;
                  setStatus(statuses[nextIndex]);
                }}
                size="sm"
                variant="outline"
              >
                Alterar Status
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      <Card>
        <CardHeader>
          <CardTitle>Loading State Dinâmico</CardTitle>
          <CardDescription>
            Mensagens de loading que mudam dinamicamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingState messages={loadingMessages} interval={1500} />
        </CardContent>
      </Card>

      {/* Skeleton Loading */}
      <Card>
        <CardHeader>
          <CardTitle>Skeleton Loading</CardTitle>
          <CardDescription>
            Placeholders animados para conteúdo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="loading-showcase-grid cols-3 gap-6">
            <ShimmerSkeleton lines={4} avatar />
            <ShimmerSkeleton lines={3} />
          </div>
        </CardContent>
      </Card>

      {/* Alerts e Notificações */}
      <Card>
        <CardHeader>
          <CardTitle>Alerts e Notificações</CardTitle>
          <CardDescription>
            Componentes de feedback visual para o usuário
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleShowToast('success')}
                variant="outline"
                size="sm"
              >
                Toast Sucesso
              </Button>
              <Button
                onClick={() => handleShowToast('error')}
                variant="outline"
                size="sm"
              >
                Toast Erro
              </Button>
              <Button
                onClick={() => handleShowToast('warning')}
                variant="outline"
                size="sm"
              >
                Toast Aviso
              </Button>
              <Button
                onClick={() => handleShowToast('info')}
                variant="outline"
                size="sm"
              >
                Toast Info
              </Button>
            </div>

            <div className="space-y-3">
              <AnimatedAlert
                type="success"
                title="Sucesso!"
                message="Sua operação foi concluída com êxito."
              />
              <InlineNotification
                type="info"
                title="Informação"
                message="Esta é uma notificação inline para informações importantes."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {showFullPage && (
          <FullPageLoader
            message="Carregando aplicação..."
          />
        )}
    </div>
  );
};

export const LoadingShowcase: React.FC = () => {
  return (
    <EnhancedToastProvider>
      <LoadingShowcaseContent />
    </EnhancedToastProvider>
  );
};

export default LoadingShowcase;