import React from 'react'
import { Building2, Calendar, DollarSign, FileText, Hash, X, CreditCard, CheckCircle } from 'lucide-react'

const fmt = (n, d = 2) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function ModalDetallePagoProveedor({ isOpen, onClose, proveedorData, periodo }) {
  if (!isOpen || !proveedorData) return null

  const {
    nombre = 'Proveedor',
    total = 0,
    cantidad = 0,
    pagos = [],
  } = proveedorData

  const promedio = cantidad > 0 ? total / cantidad : (pagos.length > 0 ? total / pagos.length : 0)

  const metodoBadge = (metodo) => {
    const m = (metodo || '').toLowerCase()
    if (m.includes('efectivo')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <i className="ri-money-dollar-circle-line"></i> Efectivo
        </span>
      )
    }
    if (m.includes('transf')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
          <i className="ri-bank-line"></i> Transferencia
        </span>
      )
    }
    if (m.includes('tarjeta')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <i className="ri-bank-card-line"></i> Tarjeta
        </span>
      )
    }
    if (m.includes('cheque')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <i className="ri-file-paper-2-line"></i> Cheque
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1b2032] text-slate-300 border border-white/[0.1]">
        {metodo || 'No especificado'}
      </span>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-pago-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[#161a29] rounded-2xl shadow-2xl border border-white/[0.1] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-white/[0.08] bg-[#0f172a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl shadow-xs">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                  Detalle de Abonos a Proveedor
                </span>
              </div>
              <h3 id="modal-pago-title" className="text-lg sm:text-xl font-black text-white mt-0.5 tracking-tight">
                {nombre}
              </h3>
              {periodo?.inicio && periodo?.fin && (
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Período: <span className="font-semibold text-slate-200">{periodo.inicio}</span> al <span className="font-semibold text-slate-200">{periodo.fin}</span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de KPIs del Proveedor */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 sm:p-5 bg-[#0f172a]/70 border-b border-white/[0.08]">
          <div className="bg-[#1b2032] p-3 rounded-xl border border-amber-500/30 shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Total Liquidado / Abonado</p>
            <p className="text-xl font-black text-white mt-1 font-mono">${fmt(total)} <span className="text-xs font-normal text-slate-400">MXN</span></p>
          </div>
          <div className="bg-[#1b2032] p-3 rounded-xl border border-white/[0.08] shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Transacciones / Pagos</p>
            <p className="text-xl font-black text-white mt-1">{cantidad || pagos.length} <span className="text-xs font-normal text-slate-400">movimientos</span></p>
          </div>
          <div className="bg-[#1b2032] p-3 rounded-xl border border-white/[0.08] shadow-2xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Promedio por Pago</p>
            <p className="text-xl font-black text-white mt-1 font-mono">${fmt(promedio)} <span className="text-xs font-normal text-slate-400">MXN</span></p>
          </div>
        </div>

        {/* Tabla / Lista de Pagos Individuales */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <i className="ri-history-line text-amber-400"></i> Historial de Desembolsos en el Rango
            </h4>
            <span className="text-xs text-slate-400 font-medium">
              {pagos.length} {pagos.length === 1 ? 'registro' : 'registros'} detallados
            </span>
          </div>

          {pagos.length === 0 ? (
            <div className="text-center py-10 bg-[#1b2032] rounded-xl border border-dashed border-white/[0.1] p-6">
              <Building2 className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-200">Sin pagos desglosados en el período</p>
              <p className="text-xs text-slate-400 mt-1">
                El total acumulado refleja los abonos directos registrados en el balance financiero.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.08] shadow-2xs">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#1b2032] text-slate-400 uppercase text-[11px] font-bold tracking-wider border-b border-white/[0.08]">
                  <tr>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">No. Factura</th>
                    <th className="py-2.5 px-3">Método</th>
                    <th className="py-2.5 px-3">Referencia</th>
                    <th className="py-2.5 px-3 text-right">Monto</th>
                    <th className="py-2.5 px-3">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {pagos.map((pago, idx) => (
                    <tr key={pago.id || idx} className="hover:bg-amber-500/[0.06] transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-200 whitespace-nowrap">
                        {pago.fecha_pago || pago.fecha || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-200 whitespace-nowrap">
                        {pago.numero_factura ? (
                          <span className="bg-[#1b2032] border border-white/[0.08] px-2 py-0.5 rounded text-slate-200 font-bold">
                            {pago.numero_factura}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Sin factura</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {metodoBadge(pago.metodo_pago)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {pago.numero_referencia || pago.referencia || <span className="text-slate-500 italic">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400 whitespace-nowrap">
                        ${fmt(pago.monto)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate" title={pago.notas || ''}>
                        {pago.notas || <span className="text-slate-600 italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div className="p-4 border-t border-white/[0.08] bg-[#0f172a] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Información auditada desde el balance general y adeudos a proveedores</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#1b2032] hover:bg-slate-800 border border-white/[0.12] text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
