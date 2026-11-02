import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  TrendingUp,
  Users,
  TrendingDown,
  Download,
  Flame,
  Package,
  Wrench,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  Scale,
  Truck,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
} from 'lucide-react'
import { apiClient } from '../../lib/apiClient'
import AlarmaModal from '../../components/AlarmaModal'
import ModalDetallePagoProveedor from './ModalDetallePagoProveedor'

// tok() kept only for PDF download (blob response, not JSON)
const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
const fmt = (n, d = 2) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })
const hoy = () => new Date().toISOString().slice(0, 10)
const primerDiaMes = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
]

const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function Spinner() {
  return (
    <div className="flex justify-center items-center py-12">
      <div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function KpiCard({ label, value, sub, color = 'blue', icon: Icon }) {
  const styles = {
    blue: {
      card: 'bg-gradient-to-br from-[#161a29] via-[#161a29] to-red-950/25 border-red-500/30',
      label: 'text-red-400',
      icon: 'bg-red-500/15 text-red-400 border border-red-500/30',
    },
    green: {
      card: 'bg-gradient-to-br from-[#161a29] via-[#161a29] to-emerald-950/25 border-emerald-500/30',
      label: 'text-emerald-400',
      icon: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    },
    red: {
      card: 'bg-gradient-to-br from-[#161a29] via-[#161a29] to-rose-950/25 border-rose-500/30',
      label: 'text-rose-400',
      icon: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    },
    orange: {
      card: 'bg-gradient-to-br from-[#161a29] via-[#161a29] to-amber-950/25 border-amber-500/30',
      label: 'text-amber-400',
      icon: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    },
    purple: {
      card: 'bg-gradient-to-br from-[#161a29] via-[#161a29] to-purple-950/25 border-purple-500/30',
      label: 'text-purple-400',
      icon: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    },
    slate: {
      card: 'bg-[#161a29] border-white/[0.1]',
      label: 'text-slate-300',
      icon: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
    },
  }

  const s = styles[color] || styles.blue

  return (
    <div className={`border rounded-xl p-4 transition-all shadow-sm ${s.card}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-bold uppercase tracking-wider ${s.label}`}>{label}</p>
        {Icon && (
          <div className={`p-2 rounded-lg ${s.icon}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className="text-2xl font-extrabold text-white font-mono mt-2 tracking-tight">{value}</p>
      {sub && <p className="text-xs mt-1 text-slate-400 font-medium">{sub}</p>}
    </div>
  )
}

function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-black text-xs shadow-xs" title="1° Lugar">
        <i className="ri-medal-fill text-amber-400"></i> 1°
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-500/20 border border-slate-400/30 text-slate-200 font-bold text-xs shadow-xs" title="2° Lugar">
        <i className="ri-medal-fill text-slate-300"></i> 2°
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center gap-0.5 px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 font-bold text-xs shadow-xs" title="3° Lugar">
        <i className="ri-medal-fill text-orange-400"></i> 3°
      </span>
    )
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#1b2032] border border-white/[0.08] text-slate-400 font-semibold text-xs">
      {rank}°
    </span>
  )
}

// ─── Selector de período ────────────────────────────────────────────────────
function PeriodoSelector({ inicio, fin, onInicio, onFin }) {
  const presets = [
    { label: 'Hoy', i: hoy(), f: hoy() },
    {
      label: 'Esta semana', i: (() => {
        const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10)
      })(), f: hoy()
    },
    { label: 'Este mes', i: primerDiaMes(), f: hoy() },
    {
      label: 'Mes anterior', i: (() => {
        const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10)
      })(), f: (() => {
        const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10)
      })()
    },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(p => (
        <button
          key={p.label}
          onClick={() => { onInicio(p.i); onFin(p.f) }}
          className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
            inicio === p.i && fin === p.f
              ? 'bg-[#df000a] text-white border-[#df000a] font-semibold shadow-xs'
              : 'bg-[#1b2032] text-slate-300 border-white/[0.1] hover:border-[#df000a] hover:text-white'
          }`}
        >
          {p.label}
        </button>
      ))}
      <input
        type="date" value={inicio} onChange={e => onInicio(e.target.value)}
        className="border border-white/[0.12] rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-[#df000a]"
      />
      <span className="text-slate-400 text-xs font-bold">al</span>
      <input
        type="date" value={fin} onChange={e => onFin(e.target.value)}
        className="border border-white/[0.12] rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-[#df000a]"
      />
    </div>
  )
}

// ─── Tab 1: Balance Financiero Global ────────────────────────────────────────
function TabBalanceGlobal({ inicio, fin, onDescargarPDF, descargando }) {
  const { data, isPending } = useQuery({
    queryKey: ['reporte-balance-global', inicio, fin],
    queryFn: async () => {
      try {
        return await apiClient.get(`/api/reportes/balance-global/?fecha_inicio=${inicio}&fecha_fin=${fin}`)
      } catch {
        // Fallback estructurado en caso de estar esperando respuesta
        const [resVentas, resGastos] = await Promise.all([
          apiClient.get(`/api/reportes/ventas/?fecha_inicio=${inicio}&fecha_fin=${fin}`).catch(() => null),
          apiClient.get(`/api/reportes/gastos/?fecha_inicio=${inicio}&fecha_fin=${fin}`).catch(() => null),
        ])

        const totVentas = resVentas?.totales?.total || 0
        const totGastos = resGastos?.totales?.total || 0
        return {
          periodo: { inicio, fin },
          resumen_ejecutivo: {
            total_ingresos: totVentas,
            ingresos_taller: totVentas,
            ingresos_rescates: 0,
            egresos_gastos: totGastos,
            egresos_nomina: 0,
            egresos_proveedores: 0,
            total_egresos_flujo: totGastos,
            flujo_neto_disponible: totVentas - totGastos,
            utilidad_operativa: totVentas - totGastos,
          },
          desglose_ingresos: {
            total: totVentas,
            efectivo: resVentas?.totales?.efectivo || 0,
            tarjeta_total: resVentas?.totales?.electronico || 0,
            transferencia: 0,
          },
          taller: {
            total: totVentas,
            num_ventas: resVentas?.totales?.cantidad || 0,
          },
          rescates: {
            total: 0,
            num_rescates: 0,
          },
          nomina: { total: 0, comisiones: 0 },
          proveedores: { total: 0, desglose: [] },
          gastos: { total: totGastos, por_categoria: resGastos?.por_categoria || [] },
        }
      }
    },
  })

  const [modalProveedor, setModalProveedor] = useState(null)

  if (isPending) return <Spinner />

  const handleAbrirDetalle = (p) => {
    const provNombre = p.proveedor__nombre || p.proveedor || p.nombre || 'Proveedor'
    const pagosTodos = data?.proveedores?.pagos_detalle || data?.pagos_detalle || []
    const pagosFiltrados = pagosTodos.filter(
      pago => (pago.proveedor_nombre || '').trim().toLowerCase() === provNombre.trim().toLowerCase()
    )
    setModalProveedor({
      nombre: provNombre,
      total: Number(p.total || p.monto || 0),
      cantidad: Number(p.cantidad || p.abonos || (pagosFiltrados.length > 0 ? pagosFiltrados.length : 1)),
      pagos: pagosFiltrados,
    })
  }

  const resumen = data?.resumen_ejecutivo || {}
  const desgloseIngresos = data?.desglose_ingresos || {}
  const tallerData = data?.taller || {}
  const rescatesData = data?.rescates || {}
  const nominaData = data?.nomina || {}
  const proveedoresData = data?.proveedores || {}
  const gastosData = data?.gastos || {}

  const totalIngresos = Number(resumen.total_ingresos ?? desgloseIngresos.total ?? data?.ingresos?.total ?? 0)
  const ingresosTaller = Number(resumen.ingresos_taller ?? tallerData.total ?? data?.ingresos?.taller ?? totalIngresos)
  const ingresosRescates = Number(resumen.ingresos_rescates ?? rescatesData.total ?? data?.ingresos?.rescates ?? 0)
  const totalNomina = Number(resumen.egresos_nomina ?? nominaData.total ?? data?.egresos?.nomina ?? 0)
  const totalProveedores = Number(resumen.egresos_proveedores ?? proveedoresData.total ?? data?.egresos?.proveedores ?? 0)
  const totalGastos = Number(resumen.egresos_gastos ?? gastosData.total ?? data?.egresos?.gastos ?? 0)
  const totalEgresos = Number(resumen.total_egresos_flujo ?? (totalNomina + totalProveedores + totalGastos))
  const flujoNeto = Number(resumen.flujo_neto_disponible ?? (totalIngresos - totalEgresos))
  const isPositivo = flujoNeto >= 0

  const efectivoIngresos = Number(desgloseIngresos.efectivo ?? data?.ingresos?.efectivo ?? 0)
  const tarjetaIngresos = Number(desgloseIngresos.tarjeta_total ?? desgloseIngresos.tarjeta ?? data?.ingresos?.tarjeta ?? 0)
  const transfIngresos = Number(desgloseIngresos.transferencia ?? data?.ingresos?.transferencia ?? 0)

  const numVentas = tallerData.num_ventas ?? data?.ingresos?.num_ventas ?? 0
  const numRescates = rescatesData.num_rescates ?? data?.ingresos?.num_rescates ?? 0

  const desgloseProveedores = proveedoresData.desglose || proveedoresData.por_proveedor || data?.egresos?.desglose_proveedores || []
  const comisionesNomina = nominaData.comisiones || data?.egresos?.desglose_nomina?.comisiones || 0

  // Porcentajes de egresos sobre total de egresos
  const pctNomina = totalEgresos > 0 ? (totalNomina / totalEgresos) * 100 : 0
  const pctProveedores = totalEgresos > 0 ? (totalProveedores / totalEgresos) * 100 : 0
  const pctGastos = totalEgresos > 0 ? (totalGastos / totalEgresos) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Banner de Estado Financiero */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
        isPositivo
          ? 'bg-gradient-to-r from-emerald-950/40 via-emerald-900/20 to-[#161a29] border-emerald-500/40 text-white'
          : 'bg-gradient-to-r from-rose-950/40 via-rose-900/20 to-[#161a29] border-rose-500/40 text-white'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl border ${isPositivo ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'}`}>
              {isPositivo ? <CheckCircle2 className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Flujo Neto Disponible del Período
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold uppercase flex items-center gap-1 ${
                  isPositivo ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                }`}>
                  <i className={isPositivo ? "ri-checkbox-circle-line" : "ri-error-warning-line"}></i>
                  <span>{isPositivo ? 'Superávit Financiero' : 'Déficit / Ajustado'}</span>
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mt-1 font-mono tracking-tight text-white">
                ${fmt(flujoNeto)} <span className="text-base font-normal text-slate-400">MXN</span>
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Ingresos Totales (${fmt(totalIngresos)}) − Egresos Totales (${fmt(totalEgresos)}) [Nóminas + Proveedores + Gastos]
              </p>
            </div>
          </div>

          <button
            onClick={onDescargarPDF}
            disabled={descargando}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#df000a] hover:bg-[#b80008] active:scale-95 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-900/40 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {descargando ? 'Generando Minuta...' : 'Descargar Minuta PDF'}
          </button>
        </div>
      </div>

      {/* Grid Principal de KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ingresos Totales */}
        <KpiCard
          label="Ingresos Totales"
          value={`$${fmt(totalIngresos)}`}
          sub={`Mostrador: $${fmt(ingresosTaller)} | Rescates: $${fmt(ingresosRescates)}`}
          color="green"
          icon={ArrowUpRight}
        />

        {/* Nóminas Pagadas */}
        <KpiCard
          label="Nóminas Pagadas"
          value={`$${fmt(totalNomina)}`}
          sub={comisionesNomina ? `Comisiones: $${fmt(comisionesNomina)}` : 'Sueldos + Comisiones + Domingos'}
          color="red"
          icon={Users}
        />

        {/* Pagos a Proveedores */}
        <KpiCard
          label="Pagos a Proveedores"
          value={`$${fmt(totalProveedores)}`}
          sub="Abonos a compras y facturas de llantas"
          color="orange"
          icon={Building2}
        />

        {/* Gastos Operativos */}
        <KpiCard
          label="Gastos Operativos"
          value={`$${fmt(totalGastos)}`}
          sub="Renta, luz, gasolina, insumos taller"
          color="purple"
          icon={TrendingDown}
        />
      </div>

      {/* Desglose Gráfico de Egresos y Deducciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribución de Egresos */}
        <div className="bg-[#161a29] rounded-2xl border border-white/[0.08] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-[#df000a]" />
              <h3 className="font-bold text-white text-sm">Distribución de Egresos</h3>
            </div>
            <span className="text-xs font-bold text-slate-400">Total: ${fmt(totalEgresos)}</span>
          </div>

          {/* Barra acumulada */}
          <div className="w-full h-4 bg-[#0d0f14] border border-white/[0.06] rounded-full overflow-hidden flex mb-4">
            <div
              style={{ width: `${pctNomina}%` }}
              className="bg-rose-500 transition-all duration-500"
              title={`Nómina: ${pctNomina.toFixed(1)}%`}
            />
            <div
              style={{ width: `${pctProveedores}%` }}
              className="bg-amber-500 transition-all duration-500"
              title={`Proveedores: ${pctProveedores.toFixed(1)}%`}
            />
            <div
              style={{ width: `${pctGastos}%` }}
              className="bg-purple-500 transition-all duration-500"
              title={`Gastos: ${pctGastos.toFixed(1)}%`}
            />
          </div>

          {/* Lista de leyendas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#1b2032] border border-white/[0.07]">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-rose-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Nómina y Personal</p>
                  <p className="text-[11px] text-slate-400">{pctNomina.toFixed(1)}% del total</p>
                </div>
              </div>
              <span className="font-mono font-bold text-rose-400 text-sm">${fmt(totalNomina)}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#1b2032] border border-white/[0.07]">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Proveedores (Llantas)</p>
                  <p className="text-[11px] text-slate-400">{pctProveedores.toFixed(1)}% del total</p>
                </div>
              </div>
              <span className="font-mono font-bold text-amber-400 text-sm">${fmt(totalProveedores)}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#1b2032] border border-white/[0.07]">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-purple-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-slate-200">Gastos Operativos</p>
                  <p className="text-[11px] text-slate-400">{pctGastos.toFixed(1)}% del total</p>
                </div>
              </div>
              <span className="font-mono font-bold text-purple-400 text-sm">${fmt(totalGastos)}</span>
            </div>
          </div>
        </div>

        {/* Desglose de Ingresos por Canal y Método */}
        <div className="bg-[#161a29] rounded-2xl border border-white/[0.08] p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-sm">Canales de Ingreso y Formas de Pago</h3>
            </div>
            <span className="text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full">
              Recaudado: ${fmt(totalIngresos)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Canales de Venta */}
            <div className="bg-[#1b2032] border border-white/[0.07] rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <i className="ri-map-pin-2-line text-slate-400"></i> Por Canal de Venta
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between bg-[#161a29] p-3 rounded-lg border border-white/[0.05]">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-xs font-bold text-slate-200">Taller / Mostrador</p>
                      <p className="text-[11px] text-slate-400">{numVentas} ventas</p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-white">${fmt(ingresosTaller)}</span>
                </div>

                <div className="flex items-center justify-between bg-[#161a29] p-3 rounded-lg border border-white/[0.05]">
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-[#ff4040]" />
                    <div>
                      <p className="text-xs font-bold text-slate-200">Rescates en Ruta</p>
                      <p className="text-[11px] text-slate-400">{numRescates} auxilios viales</p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[#ff4040]">${fmt(ingresosRescates)}</span>
                </div>
              </div>
            </div>

            {/* Métodos de Pago */}
            <div className="bg-[#1b2032] border border-white/[0.07] rounded-xl p-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <i className="ri-bank-card-line text-slate-400"></i> Por Forma de Pago
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs px-3 py-2.5 rounded-lg bg-[#161a29] border border-white/[0.05]">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <i className="ri-money-dollar-circle-line text-emerald-400"></i> Efectivo:
                  </span>
                  <span className="font-mono font-bold text-emerald-400">${fmt(efectivoIngresos)}</span>
                </div>
                <div className="flex items-center justify-between text-xs px-3 py-2.5 rounded-lg bg-[#161a29] border border-white/[0.05]">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <i className="ri-bank-card-line text-blue-400"></i> Tarjetas (Débito/Crédito):
                  </span>
                  <span className="font-mono font-bold text-blue-400">${fmt(tarjetaIngresos)}</span>
                </div>
                <div className="flex items-center justify-between text-xs px-3 py-2.5 rounded-lg bg-[#161a29] border border-white/[0.05]">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <i className="ri-bank-line text-cyan-400"></i> Transferencias / Otros:
                  </span>
                  <span className="font-mono font-bold text-cyan-400">${fmt(transfIngresos)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla Ejecutiva de Pagos a Proveedores en el Período */}
      {Array.isArray(desgloseProveedores) && desgloseProveedores.length > 0 && (
        <div className="bg-[#161a29] rounded-2xl border border-white/[0.08] overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-[#1b2032]">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-white text-sm">Desglose de Pagos a Proveedores en el Período</h3>
            </div>
            <span className="text-xs font-bold text-amber-400">
              Total: ${fmt(totalProveedores)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1b2032] text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Proveedor</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Abonos / Pagos</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Monto Pagado</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {desgloseProveedores.map((p, idx) => {
                  const provNombre = p.proveedor__nombre || p.proveedor || p.nombre || 'Proveedor'
                  return (
                    <tr
                      key={idx}
                      onClick={() => handleAbrirDetalle(p)}
                      className="hover:bg-amber-500/[0.06] transition-colors cursor-pointer group"
                      title={`Ver desglose detallado de pagos a ${provNombre}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-100 group-hover:text-amber-300">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition-colors" />
                          <span>{provNombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-300">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#1b2032] border border-white/[0.08] text-slate-300 text-xs font-semibold group-hover:border-amber-500/30 group-hover:text-amber-300 transition-colors">
                          {p.cantidad || p.abonos || 1} {((p.cantidad || p.abonos || 1) === 1) ? 'pago' : 'pagos'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-400">
                        ${fmt(p.total || p.monto || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAbrirDetalle(p)
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-eye-line"></i>
                          <span>Ver</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Detalle de Pagos al Proveedor */}
      <ModalDetallePagoProveedor
        isOpen={Boolean(modalProveedor)}
        onClose={() => setModalProveedor(null)}
        proveedorData={modalProveedor}
        periodo={{ inicio, fin }}
      />
    </div>
  )
}

// ─── Tab 2: Ventas ──────────────────────────────────────────────────────────
function TabVentas({ inicio, fin }) {
  const { data, isPending } = useQuery({
    queryKey: ['reporte-ventas', inicio, fin],
    queryFn: () => apiClient.get(`/api/reportes/ventas/?fecha_inicio=${inicio}&fecha_fin=${fin}`),
  })

  if (isPending) return <Spinner />
  if (!data) return null

  const t = data.totales
  const ticket = t.cantidad > 0 ? t.total / t.cantidad : 0

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Ventas" value={`$${fmt(t.total)}`} sub={`${t.cantidad} ventas`} color="blue" />
        <KpiCard label="Efectivo" value={`$${fmt(t.efectivo)}`} color="green" />
        <KpiCard label="Electrónico" value={`$${fmt(t.electronico)}`} color="purple" />
        <KpiCard label="Ticket Promedio" value={`$${fmt(ticket)}`} color="orange" />
      </div>

      {/* Por vendedor */}
      <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-white/[0.08] bg-[#1b2032] font-semibold text-sm text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-[#ff4040]" /> Ventas por Vendedor
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1b2032]">
              <tr>
                {['Vendedor', 'Ventas', 'Total'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.por_empleado.map((v, i) => (
                <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-4 py-2 text-slate-200">{v.nombre || '—'}</td>
                  <td className="px-4 py-2 text-slate-300">{v.cantidad}</td>
                  <td className="px-4 py-2 font-mono font-bold text-emerald-400">${fmt(v.total)}</td>
                </tr>
              ))}
              {data.por_empleado.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin ventas en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por día */}
      <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-white/[0.08] bg-[#1b2032] font-semibold text-sm text-white flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Ventas por Día
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1b2032]">
              <tr>
                {['Fecha', 'Ventas', 'Total'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.por_dia.map((d, i) => (
                <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-4 py-2 text-slate-200">{d.dia}</td>
                  <td className="px-4 py-2 text-slate-300">{d.cantidad}</td>
                  <td className="px-4 py-2 font-mono font-bold text-emerald-400">${fmt(d.total)}</td>
                </tr>
              ))}
              {data.por_dia.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 3: Comisiones ──────────────────────────────────────────────────────
function TabComisiones({ inicio, fin }) {
  const { data, isPending } = useQuery({
    queryKey: ['reporte-comisiones', inicio, fin],
    queryFn: () => apiClient.get(`/api/reportes/comisiones/?fecha_inicio=${inicio}&fecha_fin=${fin}`),
  })

  if (isPending) return <Spinner />
  if (!data) return null

  const totalComisiones = data.vendedores.reduce((s, v) => s + v.comision_calculada, 0)
  const totalVentas = data.vendedores.reduce((s, v) => s + v.total_ventas, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Total Ventas Vendedores" value={`$${fmt(totalVentas)}`} color="blue" />
        <KpiCard label="Total Comisiones a Pagar" value={`$${fmt(totalComisiones)}`} color="orange" />
      </div>

      <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-white/[0.08] bg-[#1b2032] font-semibold text-sm text-white">
          Comisiones por Vendedor
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1b2032]">
              <tr>
                {['Vendedor', 'Ventas', 'Total Vendido', '% Comisión', 'Comisión'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.vendedores.map((v, i) => (
                <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-4 py-2 font-medium text-slate-100">{v.nombre}</td>
                  <td className="px-4 py-2 text-slate-300">{v.num_ventas}</td>
                  <td className="px-4 py-2 font-mono text-slate-200">${fmt(v.total_ventas)}</td>
                  <td className="px-4 py-2 font-mono text-amber-400">{fmt(v.comision_porcentaje, 1)}%</td>
                  <td className="px-4 py-2 font-mono font-bold text-emerald-400">${fmt(v.comision_calculada)}</td>
                </tr>
              ))}
              {data.vendedores.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin vendedores con comisión configurada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 4: Gastos ──────────────────────────────────────────────────────────
function TabGastos({ inicio, fin }) {
  const { data, isPending } = useQuery({
    queryKey: ['reporte-gastos', inicio, fin],
    queryFn: () => apiClient.get(`/api/reportes/gastos/?fecha_inicio=${inicio}&fecha_fin=${fin}`),
  })

  if (isPending) return <Spinner />
  if (!data) return null

  const t = data.totales

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Gastos" value={`$${fmt(t.total)}`} sub={`${t.cantidad} registros`} color="red" />
        <KpiCard label="Efectivo" value={`$${fmt(t.efectivo)}`} color="orange" />
        <KpiCard label="Transferencia" value={`$${fmt(t.transferencia)}`} color="blue" />
        <KpiCard label="Tarjeta" value={`$${fmt(t.tarjeta)}`} color="purple" />
      </div>

      {/* Por categoría */}
      <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-white/[0.08] bg-[#1b2032] font-semibold text-sm text-white flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-400" /> Por Categoría
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1b2032]">
              <tr>
                {['Categoría', 'Registros', 'Total'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.por_categoria.map((c, i) => (
                <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-4 py-2 font-medium text-slate-100">{c.categoria}</td>
                  <td className="px-4 py-2 text-slate-300">{c.cantidad}</td>
                  <td className="px-4 py-2 font-mono font-bold text-rose-400">${fmt(c.total)}</td>
                </tr>
              ))}
              {data.por_categoria.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin gastos en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle */}
      <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-white/[0.08] bg-[#1b2032] font-semibold text-sm text-white">
          Detalle de Gastos
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1b2032]">
              <tr>
                {['Fecha', 'Concepto', 'Categoría', 'Método', 'Responsable', 'Monto'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.detalle.map((g, i) => (
                <tr key={i} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-300">{g.fecha}</td>
                  <td className="px-3 py-2 text-slate-100">{g.concepto}</td>
                  <td className="px-3 py-2 text-slate-300">{g.categoria}</td>
                  <td className="px-3 py-2 capitalize text-slate-300">{g.metodo_pago}</td>
                  <td className="px-3 py-2 text-slate-300">{g.responsable}</td>
                  <td className="px-3 py-2 font-mono font-bold text-rose-400">${fmt(g.monto)}</td>
                </tr>
              ))}
              {data.detalle.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin gastos en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab 5: Productos y Servicios Más Vendidos ───────────────────────────────
function TabMasVendidos() {
  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(anioActual)
  const [filtroTipo, setFiltroTipo] = useState('todos') // 'todos' | 'productos' | 'servicios'
  const [expandido, setExpandido] = useState({})

  const aniosDisponibles = [2024, 2025, 2026]

  const toggleExpand = (key) => {
    setExpandido(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const { data, isPending } = useQuery({
    queryKey: ['reporte-mas-vendidos', anio],
    queryFn: async () => {
      try {
        return await apiClient.get(`/api/reportes/mas-vendidos/?anio=${anio}`)
      } catch {
        const start = `${anio}-01-01`
        const end = `${anio}-12-31`
        const [prod, serv] = await Promise.all([
          apiClient.get(`/api/ventas/ventas/productos_mas_vendidos/?fecha_inicio=${start}&fecha_fin=${end}&limite=50`).catch(() => []),
          apiClient.get(`/api/ventas/ventas/servicios_mas_vendidos/?fecha_inicio=${start}&fecha_fin=${end}&limite=50`).catch(() => []),
        ])
        return {
          anio,
          productos: Array.isArray(prod) ? prod : (prod.results || []),
          servicios: Array.isArray(serv) ? serv : (serv.results || []),
        }
      }
    },
  })

  if (isPending) return <Spinner />

  const productos = data?.productos || []
  const servicios = data?.servicios || []

  const totalUnidadesProd = productos.reduce((s, p) => s + (p.cantidad_total || p.total_unidades || p.cantidad || 0), 0)
  const totalMontoProd = productos.reduce((s, p) => s + parseFloat(p.ventas_total || p.total_monto || p.monto_total || 0), 0)

  const totalCantServ = servicios.reduce((s, serv) => s + (serv.cantidad_total || serv.total_unidades || serv.cantidad || 0), 0)
  const totalMontoServ = servicios.reduce((s, serv) => s + parseFloat(serv.ventas_total || serv.total_monto || serv.monto_total || 0), 0)

  return (
    <div className="space-y-6">
      {/* Barra de controles: Año y Tipo */}
      <div className="bg-[#161a29] rounded-xl border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">Año de consulta:</span>
          <div className="flex gap-1 bg-[#0d0f14] border border-white/[0.06] p-1 rounded-lg">
            {aniosDisponibles.map(a => (
              <button
                key={a}
                onClick={() => setAnio(a)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  anio === a
                    ? 'bg-[#df000a] text-white shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-[#1b2032]'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1 bg-[#0d0f14] border border-white/[0.06] p-1 rounded-lg">
          {[
            { id: 'todos', label: 'Todos', icon: Flame },
            { id: 'productos', label: 'Llantas / Productos', icon: Package },
            { id: 'servicios', label: 'Servicios', icon: Wrench },
          ].map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setFiltroTipo(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  filtroTipo === t.id
                    ? 'bg-[#1b2032] border border-red-500/30 text-[#ff4040] font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Resumen KPIs del año */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label={`Llantas vendidas (${anio})`}
          value={`${totalUnidadesProd} pzs`}
          sub={`Recaudado: $${fmt(totalMontoProd)}`}
          color="blue"
        />
        <KpiCard
          label={`Servicios realizados (${anio})`}
          value={`${totalCantServ} serv`}
          sub={`Recaudado: $${fmt(totalMontoServ)}`}
          color="green"
        />
        <KpiCard
          label="Total Recaudado Anual"
          value={`$${fmt(totalMontoProd + totalMontoServ)}`}
          sub="Productos + Servicios"
          color="purple"
        />
        <KpiCard
          label="Top #1 Producto"
          value={productos[0]?.producto__codigo || productos[0]?.codigo || '—'}
          sub={productos[0] ? `${productos[0].cantidad_total || productos[0].cantidad} unidades vendidas` : 'Sin datos'}
          color="orange"
        />
      </div>

      {/* Tabla de Productos */}
      {(filtroTipo === 'todos' || filtroTipo === 'productos') && (
        <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-white/[0.08] bg-[#1b2032] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#ff4040]" />
              <h3 className="font-bold text-white text-sm">Ranking de Productos Más Vendidos ({anio})</h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-red-500/15 border border-red-500/30 text-red-300 rounded-full">
              {productos.length} producto(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1b2032] border-b border-white/[0.06]">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-16">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Descripción / Medida</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Unidades</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Monto Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-28">Desglose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {productos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      No se encontraron ventas de productos en el año {anio}.
                    </td>
                  </tr>
                ) : (
                  productos.map((p, idx) => {
                    const rowKey = `prod-${p.id || p.producto__id || idx}`
                    const isExpanded = !!expandido[rowKey]
                    const desc = p.descripcion || p.producto__descripcion_completa || `${p.producto__marca__nombre || ''} ${p.producto__modelo || ''} ${p.producto__medida || ''}`.trim() || '—'
                    const codigo = p.codigo || p.producto__codigo || '—'
                    const unidades = p.cantidad_total ?? p.total_unidades ?? p.cantidad ?? 0
                    const monto = p.ventas_total ?? p.total_monto ?? p.monto_total ?? 0
                    const desglose = p.desglose_mensual || p.por_mes || p.meses || []

                    return (
                      <tr key={rowKey} className="group">
                        <td colSpan={6} className="p-0">
                          <div className="flex items-center px-4 py-3 hover:bg-white/[0.03] transition-colors border-b border-white/[0.06]">
                            <div className="w-16 text-center">
                              <RankBadge rank={idx + 1} />
                            </div>
                            <div className="w-32 font-mono font-bold text-white">
                              {codigo}
                            </div>
                            <div className="flex-1 text-slate-300 min-w-0 pr-4">
                              <p className="font-medium text-slate-100 truncate">{desc}</p>
                              {p.producto__medida && (
                                <span className="inline-block mt-0.5 font-mono text-xs text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded">
                                  {p.producto__medida}
                                </span>
                              )}
                            </div>
                            <div className="w-24 text-center font-bold text-emerald-400 font-mono">
                              {unidades}
                            </div>
                            <div className="w-32 text-right font-bold text-white font-mono">
                              ${fmt(monto)}
                            </div>
                            <div className="w-28 text-center">
                              {Array.isArray(desglose) && desglose.length > 0 ? (
                                <button
                                  onClick={() => toggleExpand(rowKey)}
                                  className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-white font-semibold py-1 px-2.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 cursor-pointer"
                                >
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  {isExpanded ? 'Ocultar' : 'Por mes'}
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </div>
                          </div>

                          {/* Desglose expandido */}
                          {isExpanded && Array.isArray(desglose) && desglose.length > 0 && (
                            <div className="bg-[#0d0f14] border-b border-white/[0.08] px-6 py-4">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <i className="ri-calendar-line text-slate-400"></i> Ventas mes a mes ({anio}) para {codigo}:
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                                {desglose.map((m, mIdx) => (
                                  <div key={mIdx} className="bg-[#1b2032] border border-white/[0.08] rounded-lg p-2 text-center shadow-2xs">
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase">
                                      {m.mes_nombre || MESES[m.mes ? m.mes - 1 : mIdx] || `M${mIdx + 1}`}
                                    </p>
                                    <p className="text-xs font-black text-white mt-0.5">
                                      {m.cantidad ?? m.unidades ?? 0} pzs
                                    </p>
                                    <p className="text-[10px] text-emerald-400 font-mono">
                                      ${fmt(m.monto ?? m.total ?? 0, 0)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla de Servicios */}
      {(filtroTipo === 'todos' || filtroTipo === 'servicios') && (
        <div className="bg-[#161a29] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-white/[0.08] bg-[#1b2032] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-sm">Ranking de Servicios Más Vendidos ({anio})</h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-full">
              {servicios.length} servicio(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1b2032] border-b border-white/[0.06]">
                <tr>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-16">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Servicio</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Realizados</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Monto Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase w-28">Desglose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {servicios.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400">
                      No se encontraron servicios realizados en el año {anio}.
                    </td>
                  </tr>
                ) : (
                  servicios.map((s, idx) => {
                    const rowKey = `serv-${s.id || s.servicio__id || idx}`
                    const isExpanded = !!expandido[rowKey]
                    const nombre = s.nombre || s.servicio__nombre || '—'
                    const desc = s.descripcion || ''
                    const cantidad = s.cantidad_total ?? s.total_unidades ?? s.cantidad ?? 0
                    const monto = s.ventas_total ?? s.total_monto ?? s.monto_total ?? 0
                    const desglose = s.desglose_mensual || s.por_mes || s.meses || []

                    return (
                      <tr key={rowKey} className="group">
                        <td colSpan={5} className="p-0">
                          <div className="flex items-center px-4 py-3 hover:bg-white/[0.03] transition-colors border-b border-white/[0.06]">
                            <div className="w-16 text-center">
                              <RankBadge rank={idx + 1} />
                            </div>
                            <div className="flex-1 text-white pr-4">
                              <p className="font-bold">{nombre}</p>
                              {desc && <p className="text-xs text-slate-400 line-clamp-1">{desc}</p>}
                            </div>
                            <div className="w-24 text-center font-bold text-emerald-400 font-mono">
                              {cantidad}
                            </div>
                            <div className="w-32 text-right font-bold text-white font-mono">
                              ${fmt(monto)}
                            </div>
                            <div className="w-28 text-center">
                              {Array.isArray(desglose) && desglose.length > 0 ? (
                                <button
                                  onClick={() => toggleExpand(rowKey)}
                                  className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-white font-semibold py-1 px-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 cursor-pointer"
                                >
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  {isExpanded ? 'Ocultar' : 'Por mes'}
                                </button>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </div>
                          </div>

                          {/* Desglose mensual expandido */}
                          {isExpanded && Array.isArray(desglose) && desglose.length > 0 && (
                            <div className="bg-[#0d0f14] border-b border-white/[0.08] px-6 py-4">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <i className="ri-calendar-line text-slate-400"></i> Servicios mes a mes ({anio}) para {nombre}:
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                                {desglose.map((m, mIdx) => (
                                  <div key={mIdx} className="bg-[#1b2032] border border-white/[0.08] rounded-lg p-2 text-center shadow-2xs">
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase">
                                      {m.mes_nombre || MESES[m.mes ? m.mes - 1 : mIdx] || `M${mIdx + 1}`}
                                    </p>
                                    <p className="text-xs font-black text-white mt-0.5">
                                      {m.cantidad ?? m.unidades ?? 0} serv
                                    </p>
                                    <p className="text-[10px] text-emerald-400 font-mono">
                                      ${fmt(m.monto ?? m.total ?? 0, 0)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal de Respaldo de Base de Datos en 1 Clic ────────────────────────────
function ModalRespaldoBD({ isOpen, onClose, onError }) {
  const [descargandoZip, setDescargandoZip] = useState(false)
  const [exitoZip, setExitoZip] = useState(null)

  const { data: infoBackup, isLoading, isError, refetch } = useQuery({
    queryKey: ['reportes-backup-info'],
    queryFn: () => apiClient.get('/api/reportes/backup/'),
    enabled: isOpen,
  })

  if (!isOpen) return null

  const conteos = infoBackup?.conteos || {}
  const itemsResumen = [
    { key: 'clientes', label: 'Clientes Registrados', icon: 'ri-user-3-line', val: conteos.clientes ?? infoBackup?.clientes ?? 0 },
    { key: 'vehiculos', label: 'Expedientes de Vehículos', icon: 'ri-roadster-line', val: conteos.vehiculos ?? infoBackup?.vehiculos ?? 0 },
    { key: 'productos', label: 'Productos en Catálogo', icon: 'ri-archive-drawer-line', val: conteos.productos ?? infoBackup?.productos ?? 0 },
    { key: 'ventas', label: 'Ventas de Mostrador', icon: 'ri-shopping-cart-2-line', val: conteos.ventas ?? infoBackup?.ventas ?? 0 },
    { key: 'cotizaciones', label: 'Cotizaciones Multimarca', icon: 'ri-price-tag-3-line', val: conteos.cotizaciones ?? infoBackup?.cotizaciones ?? 0 },
    { key: 'rescates', label: 'Rescates Viales', icon: 'ri-truck-line', val: conteos.rescates ?? infoBackup?.rescates ?? 0 },
    { key: 'cajas', label: 'Turnos / Cortes de Caja', icon: 'ri-safe-2-line', val: conteos.cajas ?? infoBackup?.cajas ?? 0 },
    { key: 'proveedores', label: 'Proveedores', icon: 'ri-building-2-line', val: conteos.proveedores ?? infoBackup?.proveedores ?? 0 },
    { key: 'pagos', label: 'Pagos a Proveedores', icon: 'ri-secure-payment-line', val: conteos.pagos ?? infoBackup?.pagos ?? 0 },
  ]

  const handleDescargarZip = async () => {
    setDescargandoZip(true)
    setExitoZip(null)
    try {
      const res = await fetch('/api/reportes/backup/?descargar=1', { headers: tok() })
      if (!res.ok) {
        throw new Error('No tienes permisos de administrador o ocurrió un error al generar el respaldo.')
      }
      const blob = await res.blob()
      const contentDisp = res.headers.get('Content-Disposition') || ''
      const matchName = contentDisp.match(/filename="?([^"]+)"?/)
      const filename = matchName ? matchName[1] : `Respaldo_EmirS_${hoy().replace(/-/g, '')}.zip`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      setExitoZip(`Copia de seguridad (${filename}) descargada exitosamente.`)
      refetch()
    } catch (e) {
      onError?.(e.message)
    } finally {
      setDescargandoZip(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#161a29] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/[0.1]">
        {/* Header */}
        <div className="bg-[#0f172a] text-white px-6 py-4 flex items-center justify-between border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm">
              <i className="ri-database-2-line text-xl"></i>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                Respaldo Integral de Base de Datos (1-Clic)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Exportación cifrada en paquete comprimido (.ZIP) con volcado completo y manifiesto de auditoría
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {exitoZip && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold flex items-center gap-2">
              <i className="ri-checkbox-circle-fill text-emerald-400 text-lg"></i>
              <span>{exitoZip}</span>
            </div>
          )}

          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-sm text-center">
              <i className="ri-shield-keyhole-line text-2xl block mb-1"></i>
              Acceso restringido a administradores del sistema.
            </div>
          ) : (
            <>
              <div className="bg-[#0f172a] border border-white/[0.08] text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Total de Registros Principales en Base de Datos
                  </span>
                  <p className="text-2xl font-black font-mono text-emerald-400 mt-0.5">
                    {Number(infoBackup?.total_registros ?? 0).toLocaleString('es-MX')} registros activos
                  </p>
                </div>
                <div className="text-left sm:text-right text-xs text-slate-300">
                  <span className="block text-slate-400">Última verificación:</span>
                  <span className="font-mono font-semibold">{infoBackup?.fecha_actual || hoy()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {itemsResumen.map(item => (
                  <div
                    key={item.key}
                    className="bg-[#1b2032] border border-white/[0.07] rounded-xl p-3 flex items-center gap-2.5"
                  >
                    <div className="p-2 rounded-lg bg-[#161a29] border border-white/[0.08] text-[#ff4040] shrink-0">
                      <i className={`${item.icon} text-base`}></i>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-400 font-semibold truncate">{item.label}</p>
                      <p className="text-sm font-black font-mono text-white">
                        {Number(item.val).toLocaleString('es-MX')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200 flex items-start gap-2.5">
                <i className="ri-information-line text-amber-400 text-base mt-0.5"></i>
                <div>
                  <strong>Recomendación de Seguridad:</strong> Guarda este archivo <code>.ZIP</code> en una carpeta en la nube (OneDrive / Google Drive) o memoria externa al finalizar la semana. Incluye <code>full_database_dump.json</code> y <code>manifest.json</code>.
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-white/[0.12] bg-[#1b2032] text-slate-200 hover:bg-slate-800 text-xs font-bold cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleDescargarZip}
                  disabled={descargandoZip}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-black shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <i className="ri-download-cloud-2-line text-base"></i>
                  <span>
                    {descargandoZip
                      ? 'Empaquetando Base de Datos (.ZIP)...'
                      : 'Descargar Copia de Seguridad Completa (.ZIP)'}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente Principal de Reportes ─────────────────────────────────────────
const TABS = [
  { id: 'balance_global', label: 'Balance Global', icon: Scale, highlight: true },
  { id: 'ventas', label: 'Ventas', icon: TrendingUp },
  { id: 'mas_vendidos', label: 'Más Vendidos', icon: Flame },
  { id: 'comisiones', label: 'Comisiones', icon: Users },
  { id: 'gastos', label: 'Gastos', icon: TrendingDown },
]

export default function Reportes() {
  const [tab, setTab] = useState('balance_global')
  const [inicio, setInicio] = useState(primerDiaMes)
  const [fin, setFin] = useState(hoy)
  const [descargando, setDescargando] = useState(false)
  const [descargandoExcel, setDescargandoExcel] = useState(false)
  const [modalBackupOpen, setModalBackupOpen] = useState(false)
  const [alarma, setAlarma] = useState({ isOpen: false, titulo: '', mensaje: '', tipo: 'error' })

  const descargarExcel = async () => {
    setDescargandoExcel(true)
    try {
      const res = await fetch(`/api/reportes/contable-excel/?fecha_inicio=${inicio}&fecha_fin=${fin}`, { headers: tok() })
      if (!res.ok) {
        let msg = 'Error al generar el Libro Contable Excel'
        try {
          const errData = await res.json()
          if (errData?.error || errData?.detail) msg = errData.error || errData.detail
        } catch (_) {}
        throw new Error(msg)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_contable_emirs_${inicio}_${fin}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setAlarma({
        isOpen: true,
        titulo: 'Error al Descargar Libro Contable',
        mensaje: e.message || 'No se pudo generar ni descargar el Libro Contable Excel.',
        tipo: 'error',
      })
    } finally {
      setDescargandoExcel(false)
    }
  }

  const descargarPDF = async () => {
    setDescargando(true)
    try {
      const res = await fetch(`/api/reportes/pdf/?fecha_inicio=${inicio}&fecha_fin=${fin}`, { headers: tok() })
      if (!res.ok) throw new Error('Error al generar PDF de la Minuta Ejecutiva')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `minuta_operacion_${inicio}_${fin}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setAlarma({
        isOpen: true,
        titulo: 'Error al Generar Minuta PDF',
        mensaje: e.message || 'No se pudo descargar el archivo PDF de la minuta.',
        tipo: 'error',
      })
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-500/15 border border-red-500/30 rounded-2xl shadow-xs">
            <FileText className="w-6 h-6 text-[#ff4040]" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">Reportes & Finanzas</h1>
            <p className="text-xs text-slate-400">Balance global del mes, nóminas, proveedores, comisiones y minuta ejecutiva</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={descargarExcel}
            disabled={descargandoExcel}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-950/20 cursor-pointer"
          >
            <i className={`ri-file-excel-2-line text-base ${descargandoExcel ? 'animate-spin' : ''}`}></i>
            <span>{descargandoExcel ? 'Generando Excel...' : 'Libro Contable Excel (4 Hojas)'}</span>
          </button>
          <button
            type="button"
            onClick={() => setModalBackupOpen(true)}
            className="flex items-center justify-center gap-2 bg-[#161a29] hover:bg-[#1b2032] border border-white/[0.1] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
          >
            <i className="ri-database-2-line text-base text-emerald-400"></i>
            <span>Respaldo BD (1-Clic)</span>
          </button>
          <button
            onClick={descargarPDF}
            disabled={descargando}
            className="flex items-center justify-center gap-2 bg-[#df000a] hover:bg-[#b80008] disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-red-900/20 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {descargando ? 'Generando PDF...' : 'Descargar Minuta PDF'}
          </button>
        </div>
      </div>

      {/* Período (solo para pestañas que usan rango de fechas) */}
      {tab !== 'mas_vendidos' && (
        <div className="bg-[#161a29] rounded-2xl border border-white/[0.08] p-3.5 sm:p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Filtrar por Período</p>
          <PeriodoSelector inicio={inicio} fin={fin} onInicio={setInicio} onFin={setFin} />
        </div>
      )}

      {/* Navegación por Pestañas (Diseño Ergonómico de Alto Contraste) */}
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800 p-1.5 rounded-2xl shadow-xl ring-1 ring-white/5 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1.5 min-w-max md:min-w-0">
          {TABS.map(({ id, label, icon: Icon, highlight }) => {
            const isActive = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`group relative flex items-center justify-center gap-2 flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold tracking-tight transition-all duration-200 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#df000a] ${
                  isActive
                    ? 'bg-gradient-to-r from-red-600 via-[#df000a] to-red-700 text-white font-black shadow-lg shadow-red-900/50 ring-1 ring-white/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95'
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isActive ? 'text-white scale-110' : 'text-slate-400 group-hover:text-slate-200 group-hover:scale-105'
                  }`}
                />
                <span>{label}</span>
                {highlight && !isActive && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#df000a]"></span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenido Dinámico */}
      {tab === 'balance_global' && (
        <TabBalanceGlobal
          inicio={inicio}
          fin={fin}
          onDescargarPDF={descargarPDF}
          descargando={descargando}
        />
      )}
      {tab === 'ventas' && <TabVentas inicio={inicio} fin={fin} />}
      {tab === 'mas_vendidos' && <TabMasVendidos />}
      {tab === 'comisiones' && <TabComisiones inicio={inicio} fin={fin} />}
      {tab === 'gastos' && <TabGastos inicio={inicio} fin={fin} />}

      {/* Modal de Respaldo BD en 1 Clic */}
      <ModalRespaldoBD
        isOpen={modalBackupOpen}
        onClose={() => setModalBackupOpen(false)}
        onError={(msg) => {
          setModalBackupOpen(false)
          setAlarma({
            isOpen: true,
            titulo: 'Error al Descargar Respaldo BD',
            mensaje: msg,
            tipo: 'error',
          })
        }}
      />

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
