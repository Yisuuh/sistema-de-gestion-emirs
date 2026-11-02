import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Plus,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Wrench,
  DollarSign,
  Share2,
  Calendar,
  Search,
  Check,
  ChevronRight,
  RotateCw,
  SlidersHorizontal,
  X,
  Radio,
  FileText,
  Building2,
  User,
  ShieldCheck,
  Edit2,
  Trash2,
} from 'lucide-react'
import { apiClient } from '../../lib/apiClient'
import POSRescateModal from './POSRescateModal'
import TicketRescateModal from './TicketRescateModal'
import AlarmaModal from '../../components/AlarmaModal'

const fmtMXN = (n) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ESTADOS = [
  { id: 'todos', label: 'Todos', icon: null, color: 'bg-slate-100 text-slate-700' },
  { id: 'solicitado', label: 'Solicitados', icon: 'ri-alarm-warning-line', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  { id: 'en_camino', label: 'En Camino', icon: 'ri-roadster-line', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  { id: 'en_proceso', label: 'En Proceso', icon: 'ri-tools-line', color: 'bg-purple-100 text-purple-900 border-purple-300' },
  { id: 'completado', label: 'Completados', icon: 'ri-checkbox-circle-line', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
]

export default function Rescates() {
  const queryClient = useQueryClient()
  const [tabPrincipal, setTabPrincipal] = useState('tablero') // 'tablero' | 'nuevo' | 'historial' | 'catalogo' | 'unidades'
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [busqueda, setBusqueda] = useState('')

  // Modales Principales
  const [rescateParaCobrar, setRescateParaCobrar] = useState(null)
  const [rescateParaTicket, setRescateParaTicket] = useState(null)

  // Modales de Catálogos
  const [servicioModal, setServicioModal] = useState({ isOpen: false, item: null })
  const [unidadModal, setUnidadModal] = useState({ isOpen: false, item: null })

  // Modal Alarma / Error accesible
  const [alarma, setAlarma] = useState({ isOpen: false, titulo: '', mensaje: '', detalles: null, tipo: 'error' })

  // ── Queries Principales ──────────────────────────────────────────────────
  const { data: rescates = [], isLoading: loadingRescates } = useQuery({
    queryKey: ['rescates-lista'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/api/rescates/ordenes/')
        return Array.isArray(res) ? res : (res.results || [])
      } catch (e) {
        try {
          const fallbackRes = await apiClient.get('/api/rescates/')
          return Array.isArray(fallbackRes) ? fallbackRes : (fallbackRes.results || [])
        } catch {
          return []
        }
      }
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  })

  const { data: serviciosCatalogo = [] } = useQuery({
    queryKey: ['rescates-servicios'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/api/rescates/tipos-servicio/')
        return Array.isArray(res) ? res : (res.results || [])
      } catch (e) {
        return [
          { id: 1, nombre: 'Parche en Frío / Tubeless en Ruta', precio_base: 250.0, comision_operador: 50.0, activo: true },
          { id: 2, nombre: 'Parche Vulcanizado Caliente en Ruta', precio_base: 400.0, comision_operador: 80.0, activo: true },
          { id: 3, nombre: 'Cambio de Llanta por Refacción', precio_base: 200.0, comision_operador: 40.0, activo: true },
          { id: 4, nombre: 'Paso de Corriente / Batería Auxiliar', precio_base: 300.0, comision_operador: 60.0, activo: true },
          { id: 5, nombre: 'Rescate en Periférico / Autopista', precio_base: 500.0, comision_operador: 100.0, activo: true },
          { id: 6, nombre: 'Inflado con Nitrógeno Móvil', precio_base: 150.0, comision_operador: 30.0, activo: true },
        ]
      }
    },
  })

  const { data: unidadesMoviles = [] } = useQuery({
    queryKey: ['rescates-unidades'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/api/rescates/unidades/')
        return Array.isArray(res) ? res : (res.results || [])
      } catch (e) {
        return [
          { id: 1, numero_economico: 'UNIDAD-01', nombre: 'Ram 700 Blanca', placas: 'YS-4812-B', chofer_habitual_nombre: 'Juan Pérez', activo: true },
          { id: 2, numero_economico: 'UNIDAD-02', nombre: 'Toyota Hilux Roja', placas: 'YT-9931-A', chofer_habitual_nombre: 'Roberto Gómez', activo: true },
        ]
      }
    },
  })

  const { data: empleados = [] } = useQuery({
    queryKey: ['nomina-empleados-activos'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/api/nomina/empleados/?activo=true')
        return Array.isArray(res) ? res : (res.results || [])
      } catch {
        try {
          const res2 = await apiClient.get('/api/nomina/empleados/')
          return Array.isArray(res2) ? res2 : (res2.results || [])
        } catch {
          return []
        }
      }
    },
  })

  const { data: inventarioProductos = [] } = useQuery({
    queryKey: ['inventario-llantas-rescate'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/api/inventario/productos/?activo=true')
        return Array.isArray(res) ? res : (res.results || [])
      } catch (e) {
        return []
      }
    },
  })

  // ── Mutaciones ──────────────────────────────────────────────────────────
  const mutationCambiarEstado = useMutation({
    mutationFn: async ({ id, nuevoEstado }) => {
      return await apiClient.post(`/api/rescates/ordenes/${id}/cambiar-estado/`, { estado: nuevoEstado })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rescates-lista'] })
      queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] })
      queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] })
      queryClient.invalidateQueries({ queryKey: ['reporte-balance-global'] })
    },
    onError: (err) => {
      setAlarma({
        isOpen: true,
        titulo: 'Error al cambiar estado',
        mensaje: err.response?.data?.error || err.message || 'No se pudo actualizar el estado de la orden.',
        detalles: err.response?.data,
        tipo: 'error',
      })
    }
  })

  const mutationCobro = useMutation({
    mutationFn: async ({ id, payload }) => {
      return await apiClient.post(`/api/rescates/ordenes/${id}/cobrar/`, payload)
    },
    onSuccess: (data) => {
      const rescateFinal = data?.rescate || data
      queryClient.invalidateQueries({ queryKey: ['rescates-lista'] })
      queryClient.invalidateQueries({ queryKey: ['reporte-balance-global'] })
      queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] })
      queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] })
      queryClient.invalidateQueries({ queryKey: ['cajas'] })
      queryClient.invalidateQueries({ queryKey: ['historial-cajas'] })
      queryClient.invalidateQueries({ queryKey: ['balance-global'] })
      setRescateParaCobrar(null)
      setRescateParaTicket(rescateFinal)
    },
    onError: (err) => {
      setAlarma({
        isOpen: true,
        titulo: 'Error al procesar cobro',
        mensaje: err.response?.data?.error || err.message || 'No se pudo registrar el pago del rescate.',
        detalles: err.response?.data,
        tipo: 'error',
      })
    }
  })

  // Mutaciones para Servicios
  const mutationGuardarServicio = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        return await apiClient.patch(`/api/rescates/tipos-servicio/${data.id}/`, data)
      }
      return await apiClient.post('/api/rescates/tipos-servicio/', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rescates-servicios'] })
      setServicioModal({ isOpen: false, item: null })
    },
    onError: (err) => {
      setAlarma({
        isOpen: true,
        titulo: 'Error al guardar servicio',
        mensaje: err.response?.data?.detail || err.response?.data?.error || err.message || 'Verifica los campos ingresados.',
        detalles: err.response?.data,
        tipo: 'error',
      })
    }
  })

  const mutationEliminarServicio = useMutation({
    mutationFn: async (id) => {
      return await apiClient.delete(`/api/rescates/tipos-servicio/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rescates-servicios'] })
    },
    onError: (err) => {
      setAlarma({
        isOpen: true,
        titulo: 'No se pudo eliminar el servicio',
        mensaje: err.response?.data?.detail || err.message || 'El servicio podría tener rescates asociados.',
        tipo: 'warning',
      })
    }
  })

  // Mutaciones para Unidades
  const mutationGuardarUnidad = useMutation({
    mutationFn: async (data) => {
      if (data.id) {
        return await apiClient.patch(`/api/rescates/unidades/${data.id}/`, data)
      }
      return await apiClient.post('/api/rescates/unidades/', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rescates-unidades'] })
      setUnidadModal({ isOpen: false, item: null })
    },
    onError: (err) => {
      setAlarma({
        isOpen: true,
        titulo: 'Error al guardar unidad móvil',
        mensaje: err.response?.data?.detail || err.response?.data?.error || err.message || 'Verifica los datos de la unidad.',
        detalles: err.response?.data,
        tipo: 'error',
      })
    }
  })

  const mutationEliminarUnidad = useMutation({
    mutationFn: async (id) => {
      return await apiClient.delete(`/api/rescates/unidades/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rescates-unidades'] })
    },
    onError: (err) => {
      setAlarma({
        isOpen: true,
        titulo: 'No se pudo eliminar la unidad móvil',
        mensaje: err.response?.data?.detail || err.message || 'La unidad podría tener rescates históricos asociados.',
        tipo: 'warning',
      })
    }
  })

  // ── Filtros y KPIs ──────────────────────────────────────────────────────
  const countSolicitados = rescates.filter(r => r.estado === 'solicitado').length
  const countEnCamino = rescates.filter(r => r.estado === 'en_camino').length
  const countEnProceso = rescates.filter(r => r.estado === 'en_proceso').length
  const countCompletados = rescates.filter(r => r.estado === 'completado').length
  const totalCobradoHoy = rescates
    .filter(r => r.estado === 'completado')
    .reduce((sum, r) => sum + parseFloat(r.total || 0), 0)

  const rescatesFiltrados = rescates.filter(r => {
    const matchEstado = filtroEstado === 'todos' || r.estado === filtroEstado
    if (!matchEstado) return false
    if (!busqueda) return true
    const q = busqueda.toLowerCase()
    const cliente = (r.nombre_cliente || r.cliente_nombre || '').toLowerCase()
    const vehiculo = (r.vehiculo_marca_modelo || r.vehiculo_descripcion || '').toLowerCase()
    const medida = (r.medida_llanta || '').toLowerCase()
    const ubicacion = (r.ubicacion_texto || '').toLowerCase()
    const folio = (r.folio || '').toLowerCase()
    const placas = (r.vehiculo_placas || '').toLowerCase()
    return (
      folio.includes(q) ||
      cliente.includes(q) ||
      vehiculo.includes(q) ||
      medida.includes(q) ||
      ubicacion.includes(q) ||
      placas.includes(q)
    )
  })

  // ── Helper para abrir Mapas ─────────────────────────────────────────────
  const handleOpenMap = (rescate) => {
    let url = ''
    const coords = rescate.coordenadas_gps || (rescate.latitud && rescate.longitud ? `${rescate.latitud},${rescate.longitud}` : null)
    if (coords) {
      url = `https://www.google.com/maps/search/?api=1&query=${coords}`
    } else if (rescate.ubicacion_texto) {
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rescate.ubicacion_texto + ', Mérida Yucatán')}`
    } else {
      setAlarma({
        isOpen: true,
        titulo: 'Sin ubicación',
        mensaje: 'Este rescate no tiene coordenadas ni dirección registradas.',
        tipo: 'info',
      })
      return
    }
    window.open(url, '_blank')
  }

  return (
    <div className="p-3 sm:p-5 md:p-6 max-w-7xl mx-auto space-y-5">
      {/* ── HEADER PRINCIPAL Y TABS DE NAVEGACIÓN ─────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-[#df000a] text-white rounded-2xl shadow-md shadow-red-900/30">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                  Rescates & Auxilio Vial
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-red-100 text-[#df000a] border border-red-200">
                  MÓVIL 24/7
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Despacho en ruta, asistencia llantera y cobro POS móvil en campo
              </p>
            </div>
          </div>
        </div>

        {/* Botones / Pestañas de Modo de Vista */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setTabPrincipal('tablero')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              tabPrincipal === 'tablero'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-layout-masonry-line text-base"></i>
            <span>Tablero de Despacho</span>
            {countSolicitados > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setTabPrincipal('nuevo')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              tabPrincipal === 'nuevo'
                ? 'bg-[#df000a] text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-add-line text-base"></i>
            <span>Nuevo Rescate</span>
          </button>

          <button
            onClick={() => setTabPrincipal('historial')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              tabPrincipal === 'historial'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-file-list-3-line text-base"></i>
            <span>Historial</span>
          </button>

          <button
            onClick={() => setTabPrincipal('catalogo')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              tabPrincipal === 'catalogo'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-settings-3-line text-base"></i>
            <span>Servicios</span>
          </button>

          <button
            onClick={() => setTabPrincipal('unidades')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              tabPrincipal === 'unidades'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-truck-line text-base"></i>
            <span>Flotilla</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: TABLERO DESPACHO KANBAN / TARJETAS TÁCTILES ───────────────── */}
      {tabPrincipal === 'tablero' && (
        <div className="space-y-4">
          {/* KPI Bar de Estados en Tiempo Real */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => setFiltroEstado('solicitado')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                filtroEstado === 'solicitado'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-900/20'
                  : 'bg-white border-gray-200 text-gray-800 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-90">Solicitados</span>
                <i className="ri-alarm-warning-line text-lg"></i>
              </div>
              <p className="text-2xl font-black mt-1">{countSolicitados}</p>
            </button>

            <button
              onClick={() => setFiltroEstado('en_camino')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                filtroEstado === 'en_camino'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-900/20'
                  : 'bg-white border-gray-200 text-gray-800 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-90">En Camino</span>
                <i className="ri-roadster-line text-lg"></i>
              </div>
              <p className="text-2xl font-black mt-1">{countEnCamino}</p>
            </button>

            <button
              onClick={() => setFiltroEstado('en_proceso')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                filtroEstado === 'en_proceso'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-900/20'
                  : 'bg-white border-gray-200 text-gray-800 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-90">En Proceso</span>
                <i className="ri-tools-line text-lg"></i>
              </div>
              <p className="text-2xl font-black mt-1">{countEnProceso}</p>
            </button>

            <button
              onClick={() => setFiltroEstado('completado')}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                filtroEstado === 'completado'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-md shadow-emerald-900/20'
                  : 'bg-white border-gray-200 text-gray-800 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider opacity-90">Completados</span>
                <i className="ri-checkbox-circle-line text-lg"></i>
              </div>
              <p className="text-2xl font-black mt-1">{countCompletados}</p>
            </button>
          </div>

          {/* Barra de Búsqueda y Filtros */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por cliente, placas, folio, modelo o dirección..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-200 text-xs sm:text-sm focus:outline-hidden focus:border-[#df000a]"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {ESTADOS.map(st => (
                <button
                  key={st.id}
                  onClick={() => setFiltroEstado(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filtroEstado === st.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de Tarjetas Táctiles de Rescate */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rescatesFiltrados.map((rescate) => {
              const isSolicitado = rescate.estado === 'solicitado'
              const isEnCamino = rescate.estado === 'en_camino'
              const isEnProceso = rescate.estado === 'en_proceso'
              const isCompletado = rescate.estado === 'completado'

              return (
                <div
                  key={rescate.id}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-4 flex flex-col justify-between gap-3 relative overflow-hidden"
                >
                  {/* Barra lateral de estado */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    isSolicitado ? 'bg-amber-500' :
                    isEnCamino ? 'bg-blue-600' :
                    isEnProceso ? 'bg-purple-600' :
                    isCompletado ? 'bg-emerald-600' : 'bg-gray-300'
                  }`} />

                  {/* Header de Tarjeta */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="font-mono font-black text-sm text-gray-900">
                        {rescate.folio}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                        isSolicitado ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        isEnCamino ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        isEnProceso ? 'bg-purple-50 text-purple-800 border-purple-200' :
                        isCompletado ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {rescate.estado}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {rescate.fecha_solicitud
                        ? new Date(rescate.fecha_solicitud).toLocaleDateString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                        : 'Fecha reciente'}
                    </p>
                  </div>

                  {/* Datos del Cliente y Vehículo */}
                  <div className="space-y-2 py-2 border-y border-gray-100 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900 text-sm truncate">
                        {rescate.nombre_cliente || rescate.cliente_nombre || 'Cliente General'}
                      </span>
                      {rescate.telefono_cliente && (
                        <a
                          href={`tel:${rescate.telefono_cliente}`}
                          className="flex items-center gap-1 text-[#df000a] font-bold bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{rescate.telefono_cliente}</span>
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-gray-600">
                      <i className="ri-roadster-line text-sm text-gray-400"></i>
                      <span className="truncate">{rescate.vehiculo_marca_modelo || rescate.vehiculo_descripcion || 'Vehículo sin especificar'}</span>
                      {rescate.vehiculo_placas && (
                        <span className="font-mono text-[10px] font-bold bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                          {rescate.vehiculo_placas}
                        </span>
                      )}
                    </div>

                    {rescate.medida_llanta && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-gray-400">Medida:</span>
                        <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                          {rescate.medida_llanta}
                        </span>
                      </div>
                    )}

                    {/* Ubicación / Botón Mapa Alto Contraste */}
                    <div className="pt-1">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white flex items-center justify-between gap-2 shadow-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <i className="ri-map-pin-2-fill text-emerald-400 text-base flex-shrink-0"></i>
                          <p className="text-xs font-semibold text-slate-100 truncate">
                            {rescate.ubicacion_texto || 'Ubicación registrada'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenMap(rescate)}
                          className="flex-shrink-0 flex items-center gap-1 bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-black text-xs px-2.5 py-1 rounded-lg transition-all shadow-xs cursor-pointer"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Ver Mapa</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Operador y Unidad */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-gray-400" />
                      <span className="font-medium text-gray-700">{rescate.unidad_nombre || 'Unidad Móvil'}</span>
                    </div>
                    <span className="text-gray-400">Téc: {rescate.operador_nombre || 'Por Asignar'}</span>
                  </div>

                  {/* Botones de Acción Táctil según Estado */}
                  <div className="pt-2 border-t border-gray-100">
                    {isSolicitado && (
                      <button
                        onClick={() => mutationCambiarEstado.mutate({ id: rescate.id, nuevoEstado: 'en_camino' })}
                        className="w-full min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-blue-900/20 cursor-pointer"
                      >
                        <i className="ri-roadster-line text-base"></i>
                        Marcar En Camino
                      </button>
                    )}

                    {isEnCamino && (
                      <button
                        onClick={() => mutationCambiarEstado.mutate({ id: rescate.id, nuevoEstado: 'en_proceso' })}
                        className="w-full min-h-[44px] rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-98 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md shadow-purple-900/20 cursor-pointer"
                      >
                        <i className="ri-tools-line text-base"></i>
                        Iniciar Atención en Sitio
                      </button>
                    )}

                    {isEnProceso && (
                      <button
                        onClick={() => setRescateParaCobrar(rescate)}
                        className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-800/30 cursor-pointer"
                      >
                        <i className="ri-money-dollar-circle-line text-lg"></i>
                        Cobrar en POS Móvil
                      </button>
                    )}

                    {isCompletado && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRescateParaTicket(rescate)}
                          className="flex-1 min-h-[40px] rounded-xl bg-gray-900 hover:bg-black active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Ver Ticket
                        </button>
                        <button
                          onClick={() => setRescateParaTicket(rescate)}
                          className="px-3 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                          title="Compartir por WhatsApp"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {rescatesFiltrados.length === 0 && (
              <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-gray-200">
                <Truck className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-600 font-bold text-sm">No hay rescates en este estado</p>
                <p className="text-gray-400 text-xs mt-0.5">Usa &quot;Nuevo Rescate&quot; para despachar una unidad móvil</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: FORMULARIO DE NUEVO RESCATE CON GPS ─────────────────────── */}
      {tabPrincipal === 'nuevo' && (
        <FormularioNuevoRescate
          unidades={unidadesMoviles}
          serviciosCatalogo={serviciosCatalogo}
          empleados={empleados}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['rescates-lista'] })
            queryClient.invalidateQueries({ queryKey: ['reporte-balance-global'] })
            queryClient.invalidateQueries({ queryKey: ['caja-activa-completa'] })
            queryClient.invalidateQueries({ queryKey: ['caja-activa-pos'] })
            queryClient.invalidateQueries({ queryKey: ['cajas'] })
            queryClient.invalidateQueries({ queryKey: ['historial-cajas'] })
            queryClient.invalidateQueries({ queryKey: ['balance-global'] })
            setTabPrincipal('tablero')
          }}
          onCancel={() => setTabPrincipal('tablero')}
          onError={(errPayload) => {
            setAlarma({
              isOpen: true,
              titulo: 'Error al Registrar Rescate',
              mensaje: errPayload.mensaje || 'Verifica los campos obligatorios.',
              detalles: errPayload.detalles,
              tipo: 'error',
            })
          }}
        />
      )}

      {/* ── TAB 3: HISTORIAL COMPLETO DE RESCATES ──────────────────────────── */}
      {tabPrincipal === 'historial' && (
        <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Historial Completo de Rescates Viales</h3>
              <p className="text-xs text-gray-500">Registro histórico de todos los auxilios solicitados, atendidos y concluidos</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1 bg-red-50 text-[#df000a] rounded-full border border-red-200">
                {rescates.length} registros totales
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Folio / Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold">Cliente / Teléfono</th>
                  <th className="px-4 py-3 text-left font-semibold">Vehículo / Medida</th>
                  <th className="px-4 py-3 text-left font-semibold">Unidad / Técnico</th>
                  <th className="px-4 py-3 text-center font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-center font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rescates.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono">
                      <p className="font-bold text-gray-900">{r.folio}</p>
                      <p className="text-[11px] text-gray-400 font-sans">
                        {r.fecha_solicitud
                          ? new Date(r.fecha_solicitud).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : (r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : '—')}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{r.nombre_cliente || r.cliente_nombre || 'Cliente General'}</p>
                      <p className="text-xs text-gray-500">{r.telefono_cliente || r.cliente_telefono || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{r.vehiculo_marca_modelo || r.vehiculo_descripcion || '—'}</p>
                      {r.medida_llanta && (
                        <span className="font-mono text-[11px] text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                          {r.medida_llanta}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-gray-800">{r.unidad_nombre || '—'}</p>
                      <p className="text-[11px] text-gray-500">{r.operador_nombre || 'Sin chofer asignado'}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        r.estado === 'completado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        r.estado === 'en_proceso' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        r.estado === 'en_camino' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        r.estado === 'cancelado' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                      ${fmtMXN(r.total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setRescateParaTicket(r)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 cursor-pointer"
                        title="Ver Comprobante"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rescates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No hay rescates registrados en el historial
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: CATÁLOGO DE SERVICIOS DE AUXILIO ────────────────────────── */}
      {tabPrincipal === 'catalogo' && (
        <TabCatalogoServicios
          servicios={serviciosCatalogo}
          onNuevo={() => setServicioModal({ isOpen: true, item: null })}
          onEditar={(serv) => setServicioModal({ isOpen: true, item: serv })}
          onEliminar={(id) => {
            if (window.confirm('¿Seguro de eliminar este tipo de servicio de rescate?')) {
              mutationEliminarServicio.mutate(id)
            }
          }}
        />
      )}

      {/* ── TAB 5: UNIDADES MÓVILES DE FLOTILLA ────────────────────────────── */}
      {tabPrincipal === 'unidades' && (
        <TabUnidadesMoviles
          unidades={unidadesMoviles}
          empleados={empleados}
          onNueva={() => setUnidadModal({ isOpen: true, item: null })}
          onEditar={(u) => setUnidadModal({ isOpen: true, item: u })}
          onEliminar={(id) => {
            if (window.confirm('¿Seguro de eliminar esta unidad móvil de la flotilla?')) {
              mutationEliminarUnidad.mutate(id)
            }
          }}
        />
      )}

      {/* ── MODAL POS MÓVIL TOUCH-FIRST ───────────────────────────────────── */}
      {rescateParaCobrar && (
        <POSRescateModal
          isOpen={!!rescateParaCobrar}
          onClose={() => setRescateParaCobrar(null)}
          rescate={rescateParaCobrar}
          serviciosCatalogo={serviciosCatalogo}
          productosCatalogo={inventarioProductos}
          onProcesarCobro={(payload) => mutationCobro.mutate({ id: rescateParaCobrar.id, payload })}
          isSubmitting={mutationCobro.isPending}
        />
      )}

      {/* ── MODAL TICKET DE RESCATE 58MM + WHATSAPP ────────────────────────── */}
      {rescateParaTicket && (
        <TicketRescateModal
          isOpen={!!rescateParaTicket}
          onClose={() => setRescateParaTicket(null)}
          rescate={rescateParaTicket}
        />
      )}

      {/* ── MODAL CREAR / EDITAR SERVICIO DE RESCATE ──────────────────────── */}
      {servicioModal.isOpen && (
        <ModalServicioRescate
          isOpen={servicioModal.isOpen}
          initialData={servicioModal.item}
          onClose={() => setServicioModal({ isOpen: false, item: null })}
          onSave={(data) => mutationGuardarServicio.mutate(data)}
          isSaving={mutationGuardarServicio.isPending}
        />
      )}

      {/* ── MODAL CREAR / EDITAR UNIDAD MÓVIL ──────────────────────────────── */}
      {unidadModal.isOpen && (
        <ModalUnidadMovil
          isOpen={unidadModal.isOpen}
          initialData={unidadModal.item}
          empleados={empleados}
          onClose={() => setUnidadModal({ isOpen: false, item: null })}
          onSave={(data) => mutationGuardarUnidad.mutate(data)}
          isSaving={mutationGuardarUnidad.isPending}
        />
      )}

      {/* ── ALARMA MODAL ACCESIBLE ────────────────────────────────────────── */}
      <AlarmaModal
        isOpen={alarma.isOpen}
        titulo={alarma.titulo}
        mensaje={alarma.mensaje}
        detalles={alarma.detalles}
        tipo={alarma.tipo}
        onClose={() => setAlarma(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

// ─── Subcomponente: Formulario de Nuevo Rescate con GPS ───────────────────────
function FormularioNuevoRescate({ unidades = [], serviciosCatalogo = [], empleados = [], onSuccess, onCancel, onError }) {
  const [unidadId, setUnidadId] = useState(unidades[0]?.id ? String(unidades[0].id) : '')
  const [operadorId, setOperadorId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [vehiculo, setVehiculo] = useState('')
  const [medidaLlanta, setMedidaLlanta] = useState('')
  const [ubicacionTexto, setUbicacionTexto] = useState('')
  const [latitud, setLatitud] = useState(null)
  const [longitud, setLongitud] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Al cambiar unidad, sugerir su chofer habitual si lo tiene
  useEffect(() => {
    if (unidadId) {
      const u = unidades.find(unit => String(unit.id) === String(unidadId))
      if (u && u.chofer_habitual) {
        setOperadorId(String(u.chofer_habitual))
      }
    }
  }, [unidadId, unidades])

  // Obtener geolocalización GPS con 1 toque
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      onError?.({ mensaje: 'Tu navegador o dispositivo no soporta geolocalización.' })
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setLatitud(lat)
        setLongitud(lng)
        if (!ubicacionTexto) {
          setUbicacionTexto(`Coordenadas GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        }
        setGpsLoading(false)
      },
      (err) => {
        onError?.({ mensaje: 'No se pudo obtener la ubicación GPS: ' + err.message })
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const toggleServicio = (serv) => {
    setServiciosSeleccionados(prev => {
      const exists = prev.find(s => s.id === serv.id)
      if (exists) return prev.filter(s => s.id !== serv.id)
      return [...prev, serv]
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!clienteNombre.trim()) {
      onError?.({ mensaje: 'Ingresa el nombre del cliente para el rescate.' })
      return
    }
    setIsSubmitting(true)
    try {
      const totalServicios = serviciosSeleccionados.reduce((sum, s) => sum + (parseFloat(s.precio_base || s.precio || 0)), 0)
      const payload = {
        unidad: unidadId ? Number(unidadId) : null,
        operador: operadorId ? Number(operadorId) : null,
        nombre_cliente: clienteNombre.trim(),
        telefono_cliente: clienteTelefono.trim(),
        vehiculo_marca_modelo: vehiculo.trim(),
        medida_llanta: medidaLlanta.trim(),
        ubicacion_texto: ubicacionTexto.trim(),
        coordenadas_gps: latitud && longitud ? `${latitud},${longitud}` : '',
        estado: 'solicitado',
        subtotal: totalServicios,
        total: totalServicios,
        detalles: serviciosSeleccionados.map(s => ({
          servicio_rescate: s.id,
          descripcion: s.nombre,
          cantidad: 1,
          precio_unitario: parseFloat(s.precio_base || s.precio || 0),
          subtotal: parseFloat(s.precio_base || s.precio || 0),
        })),
      }
      await apiClient.post('/api/rescates/ordenes/', payload)
      onSuccess()
    } catch (err) {
      const errorData = err.response?.data
      const errorMsg = errorData?.detail || errorData?.error || err.message || 'Error al guardar la orden de rescate.'
      onError?.({
        mensaje: errorMsg,
        detalles: typeof errorData === 'object' ? errorData : null
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-4 sm:p-6 shadow-xs max-w-2xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-red-50 text-[#df000a]">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-black text-gray-900 text-lg">Nuevo Despacho de Rescate</h2>
            <p className="text-xs text-gray-500">Asigna la unidad móvil, chofer y registra los datos del auxilio</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Selector de Unidad Móvil y Chofer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <i className="ri-truck-line text-[#df000a]"></i> Unidad Móvil
            </label>
            <select
              value={unidadId}
              onChange={e => setUnidadId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium focus:border-[#df000a] focus:ring-1 focus:ring-red-500"
            >
              <option value="">-- Sin unidad asignada --</option>
              {unidades.map(u => (
                <option key={u.id} value={u.id}>
                  {u.numero_economico} - {u.nombre} (Placas: {u.placas || 'S/P'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <i className="ri-user-star-line text-[#df000a]"></i> Técnico / Chofer Asignado
            </label>
            <select
              value={operadorId}
              onChange={e => setOperadorId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium focus:border-[#df000a] focus:ring-1 focus:ring-red-500"
            >
              <option value="">-- Asignar después / Sin chofer --</option>
              {empleados.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre_completo || `${emp.nombre || ''} ${emp.apellido || ''}`.trim() || `Empleado #${emp.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cliente & Teléfono */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-user-line text-gray-500"></i> Nombre del Cliente *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Juan Martín / Dra. Gómez"
              value={clienteNombre}
              onChange={e => setClienteNombre(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-phone-line text-gray-500"></i> Teléfono de Contacto
            </label>
            <input
              type="tel"
              placeholder="Ej. 999 123 4567"
              value={clienteTelefono}
              onChange={e => setClienteTelefono(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>
        </div>

        {/* Vehículo & Medida de Llanta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-roadster-line text-gray-500"></i> Vehículo (Marca / Modelo / Color)
            </label>
            <input
              type="text"
              placeholder="Ej. Nissan Versa Blanco 2021"
              value={vehiculo}
              onChange={e => setVehiculo(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-disc-line text-gray-500"></i> Medida de Llanta Requerida
            </label>
            <input
              type="text"
              placeholder="Ej. 205/55R16 o 185/65R15"
              value={medidaLlanta}
              onChange={e => setMedidaLlanta(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-mono focus:border-[#df000a]"
            />
          </div>
        </div>

        {/* Ubicación con Botón GPS */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <i className="ri-map-pin-user-line text-gray-500"></i> Ubicación del Auxilio
            </label>
            <button
              type="button"
              onClick={handleGetLocation}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 text-xs font-bold text-[#df000a] hover:text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 cursor-pointer"
            >
              <i className="ri-map-pin-user-line"></i>
              {gpsLoading ? 'Obteniendo GPS...' : 'Mi Ubicación GPS'}
            </button>
          </div>
          <textarea
            rows={2}
            placeholder="Dirección, calle por calle, referencias o enlace de maps..."
            value={ubicacionTexto}
            onChange={e => setUbicacionTexto(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
          />
          {latitud && longitud && (
            <p className="text-[11px] text-emerald-600 font-mono mt-1 flex items-center gap-1">
              <i className="ri-check-line font-bold"></i> Coordenadas capturadas: {latitud.toFixed(5)}, {longitud.toFixed(5)}
            </p>
          )}
        </div>

        {/* Servicios Iniciales Requeridos */}
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <i className="ri-tools-line text-gray-500"></i> Servicios de Auxilio Iniciales
          </label>
          <div className="grid grid-cols-2 gap-2">
            {serviciosCatalogo.map(s => {
              const isSelected = serviciosSeleccionados.some(sel => sel.id === s.id)
              const precioVal = parseFloat(s.precio_base || s.precio || 0)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleServicio(s)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-red-50 border-[#df000a] text-[#df000a] font-bold'
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="truncate">{s.nombre}</span>
                  <span className="font-mono text-xs font-bold flex-shrink-0 ml-1">
                    ${fmtMXN(precioVal)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Botones de acción del formulario */}
        <div className="pt-3 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 min-h-[48px] py-3 rounded-xl bg-[#df000a] hover:bg-[#b80008] text-white font-black text-sm shadow-md shadow-red-900/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <i className="ri-truck-line text-lg"></i>
            {isSubmitting ? 'Despachando...' : 'Despachar Unidad'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Subcomponente: Catálogo de Servicios de Auxilio (Modernizado con CRUD) ───
function TabCatalogoServicios({ servicios = [], onNuevo, onEditar, onEliminar }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <h3 className="font-black text-gray-900 text-base">Catálogo de Servicios de Rescate</h3>
          <p className="text-xs text-gray-500">Tarifas base y comisiones sugeridas por servicio en ruta</p>
        </div>
        <button
          onClick={onNuevo}
          className="flex items-center justify-center gap-2 bg-[#df000a] hover:bg-[#b80008] text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-red-900/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Servicio de Rescate</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {servicios.map(s => {
          const precio = parseFloat(s.precio_base || s.precio || 0)
          const comision = parseFloat(s.comision_operador || s.comision_chofer || 0)

          return (
            <div
              key={s.id}
              className="p-4 rounded-2xl border border-gray-200 bg-white hover:border-red-300 hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-gray-900 text-sm group-hover:text-[#df000a] transition-colors">
                    {s.nombre}
                  </span>
                  <span className="font-mono font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl text-xs flex-shrink-0">
                    ${fmtMXN(precio)}
                  </span>
                </div>

                {s.descripcion && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {s.descripcion}
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Comisión Chofer:</span>
                  <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    ${fmtMXN(comision)}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    onClick={() => onEditar(s)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                    title="Editar Servicio"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onEliminar(s.id)}
                    className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Eliminar Servicio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {servicios.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            No hay servicios de rescate configurados. Haz clic en &quot;Nuevo Servicio de Rescate&quot;.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Subcomponente: Unidades Móviles (Modernizado con CRUD) ───────────────────
function TabUnidadesMoviles({ unidades = [], empleados = [], onNueva, onEditar, onEliminar }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div>
          <h3 className="font-black text-gray-900 text-base">Flotilla de Unidades Móviles</h3>
          <p className="text-xs text-gray-500">Camionetas y vehículos equipados para rescate llantero</p>
        </div>
        <button
          onClick={onNueva}
          className="flex items-center justify-center gap-2 bg-[#df000a] hover:bg-[#b80008] text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-red-900/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Unidad Móvil</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {unidades.map(u => (
          <div
            key={u.id}
            className="p-4 rounded-2xl border border-gray-200 bg-white hover:border-red-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-red-50 text-[#df000a] flex-shrink-0">
                <Truck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-sm text-gray-900">{u.numero_economico}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                    u.activo !== false
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                      : 'text-gray-600 bg-gray-100 border-gray-200'
                  }`}>
                    {u.activo !== false ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="text-sm font-bold text-gray-800">{u.nombre}</p>
                <p className="text-xs text-gray-500 font-mono">
                  Placas: {u.placas || 'Sin placas'} • Modelo: {u.modelo || 'N/A'}
                </p>
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <i className="ri-user-star-line text-gray-400"></i>
                  <span>Chofer habitual: <b>{u.chofer_habitual_nombre || u.chofer_nombre || 'Asignación dinámica'}</b></span>
                </p>
              </div>
            </div>

            <div className="flex sm:flex-col items-center justify-end gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
              <button
                onClick={() => onEditar(u)}
                className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors cursor-pointer"
                title="Editar Unidad"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEliminar(u.id)}
                className="p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Eliminar Unidad"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {unidades.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400">
            No hay unidades registradas en la flotilla. Haz clic en &quot;Nueva Unidad Móvil&quot;.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal para Crear / Editar TipoServicioRescate ─────────────────────────────
function ModalServicioRescate({ isOpen, initialData, onClose, onSave, isSaving }) {
  const [nombre, setNombre] = useState(initialData?.nombre || '')
  const [descripcion, setDescripcion] = useState(initialData?.descripcion || '')
  const [precioBase, setPrecioBase] = useState(initialData?.precio_base ?? initialData?.precio ?? '')
  const [comisionOperador, setComisionOperador] = useState(initialData?.comision_operador ?? initialData?.comision_chofer ?? '')
  const [activo, setActivo] = useState(initialData?.activo !== false)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...(initialData?.id ? { id: initialData.id } : {}),
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precio_base: parseFloat(precioBase || 0),
      comision_operador: parseFloat(comisionOperador || 0),
      activo,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
          <h3 className="font-bold text-gray-900 text-base">
            {initialData ? 'Editar Servicio de Rescate' : 'Nuevo Servicio de Rescate'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nombre del Servicio *</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej. Parche en Frío / Vulcanizado"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Descripción</label>
            <textarea
              rows={2}
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Detalles sobre lo que incluye el servicio..."
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Precio Base ($ MXN) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={precioBase}
                onChange={e => setPrecioBase(e.target.value)}
                placeholder="250.00"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-mono focus:border-[#df000a]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Comisión Chofer ($ MXN)</label>
              <input
                type="number"
                step="0.01"
                value={comisionOperador}
                onChange={e => setComisionOperador(e.target.value)}
                placeholder="50.00"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-mono focus:border-[#df000a]"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="serv-activo"
              checked={activo}
              onChange={e => setActivo(e.target.checked)}
              className="rounded text-[#df000a] focus:ring-red-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="serv-activo" className="text-xs font-bold text-gray-700 cursor-pointer">
              Servicio activo y disponible para auxilio
            </label>
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-[#df000a] hover:bg-[#b80008] text-white font-bold text-xs shadow-md shadow-red-900/20"
            >
              {isSaving ? 'Guardando...' : 'Guardar Servicio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal para Crear / Editar UnidadMovil ──────────────────────────────────────
function ModalUnidadMovil({ isOpen, initialData, empleados = [], onClose, onSave, isSaving }) {
  const [numeroEconomico, setNumeroEconomico] = useState(initialData?.numero_economico || '')
  const [nombre, setNombre] = useState(initialData?.nombre || '')
  const [placas, setPlacas] = useState(initialData?.placas || '')
  const [modelo, setModelo] = useState(initialData?.modelo || '')
  const [choferHabitual, setChoferHabitual] = useState(initialData?.chofer_habitual ? String(initialData.chofer_habitual) : '')
  const [notas, setNotas] = useState(initialData?.notas || '')
  const [activo, setActivo] = useState(initialData?.activo !== false)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...(initialData?.id ? { id: initialData.id } : {}),
      numero_economico: numeroEconomico.trim(),
      nombre: nombre.trim(),
      placas: placas.trim(),
      modelo: modelo.trim(),
      chofer_habitual: choferHabitual ? Number(choferHabitual) : null,
      notas: notas.trim(),
      activo,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl border border-gray-200">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
          <h3 className="font-bold text-gray-900 text-base">
            {initialData ? 'Editar Unidad Móvil' : 'Nueva Unidad Móvil'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">No. Económico *</label>
              <input
                type="text"
                required
                value={numeroEconomico}
                onChange={e => setNumeroEconomico(e.target.value)}
                placeholder="Ej. UNIDAD-03"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-mono focus:border-[#df000a]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Placas</label>
              <input
                type="text"
                value={placas}
                onChange={e => setPlacas(e.target.value)}
                placeholder="Ej. YS-4812-B"
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm font-mono focus:border-[#df000a]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nombre / Identificador *</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej. Ram 700 Blanca / Ranger 2022"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Modelo / Detalles</label>
            <input
              type="text"
              value={modelo}
              onChange={e => setModelo(e.target.value)}
              placeholder="Ej. Dodge Ram 700 SLT 2021"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Chofer Habitual</label>
            <select
              value={choferHabitual}
              onChange={e => setChoferHabitual(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            >
              <option value="">-- Sin chofer habitual fijo --</option>
              {empleados.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre_completo || `${emp.nombre || ''} ${emp.apellido || ''}`.trim() || `Empleado #${emp.id}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Notas / Equipamiento</label>
            <textarea
              rows={2}
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Compresor 12V, pistola de impacto, gato caimán 3T..."
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a]"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="uni-activa"
              checked={activo}
              onChange={e => setActivo(e.target.checked)}
              className="rounded text-[#df000a] focus:ring-red-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="uni-activa" className="text-xs font-bold text-gray-700 cursor-pointer">
              Unidad activa en servicio
            </label>
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-[#df000a] hover:bg-[#b80008] text-white font-bold text-xs shadow-md shadow-red-900/20"
            >
              {isSaving ? 'Guardando...' : 'Guardar Unidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
