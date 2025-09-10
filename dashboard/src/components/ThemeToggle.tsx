import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'framer-motion';

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown';
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'button', className = '' }) => {
  const { theme, actualTheme, setTheme, toggleTheme } = useTheme();

  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`}>
        <div className='space-y-1'>
          <button
            onClick={() => setTheme('light')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${
              theme === 'light'
                ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Sun className='w-4 h-4' />
            <span>Claro</span>
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${
              theme === 'dark'
                ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Moon className='w-4 h-4' />
            <span>Escuro</span>
          </button>
          <button
            onClick={() => setTheme('system')}
            className={`w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-lg transition-colors ${
              theme === 'system'
                ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Monitor className='w-4 h-4' />
            <span>Sistema</span>
          </button>
        </div>
      </div>
    );
  }

  const getIcon = () => {
    if (theme === 'system') {
      return <Monitor className='w-4 h-4' />;
    }
    return actualTheme === 'light' ? <Sun className='w-4 h-4' /> : <Moon className='w-4 h-4' />;
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className={`p-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 ${className}`}
      title={`Tema atual: ${theme === 'system' ? 'Sistema' : theme === 'light' ? 'Claro' : 'Escuro'}`}
    >
      <motion.div
        key={theme + actualTheme}
        initial={{ rotate: -180, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {getIcon()}
      </motion.div>
    </motion.button>
  );
};

export default ThemeToggle;
