import { useEffect, useRef } from 'react'
import { X, AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

export default function AlarmaModal({
  isOpen,
  onClose,
  titulo = 'Aviso del Sistema',
  mensaje = '',
  detalles = null,
  tipo = 'error', // 'error' | 'warning' | 'info' | 'success'
  botonTexto = 'Entendido / Corregir',
}) {
  const btnRef = useRef(null)

  // Cerrar con Escape y enfocar botón al abrir
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    btnRef.current?.focus()
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const config = {
    error: {
      icon: AlertCircle,
      iconBg: 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400',
      btnBg: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-400',
      border: 'border-rose-200 dark:border-rose-900',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
      btnBg: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-400',
      border: 'border-amber-200 dark:border-amber-900',
    },
    success: {
      icon: CheckCircle2,
      iconBg: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400',
      btnBg: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-900',
    },
    info: {
      icon: Info,
      iconBg: 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400',
      btnBg: 'bg-[#df000a] hover:bg-[#b80008] focus:ring-red-400',
      border: 'border-blue-200 dark:border-blue-900',
    },
  }

  const currentConfig = config[tipo] || config.error
  const IconComponent = currentConfig.icon

  // Formatear detalles de error si vienen como objeto o array
  const formattedDetails = Array.isArray(detalles)
    ? detalles
    : detalles && typeof detalles === 'object'
    ? Object.entries(detalles).map(([campo, errores]) => {
        const errorStr = Array.isArray(errores) ? errores.join(', ') : String(errores)
        const campoFmt = campo.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        return `• ${campoFmt}: ${errorStr}`
      })
    : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarma-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-2xl w-full max-w-md p-5 shadow-2xl border ${currentConfig.border} flex flex-col gap-4 relative animate-scaleUp`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón cerrar X accesible */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Cerrar alerta (Esc)"
          title="Cerrar (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3.5 pr-6">
          <div className={`p-3 rounded-xl flex-shrink-0 ${currentConfig.iconBg}`}>
            <IconComponent className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 id="alarma-modal-title" className="font-bold text-base text-gray-900 dark:text-white">
              {titulo}
            </h3>
            {mensaje && (
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {mensaje}
              </p>
            )}
          </div>
        </div>

        {/* Lista de detalles / campos que requieren atención */}
        {formattedDetails && formattedDetails.length > 0 && (
          <div className="bg-gray-50 dark:bg-slate-800/80 rounded-xl p-3 border border-gray-200 dark:border-slate-700 text-xs text-gray-700 dark:text-gray-200 space-y-1 font-mono">
            {formattedDetails.map((det, idx) => (
              <p key={idx} className="leading-snug">{det}</p>
            ))}
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <button
            ref={btnRef}
            type="button"
            onClick={onClose}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md transition-all focus:outline-hidden focus:ring-2 cursor-pointer ${currentConfig.btnBg}`}
          >
            {botonTexto}
          </button>
        </div>
      </div>
    </div>
  )
}
