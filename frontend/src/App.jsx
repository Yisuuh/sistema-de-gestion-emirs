import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Layouts
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'

// Pages
import Login from './pages/auth/Login'
import Dashboard from './pages/Dashboard'
import Inventario from './pages/inventario/Inventario'
import Adeudos from './pages/inventario/Adeudos'
import Ventas from './pages/ventas/Ventas'
import Caja from './pages/caja/Caja'
import Clientes from './pages/clientes/Clientes'
import Notificaciones from './pages/notificaciones/Notificaciones'
import Nomina from './pages/nomina/Nomina'
import Gastos from './pages/gastos/Gastos'
import Facturacion from './pages/facturacion/Facturacion'
import Reportes from './pages/reportes/Reportes'

const queryClient = new QueryClient()

// Componente para proteger rutas
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/auth/login" replace />;
  }
  
  return children;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Auth Routes */}
          <Route path="/auth" element={<AuthLayout />}>
            <Route path="login" element={<Login />} />
          </Route>

          {/* Main Routes - Protegidas */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="inventario" element={<Inventario />} />
            <Route path="adeudos" element={<Adeudos />} />
            <Route path="ventas" element={<Ventas />} />
            <Route path="caja" element={<Caja />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="nomina" element={<Nomina />} />
            <Route path="gastos" element={<Gastos />} />
            <Route path="facturacion" element={<Facturacion />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="notificaciones" element={<Notificaciones />} />
          </Route>

          {/* Redirección por defecto */}
          <Route path="*" element={<Navigate to="/auth/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
