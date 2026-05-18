import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  Home, Package, ShoppingCart, Wallet, Users, FileText,
  LogOut, CreditCard, Bell, Menu, X, Banknote, Receipt, TrendingDown,
} from 'lucide-react'

const NAV_SECTIONS = [
  {
    label: 'Operaciones',
    links: [
      { to: '/dashboard',  icon: Home,         label: 'Dashboard' },
      { to: '/ventas',     icon: ShoppingCart,  label: 'Punto de Venta' },
      { to: '/caja',       icon: Wallet,        label: 'Caja' },
    ],
  },
  {
    label: 'Inventario',
    links: [
      { to: '/inventario', icon: Package,   label: 'Inventario' },
      { to: '/adeudos',    icon: CreditCard, label: 'Adeudos Prov.' },
    ],
  },
  {
    label: 'Clientes',
    links: [
      { to: '/clientes', icon: Users,    label: 'Clientes' },
      { to: '/nomina',   icon: Banknote, label: 'Nómina' },
    ],
  },
  {
    label: 'Finanzas',
    links: [
      { to: '/gastos',      icon: TrendingDown, label: 'Gastos' },
      { to: '/facturacion', icon: Receipt,      label: 'Facturación' },
      { to: '/reportes',    icon: FileText,     label: 'Reportes' },
    ],
  },
  {
    label: 'Sistema',
    links: [
      { to: '/notificaciones', icon: Bell, label: 'Notificaciones' },
    ],
  },
]

export default function MainLayout() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const [open, setOpen] = useState(false)
  const username   = localStorage.getItem('username') || 'Usuario'
  const initial    = username.charAt(0).toUpperCase()

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('username')
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--c-bg)' }}>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 z-30 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{
          background: 'var(--c-sidebar)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Brand header */}
        <div
          className="px-4 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center font-display font-black text-white tracking-tight"
              style={{
                background: 'var(--c-red)',
                boxShadow: '0 0 14px rgba(223,0,10,0.40)',
                fontSize: '13px',
                letterSpacing: '-0.01em',
              }}
            >
              ES
            </div>
            <div className="min-w-0">
              <p
                className="text-white font-display font-bold leading-tight"
                style={{ fontSize: '15px', letterSpacing: '0.01em' }}
              >
                Centro Llantero
                <span style={{ color: 'var(--c-red)' }}> EmirS</span>
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>
                {username}
              </p>
            </div>
          </div>
          <button
            className="md:hidden rounded-lg p-1 transition-colors"
            style={{ color: 'var(--c-text-3)' }}
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-hide px-3 py-4 space-y-5">
          {NAV_SECTIONS.map(({ label, links }) => (
            <div key={label}>
              <p
                className="px-2 mb-1.5 font-display font-semibold uppercase"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.13em',
                  color: 'var(--c-text-3)',
                }}
              >
                {label}
              </p>
              <div className="space-y-0.5">
                {links.map(({ to, icon: Icon, label: linkLabel }) => {
                  const isActive =
                    location.pathname === to ||
                    (to !== '/dashboard' && location.pathname.startsWith(to))
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setOpen(false)}
                      className={`nav-link${isActive ? ' active' : ''}`}
                    >
                      <Icon
                        className="w-4 h-4 flex-shrink-0"
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                      <span className="truncate">{linkLabel}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — user + logout */}
        <div
          className="px-3 py-3 flex-shrink-0 space-y-1"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                font-display font-bold text-white"
              style={{ background: 'var(--c-red)', fontSize: '13px' }}
            >
              {initial}
            </div>
            <span
              className="text-sm font-medium truncate flex-1"
              style={{ color: 'var(--c-text-1)' }}
            >
              {username}
            </span>
          </div>
          <button onClick={handleLogout} className="nav-logout">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ─────────────────────────────────────── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 h-14 z-10 flex items-center px-4"
        style={{
          background: 'var(--c-sidebar)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 1px 0 rgba(223,0,10,0.18)',
        }}
      >
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 mr-3 transition-colors"
          style={{ color: 'var(--c-text-2)' }}
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <p
          className="font-display font-bold text-white"
          style={{ fontSize: '15px', letterSpacing: '0.02em' }}
        >
          Centro Llantero
          <span style={{ color: 'var(--c-red)' }}> EmirS</span>
        </p>
      </header>

      {/* ── Main content ───────────────────────────────────────── */}
      <main
        className="md:ml-72 pt-14 md:pt-0 min-h-screen"
        style={{ background: 'var(--c-bg)' }}
      >
        <Outlet />
      </main>

    </div>
  )
}
