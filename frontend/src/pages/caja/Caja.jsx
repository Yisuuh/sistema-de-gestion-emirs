import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  XMarkIcon,
  BanknotesIcon,
  CalculatorIcon,
  DocumentTextIcon,
  ShoppingCartIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockClosedIcon,
  LockOpenIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const API_CAJA = 'http://localhost:8000/api/caja';
const tok = () => localStorage.getItem('token');
const hdrs = () => ({ Authorization: `Bearer ${tok()}` });
const jsonHdrs = () => ({ ...hdrs(), 'Content-Type': 'application/json' });
const fmt = (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

// ─── Denominaciones MXN ───────────────────────────────────────────────────────
const BILLETES = [1000, 500, 200, 100, 50, 20];
const MONEDAS  = [20, 10, 5, 2, 1, 0.5];
const DENOM_INITIAL = Object.fromEntries([...BILLETES, ...MONEDAS].map((d) => [d, '']));

function calcTotalArqueo(arqueo) {
  return [...BILLETES, ...MONEDAS].reduce(
    (sum, d) => sum + d * (parseFloat(arqueo[d]) || 0),
    0
  );
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Badge({ text, color = 'gray' }) {
  const map = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-600',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[color] ?? map.gray}`}>{text}</span>
  );
}

function StatCard({ icon: Icon, label, value, color = 'blue', sub }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.blue}`}>
      <div className="flex items-center gap-3 mb-2">
        <Icon className="h-6 w-6" />
        <span className="text-sm font-medium opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

// â”€â”€â”€ Modal Apertura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalApertura({ empleados, onGuardado, onClose }) {
  const [form, setForm] = useState({ empleado_apertura: '', monto_inicial: '', notas_apertura: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/cajas/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({ ...form, monto_inicial: parseFloat(form.monto_inicial) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <LockOpenIcon className="h-6 w-6 text-green-600" />
          <h2 className="text-xl font-bold text-gray-900">Abrir Caja</h2>
        </div>
        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado *</label>
            <select required value={form.empleado_apertura}
              onChange={(e) => setForm({ ...form, empleado_apertura: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500">
              <option value="">Seleccionar empleado</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto inicial (fondo) *</label>
            <input type="number" min="0" step="0.01" required value={form.monto_inicial}
              onChange={(e) => setForm({ ...form, monto_inicial: e.target.value })}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea rows={2} value={form.notas_apertura}
              onChange={(e) => setForm({ ...form, notas_apertura: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LockOpenIcon className="h-4 w-4" />}
              Abrir Caja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Cierre â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalCierre({ caja, empleados, onGuardado, onClose }) {
  const [paso, setPaso] = useState(1); // 1=arqueo, 2=confirmar
  const [arqueo, setArqueo] = useState(DENOM_INITIAL);
  const [form, setForm] = useState({ empleado_cierre: '', notas_cierre: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const totalArqueo = calcTotalArqueo(arqueo);
  const diferencia  = totalArqueo - parseFloat(caja.saldo_esperado || 0);

  const setDenom = (d, val) =>
    setArqueo((prev) => ({ ...prev, [d]: val === '' ? '' : val }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/cajas/${caja.id}/cerrar/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({
          ...form,
          monto_final: totalArqueo,
          empleado_cierre: parseInt(form.empleado_cierre),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <LockClosedIcon className="h-6 w-6 text-red-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Cerrar Caja {caja.folio}</h2>
              <p className="text-xs text-gray-500">
                {paso === 1 ? 'Paso 1 de 2 — Arqueo de efectivo' : 'Paso 2 de 2 — Confirmar cierre'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Resumen saldo esperado */}
        <div className="mx-6 mt-4 bg-gray-50 rounded-lg px-4 py-3 text-sm grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-500">Saldo esperado:</span>{' '}
            <span className="font-semibold text-gray-800">{fmt(caja.saldo_esperado)}</span>
          </div>
          <div>
            <span className="text-gray-500">Ventas del día:</span>{' '}
            <span className="font-semibold text-gray-800">{caja.num_ventas}</span>
          </div>
        </div>

        {/* ─── Paso 1: Arqueo ─────────────────────────────────────────── */}
        {paso === 1 && (
          <div className="px-6 py-4 space-y-5">
            {/* Billetes */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <BanknotesIcon className="h-4 w-4 text-gray-500" />
                Billetes
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {BILLETES.map((d) => (
                  <div key={d} className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-0.5 font-medium">${d}</label>
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                      <input
                        type="number"
                        min="0"
                        value={arqueo[d]}
                        onChange={(e) => setDenom(d, e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-300 h-full flex items-center">
                        pzs
                      </span>
                    </div>
                    {(parseFloat(arqueo[d]) || 0) > 0 && (
                      <span className="text-xs text-green-600 mt-0.5 text-right">
                        = {fmt(d * parseFloat(arqueo[d]))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Monedas */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <CurrencyDollarIcon className="h-4 w-4 text-gray-500" />
                Monedas
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {MONEDAS.map((d) => (
                  <div key={d} className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-0.5 font-medium">${d}</label>
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                      <input
                        type="number"
                        min="0"
                        value={arqueo[d]}
                        onChange={(e) => setDenom(d, e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1.5 text-sm text-gray-900 text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-300 h-full flex items-center">
                        pzs
                      </span>
                    </div>
                    {(parseFloat(arqueo[d]) || 0) > 0 && (
                      <span className="text-xs text-green-600 mt-0.5 text-right">
                        = {fmt(d * parseFloat(arqueo[d]))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Total arqueo */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-800">Total contado:</span>
              <span className="text-xl font-bold text-blue-900">{fmt(totalArqueo)}</span>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={totalArqueo === 0}
                onClick={() => setPaso(2)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2">
                <CalculatorIcon className="h-4 w-4" />
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ─── Paso 2: Confirmar cierre ────────────────────────────────── */}
        {paso === 2 && (
          <form onSubmit={submit} className="px-6 py-4 space-y-4">
            <div className="rounded-lg border overflow-hidden text-sm">
              <div className="px-4 py-2 bg-gray-50 border-b grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-gray-400">Saldo esperado</p>
                  <p className="font-bold text-gray-800">{fmt(caja.saldo_esperado)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total arqueo</p>
                  <p className="font-bold text-gray-800">{fmt(totalArqueo)}</p>
                </div>
              </div>
              <div className={`px-4 py-3 flex items-center justify-between ${diferencia >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className={`font-semibold text-sm ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {diferencia >= 0 ? 'Sobrante' : 'Faltante'}
                </span>
                <span className={`text-lg font-bold ${diferencia >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {diferencia >= 0 ? '+' : ''}{fmt(diferencia)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empleado que cierra *</label>
              <select required value={form.empleado_cierre}
                onChange={(e) => setForm({ ...form, empleado_cierre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-400">
                <option value="">Seleccionar empleado</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
              <textarea rows={2} value={form.notas_cierre}
                onChange={(e) => setForm({ ...form, notas_cierre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-red-400" />
            </div>

            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setPaso(1)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                ← Regresar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LockClosedIcon className="h-4 w-4" />}
                Cerrar Caja
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Modal Movimiento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModalMovimiento({ cajaId, empleados, onGuardado, onClose }) {
  const [form, setForm] = useState({ caja: cajaId, tipo: 'ingreso', concepto: '', descripcion: '', monto: '', empleado: '', categoria: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`${API_CAJA}/movimientos/`, {
        method: 'POST',
        headers: jsonHdrs(),
        body: JSON.stringify({ ...form, monto: parseFloat(form.monto), empleado: parseInt(form.empleado) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail || JSON.stringify(data)); return; }
      onGuardado(data);
    } catch { setErr('Error de conexión.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Registrar Movimiento</h2>
          <button onClick={onClose}><XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        {err && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-2">
            {['ingreso', 'egreso'].map((t) => (
              <button key={t} type="button"
                onClick={() => setForm({ ...form, tipo: t })}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${form.tipo === t
                  ? t === 'ingreso' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empleado *</label>
            <select required value={form.empleado} onChange={(e) => setForm({ ...form, empleado: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">Seleccionar empleado</option>
              {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} {e.apellido}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Concepto *</label>
              <input required type="text" value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
              <input required type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría (opcional)</label>
            <input type="text" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder="Operativo, Servicios, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// â”€â”€â”€ Panel Caja Activa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CajaActiva({ caja, ventas, movimientos, empleados, onRefresh, setModal }) {
  const metodoPagoColor = { efectivo: 'green', tarjeta: 'blue', transferencia: 'purple', mixto: 'orange' };
  const metodoPagoLabel = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', mixto: 'Mixto' };

  return (
    <div className="space-y-6">
      {/* Header caja */}
      <div className="bg-white rounded-xl border border-green-200 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 rounded-xl">
            <LockOpenIcon className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Caja activa</p>
            <h2 className="text-xl font-bold text-gray-900">{caja.folio}</h2>
            <p className="text-sm text-gray-500">
              Apertura: <span className="font-medium">{caja.fecha_apertura_formateada}</span>
              {' · '}{caja.empleado_apertura_nombre}
              {' · '}Inicial: <span className="font-medium">{fmt(caja.monto_inicial)}</span>
            </p>
          </div>
        </div>
        <div className="sm:ml-auto flex gap-2 flex-wrap">
          <button onClick={() => setModal('movimiento')}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" /> Movimiento
          </button>
          <button onClick={onRefresh}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1.5 text-gray-600">
            <ArrowPathIcon className="h-4 w-4" /> Actualizar
          </button>
          <button onClick={() => setModal('cierre')}
            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center gap-1.5">
            <LockClosedIcon className="h-4 w-4" /> Cerrar Caja
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ShoppingCartIcon} label="Ventas registradas" value={caja.num_ventas ?? 0} color="blue" />
        <StatCard icon={CurrencyDollarIcon} label="Total ventas" value={fmt(caja.total_ventas)} color="green" />
        <StatCard icon={BanknotesIcon} label="Efectivo" value={fmt(caja.total_ventas_efectivo)} color="orange"
          sub={`Electrónico: ${fmt(caja.total_ventas_electronico)}`} />
        <StatCard icon={CalculatorIcon} label="Saldo esperado" value={fmt(caja.saldo_esperado)} color="purple"
          sub={`Egresos: ${fmt(caja.total_egresos)}`} />
      </div>

      {/* Ventas del día */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <ShoppingCartIcon className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-800">Ventas en esta caja</h3>
          <span className="ml-auto text-sm text-gray-400">{ventas.length} venta(s)</span>
        </div>
        {ventas.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            Sin ventas registradas en esta caja aún.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Folio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Art.</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Efectivo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Electrónico</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ventas.map((v) => (
                  <tr key={v.id} className="hover:bg-blue-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-800">{v.folio}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{v.fecha_formateada}</td>
                    <td className="px-4 py-3 text-gray-700">{v.empleado_nombre}</td>
                    <td className="px-4 py-3">
                      <Badge text={metodoPagoLabel[v.metodo_pago] ?? v.metodo_pago}
                        color={metodoPagoColor[v.metodo_pago] ?? 'gray'} />
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{v.total_items}</td>
                    <td className="px-4 py-3 text-right text-green-700 font-mono">{fmt(v.monto_efectivo)}</td>
                    <td className="px-4 py-3 text-right text-blue-700 font-mono">{fmt(v.monto_electronico)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(v.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-gray-600">Totales</td>
                  <td className="px-4 py-2 text-right font-bold text-green-700">
                    {fmt(ventas.reduce((s, v) => s + parseFloat(v.monto_efectivo || 0), 0))}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-blue-700">
                    {fmt(ventas.reduce((s, v) => s + parseFloat(v.monto_electronico || 0), 0))}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">
                    {fmt(ventas.reduce((s, v) => s + parseFloat(v.total || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Movimientos extra */}
      {movimientos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <ArrowUpIcon className="h-5 w-5 text-gray-400" />
            <h3 className="font-semibold text-gray-800">Movimientos de caja</h3>
            <span className="ml-auto text-sm text-gray-400">{movimientos.length} movimiento(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Concepto</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{m.fecha_formateada}</td>
                    <td className="px-4 py-2">
                      <Badge text={m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                        color={m.tipo === 'ingreso' ? 'green' : 'red'} />
                    </td>
                    <td className="px-4 py-2 text-gray-700">{m.concepto}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{m.categoria || '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold font-mono ${m.tipo === 'ingreso' ? 'text-green-700' : 'text-red-700'}`}>
                      {m.tipo === 'ingreso' ? '+' : '-'}{fmt(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Panel Historial â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Historial() {
  const [periodo, setPeriodo] = useState('hoy');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cajasAbiertas, setCajasAbiertas] = useState({});
  const [ventasCaja, setVentasCaja] = useState({});

  const cargar = useCallback(async (p, fi, ff) => {
    setLoading(true); setError(null);
    try {
      let url = `${API_CAJA}/cajas/historial/?periodo=${p}`;
      if (p === 'rango') url += `&fecha_inicio=${fi}&fecha_fin=${ff}`;
      const res = await fetch(url, { headers: hdrs() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar('hoy', '', ''); }, [cargar]);

  const toggleCaja = async (cajaId) => {
    const abierto = cajasAbiertas[cajaId];
    if (abierto) { setCajasAbiertas((s) => ({ ...s, [cajaId]: false })); return; }
    setCajasAbiertas((s) => ({ ...s, [cajaId]: true }));
    if (ventasCaja[cajaId]) return;
    try {
      const res = await fetch(`${API_CAJA}/cajas/${cajaId}/ventas_caja/`, { headers: hdrs() });
      const d = await res.json();
      setVentasCaja((s) => ({ ...s, [cajaId]: d }));
    } catch { /* silencio */ }
  };

  const periodos = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' },
    { key: 'rango', label: 'Rango' },
  ];

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
        <div className="flex gap-2 flex-wrap">
          {periodos.map((p) => (
            <button key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${periodo === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'rango' && (
          <div className="flex gap-2 items-center ml-2">
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            <span className="text-gray-400">–</span>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </div>
        )}
        <button onClick={() => cargar(periodo, fechaInicio, fechaFin)}
          className="ml-2 px-4 py-1.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
          {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
          Buscar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {data && (
        <>
          {/* Totales período */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={DocumentTextIcon} label="Cajas" value={data.totales.cajas} color="blue" />
            <StatCard icon={ShoppingCartIcon} label="Ventas totales" value={fmt(data.totales.monto_ventas)} color="green"
              sub={`${data.totales.ventas} venta(s)`} />
            <StatCard icon={BanknotesIcon} label="Efectivo" value={fmt(data.totales.efectivo)} color="orange"
              sub={`Electrónico: ${fmt(data.totales.electronico)}`} />
            <StatCard icon={ArrowDownIcon} label="Egresos" value={fmt(data.totales.egresos)} color="red" />
          </div>

          {/* Lista de cajas */}
          {data.cajas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay cajas en este período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.cajas.map((c) => {
                const abierta = cajasAbiertas[c.id];
                const vc = ventasCaja[c.id];
                return (
                  <div key={c.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <button onClick={() => toggleCaja(c.id)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 text-left">
                      {abierta
                        ? <ChevronDownIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        : <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />}
                      <div className="w-28 flex-shrink-0">
                        <p className="font-mono font-semibold text-gray-800">{c.folio}</p>
                        <Badge text={c.estado} color={c.estado === 'abierta' ? 'green' : 'gray'} />
                      </div>
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Apertura</p>
                          <p className="font-medium text-gray-700">{c.fecha_apertura}</p>
                          <p className="text-xs text-gray-500">{c.empleado_apertura}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Ventas ({c.num_ventas})</p>
                          <p className="font-semibold text-green-700">{fmt(c.total_ventas)}</p>
                          <p className="text-xs text-gray-400">Ef: {fmt(c.total_ventas_efectivo)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Saldo esperado</p>
                          <p className="font-bold text-gray-800">{fmt(c.saldo_esperado)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Diferencia</p>
                          {c.diferencia !== null ? (
                            <p className={`font-bold ${c.diferencia >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {c.diferencia >= 0 ? '+' : ''}{fmt(c.diferencia)}
                            </p>
                          ) : <p className="text-gray-400 text-xs">Sin cierre</p>}
                        </div>
                      </div>
                    </button>

                    {/* Detalle de ventas de la caja */}
                    {abierta && vc && (
                      <div className="border-t border-gray-100 overflow-x-auto">
                        <div className="px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                          Ventas registradas en {c.folio}
                        </div>
                        {vc.ventas && vc.ventas.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-gray-400">Sin ventas en esta caja.</p>
                        ) : (
                          <table className="min-w-full text-sm">
                            <thead className="bg-white border-b border-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Folio</th>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Hora</th>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Empleado</th>
                                <th className="px-4 py-2 text-left text-xs text-gray-400 font-medium">Método</th>
                                <th className="px-4 py-2 text-right text-xs text-gray-400 font-medium">Efectivo</th>
                                <th className="px-4 py-2 text-right text-xs text-gray-400 font-medium">Electrónico</th>
                                <th className="px-4 py-2 text-right text-xs text-gray-400 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {(vc.ventas || []).map((v) => (
                                <tr key={v.id} className="hover:bg-blue-50">
                                  <td className="px-4 py-2 font-mono font-semibold text-gray-800">{v.folio}</td>
                                  <td className="px-4 py-2 text-xs text-gray-500">{v.fecha_formateada}</td>
                                  <td className="px-4 py-2 text-gray-700">{v.empleado_nombre}</td>
                                  <td className="px-4 py-2">
                                    <Badge text={v.metodo_pago}
                                      color={{ efectivo: 'green', tarjeta: 'blue', transferencia: 'purple', mixto: 'orange' }[v.metodo_pago] ?? 'gray'} />
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-green-700">{fmt(v.monto_efectivo)}</td>
                                  <td className="px-4 py-2 text-right font-mono text-blue-700">{fmt(v.monto_electronico)}</td>
                                  <td className="px-4 py-2 text-right font-bold text-gray-900">{fmt(v.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// â”€â”€â”€ PÃ¡gina principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Caja() {
  const [tab, setTab] = useState('activa');
  const [cajaActual, setCajaActual] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exito, setExito] = useState(null);
  const [modal, setModal] = useState(null); // 'apertura' | 'cierre' | 'movimiento'
  const autoRefreshRef = useRef(null);

  const cargarCaja = useCallback(async () => {
    try {
      const res = await fetch(`${API_CAJA}/cajas/caja_actual/`, { headers: hdrs() });
      if (res.ok) {
        const caja = await res.json();
        setCajaActual(caja);
        const [resV, resM] = await Promise.all([
          fetch(`${API_CAJA}/cajas/${caja.id}/ventas_caja/`, { headers: hdrs() }),
          fetch(`${API_CAJA}/movimientos/?caja=${caja.id}`, { headers: hdrs() }),
        ]);
        if (resV.ok) { const d = await resV.json(); setVentas(d.ventas ?? []); }
        if (resM.ok) { const d = await resM.json(); setMovimientos(Array.isArray(d) ? d : d.results ?? []); }
      } else {
        setCajaActual(null); setVentas([]); setMovimientos([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const cargarEmpleados = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:8000/api/nomina/empleados/?activos=true', { headers: hdrs() });
      if (res.ok) { const d = await res.json(); setEmpleados(Array.isArray(d) ? d : d.results ?? []); }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    cargarCaja();
    cargarEmpleados();
    autoRefreshRef.current = setInterval(cargarCaja, 45000);
    return () => clearInterval(autoRefreshRef.current);
  }, [cargarCaja, cargarEmpleados]);

  const ok = (msg) => { setExito(msg); setTimeout(() => setExito(null), 5000); };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control de apertura, ventas, movimientos y cierre diario</p>
        </div>
        <div className="flex items-center gap-3">
          {cajaActual?.estado === 'abierta'
            ? <Badge text="🟢 Caja abierta" color="green" />
            : <Badge text="⚫ Sin caja activa" color="gray" />}
        </div>
      </div>

      {exito && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          {exito}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'activa', label: 'Caja Activa', icon: LockOpenIcon },
          { key: 'historial', label: 'Historial', icon: CalendarDaysIcon },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors ${tab === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Caja Activa */}
      {tab === 'activa' && (
        loading ? (
          <div className="text-center py-20 text-gray-400">
            <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto mb-3" />
            Cargando caja...
          </div>
        ) : cajaActual && cajaActual.estado === 'abierta' ? (
          <CajaActiva
            caja={cajaActual}
            ventas={ventas}
            movimientos={movimientos}
            empleados={empleados}
            onRefresh={cargarCaja}
            setModal={setModal}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="p-5 bg-gray-100 rounded-full mb-4">
              <LockClosedIcon className="h-14 w-14 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-700 mb-1">No hay caja abierta</h2>
            <p className="text-gray-400 text-sm mb-6">Abre una caja para comenzar a registrar ventas.</p>
            <button onClick={() => setModal('apertura')}
              className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold flex items-center gap-2 shadow-md">
              <LockOpenIcon className="h-5 w-5" />
              Abrir Caja
            </button>
          </div>
        )
      )}

      {/* Tab: Historial */}
      {tab === 'historial' && <Historial />}

      {/* Modales */}
      {modal === 'apertura' && (
        <ModalApertura
          empleados={empleados}
          onGuardado={(data) => { setCajaActual(data); setModal(null); ok(`Caja ${data.folio} abierta exitosamente.`); cargarCaja(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'cierre' && cajaActual && (
        <ModalCierre
          caja={cajaActual}
          empleados={empleados}
          onGuardado={(data) => { setCajaActual(data); setModal(null); ok(`Caja ${data.folio} cerrada. Diferencia: ${fmt(data.diferencia ?? 0)}`); cargarCaja(); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'movimiento' && cajaActual && (
        <ModalMovimiento
          cajaId={cajaActual.id}
          empleados={empleados}
          onGuardado={() => { setModal(null); ok('Movimiento registrado.'); cargarCaja(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
