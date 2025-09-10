import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/toast';
import { NavigationTransition, AnimatedPage } from './components/PageTransition';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Setup from './pages/Setup';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Guilds from './pages/Guilds';
import Commands from './pages/Commands';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import LoadingShowcase from './components/LoadingShowcase';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <NavigationTransition>
            <Routes>
              {/* Public routes */}
              <Route
                path='/'
                element={
                  <AnimatedPage animation='fade'>
                    <Onboarding />
                  </AnimatedPage>
                }
              />
              <Route
                path='/onboarding'
                element={
                  <AnimatedPage animation='fade'>
                    <Onboarding />
                  </AnimatedPage>
                }
              />
              <Route
                path='/login'
                element={
                  <AnimatedPage animation='scale'>
                    <Login />
                  </AnimatedPage>
                }
              />

              {/* Setup route - protected but accessible after login */}
              <Route
                path='/setup'
                element={
                  <ProtectedRoute>
                    <AnimatedPage animation='slide'>
                      <Setup />
                    </AnimatedPage>
                  </ProtectedRoute>
                }
              />

              {/* Protected routes */}
              <Route
                path='/dashboard'
                element={
                  <ProtectedRoute>
                    <Layout>
                      <AnimatedPage animation='fade'>
                        <Dashboard />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path='/users'
                element={
                  <ProtectedRoute requiredPermissions={['ManageGuild']}>
                    <Layout>
                      <AnimatedPage animation='slide'>
                        <Users />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path='/guilds'
                element={
                  <ProtectedRoute requiredPermissions={['ManageGuild']}>
                    <Layout>
                      <AnimatedPage animation='slide'>
                        <Guilds />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path='/commands'
                element={
                  <ProtectedRoute>
                    <Layout>
                      <AnimatedPage animation='fade'>
                        <Commands />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path='/analytics'
                element={
                  <ProtectedRoute requiredPermissions={['ManageGuild']}>
                    <Layout>
                      <AnimatedPage animation='scale'>
                        <Analytics />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path='/settings'
                element={
                  <ProtectedRoute requiredPermissions={['Administrator']}>
                    <Layout>
                      <AnimatedPage animation='slide'>
                        <Settings />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path='/showcase'
                element={
                  <ProtectedRoute>
                    <Layout>
                      <AnimatedPage animation='scale'>
                        <LoadingShowcase />
                      </AnimatedPage>
                    </Layout>
                  </ProtectedRoute>
                }
              />

              {/* Catch all - redirect to dashboard */}
              <Route path='*' element={<Navigate to='/dashboard' replace />} />
            </Routes>
          </NavigationTransition>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
