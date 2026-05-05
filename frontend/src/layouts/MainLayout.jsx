import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { Home, Package, ShoppingCart, Wallet, Users, FileText, LogOut, CreditCard, Bell, Menu, X, Banknote, Receipt, TrendingDown } from 'lucide-react'

const NAV_LINKS = [
  { to: '/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/ventas', icon: ShoppingCart, label: 'Punto de Venta' },
  { to: '/inventario', icon: Package, label: 'Inventario' },
  { to: '/adeudos', icon: CreditCard, label: 'Adeudos Proveedores' },
  { to: '/caja', icon: Wallet, label: 'Caja' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/nomina', icon: Banknote, label: 'Nómina' },
  { to: '/gastos', icon: TrendingDown, label: 'Gastos' },
  { to: '/facturacion', icon: Receipt, label: 'Facturación' },
  { to: '/reportes', icon: FileText, label: 'Reportes' },
  { to: '/notificaciones', icon: Bell, label: 'Notificaciones' },
]

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const username = localStorage.getItem('username') || 'Usuario'

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('username')
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-100">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-gray-900 text-white z-30 flex flex-col transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>

        <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">Centro Llantero EmirS</h1>
            <p className="text-sm text-gray-400 mt-0.5 truncate">Bienvenido, {username}</p>
          </div>
          <button
            className="md:hidden text-gray-400 hover:text-white ml-2 flex-shrink-0"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto scrollbar-hide" style={{scrollbarWidth:'none', msOverflowStyle:'none'}}>
          {NAV_LINKS.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center px-4 py-3 hover:bg-gray-800 transition-colors ${
                location.pathname === to ? 'bg-gray-800 border-l-4 border-blue-500' : ''
              }`}
            >
              <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 hover:bg-gray-800 rounded transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3 flex-shrink-0" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-gray-900 text-white z-10 flex items-center px-4 shadow-lg">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-300 hover:text-white mr-3"
          aria-label="Abrir menú"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-base font-bold truncate">Centro Llantero EmirS</h1>
      </header>

      {/* Main Content */}
      <main className="md:ml-64 pt-14 md:pt-0 min-h-screen">
        <Outlet />
      </main>

    </div>
  )
}
