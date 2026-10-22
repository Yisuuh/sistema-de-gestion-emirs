import { useState } from 'react'
import { Printer, Share2, X, CheckCircle2, Download, FileText, Loader2 } from 'lucide-react'

const NEGOCIO = {
  nombre: 'Centro Llantero EmirS',
  slogan: 'Servicio de Rescate & Auxilio Vial 24/7',
  direccion: 'Calle 42 #282 por 45, Fracc. Francisco de Montejo, Mérida Yuc.',
  telefono: '999 371 8502',
}

const fmtMXN = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function TicketRescateModal({ isOpen, onClose, rescate }) {
  const [descargandoPDF, setDescargandoPDF] = useState(false)

  if (!isOpen || !rescate) return null

  // Desempaquetado defensivo del rescate
  const r = rescate?.rescate || rescate || {}

  const rescateId = r.id
  const folio = r.folio || 'RES-00000'
  const clientName = r.nombre_cliente || r.cliente?.nombre || r.cliente_nombre || 'Cliente General'
  const clientPhone = r.telefono_cliente || r.cliente?.telefono || r.cliente_telefono || ''
  const vehicleDesc = r.vehiculo_marca_modelo || r.vehiculo_descripcion || 'Vehículo Particular'
  const operadorName = r.operador_nombre || r.operador?.nombre_completo || r.operador?.nombre || 'Técnico de Rescate'
  const unidadName = r.unidad_nombre || r.unidad?.nombre || 'Unidad Móvil EmirS'
  const rawDate = r.fecha_solicitud || r.fecha || new Date().toISOString()
  const detalles = Array.isArray(r.detalles) ? r.detalles : []
  const subtotal = r.subtotal ?? r.total ?? 0
  const descuento = r.descuento ?? 0
  const total = r.total ?? 0
  const metodo_pago = r.metodo_pago || 'efectivo'
  const tipo_tarjeta = r.tipo_tarjeta || ''
  const monto_efectivo = r.monto_efectivo ?? 0
  const monto_electronico = r.monto_electronico ?? 0
  const num_voucher_efectivo = r.num_voucher_efectivo
  const num_voucher_tarjeta = r.num_voucher_tarjeta
  const num_voucher_transferencia = r.num_voucher_transferencia
  const medida_llanta = r.medida_llanta || ''
  const ubicacion_texto = r.ubicacion_texto || ''

  const fechaObj = new Date(rawDate)
  const fechaFmt = isNaN(fechaObj.getTime())
    ? String(rawDate)
    : fechaObj.toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })

  // Compartir archivo PDF directamente en móviles o descargar limpiamente
  const handleShareOrDownloadPDF = async () => {
    if (!rescateId) {
      window.print()
      return
    }
    setDescargandoPDF(true)
    try {
      const response = await fetch(`/api/rescates/ordenes/${rescateId}/pdf/`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (!response.ok) {
        throw new Error(`Error del servidor (${response.status})`)
      }
      const blob = await response.blob()
      const fileName = `Ticket_Rescate_${folio}.pdf`

      // Si el navegador y dispositivo soportan navigator.share de archivos, compartir directo
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], fileName, { type: 'application/pdf' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Ticket de Rescate ${folio}`,
              text: `Comprobante de auxilio vial ${folio} - Centro Llantero EmirS`,
            })
            return
          }
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return
        }
      }

      // Descarga normal de archivo
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      alert('No se pudo procesar el PDF: ' + e.message)
    } finally {
      setDescargandoPDF(false)
    }
  }

  // Generar mensaje de WhatsApp con formato claro
  const handleShareWhatsApp = () => {
    let cleanPhone = clientPhone.replace(/\D/g, '')
    if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone

    const itemsText = detalles.length > 0
      ? detalles.map(d => `• ${d.cantidad}x ${d.descripcion} - $${fmtMXN(d.subtotal)}`).join('\n')
      : `• 1x Servicio de Rescate Vial - $${fmtMXN(total)}`

    const mensaje = `*CENTRO LLANTERO EMIRS - COMPROBANTE DE RESCATE VIAL*
━━━━━━━━━━━━━━━━━━━━
*Folio:* ${folio}
*Fecha:* ${fechaFmt}
*Cliente:* ${clientName}
*Vehículo:* ${vehicleDesc} ${medida_llanta ? `(${medida_llanta})` : ''}
*Ubicación:* ${ubicacion_texto || 'Servicio en ruta'}
*Técnico:* ${operadorName} (${unidadName})
━━━━━━━━━━━━━━━━━━━━
*DETALLE DEL SERVICIO:*
${itemsText}
━━━━━━━━━━━━━━━━━━━━
*Subtotal:* $${fmtMXN(subtotal || total)} MXN
${Number(descuento) > 0 ? `*Descuento:* -$${fmtMXN(descuento)} MXN\n` : ''}*TOTAL:* $${fmtMXN(total)} MXN
*Forma de Pago:* ${metodo_pago.toUpperCase()} ${tipo_tarjeta ? `(${tipo_tarjeta.toUpperCase()})` : ''}
━━━━━━━━━━━━━━━━━━━━
¡Gracias por confiar en *Centro Llantero EmirS*!
Tel / WhatsApp Taller: 999 371 8502
_Seguridad y confianza en su camino._`

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`

    window.open(waUrl, '_blank')
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs">
      <div className="bg-white text-gray-900 rounded-3xl w-full max-w-sm max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-200">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-gray-950 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <span className="font-bold text-sm block">Ticket de Rescate</span>
              <span className="text-[11px] text-gray-400 font-mono">{folio}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ticket Scrollable Preview (58mm Thermal View con estilos directos para impresión) */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 flex justify-center">
          <div
            id="ticket-rescate-print"
            className="mx-auto"
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: '16px',
              color: '#000000',
              backgroundColor: '#ffffff',
              padding: '10px 12px',
              lineHeight: '1.55',
              width: '100%',
              maxWidth: '340px',
              boxSizing: 'border-box',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', paddingBottom: '6px' }}>
              <p style={{ fontWeight: 'bold', fontSize: '20px', margin: '3px 0' }}>
                {NEGOCIO.nombre.toUpperCase()}
              </p>
              <p style={{ fontSize: '13px', margin: '2px 0', color: '#333' }}>{NEGOCIO.slogan}</p>
              <p style={{ fontSize: '13px', margin: '2px 0', color: '#444' }}>{NEGOCIO.direccion}</p>
              <p style={{ fontSize: '13px', margin: '2px 0', fontWeight: 'bold' }}>Tel: {NEGOCIO.telefono}</p>
            </div>

            <hr style={{ border: 'none', borderTop: '2px dashed #000', margin: '7px 0' }} />

            {/* Folio & Info */}
            <div style={{ textAlign: 'center', margin: '4px 0' }}>
              <p style={{ fontWeight: 'bold', fontSize: '17px', margin: '4px 0', letterSpacing: '0.06em' }}>
                COMPROBANTE DE AUXILIO VIAL
              </p>
              <p style={{ fontWeight: 'bold', fontSize: '21px', margin: '3px 0', letterSpacing: '0.1em' }}>
                {folio}
              </p>
              <p style={{ fontSize: '13px', color: '#333', margin: '2px 0' }}>{fechaFmt}</p>
            </div>

            {/* Vouchers si existen */}
            {(num_voucher_efectivo || num_voucher_tarjeta || num_voucher_transferencia) && (
              <div style={{
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#000',
                background: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                padding: '2px 6px',
                margin: '4px 0',
              }}>
                {num_voucher_efectivo && <p style={{ margin: '1px 0' }}>TICKET EFECTIVO #{num_voucher_efectivo}</p>}
                {num_voucher_tarjeta && <p style={{ margin: '1px 0' }}>VOUCHER TARJETA #{num_voucher_tarjeta} {tipo_tarjeta ? `(${tipo_tarjeta.toUpperCase()})` : ''}</p>}
                {num_voucher_transferencia && <p style={{ margin: '1px 0' }}>TRANSF. #{num_voucher_transferencia}</p>}
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '2px dashed #000', margin: '7px 0' }} />

            {/* Datos de Despacho */}
            <div style={{ margin: '4px 0', fontSize: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                <span style={{ color: '#444', flexShrink: 0 }}>Unidad:</span>
                <span style={{ fontWeight: '600', textAlign: 'right' }}>{unidadName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                <span style={{ color: '#444', flexShrink: 0 }}>Técnico:</span>
                <span style={{ fontWeight: '600', textAlign: 'right' }}>{operadorName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                <span style={{ color: '#444', flexShrink: 0 }}>Cliente:</span>
                <span style={{ fontWeight: '600', textAlign: 'right', wordBreak: 'break-word' }}>{clientName}</span>
              </div>
              {clientPhone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                  <span style={{ color: '#444', flexShrink: 0 }}>Tel:</span>
                  <span style={{ fontWeight: '600', textAlign: 'right' }}>{clientPhone}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                <span style={{ color: '#444', flexShrink: 0 }}>Vehículo:</span>
                <span style={{ fontWeight: '600', textAlign: 'right', wordBreak: 'break-word' }}>{vehicleDesc}</span>
              </div>
              {medida_llanta && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                  <span style={{ color: '#444', flexShrink: 0 }}>Medida Llanta:</span>
                  <span style={{ fontWeight: '700', textAlign: 'right' }}>{medida_llanta}</span>
                </div>
              )}
              {ubicacion_texto && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '2px 0', gap: '6px' }}>
                  <span style={{ color: '#444', flexShrink: 0 }}>Ubicación:</span>
                  <span style={{ fontWeight: '600', textAlign: 'right', wordBreak: 'break-word', fontSize: '14px' }}>{ubicacion_texto}</span>
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '2px dashed #000', margin: '7px 0' }} />

            {/* Items */}
            <div style={{ margin: '4px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', paddingBottom: '3px', gap: '6px' }}>
                <span>CANT / ARTICULO</span>
                <span>IMPORTE</span>
              </div>
              {detalles.length > 0 ? (
                detalles.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0', gap: '6px', fontSize: '15px' }}>
                    <span style={{ flex: 1, wordBreak: 'break-word' }}>
                      {d.cantidad > 1 ? `${d.cantidad}x ` : ''}{d.descripcion}
                    </span>
                    <span style={{ flexShrink: 0, textAlign: 'right', fontWeight: 'bold' }}>
                      ${fmtMXN(d.subtotal)}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0', gap: '6px', fontSize: '15px' }}>
                  <span style={{ flex: 1 }}>1x Servicio de Rescate</span>
                  <span style={{ flexShrink: 0, fontWeight: 'bold' }}>${fmtMXN(total)}</span>
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '2px dashed #000', margin: '7px 0' }} />

            {/* Total */}
            <div style={{ margin: '4px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0', fontSize: '15px' }}>
                <span style={{ color: '#444' }}>Subtotal:</span>
                <span style={{ fontWeight: '600' }}>${fmtMXN(subtotal || total)}</span>
              </div>
              {Number(descuento) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2px 0', fontSize: '15px' }}>
                  <span style={{ color: '#444' }}>Descuento:</span>
                  <span style={{ fontWeight: '600' }}>-${fmtMXN(descuento)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '21px', margin: '4px 0 2px', paddingTop: '4px' }}>
                <span>TOTAL:</span>
                <span>${fmtMXN(total)}</span>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '2px dashed #000', margin: '7px 0' }} />

            {/* Método de Pago */}
            <div style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold', margin: '4px 0' }}>
              <p style={{ margin: '2px 0' }}>
                Forma de pago: {String(metodo_pago).toUpperCase()} {tipo_tarjeta ? `(${String(tipo_tarjeta).toUpperCase()})` : ''}
              </p>
              {metodo_pago === 'efectivo' && Number(monto_efectivo) > Number(total) && (
                <div style={{ fontSize: '14px', fontWeight: 'normal', color: '#333', marginTop: '2px' }}>
                  <p style={{ margin: '1px 0' }}>Efectivo Recibido: ${fmtMXN(monto_efectivo)}</p>
                  <p style={{ margin: '1px 0', fontWeight: 'bold', color: '#000' }}>Cambio: ${fmtMXN(Number(monto_efectivo) - Number(total))}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '13px', color: '#444', paddingBottom: '6px' }}>
              <p style={{ fontWeight: 'bold', margin: '2px 0' }}>{NEGOCIO.cierre || '¡Gracias por su preferencia!'}</p>
              <p style={{ margin: 0 }}>Centro Llantero EmirS</p>
            </div>
          </div>
        </div>

        {/* Modal Actions (Mobile ergonomic buttons) */}
        <div className="p-3 bg-white border-t border-gray-200 flex flex-col gap-2 flex-shrink-0">
          {/* Botón 1: WhatsApp con texto formateado + descarga automática */}
          <button
            onClick={handleShareWhatsApp}
            className="w-full min-h-[46px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <i className="ri-whatsapp-line text-lg"></i>
            Compartir Ticket por WhatsApp
          </button>

          {/* Botones secundarios: Descargar/Compartir PDF e Imprimir */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleShareOrDownloadPDF}
              disabled={descargandoPDF}
              className="min-h-[42px] flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-900 border border-slate-300 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-60"
            >
              {descargandoPDF ? (
                <Loader2 className="w-4 h-4 animate-spin text-red-600" />
              ) : (
                <Share2 className="w-4 h-4 text-red-600" />
              )}
              <span>{descargandoPDF ? 'Procesando...' : 'Compartir / Descargar PDF'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="min-h-[42px] flex items-center justify-center gap-1.5 bg-[#df000a] hover:bg-[#b80008] active:scale-98 text-white rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs shadow-red-900/30"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir (58mm)</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full min-h-[38px] flex items-center justify-center bg-gray-900 hover:bg-black active:scale-98 text-white rounded-xl font-bold text-xs transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
