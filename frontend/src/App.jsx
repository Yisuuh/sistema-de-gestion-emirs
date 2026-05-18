import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmProvider } from './lib/confirm'

// Layouts — pequeños, siempre necesarios (eager)
import MainLayout from './layouts/MainLayout'
import AuthLayout from './layouts/AuthLayout'

// Páginas — lazy para code splitting por ruta
const Login        = lazy(() => import('./pages/auth/Login'))
const Dashboard    = lazy(() => import('./pages/Dashboard'))
const Inventario   = lazy(() => import('./pages/inventario/Inventario'))
const Adeudos      = lazy(() => import('./pages/inventario/Adeudos'))
const Ventas       = lazy(() => import('./pages/ventas/Ventas'))
const Caja         = lazy(() => import('./pages/caja/Caja'))
const Clientes     = lazy(() => import('./pages/clientes/Clientes'))
const Notificaciones = lazy(() => import('./pages/notificaciones/Notificaciones'))
const Nomina       = lazy(() => import('./pages/nomina/Nomina'))
const Gastos       = lazy(() => import('./pages/gastos/Gastos'))
const Facturacion  = lazy(() => import('./pages/facturacion/Facturacion'))
const Reportes     = lazy(() => import('./pages/reportes/Reportes'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,    // 2 min sin re-fetch
      gcTime: 1000 * 60 * 5,       // 5 min caché inactiva
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

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
      <ConfirmProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
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
        </Suspense>
      </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  )
}

export default App
