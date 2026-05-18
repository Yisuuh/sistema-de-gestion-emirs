import { useState, useEffect } from 'react';
import { useConfirm } from '../../lib/confirm';
import {
  EnvelopeIcon,
  PlusIcon,
  PaperAirplaneIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  PencilIcon,
  ArrowPathIcon,
  BellAlertIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
const API = '/api/notificaciones';
const apiFetch = (url, opts = {}) => fetch(url, {
  ...opts,
  headers: {
    ...opts.headers,
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

// ─── Formularios vacíos ────────────────────────────────────────────────────
const PLANTILLA_VACIA = { nombre: '', tipo: 'recordatorio', asunto: '', cuerpo_html: '', activa: true };
const RECORDATORIO_VACIO = {
  nombre: '',
  plantilla: '',
  frecuencia: 'mensual',
  proxima_ejecucion: '',
  estado: 'activo',
};

const TIPOS = [
  { value: 'recordatorio', label: 'Recordatorio' },
  { value: 'publicidad', label: 'Publicidad' },
  { value: 'otro', label: 'Otro' },
];

const FRECUENCIAS = [
  { value: 'unico', label: 'Envío único' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral (cada 2 meses)' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

// ─── Helper fecha local para input datetime-local ─────────────────────────
function ahoraLocalISO() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

// ─── Badge ─────────────────────────────────────────────────────────────────
function Badge({ text, color = 'gray' }) {
  const map = {
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-red-100 text-[#a80008]',
    gray: 'bg-gray-100 text-gray-600',
    purple: 'bg-purple-100 text-purple-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[color] ?? map.gray}`}>
      {text}
    </span>
  );
}

export default function Notificaciones() {
  const confirm = useConfirm();
  const [tab, setTab] = useState('plantillas'); // 'plantillas' | 'recordatorios' | 'historial'

  // ─── Plantillas ──────────────────────────────────────────────────────────
  const [plantillas, setPlantillas] = useState([]);
  const [modalPlantilla, setModalPlantilla] = useState(false);
  const [plantillaForm, setPlantillaForm] = useState(PLANTILLA_VACIA);
  const [plantillaEditando, setPlantillaEditando] = useState(null);
  const [savingPlantilla, setSavingPlantilla] = useState(false);

  // ─── Recordatorios ───────────────────────────────────────────────────────
  const [recordatorios, setRecordatorios] = useState([]);
  const [modalRecordatorio, setModalRecordatorio] = useState(false);
  const [recForm, setRecForm] = useState(RECORDATORIO_VACIO);
  const [recEditando, setRecEditando] = useState(null);
  const [savingRec, setSavingRec] = useState(false);
  const [ejecutandoRec, setEjecutandoRec] = useState(null);

  // ─── Envío manual ────────────────────────────────────────────────────────
  const [modalEnvio, setModalEnvio] = useState(false);
  const [envioPlantillaId, setEnvioPlantillaId] = useState('');
  const [enviandoManual, setEnviandoManual] = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [clientesSeleccionados, setClientesSeleccionados] = useState([]); // [] = todos
  const [soloSeleccionados, setSoloSeleccionados] = useState(false);

  // ─── Historial ──────────────────────────────────────────────
  const [historial, setHistorial] = useState([]);
  const [filtrosHistorial, setFiltrosHistorial] = useState({ estado: '', fecha_inicio: '', fecha_fin: '' });
  const [errorDetalle, setErrorDetalle] = useState(null); // { id, mensaje }

  // ─── Feedback global ─────────────────────────────────────────────────────
  const [exito, setExito] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const ok = (msg) => { setExito(msg); setTimeout(() => setExito(null), 4000); };
  const err = (msg) => { setError(msg); setTimeout(() => setError(null), 5000); };

  // ─── Cargar datos ─────────────────────────────────────────────────────────
  useEffect(() => { cargarTodo(); }, []);

  const cargarTodo = async () => {
    setLoading(true);
    await Promise.all([cargarPlantillas(), cargarRecordatorios(), cargarHistorial()]);
    setLoading(false);
  };

  const cargarPlantillas = async () => {
    const res = await apiFetch(`${API}/plantillas/`);
    if (res.ok) {
      const d = await res.json();
      setPlantillas(Array.isArray(d) ? d : d.results || []);
    }
  };

  const cargarRecordatorios = async () => {
    const res = await apiFetch(`${API}/recordatorios/`);
    if (res.ok) {
      const d = await res.json();
      setRecordatorios(Array.isArray(d) ? d : d.results || []);
    }
  };

  const cargarHistorial = async (filtros = filtrosHistorial) => {
    const params = new URLSearchParams();
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.fecha_inicio) params.set('fecha_inicio', filtros.fecha_inicio);
    if (filtros.fecha_fin) params.set('fecha_fin', filtros.fecha_fin);
    const qs = params.toString();
    const res = await apiFetch(`${API}/historial/${qs ? '?' + qs : ''}`);
    if (res.ok) {
      const d = await res.json();
      setHistorial(Array.isArray(d) ? d : d.results || []);
    }
  };

  const cargarClientes = async () => {
    if (clientes.length) return;
    try {
      const res = await apiFetch('/api/clientes/clientes/?page_size=200');
      if (res.ok) {
        const d = await res.json();
        setClientes(Array.isArray(d) ? d : d.results || []);
      }
    } catch { /* silencio */ }
  };

  const abrirEnvioManual = () => {
    setEnvioPlantillaId('');
    setClientesSeleccionados([]);
    setSoloSeleccionados(false);
    setResultadoEnvio(null);
    cargarClientes();
    setModalEnvio(true);
  };

  // ─── Plantillas CRUD ─────────────────────────────────────────────────────
  const abrirNuevaPlantilla = () => {
    setPlantillaEditando(null);
    setPlantillaForm(PLANTILLA_VACIA);
    setModalPlantilla(true);
  };

  const abrirEditarPlantilla = (p) => {
    setPlantillaEditando(p.id);
    setPlantillaForm({ nombre: p.nombre, tipo: p.tipo, asunto: p.asunto, cuerpo_html: p.cuerpo_html, activa: p.activa });
    setModalPlantilla(true);
  };

  const guardarPlantilla = async (e) => {
    e.preventDefault();
    setSavingPlantilla(true);
    try {
      const url = plantillaEditando ? `${API}/plantillas/${plantillaEditando}/` : `${API}/plantillas/`;
      const method = plantillaEditando ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plantillaForm),
      });
      if (res.ok) {
        ok(plantillaEditando ? 'Plantilla actualizada.' : 'Plantilla creada.');
        setModalPlantilla(false);
        cargarPlantillas();
      } else {
        const d = await res.json();
        err(d.detail || JSON.stringify(d));
      }
    } catch { err('Error de conexión.'); }
    finally { setSavingPlantilla(false); }
  };

  const eliminarPlantilla = async (id) => {
    const confirmed = await confirm({
      title: '¿Eliminar plantilla?',
      message: 'Se eliminará permanentemente. No se puede deshacer.',
      variant: 'danger',
    });
    if (!confirmed) return;
    const res = await apiFetch(`${API}/plantillas/${id}/`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      ok('Plantilla eliminada.');
      cargarPlantillas();
    } else {
      err('No se pudo eliminar (puede estar en uso).');
    }
  };

  // ─── Recordatorios CRUD ──────────────────────────────────────────────────
  const abrirNuevoRec = () => {
    setRecEditando(null);
    setRecForm({ ...RECORDATORIO_VACIO, proxima_ejecucion: ahoraLocalISO() });
    setModalRecordatorio(true);
  };

  const abrirEditarRec = (r) => {
    setRecEditando(r.id);
    setRecForm({
      nombre: r.nombre,
      plantilla: r.plantilla,
      frecuencia: r.frecuencia,
      proxima_ejecucion: r.proxima_ejecucion?.slice(0, 16) || ahoraLocalISO(),
      estado: r.estado,
    });
    setModalRecordatorio(true);
  };

  const guardarRec = async (e) => {
    e.preventDefault();
    setSavingRec(true);
    // Convertir datetime-local a ISO con zona horaria
    const payload = {
      ...recForm,
      proxima_ejecucion: new Date(recForm.proxima_ejecucion).toISOString(),
    };
    try {
      const url = recEditando ? `${API}/recordatorios/${recEditando}/` : `${API}/recordatorios/`;
      const method = recEditando ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        ok(recEditando ? 'Recordatorio actualizado.' : 'Recordatorio creado.');
        setModalRecordatorio(false);
        cargarRecordatorios();
      } else {
        const d = await res.json();
        err(d.detail || JSON.stringify(d));
      }
    } catch { err('Error de conexión.'); }
    finally { setSavingRec(false); }
  };

  const ejecutarAhora = async (id, nombre) => {
    const confirmed = await confirm({
      title: '¿Enviar ahora?',
      message: `Se enviará "${nombre}" a todos los clientes con email registrado.`,
      variant: 'send',
      confirmLabel: 'Enviar',
    });
    if (!confirmed) return;
    setEjecutandoRec(id);
    try {
      const res = await apiFetch(`${API}/recordatorios/${id}/ejecutar_ahora/`, { method: 'POST' });
      const d = await res.json();
      ok(`Enviados: ${d.enviados} | Fallidos: ${d.fallidos}`);
      cargarHistorial();
    } catch { err('Error al ejecutar.'); }
    finally { setEjecutandoRec(null); }
  };

  // ─── Envío manual ────────────────────────────────────────────────────────
  const enviarManual = async (e) => {
    e.preventDefault();
    setEnviandoManual(true);
    setResultadoEnvio(null);
    try {
      const res = await apiFetch(`${API}/enviar-manual/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantilla_id: Number(envioPlantillaId) }),
      });
      const d = await res.json();
      if (res.ok) {
        setResultadoEnvio(d);
        cargarHistorial();
      } else {
        err(d.error || 'Error al enviar.');
      }
    } catch { err('Error de conexión.'); }
    finally { setEnviandoManual(false); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Notificaciones y Correos</h1>
          <p className="text-gray-600 text-sm sm:text-base">Plantillas, recordatorios automáticos e historial</p>
        </div>
        <button
          onClick={() => abrirEnvioManual()}
          className="flex items-center gap-2 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] whitespace-nowrap text-sm sm:text-base"
        >
          <PaperAirplaneIcon className="h-5 w-5" />
          Enviar correo manual
        </button>
      </div>

      {/* Feedback */}
      {exito && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5" /> {exito}
        </div>
      )}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <XCircleIcon className="h-5 w-5" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4 sm:mb-6">
        {[
          { id: 'plantillas', label: 'Plantillas', icon: DocumentTextIcon },
          { id: 'recordatorios', label: 'Recordatorios automáticos', icon: BellAlertIcon },
          { id: 'historial', label: 'Historial', icon: ClockIcon },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
              tab === id ? 'bg-[#df000a] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Plantillas ──────────────────────────────────────────────── */}
      {tab === 'plantillas' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={abrirNuevaPlantilla}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <PlusIcon className="h-5 w-5" /> Nueva plantilla
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asunto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {plantillas.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Sin plantillas aún</td></tr>
                )}
                {plantillas.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{p.nombre}</td>
                    <td className="px-6 py-4">
                      <Badge
                        text={p.tipo_display}
                        color={p.tipo === 'recordatorio' ? 'blue' : p.tipo === 'publicidad' ? 'purple' : 'gray'}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{p.asunto}</td>
                    <td className="px-6 py-4">
                      <Badge text={p.activa ? 'Activa' : 'Inactiva'} color={p.activa ? 'green' : 'gray'} />
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => abrirEditarPlantilla(p)} className="text-[#df000a] hover:text-[#a80008]">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button onClick={() => eliminarPlantilla(p.id)} className="text-red-500 hover:text-red-700">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Info variables */}
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-[#a80008]">
            <strong>Variables disponibles en el cuerpo:</strong>
            {' '}<code>{'{{nombre}}'}</code>,{' '}
            <code>{'{{vehiculo}}'}</code>,{' '}
            <code>{'{{medida}}'}</code>,{' '}
            <code>{'{{fecha}}'}</code>
          </div>
        </div>
      )}

      {/* ── TAB: Recordatorios ───────────────────────────────────────────── */}
      {tab === 'recordatorios' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={abrirNuevoRec}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <PlusIcon className="h-5 w-5" /> Nuevo recordatorio
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plantilla</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frecuencia</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Próximo envío</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recordatorios.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Sin recordatorios aún</td></tr>
                )}
                {recordatorios.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{r.nombre}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.plantilla_nombre}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{r.frecuencia_display}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {new Date(r.proxima_ejecucion).toLocaleString('es-MX')}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        text={r.estado_display}
                        color={r.estado === 'activo' ? 'green' : r.estado === 'pausado' ? 'yellow' : 'gray'}
                      />
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button
                        onClick={() => ejecutarAhora(r.id, r.nombre)}
                        disabled={ejecutandoRec === r.id}
                        className="text-green-600 hover:text-green-800 disabled:opacity-50"
                        title="Enviar ahora"
                      >
                        {ejecutandoRec === r.id
                          ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                          : <PaperAirplaneIcon className="h-4 w-4" />}
                      </button>
                      <button onClick={() => abrirEditarRec(r)} className="text-[#df000a] hover:text-[#a80008]">
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <strong>¿Cómo funciona el envío automático?</strong>
            {' '}En el servidor Linux, configura un cron que ejecute diariamente:{' '}
            <code className="bg-yellow-100 px-1 rounded">python manage.py enviar_recordatorios</code>
          </div>
        </div>
      )}

      {/* ── TAB: Historial ───────────────────────────────────────────────── */}
      {tab === 'historial' && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
              <select
                value={filtrosHistorial.estado}
                onChange={(e) => setFiltrosHistorial({ ...filtrosHistorial, estado: e.target.value })}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a]"
              >
                <option value="">Todos</option>
                <option value="enviado">Enviado</option>
                <option value="error">Error</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input type="date" value={filtrosHistorial.fecha_inicio}
                onChange={(e) => setFiltrosHistorial({ ...filtrosHistorial, fecha_inicio: e.target.value })}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input type="date" value={filtrosHistorial.fecha_fin}
                onChange={(e) => setFiltrosHistorial({ ...filtrosHistorial, fecha_fin: e.target.value })}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a]" />
            </div>
            <button
              onClick={() => cargarHistorial(filtrosHistorial)}
              className="px-4 py-1.5 bg-[#df000a] text-white rounded-lg text-sm font-medium hover:bg-[#c4000a]"
            >
              Filtrar
            </button>
            <button
              onClick={() => {
                const reset = { estado: '', fecha_inicio: '', fecha_fin: '' };
                setFiltrosHistorial(reset);
                cargarHistorial(reset);
              }}
              className="px-4 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Limpiar
            </button>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Destinatario</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asunto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recordatorio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {historial.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Sin envíos registrados</td></tr>
                )}
                {historial.map((h) => (
                  <>
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm">
                        <div className="font-medium text-gray-900">{h.destinatario_nombre}</div>
                        <div className="text-gray-500">{h.destinatario_email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{h.asunto}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{h.recordatorio_nombre || '—'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Badge text={h.estado} color={h.estado === 'enviado' ? 'green' : 'red'} />
                          {h.estado === 'error' && h.error_detalle && (
                            <button
                              onClick={() => setErrorDetalle(errorDetalle?.id === h.id ? null : { id: h.id, mensaje: h.error_detalle })}
                              className="text-xs text-red-600 underline hover:text-red-800"
                            >
                              {errorDetalle?.id === h.id ? 'Ocultar' : 'Ver error'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(h.enviado_at).toLocaleString('es-MX')}
                      </td>
                    </tr>
                    {errorDetalle?.id === h.id && (
                      <tr key={`err-${h.id}`} className="bg-red-50">
                        <td colSpan={5} className="px-6 py-3 text-xs text-red-700 font-mono">
                          {errorDetalle.mensaje}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal Plantilla ──────────────────────────────────────────────── */}
      {modalPlantilla && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{plantillaEditando ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
              <button onClick={() => setModalPlantilla(false)}><XMarkIcon className="h-6 w-6 text-gray-500" /></button>
            </div>
            <form onSubmit={guardarPlantilla} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre interno *</label>
                  <input
                    required type="text"
                    value={plantillaForm.nombre}
                    onChange={(e) => setPlantillaForm({ ...plantillaForm, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                    placeholder="ej. Recordatorio calibración"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                  <select
                    value={plantillaForm.tipo}
                    onChange={(e) => setPlantillaForm({ ...plantillaForm, tipo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                  >
                    {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asunto *</label>
                <input
                  required type="text"
                  value={plantillaForm.asunto}
                  onChange={(e) => setPlantillaForm({ ...plantillaForm, asunto: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                  placeholder="ej. Recordatorio: calibra las llantas de tu {{vehiculo}}"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuerpo del mensaje (HTML) *
                </label>
                <textarea
                  required rows={10}
                  value={plantillaForm.cuerpo_html}
                  onChange={(e) => setPlantillaForm({ ...plantillaForm, cuerpo_html: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a] font-mono text-sm"
                  placeholder={'<p>Hola {{nombre}},</p>\n<p>Te recordamos calibrar las llantas de tu {{vehiculo}}...</p>'}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Variables: {'{{nombre}}'}, {'{{vehiculo}}'}, {'{{medida}}'}, {'{{fecha}}'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="activa"
                  checked={plantillaForm.activa}
                  onChange={(e) => setPlantillaForm({ ...plantillaForm, activa: e.target.checked })}
                />
                <label htmlFor="activa" className="text-sm text-gray-700">Plantilla activa</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalPlantilla(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingPlantilla}
                  className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50">
                  {savingPlantilla ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Recordatorio ───────────────────────────────────────────── */}
      {modalRecordatorio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{recEditando ? 'Editar recordatorio' : 'Nuevo recordatorio'}</h2>
              <button onClick={() => setModalRecordatorio(false)}><XMarkIcon className="h-6 w-6 text-gray-500" /></button>
            </div>
            <form onSubmit={guardarRec} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  required type="text"
                  value={recForm.nombre}
                  onChange={(e) => setRecForm({ ...recForm, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                  placeholder="ej. Calibración mensual"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla *</label>
                  <select
                    required
                    value={recForm.plantilla}
                    onChange={(e) => setRecForm({ ...recForm, plantilla: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                  >
                    <option value="">Seleccionar…</option>
                    {plantillas.filter((p) => p.activa).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frecuencia *</label>
                  <select
                    value={recForm.frecuencia}
                    onChange={(e) => setRecForm({ ...recForm, frecuencia: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                  >
                    {FRECUENCIAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Próximo envío *</label>
                <input
                  required type="datetime-local"
                  value={recForm.proxima_ejecucion}
                  onChange={(e) => setRecForm({ ...recForm, proxima_ejecucion: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={recForm.estado}
                  onChange={(e) => setRecForm({ ...recForm, estado: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                >
                  <option value="activo">Activo</option>
                  <option value="pausado">Pausado</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalRecordatorio(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingRec}
                  className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50">
                  {savingRec ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Envío Manual ───────────────────────────────────────────── */}
      {modalEnvio && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Enviar correo</h2>
              <button onClick={() => { setModalEnvio(false); setResultadoEnvio(null); }}>
                <XMarkIcon className="h-6 w-6 text-gray-500" />
              </button>
            </div>
            {resultadoEnvio ? (
              <div className="text-center py-4">
                <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-gray-800">¡Envío completado!</p>
                <p className="text-gray-600 mt-1">
                  <span className="text-green-700 font-medium">{resultadoEnvio.enviados}</span> enviados —{' '}
                  <span className="text-red-600 font-medium">{resultadoEnvio.fallidos}</span> fallidos
                </p>
                <button
                  onClick={() => { setModalEnvio(false); setResultadoEnvio(null); }}
                  className="mt-4 px-6 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a]"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={enviarManual} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla *</label>
                  <select
                    required
                    value={envioPlantillaId}
                    onChange={(e) => setEnvioPlantillaId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#df000a]"
                  >
                    <option value="">Seleccionar plantilla…</option>
                    {plantillas.filter((p) => p.activa).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} — {p.asunto}</option>
                    ))}
                  </select>
                </div>
                {/* Selector de destinatarios */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Destinatarios</label>
                  <div className="flex gap-3 mb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        checked={!soloSeleccionados}
                        onChange={() => setSoloSeleccionados(false)}
                        className="text-[#df000a]"
                      />
                      Todos los clientes con email
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        checked={soloSeleccionados}
                        onChange={() => setSoloSeleccionados(true)}
                        className="text-[#df000a]"
                      />
                      Seleccionar clientes
                    </label>
                  </div>
                  {soloSeleccionados && (
                    <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-lg divide-y divide-gray-100">
                      {clientes.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-gray-400 text-center">Cargando clientes…</p>
                      ) : (
                        clientes.filter((c) => c.email).map((c) => (
                          <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-red-50 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={clientesSeleccionados.includes(c.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setClientesSeleccionados((prev) => [...prev, c.id]);
                                } else {
                                  setClientesSeleccionados((prev) => prev.filter((id) => id !== c.id));
                                }
                              }}
                              className="text-[#df000a]"
                            />
                            <span className="font-medium text-gray-800">{c.nombre}</span>
                            <span className="text-gray-400 text-xs ml-auto">{c.email}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {soloSeleccionados && clientesSeleccionados.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">{clientesSeleccionados.length} cliente(s) seleccionado(s)</p>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setModalEnvio(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button type="submit" disabled={enviandoManual || (soloSeleccionados && clientesSeleccionados.length === 0)}
                    className="flex-1 px-4 py-2 bg-[#df000a] text-white rounded-lg hover:bg-[#c4000a] disabled:opacity-50 flex items-center justify-center gap-2">
                    {enviandoManual
                      ? <><ArrowPathIcon className="h-4 w-4 animate-spin" /> Enviando…</>
                      : <><PaperAirplaneIcon className="h-4 w-4" /> Enviar</>}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
