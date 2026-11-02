import { useState, useMemo, useEffect } from 'react'
import AlarmaModal from '../../components/AlarmaModal'
import { coincideProductoInteligente, detectarMedidaFormateada } from '../../lib/medidaUtils'

const fmtMXN = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function POSRescateModal({
  isOpen,
  onClose,
  rescate,
  serviciosCatalogo = [],
  productosCatalogo = [],
  onProcesarCobro,
  isSubmitting,
}) {
  // Flujo en 2 pasos: 'conceptos' | 'cobro'
  const [pasoActual, setPasoActual] = useState('conceptos')

  // Items en la orden
  const [items, setItems] = useState(() => {
    if (rescate?.detalles && rescate.detalles.length > 0) {
      return rescate.detalles
        .filter(d => !d.es_traslado && !((d.descripcion || '').toLowerCase().includes('traslado') || (d.descripcion || '').toLowerCase().includes('desplazamiento')))
        .map(d => ({
          id: d.id || Math.random().toString(),
          servicio_id: d.servicio || d.servicio_id || null,
          producto_id: d.producto || d.producto_id || null,
          descripcion: d.descripcion,
          precio: parseFloat(d.precio_unitario || d.precio_base || d.precio || 0),
          cantidad: parseInt(d.cantidad || 1),
        }))
    }
    return []
  })

  // Sincronizar items al abrir o cambiar rescate
  useEffect(() => {
    if (isOpen && rescate?.detalles && rescate.detalles.length > 0) {
      setItems(
        rescate.detalles
          .filter(d => !d.es_traslado && !((d.descripcion || '').toLowerCase().includes('traslado') || (d.descripcion || '').toLowerCase().includes('desplazamiento')))
          .map(d => ({
            id: d.id || Math.random().toString(),
            servicio_id: d.servicio || d.servicio_id || null,
            producto_id: d.producto || d.producto_id || null,
            descripcion: d.descripcion,
            precio: parseFloat(d.precio_unitario || d.precio_base || d.precio || 0),
            cantidad: parseInt(d.cantidad || 1),
          }))
      )
    } else if (isOpen && (!rescate?.detalles || rescate.detalles.length === 0)) {
      setItems([])
    }
    if (isOpen) {
      setPasoActual('conceptos')
      if (rescate?.costo_traslado) {
        setCostoTraslado(String(rescate.costo_traslado))
      }
    }
  }, [isOpen, rescate])

  // Búsqueda y categoría en Paso 1
  const [tabCatalogo, setTabCatalogo] = useState('servicios') // 'servicios' | 'productos'
  const [busqueda, setBusqueda] = useState('')

  // Pagos y Totales
  const [metodoPago, setMetodoPago] = useState('efectivo') // 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mixto'
  const [montoEfectivo, setMontoEfectivo] = useState('')
  const [montoElectronico, setMontoElectronico] = useState('')
  const [descuento, setDescuento] = useState(0)
  const [costoTraslado, setCostoTraslado] = useState(() => {
    return rescate?.costo_traslado ? String(rescate.costo_traslado) : '0.00'
  })
  const [numReferencia, setNumReferencia] = useState('')
  const [alarma, setAlarma] = useState({ isOpen: false, titulo: '', mensaje: '', tipo: 'warning' })
  const [redondearCentavos, setRedondearCentavos] = useState(false)
  const [clabeCopiada, setClabeCopiada] = useState(false)

  // Totales
  const costoTrasladoNum = parseFloat(costoTraslado || 0)

  const subtotalServiciosYProductos = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
  }, [items])

  const subtotal = useMemo(() => {
    return subtotalServiciosYProductos + costoTrasladoNum
  }, [subtotalServiciosYProductos, costoTrasladoNum])

  const total = useMemo(() => {
    const raw = Math.max(0, subtotal - parseFloat(descuento || 0))
    return redondearCentavos ? Math.round(raw) : raw
  }, [subtotal, descuento, redondearCentavos])

  const efectivoNum = parseFloat(montoEfectivo || 0)
  const electronicoNum = parseFloat(montoElectronico || 0)

  // Cálculo de cambio o faltante
  const cambio = useMemo(() => {
    if (metodoPago === 'efectivo') {
      return Math.max(0, efectivoNum - total)
    }
    return 0
  }, [metodoPago, efectivoNum, total])

  const faltanteEfectivo = useMemo(() => {
    if (metodoPago === 'efectivo') {
      return Math.max(0, total - efectivoNum)
    }
    if (metodoPago === 'mixto') {
      return Math.max(0, total - (efectivoNum + electronicoNum))
    }
    return 0
  }, [metodoPago, efectivoNum, electronicoNum, total])

  // Al pasar a cobrar, si montoEfectivo está vacío sugerir cobro exacto
  const handleIrACobro = () => {
    if (items.length === 0 && costoTrasladoNum <= 0) {
      setAlarma({
        isOpen: true,
        titulo: 'Faltan Conceptos a Cobrar',
        mensaje: 'Debes agregar al menos un servicio, llanta o costo de traslado para continuar al cobro.',
        tipo: 'warning',
      })
      return
    }
    if (!montoEfectivo || parseFloat(montoEfectivo) === 0) {
      setMontoEfectivo(total.toString())
    }
    if (metodoPago === 'mixto' && !montoElectronico) {
      const efec = parseFloat(montoEfectivo) || 0
      setMontoElectronico(Math.max(0, total - efec).toString())
    }
    setPasoActual('cobro')
  }

  // Manejo de Items
  const handleAddServicio = (serv) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.servicio_id === serv.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx].cantidad += 1
        return next
      }
      return [...prev, {
        id: 'serv-' + serv.id,
        servicio_id: serv.id,
        producto_id: null,
        descripcion: serv.nombre,
        precio: parseFloat(serv.precio_base ?? serv.precio ?? 0),
        cantidad: 1,
      }]
    })
  }

  const handleAddProducto = (prod) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.producto_id === prod.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx].cantidad += 1
        return next
      }
      const desc = `${prod.marca_nombre || prod.marca?.nombre || ''} ${prod.modelo || ''} ${prod.medida || ''}`.trim() || prod.descripcion
      return [...prev, {
        id: 'prod-' + prod.id,
        servicio_id: null,
        producto_id: prod.id,
        descripcion: desc,
        precio: parseFloat(prod.precio_venta || prod.precio || 0),
        cantidad: 1,
      }]
    })
  }

  const handleUpdateCantidad = (id, delta) => {
    setItems(prev => {
      return prev.map(item => {
        if (item.id === id) {
          const nueva = item.cantidad + delta
          return nueva > 0 ? { ...item, cantidad: nueva } : null
        }
        return item
      }).filter(Boolean)
    })
  }

  const handleRemoveItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  // Teclado cajero ATM (3 columnas)
  const handleKeypadPress = (val) => {
    let next = montoEfectivo

    if (val === 'C') {
      next = ''
    } else if (val === 'backspace') {
      next = next.slice(0, -1)
    } else if (val === '.') {
      if (!next.includes('.')) next = next ? next + '.' : '0.'
    } else if (val === '00') {
      if (next && next !== '0') next = next + '00'
      else next = '0'
    } else {
      next = next === '0' ? val : next + val
    }

    setMontoEfectivo(next)
    if (metodoPago === 'mixto') {
      const valEfec = parseFloat(next || 0)
      setMontoElectronico(Math.max(0, total - valEfec).toString())
    }
  }

  // Billetes rápidos en 1 toque
  const handleFastAmount = (amount) => {
    if (amount === 'exact') {
      setMontoEfectivo(total.toString())
      if (metodoPago === 'mixto') {
        setMontoElectronico('0')
      }
    } else if (typeof amount === 'number') {
      // Si el número es 200, 500, 1000 es fijar denominación directa
      // Si viene con prefijo suma (100 o 200 adicional)
      setMontoEfectivo(amount.toString())
      if (metodoPago === 'mixto') {
        setMontoElectronico(Math.max(0, total - amount).toString())
      }
    }
  }

  const handleAddAmount = (addVal) => {
    const current = parseFloat(montoEfectivo || 0)
    const next = current + addVal
    setMontoEfectivo(next.toString())
    if (metodoPago === 'mixto') {
      setMontoElectronico(Math.max(0, total - next).toString())
    }
  }

  const handleCopiarClabe = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText('014910605635788786')
      setClabeCopiada(true)
      setTimeout(() => setClabeCopiada(false), 2500)
    }
  }

  // Submit cobro
  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    if (items.length === 0 && costoTrasladoNum <= 0) {
      setAlarma({
        isOpen: true,
        titulo: 'Faltan Conceptos a Cobrar',
        mensaje: 'Debes agregar al menos un servicio, llanta o costo de traslado para cobrar el rescate.',
        tipo: 'warning',
      })
      return
    }

    if (metodoPago === 'efectivo' && efectivoNum < total) {
      setAlarma({
        isOpen: true,
        titulo: 'Monto Insuficiente',
        mensaje: `El monto recibido ($${fmtMXN(efectivoNum)}) es menor al total a cobrar ($${fmtMXN(total)}). Faltan $${fmtMXN(faltanteEfectivo)} MXN.`,
        tipo: 'warning',
      })
      return
    }

    if (metodoPago === 'mixto' && (efectivoNum + electronicoNum) < total) {
      setAlarma({
        isOpen: true,
        titulo: 'Monto Mixto Insuficiente',
        mensaje: `La suma de efectivo y electrónico ($${fmtMXN(efectivoNum + electronicoNum)}) no cubre el total de $${fmtMXN(total)} MXN.`,
        tipo: 'warning',
      })
      return
    }

    let tipoTarjetaFinal = null
    let metodoFinal = metodoPago
    if (metodoPago === 'debito') {
      metodoFinal = 'tarjeta'
      tipoTarjetaFinal = 'debito'
    } else if (metodoPago === 'credito') {
      metodoFinal = 'tarjeta'
      tipoTarjetaFinal = 'credito'
    }

    const payload = {
      costo_traslado: costoTrasladoNum,
      detalles: items.map(i => ({
        servicio_rescate: i.servicio_id,
        producto: i.producto_id,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precio,
        subtotal: i.precio * i.cantidad,
      })),
      subtotal,
      descuento: parseFloat(descuento || 0),
      total,
      metodo_pago: metodoFinal,
      tipo_tarjeta: tipoTarjetaFinal,
      monto_efectivo: metodoFinal === 'efectivo' ? (parseFloat(montoEfectivo) || total) : (metodoFinal === 'mixto' ? parseFloat(montoEfectivo || 0) : 0),
      monto_electronico: (metodoFinal === 'tarjeta' || metodoFinal === 'transferencia') ? total : (metodoFinal === 'mixto' ? parseFloat(montoElectronico || 0) : 0),
      num_referencia: numReferencia,
    }

    onProcesarCobro(payload)
  }

  const medidaDetectada = useMemo(() => detectarMedidaFormateada(busqueda), [busqueda])

  // Filtrar catálogo
  const filteredServicios = useMemo(() => {
    if (!busqueda) return serviciosCatalogo
    const q = busqueda.toLowerCase()
    return serviciosCatalogo.filter(s => s.nombre.toLowerCase().includes(q))
  }, [serviciosCatalogo, busqueda])

  const filteredProductos = useMemo(() => {
    if (!busqueda) return productosCatalogo
    return productosCatalogo.filter(p => coincideProductoInteligente(p, busqueda))
  }, [productosCatalogo, busqueda])

  if (!isOpen || !rescate) return null

  // Validación de habilitación para botón de cobro en Paso 2
  const esBotonCobroDeshabilitado = isSubmitting ||
    (metodoPago === 'efectivo' && efectivoNum < total) ||
    (metodoPago === 'mixto' && (efectivoNum + electronicoNum) < total)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs">
      <div className="bg-slate-900 text-white rounded-3xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden">
        {/* Header POS */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-500">
              <i className="ri-calculator-line text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Cobro de Rescate:</span>
                <span className="font-mono font-black text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md text-xs border border-red-800/40">
                  {rescate.folio}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {pasoActual === 'conceptos' ? 'Paso 1: Conceptos & Traslado' : 'Paso 2: Cobro & Cambio'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">
                {rescate.cliente_nombre || 'Cliente General'} • {rescate.vehiculo_descripcion || 'Vehículo'} {rescate.medida_llanta ? `(${rescate.medida_llanta})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* PASO 1: CONCEPTOS & DESPLAZAMIENTO */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {pasoActual === 'conceptos' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-y-auto">
              {/* Lado Izquierdo: Catálogo Táctil Rápido (7 cols) */}
              <div className="lg:col-span-7 p-3 sm:p-4 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col space-y-3 bg-slate-900/50">
                {/* Tabs Selector de Servicios vs Llantas */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setTabCatalogo('servicios')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-none justify-center cursor-pointer ${
                        tabCatalogo === 'servicios' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="ri-tools-line text-sm"></i>
                      Servicios de Auxilio
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabCatalogo('productos')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-none justify-center cursor-pointer ${
                        tabCatalogo === 'productos' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <i className="ri-archive-line text-sm"></i>
                      Llantas & Insumos
                    </button>
                  </div>

                  {/* Input Búsqueda rápida */}
                  <div className="flex-1">
                    <div className="relative">
                      <i className="ri-search-line text-slate-500 absolute left-3 top-2.5 text-sm"></i>
                      <input
                        type="text"
                        placeholder="Buscar servicio o medida (ej. 2055516)..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                    {medidaDetectada && (
                      <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-700/60 text-[11px] font-bold text-red-300">
                        <i className="ri-focus-3-line"></i>
                        <span>Medida detectada: {medidaDetectada}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid Táctil de Botones Grandes para Operadores */}
                <div className="flex-1 overflow-y-auto max-h-[360px] sm:max-h-[460px] pr-1">
                  {tabCatalogo === 'servicios' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {filteredServicios.map(serv => (
                        <button
                          key={serv.id}
                          type="button"
                          onClick={() => handleAddServicio(serv)}
                          className="min-h-[72px] p-2.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-red-500/60 active:scale-95 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-xs"
                        >
                          <span className="text-xs font-bold text-slate-200 group-hover:text-white line-clamp-2 leading-tight">
                            {serv.nombre}
                          </span>
                          <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-900">
                            <span className="text-xs font-black font-mono text-emerald-400">
                              ${fmtMXN(serv.precio_base ?? serv.precio ?? 0)}
                            </span>
                            <span className="w-5 h-5 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs group-hover:bg-red-600 group-hover:text-white transition-colors">
                              <i className="ri-add-line"></i>
                            </span>
                          </div>
                        </button>
                      ))}
                      {filteredServicios.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                          <i className="ri-tools-line text-2xl block mb-1 text-slate-600"></i>
                          No hay servicios disponibles
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {filteredProductos.map(prod => (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleAddProducto(prod)}
                          className="min-h-[68px] p-2.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-red-500/60 active:scale-95 transition-all text-left flex flex-col justify-between group cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-red-400">{prod.codigo}</span>
                              <span className="text-[10px] text-slate-400 font-mono">Stock: {prod.stock_actual ?? prod.stock ?? '—'}</span>
                            </div>
                            <p className="text-xs text-slate-200 font-medium truncate mt-0.5">
                              {prod.marca_nombre || prod.marca?.nombre} {prod.medida || ''}
                            </p>
                          </div>
                          <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-900">
                            <span className="text-xs font-black font-mono text-emerald-400">
                              ${fmtMXN(prod.precio_venta || prod.precio)}
                            </span>
                            <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                              <i className="ri-add-line"></i> Agregar
                            </span>
                          </div>
                        </button>
                      ))}
                      {filteredProductos.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                          <i className="ri-archive-line text-2xl block mb-1 text-slate-600"></i>
                          No se encontraron llantas ni insumos
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Lado Derecho: Lista de Items + Traslado (5 cols) */}
              <div className="lg:col-span-5 p-3 sm:p-4 flex flex-col justify-between space-y-3 bg-slate-950">
                {/* Lista de Items Agregados */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="ri-shopping-cart-2-line text-slate-400"></i>
                      <span>Detalle a Cobrar ({items.length})</span>
                    </span>
                    {items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setItems([])}
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer flex items-center gap-1"
                      >
                        <i className="ri-delete-bin-line"></i> Vaciar
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-[220px] sm:max-h-[260px] overflow-y-auto mt-2 pr-1">
                    {items.map(item => (
                      <div key={item.id} className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.descripcion}</p>
                          <p className="text-[11px] font-mono text-emerald-400">${fmtMXN(item.precio)} c/u</p>
                        </div>

                        {/* Stepper cantidad táctil */}
                        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                          <button
                            type="button"
                            onClick={() => handleUpdateCantidad(item.id, -1)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer active:scale-95"
                          >
                            <i className="ri-subtract-line text-xs"></i>
                          </button>
                          <span className="text-xs font-mono font-bold w-6 text-center">{item.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCantidad(item.id, 1)}
                            className="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer active:scale-95"
                          >
                            <i className="ri-add-line text-xs"></i>
                          </button>
                        </div>

                        <span className="font-mono font-bold text-xs text-white min-w-[55px] text-right">
                          ${fmtMXN(item.precio * item.cantidad)}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer transition-colors"
                          title="Eliminar concepto"
                        >
                          <i className="ri-delete-bin-line text-sm"></i>
                        </button>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <div className="py-8 text-center text-slate-600 text-xs">
                        <i className="ri-hand-coin-line text-2xl block mb-1 text-slate-700"></i>
                        Toca un servicio o llanta para agregar
                      </div>
                    )}
                  </div>
                </div>

                {/* Bloque Prominente: Costo de Traslado / Desplazamiento */}
                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="ri-roadster-line text-red-500 text-sm"></i>
                      <span>Costo de Traslado / Desplazamiento</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-red-400">
                      ${fmtMXN(costoTrasladoNum)} MXN
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2 text-slate-500 font-mono text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={costoTraslado}
                        onChange={e => setCostoTraslado(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-xs focus:border-red-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCostoTraslado('0')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer transition-colors"
                      title="Sin costo de traslado"
                    >
                      $0
                    </button>
                  </div>

                  {/* Chips rápidos de traslado (+$150, +$250, +$350, +$500) */}
                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    {[
                      { label: '+$150', val: 150 },
                      { label: '+$250', val: 250 },
                      { label: '+$350', val: 350 },
                      { label: '+$500', val: 500 },
                    ].map(preset => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => {
                          const actual = parseFloat(costoTraslado || 0)
                          setCostoTraslado((actual + preset.val).toString())
                        }}
                        className="py-1.5 rounded-lg bg-slate-950 hover:bg-red-950/60 border border-slate-800 hover:border-red-600/50 text-slate-200 hover:text-white font-mono text-[11px] font-bold active:scale-95 transition-all cursor-pointer text-center"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtotales en Paso 1 */}
                <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                  {subtotalServiciosYProductos > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Servicios & Llantas:</span>
                      <span className="font-mono font-bold">${fmtMXN(subtotalServiciosYProductos)}</span>
                    </div>
                  )}
                  {costoTrasladoNum > 0 && (
                    <div className="flex justify-between text-amber-300">
                      <span>Traslado / Desplazamiento:</span>
                      <span className="font-mono font-bold">+${fmtMXN(costoTrasladoNum)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-900">
                    <span>Subtotal Estimado:</span>
                    <span className="font-mono text-lg text-emerald-400">${fmtMXN(subtotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra Inferior Fija: Botón Primario Continuar al Cobro */}
            <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400 hidden sm:block">
                <span className="font-bold text-white">{items.length} concepto(s)</span> agregados
                {costoTrasladoNum > 0 && ` • Traslado: $${fmtMXN(costoTrasladoNum)}`}
              </div>
              <button
                type="button"
                onClick={handleIrACobro}
                disabled={items.length === 0 && costoTrasladoNum <= 0}
                className="w-full sm:w-auto ml-auto min-h-[52px] px-8 rounded-2xl bg-gradient-to-r from-red-600 to-[#df000a] hover:from-red-500 hover:to-red-600 active:scale-98 disabled:opacity-50 text-white font-black text-base shadow-lg shadow-red-950 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Continuar al Cobro: ${fmtMXN(total)} MXN</span>
                <i className="ri-arrow-right-line text-lg"></i>
              </button>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* PASO 2: COBRO INTELIGENTE & CAMBIO */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {pasoActual === 'cobro' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {/* Barra de Navegación Regresar al Paso 1 */}
            <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={() => setPasoActual('conceptos')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-line text-sm"></i>
                <span>Modificar Conceptos</span>
              </button>
              <div className="text-right text-xs text-slate-400">
                <span className="text-slate-300 font-bold">{items.length} concepto(s)</span>
                {costoTrasladoNum > 0 && ` + Traslado`}
              </div>
            </div>

            {/* Contenedor Principal Paso 2 */}
            <div className="flex-1 p-3 sm:p-5 space-y-4">
              {/* Tarjeta de Resumen: TOTAL A COBRAR EN GRANDE */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-inner flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                    <i className="ri-wallet-3-line text-red-500"></i>
                    <span>Total a Cobrar</span>
                  </span>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-white mt-1">
                    ${fmtMXN(total)}{' '}
                    <span className="text-sm sm:text-base font-bold text-slate-400 font-sans">MXN</span>
                  </div>
                </div>

                {/* Descuento y Redondeo */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800">
                    <input
                      type="checkbox"
                      checked={redondearCentavos}
                      onChange={e => setRedondearCentavos(e.target.checked)}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs text-slate-300 font-medium">Redondear al peso</span>
                  </label>

                  <div className="flex items-center gap-1.5 bg-slate-950/70 px-3 py-1 rounded-xl border border-slate-800 text-xs">
                    <span className="text-slate-400 font-medium">Desc:</span>
                    <span className="font-mono text-slate-400">$</span>
                    <input
                      type="number"
                      min="0"
                      value={descuento}
                      onChange={e => setDescuento(parseFloat(e.target.value || 0))}
                      className="w-14 bg-transparent text-white font-mono font-bold focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Selector de Método de Pago con Remix Icons */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <i className="ri-bank-card-line text-sm"></i>
                  <span>Método de Pago</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'efectivo', label: 'Efectivo', icon: 'ri-money-dollar-circle-line' },
                    { id: 'debito', label: 'Débito', icon: 'ri-bank-card-line' },
                    { id: 'credito', label: 'Crédito', icon: 'ri-bank-card-2-line' },
                    { id: 'transferencia', label: 'Transferencia', icon: 'ri-bank-line' },
                    { id: 'mixto', label: 'Mixto', icon: 'ri-shuffle-line' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetodoPago(m.id)}
                      className={`min-h-[50px] p-2 rounded-2xl text-xs font-bold transition-all text-center cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1.5 shadow-xs ${
                        metodoPago === m.id
                          ? 'bg-red-600 text-white shadow-lg shadow-red-950 border border-red-500 scale-[1.02]'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <i className={`${m.icon} text-base`}></i>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* VISTA 1: EFECTIVO (Billetes Rápidos + Display + ATM 3x4) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {metodoPago === 'efectivo' && (
                <div className="space-y-3 pt-1">
                  {/* Billetes rápidos en 1 toque */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Billetes Rápidos (1 Toque)
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <button
                        type="button"
                        onClick={() => handleFastAmount('exact')}
                        className="min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 border border-slate-700"
                      >
                        <i className="ri-check-double-line text-emerald-400"></i>
                        <span>Cobro Exacto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFastAmount(200)}
                        className="min-h-[46px] rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 font-mono text-sm font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      >
                        $200
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFastAmount(500)}
                        className="min-h-[46px] rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 font-mono text-sm font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      >
                        $500
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFastAmount(1000)}
                        className="min-h-[46px] rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 font-mono text-sm font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      >
                        $1,000
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddAmount(100)}
                        className="min-h-[46px] rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-mono text-xs font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      >
                        +$100
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddAmount(200)}
                        className="min-h-[46px] rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-mono text-xs font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                      >
                        +$200
                      </button>
                    </div>
                  </div>

                  {/* Layout split: Display Digital a la izquierda / Teclado ATM a la derecha */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
                    {/* Display Digital de Alto Contraste (5 cols) */}
                    <div className="md:col-span-5 flex flex-col justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner space-y-4">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Monto Recibido
                        </span>
                        <div className="text-3xl font-black font-mono text-white mt-1">
                          ${fmtMXN(efectivoNum)}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                        {efectivoNum >= total ? (
                          <div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                              Cambio a Devolver
                            </span>
                            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-1 flex items-center gap-2">
                              <i className="ri-money-dollar-box-line"></i>
                              <span>${fmtMXN(cambio)}</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block flex items-center gap-1">
                              <i className="ri-error-warning-line"></i>
                              Monto Insuficiente
                            </span>
                            <div className="text-2xl font-black font-mono text-rose-400 mt-1">
                              Faltan ${fmtMXN(faltanteEfectivo)}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono">
                        Total requerido: ${fmtMXN(total)} MXN
                      </div>
                    </div>

                    {/* Teclado ATM Estándar 3x4 + 00, . (7 cols) */}
                    <div className="md:col-span-7 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                      <div className="grid grid-cols-3 gap-2">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => handleKeypadPress(k)}
                            className="min-h-[50px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-mono text-xl font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center shadow-xs"
                          >
                            {k}
                          </button>
                        ))}

                        {/* Fila 4: C, 0, Retroceso */}
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('C')}
                          className="min-h-[50px] rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 font-mono text-base font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                          title="Borrar todo"
                        >
                          C
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('0')}
                          className="min-h-[50px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-mono text-xl font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('backspace')}
                          className="min-h-[50px] rounded-xl bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/40 text-amber-300 text-xl font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                          title="Borrar último dígito"
                        >
                          <i className="ri-delete-back-2-line"></i>
                        </button>

                        {/* Fila 5: 00 y punto decimal */}
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('00')}
                          className="min-h-[46px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-mono text-base font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center col-span-2"
                        >
                          00
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('.')}
                          className="min-h-[46px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-mono text-xl font-bold active:scale-95 transition-all cursor-pointer flex items-center justify-center"
                        >
                          .
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* VISTA 2: DÉBITO O CRÉDITO (Calculadora Oculta, Mensaje Limpio) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {(metodoPago === 'debito' || metodoPago === 'credito') && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-blue-600/20 text-blue-400">
                      <i className={metodoPago === 'debito' ? 'ri-bank-card-line text-2xl' : 'ri-bank-card-2-line text-2xl'}></i>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">
                        Cobro con Tarjeta de {metodoPago === 'debito' ? 'Débito' : 'Crédito'}
                      </h4>
                      <p className="text-xs text-slate-400">
                        Introduce el monto de <span className="font-mono font-bold text-emerald-400">${fmtMXN(total)} MXN</span> en la terminal bancaria (Clip / Mercado Pago / Bancaria).
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Número de Autorización o Terminal (Opcional):
                    </label>
                    <div className="relative">
                      <i className="ri-hashtag text-slate-500 absolute left-3 top-3 text-sm"></i>
                      <input
                        type="text"
                        placeholder="Ej. AUT-89421 / Terminal 1"
                        value={numReferencia}
                        onChange={e => setNumReferencia(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* VISTA 3: TRANSFERENCIA (Datos Bancarios Santander EmirS) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {metodoPago === 'transferencia' && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-emerald-600/20 text-emerald-400">
                      <i className="ri-bank-line text-2xl"></i>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">
                        Transferencia SPEI Inmediata
                      </h4>
                      <p className="text-xs text-slate-400">
                        Proporciona estos datos al cliente para que realice la transferencia por <span className="font-mono font-bold text-emerald-400">${fmtMXN(total)} MXN</span>:
                      </p>
                    </div>
                  </div>

                  {/* Tarjeta de Datos Bancarios */}
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Banco:</span>
                      <span className="font-bold text-white">Santander</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Beneficiario / Titular:</span>
                      <span className="font-bold text-white">Emir Rosado</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                      <span className="text-slate-400 font-medium">CLABE Interbancaria:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-400 text-sm tracking-wide">
                          014910605635788786
                        </span>
                        <button
                          type="button"
                          onClick={handleCopiarClabe}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                          title="Copiar CLABE al portapapeles"
                        >
                          <i className={clabeCopiada ? 'ri-check-line text-emerald-400' : 'ri-file-copy-line'}></i>
                          <span>{clabeCopiada ? '¡Copiada!' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Clave de Rastreo o Referencia SPEI (Recomendado):
                    </label>
                    <div className="relative">
                      <i className="ri-qr-code-line text-slate-500 absolute left-3 top-3 text-sm"></i>
                      <input
                        type="text"
                        placeholder="Ej. SPEI 20261029 / Folio Banco"
                        value={numReferencia}
                        onChange={e => setNumReferencia(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────────────────────────────────────────────────── */}
              {/* VISTA 4: PAGO MIXTO (Efectivo + Electrónico) */}
              {/* ───────────────────────────────────────────────────────────── */}
              {metodoPago === 'mixto' && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-purple-600/20 text-purple-400">
                      <i className="ri-shuffle-line text-2xl"></i>
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">Pago Mixto Combinado</h4>
                      <p className="text-xs text-slate-400">
                        Cobra una porción en efectivo y el restante con tarjeta o transferencia.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <i className="ri-money-dollar-circle-line text-emerald-400"></i>
                        Parte en Efectivo
                      </span>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={montoEfectivo}
                          onChange={e => {
                            const val = e.target.value
                            setMontoEfectivo(val)
                            const valNum = parseFloat(val || 0)
                            setMontoElectronico(Math.max(0, total - valNum).toString())
                          }}
                          className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-sm focus:border-red-500 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <i className="ri-bank-card-line text-blue-400"></i>
                        Parte Electrónica (Tarjeta / Transf.)
                      </span>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={montoElectronico}
                          onChange={e => setMontoElectronico(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold text-sm focus:border-red-500 focus:outline-none"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Estado de balance mixto */}
                  <div className="flex items-center justify-between text-xs px-2 pt-1">
                    <span className="text-slate-400">
                      Total cubierto: <strong className="text-white">${fmtMXN(efectivoNum + electronicoNum)}</strong> de <strong className="text-white">${fmtMXN(total)}</strong>
                    </span>
                    {(efectivoNum + electronicoNum) < total ? (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <i className="ri-error-warning-line"></i>
                        Faltan ${fmtMXN(faltanteEfectivo)}
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <i className="ri-check-line"></i>
                        Total Cubierto
                      </span>
                    )}
                  </div>

                  <div className="pt-1">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Referencia o Folio Electrónico (Opcional):
                    </label>
                    <input
                      type="text"
                      placeholder="Núm. de autorización o folio SPEI"
                      value={numReferencia}
                      onChange={e => setNumReferencia(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Barra Inferior Fija de Cobro: Botón Gigante */}
            <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex-shrink-0">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={esBotonCobroDeshabilitado}
                className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-red-600 to-[#df000a] hover:from-red-500 hover:to-red-600 active:scale-98 disabled:opacity-50 text-white font-black text-base sm:text-lg shadow-xl shadow-red-950 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <i className={isSubmitting ? 'ri-loader-4-line animate-spin text-xl' : 'ri-check-line text-2xl'}></i>
                <span>
                  {isSubmitting
                    ? 'Procesando Cobro...'
                    : `Cobrar $${fmtMXN(total)} MXN`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Alarma Modal Accesible */}
      <AlarmaModal
        isOpen={alarma.isOpen}
        titulo={alarma.titulo}
        mensaje={alarma.mensaje}
        tipo={alarma.tipo}
        onClose={() => setAlarma(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}
