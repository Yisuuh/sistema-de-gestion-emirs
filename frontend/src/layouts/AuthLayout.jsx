import { Outlet } from 'react-router-dom'
import { useState } from 'react'

function TireIcon() {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="100" cy="100" r="94" stroke="#df000a" strokeWidth="12" />
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg, i) => (
        <rect key={i} x="96" y="4" width="8" height="14" rx="2" fill="#df000a" transform={`rotate(${deg} 100 100)`} />
      ))}
      <circle cx="100" cy="100" r="72" stroke="#333" strokeWidth="3" />
      <circle cx="100" cy="100" r="58" stroke="#ef8701" strokeWidth="5" fill="#111" />
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <line key={i} x1="100" y1="100" x2="100" y2="46" stroke="#ef8701" strokeWidth="7" strokeLinecap="round" transform={`rotate(${deg} 100 100)`} />
      ))}
      {[0, 72, 144, 216, 288].map((deg, i) => (
        <line key={i} x1="100" y1="100" x2="100" y2="54" stroke="#f6ed00" strokeWidth="2" strokeLinecap="round" transform={`rotate(${deg} 100 100)`} />
      ))}
      <circle cx="100" cy="100" r="18" fill="#ef8701" />
      <circle cx="100" cy="100" r="10" fill="#f6ed00" />
      <circle cx="100" cy="100" r="4" fill="#111" />
    </svg>
  )
}

function LogoOrTire() {
  const [imgError, setImgError] = useState(false)
  if (!imgError) {
    return (
      <img
        src="/images/logo.jpeg"
        alt="Centro Llantero EmirS"
        className="w-full h-full object-contain drop-shadow-2xl"
        onError={() => setImgError(true)}
      />
    )
  }
  return <TireIcon />
}

// Patrón SVG de banda de rodadura para el fondo
const TREAD_PATTERN = `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='0' y='0' width='8' height='40' fill='none' stroke='%23ffffff' stroke-width='0.4' opacity='0.04'/%3E%3Crect x='16' y='0' width='8' height='40' fill='none' stroke='%23ffffff' stroke-width='0.4' opacity='0.04'/%3E%3Crect x='32' y='0' width='8' height='40' fill='none' stroke='%23ffffff' stroke-width='0.4' opacity='0.04'/%3E%3C/svg%3E")`

const FEATURES = [
  { color: '#df000a', text: 'Control de inventario en tiempo real' },
  { color: '#f6ed00', text: 'Punto de venta rápido y confiable' },
  { color: '#ef8701', text: 'Reportes y minutas en PDF' },
]

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-black flex">

      {/* ── Panel izquierdo — branding ── */}
      <div
        className="hidden lg:flex flex-col w-[52%] bg-black border-r border-[#df000a] relative overflow-hidden"
        style={{ backgroundImage: TREAD_PATTERN }}
      >
        {/* Degradado rojo en la esquina inferior */}
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#1a0000] to-transparent pointer-events-none" />
        {/* Círculos decorativos */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full border border-[#df000a] opacity-5" />
        <div className="absolute top-1/2 -right-20 w-72 h-72 rounded-full border border-[#ef8701] opacity-5 -translate-y-1/2" />

        {/* Contenido centrado verticalmente */}
        <div className="flex-1 flex flex-col items-center justify-center px-14 py-12 relative z-10">

          {/* Logo grande — protagonista */}
          <div className="w-72 h-72 mb-8"
            style={{ filter: 'drop-shadow(0 0 32px rgba(223,0,10,0.35))' }}>
            <LogoOrTire />
          </div>

          {/* Tagline */}
          <div className="text-center mb-10">
            <p className="font-display font-semibold text-gray-300" style={{ fontSize: '18px', letterSpacing: '0.05em' }}>Sistema integral de gestión</p>
            <p className="text-gray-600 mt-1" style={{ fontSize: '13px', letterSpacing: '0.12em' }}>VENTAS · INVENTARIO · CAJA · REPORTES</p>
          </div>

          {/* Línea divisora */}
          <div className="w-full flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#df000a] opacity-40" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#df000a]" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#df000a] opacity-40" />
          </div>

          {/* Features */}
          <div className="space-y-4 w-full max-w-xs">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: f.color, boxShadow: `0 0 6px ${f.color}` }} />
                <span className="text-gray-400 text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pie del panel */}
        <div className="relative z-10 px-14 py-5 border-t border-gray-900 flex items-center justify-between">
          <span className="text-xs text-gray-700 uppercase tracking-widest font-bold">EmirS</span>
          <span className="text-xs text-gray-800">v1.0</span>
        </div>
      </div>

      {/* ── Panel derecho — formulario ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-[#080808] relative">
        {/* Acento diagonal sutil en esquina */}
        <div className="absolute top-0 right-0 w-40 h-1 bg-gradient-to-l from-[#df000a] to-transparent opacity-60" />
        <div className="absolute bottom-0 left-0 w-40 h-1 bg-gradient-to-r from-[#df000a] to-transparent opacity-30" />

        {/* Logo móvil */}
        <div className="lg:hidden text-center mb-10">
          <div className="w-32 h-32 mx-auto mb-4">
            <LogoOrTire />
          </div>
          <p className="text-gray-500 text-sm">Sistema de Gestión</p>
        </div>

        <div className="w-full max-w-sm page-in">
          <Outlet />
        </div>

        <p className="mt-12 text-xs text-gray-800 text-center">
          © {new Date().getFullYear()} Centro Llantero EmirS · Todos los derechos reservados
        </p>
      </div>

    </div>
  )
}

