import { useState, useMemo, useEffect } from 'react'
import {
  X,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Building2,
  Check,
  Search,
  Wrench,
  Package,
  Sparkles,
  Calculator,
} from 'lucide-react'
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
  // Items en la orden
  const [items, setItems] = useState(() => {
    if (rescate?.detalles && rescate.detalles.length > 0) {
      return rescate.detalles.map(d => ({
        id: d.id || Math.random().toString(),
        servicio_id: d.servicio || d.servicio_id || null,
        producto_id: d.producto || d.producto_id || null,
        descripcion: d.descripcion,
        precio: parseFloat(d.precio_unitario || d.precio || 0),
        cantidad: parseInt(d.cantidad || 1),
      }))
    }
    return []
  })

  // Sincronizar items al abrir o cambiar rescate
  useEffect(() => {
    if (isOpen && rescate?.detalles && rescate.detalles.length > 0) {
      setItems(rescate.detalles.map(d => ({
        id: d.id || Math.random().toString(),
        servicio_id: d.servicio || d.servicio_id || null,
        producto_id: d.producto || d.producto_id || null,
        descripcion: d.descripcion,
        precio: parseFloat(d.precio_unitario || d.precio || 0),
        cantidad: parseInt(d.cantidad || 1),
      })))
    } else if (isOpen && (!rescate?.detalles || rescate.detalles.length === 0)) {
      setItems([])
    }
  }, [isOpen, rescate])

  // Búsqueda y categoría
  const [tabCatalogo, setTabCatalogo] = useState('servicios') // 'servicios' | 'productos'
  const [busqueda, setBusqueda] = useState('')

  // Pagos
  const [metodoPago, setMetodoPago] = useState('efectivo') // 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'mixto'
  const [montoEfectivo, setMontoEfectivo] = useState('')
  const [montoElectronico, setMontoElectronico] = useState('')
  const [descuento, setDescuento] = useState(0)
  const [numReferencia, setNumReferencia] = useState('')
  const [alarma, setAlarma] = useState({ isOpen: false, titulo: '', mensaje: '', tipo: 'warning' })

  // Teclado numérico activo
  const [campoActivo, setCampoActivo] = useState('efectivo') // 'efectivo' | 'descuento' | 'electronico'
  const [redondearCentavos, setRedondearCentavos] = useState(false)

  // Totales
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
  }, [items])

  const total = useMemo(() => {
    const raw = Math.max(0, subtotal - parseFloat(descuento || 0))
    return redondearCentavos ? Math.round(raw) : raw
  }, [subtotal, descuento, redondearCentavos])

  const efectivoNum = parseFloat(montoEfectivo || 0)
  const cambio = useMemo(() => {
    if (metodoPago === 'efectivo') {
      return Math.max(0, efectivoNum - total)
    }
    return 0
  }, [metodoPago, efectivoNum, total])

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
        precio: parseFloat(serv.precio || 0),
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

  // Teclado táctil
  const handleKeypadPress = (val) => {
    const current = campoActivo === 'efectivo' ? montoEfectivo : (campoActivo === 'descuento' ? String(descuento) : montoElectronico)
    let next = current

    if (val === 'C') {
      next = ''
    } else if (val === 'backspace') {
      next = next.slice(0, -1)
    } else if (val === '.') {
      if (!next.includes('.')) next = next ? next + '.' : '0.'
    } else {
      next = next === '0' ? val : next + val
    }

    if (campoActivo === 'efectivo') setMontoEfectivo(next)
    else if (campoActivo === 'descuento') setDescuento(parseFloat(next || 0))
    else setMontoElectronico(next)
  }

  const handleFastAmount = (amount) => {
    if (amount === 'exact') {
      setMontoEfectivo(total.toString())
    } else {
      const current = parseFloat(montoEfectivo || 0)
      setMontoEfectivo((current + amount).toString())
    }
  }

  // Submit cobro
  const handleSubmit = (e) => {
    e.preventDefault()
    if (items.length === 0) {
      setAlarma({
        isOpen: true,
        titulo: 'Faltan Servicios o Llantas',
        mensaje: 'Debes agregar al menos un servicio o producto para cobrar el rescate.',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs">
      <div className="bg-slate-900 text-white rounded-3xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl border border-slate-800 overflow-hidden">
        {/* Header POS */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-500">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">Cobro de Rescate:</span>
                <span className="font-mono font-black text-red-400 bg-red-950/60 px-2 py-0.5 rounded-md text-xs border border-red-800/40">
                  {rescate.folio}
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
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body Split: Catálogo táctil a la izquierda / Ticket y Cobro a la derecha */}
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
                  <Wrench className="w-3.5 h-3.5" />
                  Servicios de Auxilio
                </button>
                <button
                  type="button"
                  onClick={() => setTabCatalogo('productos')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all flex-1 sm:flex-none justify-center cursor-pointer ${
                    tabCatalogo === 'productos' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  Llantas & Insumos
                </button>
              </div>

              {/* Input Búsqueda rápida */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
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
            <div className="flex-1 overflow-y-auto max-h-[260px] sm:max-h-[360px] pr-1">
              {tabCatalogo === 'servicios' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredServicios.map(serv => (
                    <button
                      key={serv.id}
                      type="button"
                      onClick={() => handleAddServicio(serv)}
                      className="min-h-[64px] sm:min-h-[72px] p-2.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-red-500/60 active:scale-95 transition-all text-left flex flex-col justify-between group cursor-pointer shadow-xs"
                    >
                      <span className="text-xs font-bold text-slate-200 group-hover:text-white line-clamp-2 leading-tight">
                        {serv.nombre}
                      </span>
                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-900">
                        <span className="text-xs font-black font-mono text-emerald-400">
                          ${fmtMXN(serv.precio)}
                        </span>
                        <span className="w-5 h-5 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center text-xs group-hover:bg-red-600 group-hover:text-white transition-colors">
                          +
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredServicios.length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-500 text-xs">
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
                      className="min-h-[60px] p-2.5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-red-500/60 active:scale-95 transition-all text-left flex flex-col justify-between group cursor-pointer"
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
                        <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-md font-bold">
                          Agregar
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredProductos.length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-500 text-xs">
                      No se encontraron llantas
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Teclado numérico táctil en pantalla para móvil */}
            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <i className="ri-keyboard-box-line text-slate-400"></i>
                  <span>Teclado Rápido ({campoActivo === 'efectivo' ? 'Efectivo Recibido' : (campoActivo === 'descuento' ? 'Descuento' : 'Electrónico')})</span>
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setCampoActivo('efectivo')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      campoActivo === 'efectivo' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampoActivo('descuento')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      campoActivo === 'descuento' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Descuento
                  </button>
                </div>
              </div>

              {/* Botones de denominación rápida */}
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => handleFastAmount('exact')}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold active:scale-95 cursor-pointer"
                >
                  Exacto
                </button>
                <button
                  type="button"
                  onClick={() => handleFastAmount(100)}
                  className="py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-bold active:scale-95 cursor-pointer"
                >
                  +$100
                </button>
                <button
                  type="button"
                  onClick={() => handleFastAmount(200)}
                  className="py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-bold active:scale-95 cursor-pointer"
                >
                  +$200
                </button>
                <button
                  type="button"
                  onClick={() => handleFastAmount(500)}
                  className="py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-bold active:scale-95 cursor-pointer"
                >
                  +$500
                </button>
                <button
                  type="button"
                  onClick={() => handleFastAmount(1000)}
                  className="py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-bold active:scale-95 cursor-pointer"
                >
                  +$1K
                </button>
              </div>

              {/* Numeric keypad grid */}
              <div className="grid grid-cols-4 gap-1.5">
                {['1', '2', '3', 'backspace', '4', '5', '6', 'C', '7', '8', '9', '00', '.', '0'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeypadPress(k)}
                    className={`py-2 rounded-xl text-sm font-bold active:scale-95 transition-all cursor-pointer ${
                      k === 'C' ? 'bg-rose-900/60 text-rose-300 border border-rose-800/50 col-span-1' :
                      k === 'backspace' ? 'bg-amber-900/50 text-amber-300 border border-amber-800/50' :
                      'bg-slate-950 hover:bg-slate-800 text-white border border-slate-800'
                    }`}
                  >
                    {k === 'backspace' ? '⌫' : k}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lado Derecho: Lista de Items + Cobro POS (5 cols) */}
          <div className="lg:col-span-5 p-3 sm:p-4 flex flex-col justify-between space-y-4 bg-slate-950">
            {/* Lista de Items Agregados */}
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase">Detalle a Cobrar ({items.length})</span>
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="text-[11px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                  >
                    Vaciar todo
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[160px] sm:max-h-[190px] overflow-y-auto mt-2 pr-1">
                {items.map(item => (
                  <div key={item.id} className="p-2 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{item.descripcion}</p>
                      <p className="text-[11px] font-mono text-emerald-400">${fmtMXN(item.precio)} c/u</p>
                    </div>

                    {/* Stepper cantidad */}
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleUpdateCantidad(item.id, -1)}
                        className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold w-6 text-center">{item.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateCantidad(item.id, 1)}
                        className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="font-mono font-bold text-xs text-white min-w-[50px] text-right">
                      ${fmtMXN(item.precio * item.cantidad)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="py-8 text-center text-slate-600 text-xs">
                    Toca un servicio o llanta para agregar
                  </div>
                )}
              </div>
            </div>

            {/* Selector de Método de Pago Touch */}
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <i className="ri-bank-card-line"></i> Método de Pago
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'efectivo', label: 'Efectivo', icon: 'ri-money-dollar-circle-line' },
                  { id: 'debito', label: 'Débito', icon: 'ri-bank-card-line' },
                  { id: 'credito', label: 'Crédito', icon: 'ri-bank-card-2-line' },
                  { id: 'transferencia', label: 'Transfer.', icon: 'ri-bank-line' },
                  { id: 'mixto', label: 'Mixto', icon: 'ri-shuffle-line' },
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMetodoPago(m.id)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                      metodoPago === m.id
                        ? 'bg-red-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <i className={m.icon}></i>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>

              {/* Campos dinámicos según método */}
              {metodoPago === 'efectivo' && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-400">Recibido: </span>
                    <span className="font-mono font-bold text-emerald-400">${fmtMXN(efectivoNum)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Cambio: </span>
                    <span className="font-mono font-black text-amber-400">${fmtMXN(cambio)}</span>
                  </div>
                </div>
              )}

              {metodoPago === 'transferencia' && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Núm. de Referencia o Rastreo"
                    value={numReferencia}
                    onChange={e => setNumReferencia(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              )}
            </div>

            {/* Totales y Botón de Cobro Gigante */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono font-bold">${fmtMXN(subtotal)}</span>
                </div>
                {descuento > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>Descuento:</span>
                    <span className="font-mono font-bold">-${fmtMXN(descuento)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1 border-t border-slate-900">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={redondearCentavos}
                      onChange={e => setRedondearCentavos(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-red-600 focus:ring-red-500 cursor-pointer bg-slate-900 border-slate-700"
                    />
                    <span className="text-[11px] text-slate-300 font-medium">Redondear centavos al peso</span>
                  </label>
                </div>
                <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-900">
                  <span>TOTAL A COBRAR:</span>
                  <span className="font-mono text-xl text-emerald-400">${fmtMXN(total)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || items.length === 0}
                className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-red-600 to-[#df000a] hover:from-red-500 hover:to-red-600 active:scale-98 disabled:opacity-50 text-white font-black text-base shadow-lg shadow-red-950 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Check className="w-5 h-5" />
                {isSubmitting ? 'Procesando Cobro...' : `Cobrar $${fmtMXN(total)} MXN`}
              </button>
            </div>
          </div>
        </div>
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
