import { useEffect, useState } from 'react';
import {
  DocumentCheckIcon, ClockIcon, MagnifyingGlassIcon, XMarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

const API = '/api/ventas/ventas';
const hdrs = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});
const $fetch = async (url, opts = {}) => {
  const res = await fetch(url, { headers: hdrs(), ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || JSON.stringify(err));
  }
  return res.status === 204 ? null : res.json();
};
const fmt = (n) => Number(n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function Facturacion() {
  const [tab, setTab] = useState('pendientes'); // pendientes | todas
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busq, setBusq] = useState('');
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [modalFacturar, setModalFacturar] = useState(null); // venta seleccionada
  const [cfdiInput, setCfdiInput] = useState('');
  const [saving, setSaving] = useState(false);

  const showExito = (msg) => { setExito(msg); setTimeout(() => setExito(null), 3000); };

  useEffect(() => { cargar(); }, [tab]);

  const cargar = async () => {
    setLoading(true);
    try {
      let url;
      if (tab === 'pendientes') {
        url = `${API}/pendientes_facturar/`;
      } else {
        url = `${API}/?search=${busq}`;
      }
      const data = await $fetch(url);
      setVentas(data.results ?? data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const marcarFacturada = async () => {
    if (!modalFacturar) return;
    setSaving(true);
    try {
      await $fetch(`${API}/${modalFacturar.id}/marcar_facturada/`, {
        method: 'PATCH',
        body: JSON.stringify({ cfdi_uuid: cfdiInput }),
      });
      showExito(`Venta ${modalFacturar.folio} marcada como facturada`);
      setModalFacturar(null);
      setCfdiInput('');
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const ventasFiltradas = ventas.filter((v) =>
    !busq || v.folio?.toLowerCase().includes(busq.toLowerCase()) ||
    v.cliente_nombre?.toLowerCase().includes(busq.toLowerCase())
  );

  const totalPendientes = ventasFiltradas.reduce((s, v) => s + parseFloat(v.total || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facturación</h1>
        <p className="text-sm text-gray-500 mt-0.5">Control de ventas facturadas y pendientes de CFDI</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
        </div>
      )}
      {exito && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{exito}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-5">
        {[
          { id: 'pendientes', label: 'Pendientes de facturar', icon: ClockIcon },
          { id: 'todas', label: 'Todas las ventas', icon: DocumentCheckIcon },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === id ? 'bg-white text-[#df000a] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4 max-w-sm">
        <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a]"
          placeholder="Buscar por folio o cliente…"
          value={busq}
          onChange={(e) => setBusq(e.target.value)}
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-medium text-gray-700">{ventasFiltradas.length} ventas</span>
          {tab === 'pendientes' && (
            <span className="text-sm font-bold text-gray-700">Pendiente: {fmt(totalPendientes)}</span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
        ) : ventasFiltradas.length === 0 ? (
          <div className="p-12 text-center">
            <DocumentCheckIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {tab === 'pendientes' ? 'No hay ventas pendientes de facturar' : 'No hay ventas'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left">Folio</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-left">UUID CFDI</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventasFiltradas.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono font-medium text-[#df000a]">{v.folio}</td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDate(v.fecha)}</td>
                    <td className="px-4 py-2 text-gray-700">{v.cliente_nombre ?? 'Público general'}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(v.total)}</td>
                    <td className="px-4 py-2 text-center">
                      {v.facturada ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Facturada</span>
                      ) : v.factura_pendiente ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pendiente</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Sin factura</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">{v.cfdi_uuid || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      {!v.facturada && (
                        <button
                          onClick={() => { setModalFacturar(v); setCfdiInput(''); }}
                          className="flex items-center gap-1 mx-auto text-xs bg-red-50 text-[#df000a] border border-red-200 rounded-lg px-3 py-1 hover:bg-red-100"
                        >
                          <CheckCircleIcon className="w-3.5 h-3.5" /> Facturar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal facturar */}
      {modalFacturar && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Marcar como facturada</h2>
              <button onClick={() => setModalFacturar(null)}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-medium text-gray-700">{modalFacturar.folio}</p>
                <p className="text-gray-500">{fmtDate(modalFacturar.fecha)} — {fmt(modalFacturar.total)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">UUID CFDI (opcional)</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#df000a]"
                  value={cfdiInput}
                  onChange={(e) => setCfdiInput(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalFacturar(null)}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={marcarFacturada} disabled={saving}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {saving ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
