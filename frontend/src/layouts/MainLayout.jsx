import { Outlet, Link } from 'react-router-dom'
import { Home, Package, ShoppingCart, Wallet, Users, FileText, Settings, LogOut } from 'lucide-react'

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white">
        <div className="p-4">
          <h1 className="text-xl font-bold">Centro Llantero EmirS</h1>
        </div>
        
        <nav className="mt-8">
          <Link to="/dashboard" className="flex items-center px-4 py-3 hover:bg-gray-800">
            <Home className="w-5 h-5 mr-3" />
            Dashboard
          </Link>
          <Link to="/ventas" className="flex items-center px-4 py-3 hover:bg-gray-800">
            <ShoppingCart className="w-5 h-5 mr-3" />
            Punto de Venta
          </Link>
          <Link to="/inventario" className="flex items-center px-4 py-3 hover:bg-gray-800">
            <Package className="w-5 h-5 mr-3" />
            Inventario
          </Link>
          <Link to="/caja" className="flex items-center px-4 py-3 hover:bg-gray-800">
            <Wallet className="w-5 h-5 mr-3" />
            Caja
          </Link>
          <Link to="/clientes" className="flex items-center px-4 py-3 hover:bg-gray-800">
            <Users className="w-5 h-5 mr-3" />
            Clientes
          </Link>
          <Link to="/reportes" className="flex items-center px-4 py-3 hover:bg-gray-800">
            <FileText className="w-5 h-5 mr-3" />
            Reportes
          </Link>
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-800">
          <button className="flex items-center w-full px-4 py-2 hover:bg-gray-800 rounded">
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <Outlet />
      </main>
    </div>
  )
}
