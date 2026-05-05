import { useState, useEffect, useCallback } from 'react'
import { FileText, TrendingUp, Users, TrendingDown, Download } from 'lucide-react'

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
const fmt = (n, d = 2) =>
  Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })
const hoy = () => new Date().toISOString().slice(0, 10)
const primerDiaMes = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function Spinner() {
  return (
    <div className="flex justify-center items-center py-12">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function KpiCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
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
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            inicio === p.i && fin === p.f
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
          }`}
        >
          {p.label}
        </button>
      ))}
      <input
        type="date" value={inicio} onChange={e => onInicio(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-xs"
      />
      <span className="text-gray-400 text-xs">al</span>
      <input
        type="date" value={fin} onChange={e => onFin(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1 text-xs"
      />
    </div>
  )
}

// ─── Tab Ventas ─────────────────────────────────────────────────────────────
function TabVentas({ inicio, fin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reportes/ventas/?fecha_inicio=${inicio}&fecha_fin=${fin}`, { headers: tok() })
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [inicio, fin])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <Spinner />
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
        <KpiCard label="Ticket Promedio" value={`$${fmt(ticket)}`} color="yellow" />
      </div>

      {/* Por vendedor */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700 flex items-center gap-2">
          <Users className="w-4 h-4" /> Ventas por Vendedor
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Vendedor', 'Ventas', 'Total'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.por_empleado.map((v, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2">{v.nombre || '—'}</td>
                  <td className="px-4 py-2">{v.cantidad}</td>
                  <td className="px-4 py-2 font-medium">${fmt(v.total)}</td>
                </tr>
              ))}
              {data.por_empleado.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin ventas en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por día */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Ventas por Día
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha', 'Ventas', 'Total'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.por_dia.map((d, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2">{d.dia}</td>
                  <td className="px-4 py-2">{d.cantidad}</td>
                  <td className="px-4 py-2 font-medium">${fmt(d.total)}</td>
                </tr>
              ))}
              {data.por_dia.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin datos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Comisiones ──────────────────────────────────────────────────────────
function TabComisiones({ inicio, fin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reportes/comisiones/?fecha_inicio=${inicio}&fecha_fin=${fin}`, { headers: tok() })
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [inicio, fin])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <Spinner />
  if (!data) return null

  const totalComisiones = data.vendedores.reduce((s, v) => s + v.comision_calculada, 0)
  const totalVentas = data.vendedores.reduce((s, v) => s + v.total_ventas, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <KpiCard label="Total Ventas Vendedores" value={`$${fmt(totalVentas)}`} color="blue" />
        <KpiCard label="Total Comisiones a Pagar" value={`$${fmt(totalComisiones)}`} color="yellow" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">
          Comisiones por Vendedor
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Vendedor', 'Ventas', 'Total Vendido', '% Comisión', 'Comisión'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.vendedores.map((v, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{v.nombre}</td>
                  <td className="px-4 py-2">{v.num_ventas}</td>
                  <td className="px-4 py-2">${fmt(v.total_ventas)}</td>
                  <td className="px-4 py-2">{fmt(v.comision_porcentaje, 1)}%</td>
                  <td className="px-4 py-2 font-bold text-green-700">${fmt(v.comision_calculada)}</td>
                </tr>
              ))}
              {data.vendedores.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin vendedores con comisión configurada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Gastos ──────────────────────────────────────────────────────────────
function TabGastos({ inicio, fin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reportes/gastos/?fecha_inicio=${inicio}&fecha_fin=${fin}`, { headers: tok() })
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [inicio, fin])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <Spinner />
  if (!data) return null

  const t = data.totales

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Gastos" value={`$${fmt(t.total)}`} sub={`${t.cantidad} registros`} color="red" />
        <KpiCard label="Efectivo" value={`$${fmt(t.efectivo)}`} color="yellow" />
        <KpiCard label="Transferencia" value={`$${fmt(t.transferencia)}`} color="blue" />
        <KpiCard label="Tarjeta" value={`$${fmt(t.tarjeta)}`} color="purple" />
      </div>

      {/* Por categoría */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700 flex items-center gap-2">
          <TrendingDown className="w-4 h-4" /> Por Categoría
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Categoría', 'Registros', 'Total'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.por_categoria.map((c, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{c.categoria}</td>
                  <td className="px-4 py-2">{c.cantidad}</td>
                  <td className="px-4 py-2 font-semibold text-red-600">${fmt(c.total)}</td>
                </tr>
              ))}
              {data.por_categoria.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">Sin gastos en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">
          Detalle de Gastos
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Fecha', 'Concepto', 'Categoría', 'Método', 'Responsable', 'Monto'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.detalle.map((g, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">{g.fecha}</td>
                  <td className="px-3 py-2">{g.concepto}</td>
                  <td className="px-3 py-2">{g.categoria}</td>
                  <td className="px-3 py-2 capitalize">{g.metodo_pago}</td>
                  <td className="px-3 py-2">{g.responsable}</td>
                  <td className="px-3 py-2 font-medium text-red-600">${fmt(g.monto)}</td>
                </tr>
              ))}
              {data.detalle.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin gastos en el período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
const TABS = [
  { id: 'ventas', label: 'Ventas', icon: TrendingUp },
  { id: 'comisiones', label: 'Comisiones', icon: Users },
  { id: 'gastos', label: 'Gastos', icon: TrendingDown },
]

export default function Reportes() {
  const [tab, setTab] = useState('ventas')
  const [inicio, setInicio] = useState(primerDiaMes)
  const [fin, setFin] = useState(hoy)
  const [descargando, setDescargando] = useState(false)

  const descargarPDF = async () => {
    setDescargando(true)
    try {
      const res = await fetch(`/api/reportes/pdf/?fecha_inicio=${inicio}&fecha_fin=${fin}`, { headers: tok() })
      if (!res.ok) throw new Error('Error al generar PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `minuta_${inicio}_${fin}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e.message)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Reportes</h1>
            <p className="text-xs text-gray-500">Análisis de ventas, comisiones y gastos</p>
          </div>
        </div>
        <button
          onClick={descargarPDF}
          disabled={descargando}
          className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          {descargando ? 'Generando PDF...' : 'Descargar Minuta PDF'}
        </button>
      </div>

      {/* Período */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Período</p>
        <PeriodoSelector inicio={inicio} fin={fin} onInicio={setInicio} onFin={setFin} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 flex-1 justify-center py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'ventas' && <TabVentas inicio={inicio} fin={fin} />}
      {tab === 'comisiones' && <TabComisiones inicio={inicio} fin={fin} />}
      {tab === 'gastos' && <TabGastos inicio={inicio} fin={fin} />}
    </div>
  )
}
