import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import ModalProveedor from './ModalProveedor';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Modal pequeño para Crear / Editar Marcas
function ModalMarca({ isOpen, onClose, marcaAEditar = null, onGuardado }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(marcaAEditar);

  const [nombre, setNombre] = useState('');
  const [activa, setActiva] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Inicializar al abrir
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (marcaAEditar) {
        setNombre(marcaAEditar.nombre || '');
        setActiva(marcaAEditar.activa !== undefined ? Boolean(marcaAEditar.activa) : true);
      } else {
        setNombre('');
        setActiva(true);
      }
    }
  }, [isOpen, marcaAEditar]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setErrorMsg('El nombre de la marca es obligatorio.');
      return;
    }

    setLoading(true);
    try {
      const url = isEdit
        ? `/api/inventario/marcas/${marcaAEditar.id}/`
        : '/api/inventario/marcas/';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          ...tok(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nombre: nombreLimpio,
          activa: Boolean(activa),
        }),
      });

      if (!res.ok) {
        let msg = 'Error al guardar la marca.';
        try {
          const errData = await res.json();
          if (errData.nombre) {
            msg = Array.isArray(errData.nombre) ? errData.nombre[0] : errData.nombre;
          } else if (errData.detail) {
            msg = errData.detail;
          } else {
            msg = JSON.stringify(errData);
          }
        } catch (_) {
          msg = `Error ${res.status}: ${res.statusText}`;
        }
        throw new Error(msg);
      }

      const guardada = await res.json();

      queryClient.invalidateQueries({ queryKey: ['inventario-marcas'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-marcas-catalogo'] });

      if (onGuardado) onGuardado(guardada);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
              <i className="ri-price-tag-3-line text-lg"></i>
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {isEdit ? 'Editar Marca' : 'Nueva Marca'}
              </h3>
              <p className="text-xs text-gray-500">
                {isEdit ? `Marca ID #${marcaAEditar.id}` : 'Catálogo de fabricantes y marcas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl leading-none"></i>
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <i className="ri-error-warning-line text-base text-red-500 shrink-0 mt-0.5"></i>
            <span className="flex-1 font-medium">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Nombre de la Marca *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Michelin, Goodyear, Pirelli, Nexen..."
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activa}
                onChange={(e) => setActiva(e.target.checked)}
                className="w-4 h-4 text-[#df000a] rounded border-gray-300 focus:ring-[#df000a]"
              />
              <div>
                <span className="text-xs font-semibold text-gray-800">Marca Activa</span>
                <p className="text-[11px] text-gray-500">
                  Disponible para registrar nuevos productos y filtros
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[#df000a] hover:bg-[#c4000a] disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{isEdit ? 'Actualizar Marca' : 'Guardar Marca'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal de confirmación genérico para acciones críticas (alternar estado / eliminar)
function ModalConfirmacion({ isOpen, onClose, onConfirm, titulo, mensaje, tipo = 'danger', textoBoton = 'Confirmar', loading = false }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            tipo === 'danger' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
          }`}>
            <i className={`text-xl ${tipo === 'danger' ? 'ri-delete-bin-line' : 'ri-question-line'}`}></i>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{titulo}</h3>
            <p className="text-xs text-gray-500">Esta acción modificará los catálogos del sistema</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6">{mensaje}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-xl font-semibold text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
              tipo === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#df000a] hover:bg-[#b80008]'
            }`}
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            <span>{textoBoton}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TabCatalogos() {
  const esAdmin = localStorage.getItem('rol') === 'admin';
  const queryClient = useQueryClient();

  // Sub-pestaña: 'proveedores' | 'marcas'
  const [subTab, setSubTab] = useState('proveedores');

  // Búsquedas
  const [busquedaProveedores, setBusquedaProveedores] = useState('');
  const [busquedaMarcas, setBusquedaMarcas] = useState('');

  // Modales
  const [modalProveedorOpen, setModalProveedorOpen] = useState(false);
  const [proveedorAEditar, setProveedorAEditar] = useState(null);

  const [modalMarcaOpen, setModalMarcaOpen] = useState(false);
  const [marcaAEditar, setMarcaAEditar] = useState(null);

  // Modal de confirmación
  const [dialogoConfirm, setDialogoConfirm] = useState({
    isOpen: false,
    titulo: '',
    mensaje: '',
    tipo: 'danger',
    textoBoton: 'Confirmar',
    onConfirm: null,
  });

  const [accionLoading, setAccionLoading] = useState(false);
  const [notificacion, setNotificacion] = useState(null);

  const mostrarNotif = (tipo, txt) => {
    setNotificacion({ tipo, txt });
    setTimeout(() => setNotificacion(null), 5000);
  };

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: proveedores = [], isLoading: loadingProveedores } = useQuery({
    queryKey: ['inventario-proveedores-catalogo'],
    queryFn: async () => {
      const res = await fetch('/api/inventario/proveedores/', { headers: tok() });
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : (d.results ?? []);
    },
  });

  const { data: marcas = [], isLoading: loadingMarcas } = useQuery({
    queryKey: ['inventario-marcas-catalogo'],
    queryFn: async () => {
      const res = await fetch('/api/inventario/marcas/', { headers: tok() });
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : (d.results ?? []);
    },
  });

  // ── Filtrado local ───────────────────────────────────────────────────────
  const proveedoresFiltrados = useMemo(() => {
    const q = busquedaProveedores.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.contacto || '').toLowerCase().includes(q) ||
      (p.telefono || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    );
  }, [proveedores, busquedaProveedores]);

  const marcasFiltradas = useMemo(() => {
    const q = busquedaMarcas.trim().toLowerCase();
    if (!q) return marcas;
    return marcas.filter(m => (m.nombre || '').toLowerCase().includes(q));
  }, [marcas, busquedaMarcas]);

  // ── Acciones de Proveedores ───────────────────────────────────────────────
  const alternarEstadoProveedor = async (prov) => {
    setDialogoConfirm({
      isOpen: true,
      titulo: prov.activo ? 'Desactivar Proveedor' : 'Activar Proveedor',
      mensaje: `¿Deseas ${prov.activo ? 'desactivar' : 'activar'} a "${prov.nombre}"? ${
        prov.activo ? 'No aparecerá sugerido en nuevas compras ni entradas.' : 'Volverá a estar disponible en el sistema.'
      }`,
      tipo: prov.activo ? 'warning' : 'default',
      textoBoton: prov.activo ? 'Desactivar' : 'Activar',
      onConfirm: async () => {
        setAccionLoading(true);
        try {
          const res = await fetch(`/api/inventario/proveedores/${prov.id}/`, {
            method: 'PATCH',
            headers: { ...tok(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: !prov.activo }),
          });
          if (!res.ok) throw new Error('No se pudo cambiar el estado del proveedor.');
          queryClient.invalidateQueries({ queryKey: ['inventario-proveedores'] });
          queryClient.invalidateQueries({ queryKey: ['inventario-proveedores-catalogo'] });
          mostrarNotif('ok', `Proveedor "${prov.nombre}" ${!prov.activo ? 'activado' : 'desactivado'} con éxito.`);
          setDialogoConfirm(d => ({ ...d, isOpen: false }));
        } catch (err) {
          mostrarNotif('err', err.message);
        } finally {
          setAccionLoading(false);
        }
      },
    });
  };

  const eliminarProveedor = async (prov) => {
    setDialogoConfirm({
      isOpen: true,
      titulo: 'Eliminar Proveedor',
      mensaje: `¿Estás seguro de eliminar el proveedor "${prov.nombre}"? Si ya cuenta con facturas o entradas registradas, el sistema protegerá la integridad de los datos.`,
      tipo: 'danger',
      textoBoton: 'Eliminar Proveedor',
      onConfirm: async () => {
        setAccionLoading(true);
        try {
          const res = await fetch(`/api/inventario/proveedores/${prov.id}/`, {
            method: 'DELETE',
            headers: tok(),
          });
          if (!res.ok) {
            let msgError = 'No es posible eliminar el proveedor porque tiene entradas de inventario o adeudos asociados. Puedes desactivarlo en su lugar.';
            try {
              const err = await res.json();
              if (err.detail) msgError = err.detail;
            } catch (_) {}
            throw new Error(msgError);
          }
          queryClient.invalidateQueries({ queryKey: ['inventario-proveedores'] });
          queryClient.invalidateQueries({ queryKey: ['inventario-proveedores-catalogo'] });
          mostrarNotif('ok', `Proveedor "${prov.nombre}" eliminado correctamente.`);
          setDialogoConfirm(d => ({ ...d, isOpen: false }));
        } catch (err) {
          mostrarNotif('err', err.message);
          setDialogoConfirm(d => ({ ...d, isOpen: false }));
        } finally {
          setAccionLoading(false);
        }
      },
    });
  };

  // ── Acciones de Marcas ────────────────────────────────────────────────────
  const alternarEstadoMarca = async (marca) => {
    setDialogoConfirm({
      isOpen: true,
      titulo: marca.activa ? 'Desactivar Marca' : 'Activar Marca',
      mensaje: `¿Deseas ${marca.activa ? 'desactivar' : 'activar'} la marca "${marca.nombre}"? ${
        marca.activa ? 'No aparecerá como opción al crear nuevos productos.' : 'Volverá a estar disponible para el inventario.'
      }`,
      tipo: marca.activa ? 'warning' : 'default',
      textoBoton: marca.activa ? 'Desactivar' : 'Activar',
      onConfirm: async () => {
        setAccionLoading(true);
        try {
          const res = await fetch(`/api/inventario/marcas/${marca.id}/`, {
            method: 'PATCH',
            headers: { ...tok(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ activa: !marca.activa }),
          });
          if (!res.ok) throw new Error('No se pudo cambiar el estado de la marca.');
          queryClient.invalidateQueries({ queryKey: ['inventario-marcas'] });
          queryClient.invalidateQueries({ queryKey: ['inventario-marcas-catalogo'] });
          mostrarNotif('ok', `Marca "${marca.nombre}" ${!marca.activa ? 'activada' : 'desactivada'} con éxito.`);
          setDialogoConfirm(d => ({ ...d, isOpen: false }));
        } catch (err) {
          mostrarNotif('err', err.message);
        } finally {
          setAccionLoading(false);
        }
      },
    });
  };

  const eliminarMarca = async (marca) => {
    setDialogoConfirm({
      isOpen: true,
      titulo: 'Eliminar Marca',
      mensaje: `¿Estás seguro de eliminar la marca "${marca.nombre}"? Si ya está asociada a llantas o productos en catálogo, se impedirá su eliminación para proteger los datos.`,
      tipo: 'danger',
      textoBoton: 'Eliminar Marca',
      onConfirm: async () => {
        setAccionLoading(true);
        try {
          const res = await fetch(`/api/inventario/marcas/${marca.id}/`, {
            method: 'DELETE',
            headers: tok(),
          });
          if (!res.ok) {
            let msgError = 'No es posible eliminar la marca porque tiene productos registrados en catálogo. Puedes desactivarla en su lugar.';
            try {
              const err = await res.json();
              if (err.detail) msgError = err.detail;
            } catch (_) {}
            throw new Error(msgError);
          }
          queryClient.invalidateQueries({ queryKey: ['inventario-marcas'] });
          queryClient.invalidateQueries({ queryKey: ['inventario-marcas-catalogo'] });
          mostrarNotif('ok', `Marca "${marca.nombre}" eliminada correctamente.`);
          setDialogoConfirm(d => ({ ...d, isOpen: false }));
        } catch (err) {
          mostrarNotif('err', err.message);
          setDialogoConfirm(d => ({ ...d, isOpen: false }));
        } finally {
          setAccionLoading(false);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Notificación flotante / fija */}
      {notificacion && (
        <div
          className={`p-3 rounded-xl text-sm flex items-center justify-between gap-3 shadow-xs animate-in fade-in ${
            notificacion.tipo === 'ok'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notificacion.tipo === 'ok' ? (
              <CheckCircleIcon className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
              <XCircleIcon className="h-5 w-5 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{notificacion.txt}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotificacion(null)}
            className="text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>
      )}

      {/* Sub-navegación: Proveedores / Marcas */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3 flex-wrap gap-3">
        <div className="flex bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab('proveedores')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'proveedores'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-building-line text-base"></i>
            <span>Proveedores</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-bold">
              {proveedores.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('marcas')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${
              subTab === 'marcas'
                ? 'bg-white text-gray-900 shadow-xs'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <i className="ri-price-tag-3-line text-base"></i>
            <span>Marcas</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-bold">
              {marcas.length}
            </span>
          </button>
        </div>

        {/* Botón principal de creación según pestaña activa (solo administradores) */}
        {esAdmin && (
          subTab === 'proveedores' ? (
            <button
              type="button"
              onClick={() => {
                setProveedorAEditar(null);
                setModalProveedorOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#df000a] hover:bg-[#b80008] text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Nuevo Proveedor</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMarcaAEditar(null);
                setModalMarcaOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#df000a] hover:bg-[#b80008] text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Nueva Marca</span>
            </button>
          )
        )}
      </div>

      {/* ────────────────── VISTA PROVEEDORES ────────────────── */}
      {subTab === 'proveedores' && (
        <div className="space-y-3">
          {/* Barra de búsqueda y contador */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar proveedor por nombre, contacto, teléfono..."
                value={busquedaProveedores}
                onChange={(e) => setBusquedaProveedores(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent transition-colors"
              />
            </div>
            <div className="text-xs text-gray-500 self-center sm:self-auto">
              Mostrando <strong className="text-gray-800">{proveedoresFiltrados.length}</strong> de {proveedores.length} proveedores
            </div>
          </div>

          {/* Tabla de Proveedores */}
          {loadingProveedores ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Nombre / Razón Social
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Contacto / RFC
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Teléfono / Email
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Días Crédito
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {proveedoresFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                          No se encontraron proveedores que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      proveedoresFiltrados.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {p.nombre}
                            {p.direccion && (
                              <p className="text-[11px] text-gray-500 font-normal line-clamp-1">
                                {p.direccion}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {p.contacto || <span className="text-gray-400 italic">Sin contacto</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            <div>{p.telefono || <span className="text-gray-400">—</span>}</div>
                            {p.email && (
                              <div className="text-gray-500 font-mono text-[11px]">{p.email}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {p.dias_credito ?? 0} días
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                p.activo
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {p.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {esAdmin ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Botón Editar */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProveedorAEditar(p);
                                    setModalProveedorOpen(true);
                                  }}
                                  title="Editar proveedor"
                                  className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <PencilSquareIcon className="h-4 w-4" />
                                </button>

                                {/* Botón Alternar Estado */}
                                <button
                                  type="button"
                                  onClick={() => alternarEstadoProveedor(p)}
                                  title={p.activo ? 'Desactivar proveedor' : 'Activar proveedor'}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    p.activo
                                      ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                      : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                  }`}
                                >
                                  <ArrowPathIcon className="h-4 w-4" />
                                </button>

                                {/* Botón Eliminar */}
                                <button
                                  type="button"
                                  onClick={() => eliminarProveedor(p)}
                                  title="Eliminar proveedor"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic font-medium">Solo lectura</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── VISTA MARCAS ────────────────── */}
      {subTab === 'marcas' && (
        <div className="space-y-3">
          {/* Barra de búsqueda y contador */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar marca de llantas..."
                value={busquedaMarcas}
                onChange={(e) => setBusquedaMarcas(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent transition-colors"
              />
            </div>
            <div className="text-xs text-gray-500 self-center sm:self-auto">
              Mostrando <strong className="text-gray-800">{marcasFiltradas.length}</strong> de {marcas.length} marcas
            </div>
          </div>

          {/* Tabla de Marcas */}
          {loadingMarcas ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Nombre de la Marca
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Estado
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {marcasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">
                          No se encontraron marcas que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      marcasFiltradas.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                              <span>{m.nombre}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                m.activa
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {m.activa ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {esAdmin ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Botón Editar */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMarcaAEditar(m);
                                    setModalMarcaOpen(true);
                                  }}
                                  title="Editar nombre de la marca"
                                  className="p-1.5 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <PencilSquareIcon className="h-4 w-4" />
                                </button>

                                {/* Botón Alternar Estado */}
                                <button
                                  type="button"
                                  onClick={() => alternarEstadoMarca(m)}
                                  title={m.activa ? 'Desactivar marca' : 'Activar marca'}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    m.activa
                                      ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                                      : 'text-green-600 hover:text-green-700 hover:bg-green-50'
                                  }`}
                                >
                                  <ArrowPathIcon className="h-4 w-4" />
                                </button>

                                {/* Botón Eliminar */}
                                <button
                                  type="button"
                                  onClick={() => eliminarMarca(m)}
                                  title="Eliminar marca"
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic font-medium">Solo lectura</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Proveedor (Crear / Editar) */}
      <ModalProveedor
        isOpen={modalProveedorOpen}
        onClose={() => {
          setModalProveedorOpen(false);
          setProveedorAEditar(null);
        }}
        proveedorAEditar={proveedorAEditar}
        onGuardado={(p) => {
          mostrarNotif(
            'ok',
            `Proveedor "${p.nombre}" ${proveedorAEditar ? 'actualizado' : 'creado'} correctamente.`
          );
        }}
      />

      {/* Modal Marca (Crear / Editar) */}
      <ModalMarca
        isOpen={modalMarcaOpen}
        onClose={() => {
          setModalMarcaOpen(false);
          setMarcaAEditar(null);
        }}
        marcaAEditar={marcaAEditar}
        onGuardado={(m) => {
          mostrarNotif(
            'ok',
            `Marca "${m.nombre}" ${marcaAEditar ? 'actualizada' : 'creada'} correctamente.`
          );
        }}
      />

      {/* Modal Confirmación de Acciones */}
      <ModalConfirmacion
        isOpen={dialogoConfirm.isOpen}
        onClose={() => setDialogoConfirm(d => ({ ...d, isOpen: false }))}
        onConfirm={dialogoConfirm.onConfirm}
        titulo={dialogoConfirm.titulo}
        mensaje={dialogoConfirm.mensaje}
        tipo={dialogoConfirm.tipo}
        textoBoton={dialogoConfirm.textoBoton}
        loading={accionLoading}
      />
    </div>
  );
}
