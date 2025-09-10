import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bot, LogIn, Home, Settings, Users, BarChart3 } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

interface NavigationProps {
  variant?: 'onboarding' | 'dashboard' | 'minimal';
  className?: string;
}

const Navigation: React.FC<NavigationProps> = ({ variant = 'minimal', className = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  if (variant === 'onboarding') {
    return (
      <nav
        className={`bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 ${className}`}
      >
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between h-16'>
            <div
              className='flex items-center space-x-3 cursor-pointer'
              onClick={() => navigate('/')}
            >
              <div className='w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center'>
                <Bot className='w-6 h-6 text-white' />
              </div>
              <div>
                <h1 className='text-xl font-bold text-gray-900'>Hawk Esports</h1>
                <p className='text-sm text-gray-600'>Bot Discord</p>
              </div>
            </div>

            <div className='flex items-center space-x-4'>
              <ThemeToggle />
              {!user ? (
                <>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => navigate('/login')}
                    className='text-muted-foreground hover:text-primary transition-colors'
                  >
                    <LogIn className='w-4 h-4 mr-2' />
                    Login
                  </Button>

                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => navigate('/dashboard')}
                    className='border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white transition-all'
                  >
                    Dashboard
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => navigate('/dashboard')}
                    className='text-muted-foreground hover:text-primary transition-colors'
                  >
                    <Home className='w-4 h-4 mr-2' />
                    Dashboard
                  </Button>

                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={logout}
                    className='text-muted-foreground hover:text-destructive transition-colors'
                  >
                    Sair
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  if (variant === 'dashboard') {
    return (
      <nav className={`bg-card shadow-sm border-b border-border ${className}`}>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between h-16'>
            <div className='flex items-center space-x-8'>
              <div
                className='flex items-center space-x-3 cursor-pointer'
                onClick={() => navigate('/dashboard')}
              >
                <div className='w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center'>
                  <Bot className='w-5 h-5 text-white' />
                </div>
                <h1 className='text-lg font-bold text-card-foreground'>Hawk Esports</h1>
              </div>

              <div className='hidden md:flex items-center space-x-1'>
                <Button
                  variant={isActive('/dashboard') ? 'default' : 'ghost'}
                  size='sm'
                  onClick={() => navigate('/dashboard')}
                  className='transition-all'
                >
                  <Home className='w-4 h-4 mr-2' />
                  Dashboard
                </Button>

                <Button
                  variant={isActive('/users') ? 'default' : 'ghost'}
                  size='sm'
                  onClick={() => navigate('/users')}
                  className='transition-all'
                >
                  <Users className='w-4 h-4 mr-2' />
                  Usuários
                </Button>

                <Button
                  variant={isActive('/analytics') ? 'default' : 'ghost'}
                  size='sm'
                  onClick={() => navigate('/analytics')}
                  className='transition-all'
                >
                  <BarChart3 className='w-4 h-4 mr-2' />
                  Analytics
                </Button>

                <Button
                  variant={isActive('/settings') ? 'default' : 'ghost'}
                  size='sm'
                  onClick={() => navigate('/settings')}
                  className='transition-all'
                >
                  <Settings className='w-4 h-4 mr-2' />
                  Configurações
                </Button>
              </div>
            </div>

            <div className='flex items-center space-x-4'>
              <ThemeToggle />
              {user && (
                <div className='flex items-center space-x-3'>
                  <div className='text-sm text-gray-600'>Olá, {user.username}</div>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={logout}
                    className='text-muted-foreground hover:text-destructive transition-colors'
                  >
                    Sair
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Minimal variant
  return (
    <nav className={`bg-card/90 backdrop-blur-sm ${className}`}>
      <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='flex items-center justify-between h-12'>
          <div className='flex items-center space-x-2 cursor-pointer' onClick={() => navigate('/')}>
            <div className='w-6 h-6 bg-gradient-to-br from-purple-600 to-blue-600 rounded flex items-center justify-center'>
              <Bot className='w-4 h-4 text-white' />
            </div>
            <span className='text-sm font-semibold text-card-foreground'>Hawk Esports</span>
          </div>

          <div className='flex items-center space-x-2'>
            <ThemeToggle className='scale-75' />
            <Button
              variant='ghost'
              size='sm'
              onClick={() => navigate('/login')}
              className='text-xs text-muted-foreground hover:text-primary transition-colors'
            >
              Login
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
