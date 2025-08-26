import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Shield, Users, Activity, ArrowRight, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Handle Discord OAuth callback
  useEffect(() => {
    const code = searchParams.get('code');
    const guildId = searchParams.get('guild_id') || '1409723307489755270'; // Default guild ID

    if (code && !isAuthenticated && !isProcessing) {
      setIsProcessing(true);
      handleDiscordCallback(code, guildId);
    }
  }, [searchParams, isAuthenticated, isProcessing]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleDiscordCallback = async (code: string, guildId: string) => {
    try {
      const success = await login(code, guildId);
      if (success) {
        navigate('/dashboard');
      } else {
        setError('Falha na autenticação. Tente novamente.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Erro interno. Tente novamente mais tarde.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscordLogin = () => {
    // For development, simulate Discord OAuth
    const guildId = '1409723307489755270';
    const mockCode = 'dev-mock-code-' + Date.now();
    
    // In production, redirect to Discord OAuth URL:
    // const discordOAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=identify%20guilds&guild_id=${guildId}`;
    // window.location.href = discordOAuthUrl;
    
    // For development, simulate the callback
    handleDiscordCallback(mockCode, guildId);
  };

  if (isLoading || isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and Title */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-purple-600 rounded-full flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Bot Hawk Esports
          </h2>
          <p className="text-slate-300">
            Dashboard de Administração
          </p>
        </div>

        {/* Features */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold text-white mb-4">Recursos do Dashboard</h3>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-3 text-slate-200">
              <Users className="h-5 w-5 text-purple-400" />
              <span>Gerenciamento de usuários e guilds</span>
            </div>
            <div className="flex items-center space-x-3 text-slate-200">
              <Activity className="h-5 w-5 text-purple-400" />
              <span>Estatísticas em tempo real</span>
            </div>
            <div className="flex items-center space-x-3 text-slate-200">
              <Shield className="h-5 w-5 text-purple-400" />
              <span>Sistema de badges e rankings</span>
            </div>
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Fazer Login</h3>
          
          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <span className="text-red-200 text-sm">{error}</span>
            </div>
          )}

          <Button
            onClick={handleDiscordLogin}
            disabled={isProcessing}
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            {isProcessing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span>Entrar com Discord</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-xs text-slate-400 mt-3 text-center">
            Ao fazer login, você concorda com nossos termos de uso e política de privacidade.
          </p>
        </div>

        {/* Development Notice */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-200 text-sm font-medium">Modo de Desenvolvimento</span>
            </div>
            <p className="text-yellow-200 text-xs mt-1">
              Este é um ambiente de desenvolvimento. A autenticação é simulada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;