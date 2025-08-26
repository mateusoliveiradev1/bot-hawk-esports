import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Guilds from './pages/Guilds'
import Commands from './pages/Commands'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Onboarding />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/login" element={<Login />} />
        
        {/* Setup route - protected but accessible after login */}
        <Route 
          path="/setup" 
          element={
            <ProtectedRoute>
              <Setup />
            </ProtectedRoute>
          } 
        />
        
        {/* Protected routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/users" 
          element={
            <ProtectedRoute requiredPermissions={['ManageGuild']}>
              <Layout>
                <Users />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/guilds" 
          element={
            <ProtectedRoute requiredPermissions={['ManageGuild']}>
              <Layout>
                <Guilds />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/commands" 
          element={
            <ProtectedRoute>
              <Layout>
                <Commands />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/analytics" 
          element={
            <ProtectedRoute requiredPermissions={['ManageGuild']}>
              <Layout>
                <Analytics />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/settings" 
          element={
            <ProtectedRoute requiredPermissions={['Administrator']}>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          } 
        />
        
        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App