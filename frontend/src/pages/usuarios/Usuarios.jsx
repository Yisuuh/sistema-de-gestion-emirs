import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../lib/apiClient';

export default function Usuarios() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [usuarioAEditar, setUsuarioAEditar] = useState(null);
  const [usuarioParaPin, setUsuarioParaPin] = useState(null);
  const [notif, setNotif] = useState(null);

  const notificar = (msg, tipo = 'success') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 4500);
  };

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: usuarios = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['usuarios-lista'],
    queryFn: async () => {
      const res = await apiClient.get('/api/usuarios/usuarios/');
      return Array.isArray(res) ? res : (res.results || []);
    },
  });

  // ── Mutaciones ──────────────────────────────────────────────────────────
  const mutationToggleActivo = useMutation({
    mutationFn: async ({ id, nuevoEstado }) => {
      return await apiClient.patch(`/api/usuarios/usuarios/${id}/`, { activo: nuevoEstado });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios-lista'] });
      notificar(`Usuario ${vars.nuevoEstado ? 'activado' : 'desactivado'} correctamente.`);
    },
    onError: (err) => {
      notificar(err.response?.data?.error || err.message || 'Error al cambiar estado', 'error');
    },
  });

  // Filtrado en vivo
  const usuariosFiltrados = usuarios.filter((u) => {
    const q = busqueda.toLowerCase().trim();
    const matchBusqueda =
      !q ||
      u.username?.toLowerCase().includes(q) ||
      u.nombre_completo?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.telefono?.toLowerCase().includes(q);

    const matchRol = !filtroRol || u.rol === filtroRol;
    const matchEstado =
      !filtroEstado ||
      (filtroEstado === 'activo' && u.activo) ||
      (filtroEstado === 'inactivo' && !u.activo);

    return matchBusqueda && matchRol && matchEstado;
  });

  const formatearFecha = (f) => {
    if (!f) return 'Nunca';
    try {
      const d = new Date(f);
      return d.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(f);
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 text-[#df000a] flex items-center justify-center border border-red-500/30">
              <i className="ri-shield-user-line text-2xl"></i>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white">Usuarios y Roles (RBAC)</h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Gestión de cuentas, perfiles de cajeros, vendedores y PIN de autorización
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setModalCrear(true)}
          className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <i className="ri-user-add-line text-base"></i>
          <span>Nuevo Usuario</span>
        </button>
      </div>

      {/* Alerta de notificación */}
      {notif && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 border ${
            notif.tipo === 'error'
              ? 'bg-red-950/60 border-red-500 text-red-200'
              : 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
          }`}
        >
          <i
            className={`text-lg ${
              notif.tipo === 'error' ? 'ri-error-warning-line text-red-400' : 'ri-checkbox-circle-line text-emerald-400'
            }`}
          ></i>
          <span>{notif.msg}</span>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-[#161a29] border border-white/[0.08] rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <i className="ri-search-line absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base"></i>
          <input
            type="text"
            placeholder="Buscar por usuario, nombre, correo o teléfono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-red-500"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <i className="ri-close-line"></i>
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            className="px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="">Todos los Roles</option>
            <option value="admin">Administrador</option>
            <option value="vendedor">Vendedor</option>
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-red-500 cursor-pointer"
          >
            <option value="">Todos los Estados</option>
            <option value="activo">Solo Activos</option>
            <option value="inactivo">Solo Inactivos</option>
          </select>

          <button
            onClick={() => refetch()}
            title="Recargar usuarios"
            className="p-2.5 bg-[#1b2032] hover:bg-slate-700 border border-white/[0.08] rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <i className="ri-refresh-line text-base"></i>
          </button>
        </div>
      </div>

      {/* Tabla de Usuarios */}
      <div className="bg-[#161a29] border border-white/[0.08] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#1b2032] text-slate-400 border-b border-white/[0.08] uppercase text-[10px] tracking-wider font-bold">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Nombre Completo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">PIN Autorización</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Último Acceso</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-slate-300">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <i className="ri-loader-4-line text-2xl animate-spin inline-block mb-2"></i>
                    <p>Cargando catálogo de usuarios...</p>
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-red-400">
                    <i className="ri-error-warning-line text-2xl inline-block mb-1"></i>
                    <p>No se pudo cargar la lista de usuarios. Verifica tus permisos de Administrador.</p>
                  </td>
                </tr>
              ) : usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No se encontraron usuarios con los filtros especificados.
                  </td>
                </tr>
              ) : (
                usuariosFiltrados.map((u) => {
                  const esAdmin = u.rol === 'admin';
                  const activo = Boolean(u.activo);

                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Usuario */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-red-600/20 text-[#df000a] font-bold text-xs flex items-center justify-center border border-red-500/30">
                            {u.username?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>@{u.username}</span>
                              {esAdmin && (
                                <i className="ri-shield-check-fill text-red-400 text-xs" title="Administrador"></i>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {u.email || 'Sin correo'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Nombre Completo */}
                      <td className="px-4 py-3 font-semibold text-slate-200">
                        {u.nombre_completo || `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—'}
                      </td>

                      {/* Teléfono */}
                      <td className="px-4 py-3 font-mono text-slate-300">
                        {u.telefono || '—'}
                      </td>

                      {/* Rol Badge */}
                      <td className="px-4 py-3">
                        {esAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600/20 text-red-300 border border-red-500/40">
                            <i className="ri-shield-star-line text-xs"></i>
                            Administrador
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600/20 text-blue-300 border border-blue-500/40">
                            <i className="ri-user-line text-xs"></i>
                            Vendedor
                          </span>
                        )}
                      </td>

                      {/* PIN de Autorización */}
                      <td className="px-4 py-3">
                        {u.tiene_pin ? (
                          <button
                            onClick={() => setUsuarioParaPin(u)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 cursor-pointer transition-colors"
                            title="Haz clic para actualizar el PIN"
                          >
                            <i className="ri-lock-password-line text-xs"></i>
                            Configurado
                          </button>
                        ) : (
                          <button
                            onClick={() => setUsuarioParaPin(u)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700 cursor-pointer transition-colors"
                            title="Haz clic para asignar un PIN de autorización"
                          >
                            <i className="ri-lock-unlock-line text-xs"></i>
                            + Asignar PIN
                          </button>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => mutationToggleActivo.mutate({ id: u.id, nuevoEstado: !activo })}
                          disabled={mutationToggleActivo.isPending}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                            activo
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                          title={`Haz clic para ${activo ? 'desactivar' : 'activar'} usuario`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${activo ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
                          {activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>

                      {/* Último Acceso */}
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {formatearFecha(u.fecha_ultimo_acceso)}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setUsuarioAEditar(u)}
                            title="Editar usuario y credenciales"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                          >
                            <i className="ri-edit-line text-base"></i>
                          </button>
                          <button
                            onClick={() => setUsuarioParaPin(u)}
                            title="Cambiar PIN de autorización"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/[0.08] transition-colors cursor-pointer"
                          >
                            <i className="ri-key-line text-base"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear Usuario */}
      {modalCrear && (
        <ModalCrearUsuario
          onClose={() => setModalCrear(false)}
          onExito={(nuevo) => {
            setModalCrear(false);
            queryClient.invalidateQueries({ queryKey: ['usuarios-lista'] });
            notificar(`Usuario @${nuevo.username} creado exitosamente.`);
          }}
        />
      )}

      {/* Modal: Editar Usuario */}
      {usuarioAEditar && (
        <ModalEditarUsuario
          usuario={usuarioAEditar}
          onClose={() => setUsuarioAEditar(null)}
          onExito={(act) => {
            setUsuarioAEditar(null);
            queryClient.invalidateQueries({ queryKey: ['usuarios-lista'] });
            notificar(`Usuario @${act.username} actualizado correctamente.`);
          }}
        />
      )}

      {/* Modal: Asignar / Cambiar PIN */}
      {usuarioParaPin && (
        <ModalCambiarPin
          usuario={usuarioParaPin}
          onClose={() => setUsuarioParaPin(null)}
          onExito={() => {
            setUsuarioParaPin(null);
            queryClient.invalidateQueries({ queryKey: ['usuarios-lista'] });
            notificar(`PIN de autorización actualizado para @${usuarioParaPin.username}.`);
          }}
        />
      )}
    </div>
  );
}

// ─── Modal Crear Usuario ──────────────────────────────────────────────────────
function ModalCrearUsuario({ onClose, onExito }) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    password: '',
    rol: 'vendedor',
    telefono: '',
    pin: '',
    activo: true,
  });
  const [verPass, setVerPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.username.trim()) {
      setError('El nombre de usuario es obligatorio.');
      return;
    }
    if (!form.password) {
      setError('La contraseña es obligatoria.');
      return;
    }
    if (form.pin && (!/^\d{4,6}$/.test(form.pin))) {
      setError('El PIN de autorización debe ser numérico de 4 a 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        password: form.password,
        rol: form.rol,
        telefono: form.telefono.trim(),
        activo: form.activo,
      };
      if (form.pin) payload.pin = form.pin;

      const res = await apiClient.post('/api/usuarios/usuarios/', payload);
      onExito(res);
    } catch (err) {
      const d = err.response?.data;
      const msg = typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
        : err.message || 'Error al crear usuario.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161a29] border border-white/[0.08] text-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-[#df000a] flex items-center justify-center font-bold">
              <i className="ri-user-add-line text-lg"></i>
            </div>
            <div>
              <h3 className="font-black text-white text-base">Crear Nuevo Usuario</h3>
              <p className="text-xs text-slate-400">Asigna credenciales y rol en el sistema</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-500 rounded-xl text-red-200 text-xs font-semibold flex items-center gap-2">
              <i className="ri-error-warning-line text-red-400 text-base"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Usuario (Login) *
              </label>
              <input
                type="text"
                required
                placeholder="ej: carlos.mendoza"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Rol en el Sistema *
              </label>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white font-semibold focus:outline-none focus:border-red-500"
              >
                <option value="vendedor">Vendedor / Cajero</option>
                <option value="admin">Administrador (Acceso Total)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Nombre(s)
              </label>
              <input
                type="text"
                placeholder="Carlos"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Apellidos
              </label>
              <input
                type="text"
                placeholder="Mendoza"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="usuario@emirs.mx"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Teléfono / WhatsApp
              </label>
              <input
                type="tel"
                placeholder="9991234567"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Contraseña de Acceso *
            </label>
            <div className="relative">
              <input
                type={verPass ? 'text' : 'password'}
                required
                placeholder="Mínimo 6 caracteres"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 pr-10 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={() => setVerPass(!verPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <i className={verPass ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
              </button>
            </div>
          </div>

          {/* PIN de Autorización Rápida */}
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              PIN de Autorización (4 a 6 dígitos numéricos)
            </label>
            <input
              type="password"
              maxLength={6}
              placeholder="Opcional. Ej: 1234"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white font-mono tracking-widest focus:outline-none focus:border-red-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Usado para autorizaciones de cancelación/descuentos rápidos en caja si el rol es Administrador.
            </p>
          </div>

          {/* Footer botones */}
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#1b2032] hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-check-line"></i>}
              <span>Guardar Usuario</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Editar Usuario ─────────────────────────────────────────────────────
function ModalEditarUsuario({ usuario, onClose, onExito }) {
  const [form, setForm] = useState({
    first_name: usuario.first_name || '',
    last_name: usuario.last_name || '',
    email: usuario.email || '',
    telefono: usuario.telefono || '',
    rol: usuario.rol || 'vendedor',
    activo: Boolean(usuario.activo),
    password: '',
    pin: '',
  });
  const [verPass, setVerPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.pin && (!/^\d{4,6}$/.test(form.pin))) {
      setError('El PIN de autorización debe ser un número de 4 a 6 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        rol: form.rol,
        activo: form.activo,
      };
      if (form.password) payload.password = form.password;
      if (form.pin) payload.pin = form.pin;

      const res = await apiClient.patch(`/api/usuarios/usuarios/${usuario.id}/`, payload);
      onExito(res);
    } catch (err) {
      const d = err.response?.data;
      const msg = typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
        : err.message || 'Error al actualizar usuario.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161a29] border border-white/[0.08] text-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              <i className="ri-edit-line text-lg"></i>
            </div>
            <div>
              <h3 className="font-black text-white text-base">Editar Usuario @{usuario.username}</h3>
              <p className="text-xs text-slate-400">Actualiza datos personales, rol o credenciales</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs sm:text-sm">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-500 rounded-xl text-red-200 text-xs font-semibold flex items-center gap-2">
              <i className="ri-error-warning-line text-red-400 text-base"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Rol en el Sistema
              </label>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white font-semibold focus:outline-none focus:border-red-500"
              >
                <option value="vendedor">Vendedor / Cajero</option>
                <option value="admin">Administrador (Acceso Total)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Estado de la Cuenta
              </label>
              <select
                value={form.activo ? '1' : '0'}
                onChange={(e) => setForm({ ...form, activo: e.target.value === '1' })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white font-semibold focus:outline-none focus:border-red-500"
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo / Bloqueado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Nombre(s)
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Apellidos
              </label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Teléfono / WhatsApp
              </label>
              <input
                type="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full px-3 py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white font-mono focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Cambiar Contraseña */}
          <div className="p-3 bg-[#1b2032] rounded-xl border border-white/[0.05] space-y-2">
            <label className="block text-[11px] font-bold uppercase text-amber-400">
              Cambiar Contraseña (Dejar vacío para no modificar)
            </label>
            <div className="relative">
              <input
                type={verPass ? 'text' : 'password'}
                placeholder="Escribe la nueva contraseña..."
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 pr-10 bg-[#161a29] border border-white/[0.08] rounded-lg text-white focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setVerPass(!verPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <i className={verPass ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
              </button>
            </div>
          </div>

          {/* Cambiar PIN */}
          <div className="p-3 bg-[#1b2032] rounded-xl border border-white/[0.05] space-y-2">
            <label className="block text-[11px] font-bold uppercase text-emerald-400">
              PIN de Autorización Rápida (Dejar vacío para no modificar)
            </label>
            <input
              type="password"
              maxLength={6}
              placeholder={usuario.tiene_pin ? 'PIN ya configurado (escribe uno nuevo para cambiarlo)' : 'Asignar PIN de 4 a 6 dígitos'}
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              className="w-full px-3 py-2 bg-[#161a29] border border-white/[0.08] rounded-lg text-white font-mono tracking-widest focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Footer botones */}
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#1b2032] hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-check-line"></i>}
              <span>Actualizar Usuario</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Cambiar PIN Específico ─────────────────────────────────────────────
function ModalCambiarPin({ usuario, onClose, onExito }) {
  const [pin, setPin] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      setError('El PIN debe ser un número de 4 a 6 dígitos.');
      return;
    }
    if (pin !== confirmarPin) {
      setError('Los PINs no coinciden. Por favor verifícalos.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post(`/api/usuarios/usuarios/${usuario.id}/cambiar_pin/`, { pin });
      onExito();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al actualizar el PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161a29] border border-white/[0.08] text-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <i className="ri-key-line text-base"></i>
            </div>
            <div>
              <h3 className="font-black text-white text-sm">PIN de Seguridad</h3>
              <p className="text-[11px] text-slate-400">@{usuario.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer">
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          {error && (
            <div className="p-2.5 bg-red-950/60 border border-red-500 rounded-xl text-red-200 text-xs font-semibold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Nuevo PIN (4 a 6 dígitos)
            </label>
            <input
              type="password"
              maxLength={6}
              autoFocus
              required
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-lg tracking-widest font-mono py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Confirmar PIN
            </label>
            <input
              type="password"
              maxLength={6}
              required
              placeholder="••••"
              value={confirmarPin}
              onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, ''))}
              className="w-full text-center text-lg tracking-widest font-mono py-2 bg-[#1b2032] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="pt-2 border-t border-white/[0.08] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-xl bg-[#1b2032] hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-check-line"></i>}
              <span>Guardar PIN</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
