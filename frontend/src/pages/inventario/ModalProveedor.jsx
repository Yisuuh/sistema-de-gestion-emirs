import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function ModalProveedor({
  isOpen,
  onClose,
  proveedorAEditar = null,
  onGuardado,
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(proveedorAEditar);

  const [form, setForm] = useState({
    nombre: '',
    contacto: '',
    telefono: '',
    email: '',
    dias_credito: 0,
    direccion: '',
    activo: true,
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      if (proveedorAEditar) {
        setForm({
          nombre: proveedorAEditar.nombre || '',
          contacto: proveedorAEditar.contacto || '',
          telefono: proveedorAEditar.telefono || '',
          email: proveedorAEditar.email || '',
          dias_credito: proveedorAEditar.dias_credito ?? 0,
          direccion: proveedorAEditar.direccion || '',
          activo: proveedorAEditar.activo !== undefined ? Boolean(proveedorAEditar.activo) : true,
        });
      } else {
        setForm({
          nombre: '',
          contacto: '',
          telefono: '',
          email: '',
          dias_credito: 0,
          direccion: '',
          activo: true,
        });
      }
    }
  }, [isOpen, proveedorAEditar]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    const nombreLimpio = form.nombre.trim();
    if (!nombreLimpio) {
      setErrorMsg('El nombre del proveedor es obligatorio.');
      return;
    }

    const diasCreditoNum = parseInt(form.dias_credito, 10);
    if (isNaN(diasCreditoNum) || diasCreditoNum < 0) {
      setErrorMsg('Los días de crédito deben ser un número entero mayor o igual a 0.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        nombre: nombreLimpio,
        contacto: form.contacto.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        dias_credito: diasCreditoNum,
        direccion: form.direccion.trim(),
        activo: Boolean(form.activo),
      };

      const url = isEdit
        ? `/api/inventario/proveedores/${proveedorAEditar.id}/`
        : '/api/inventario/proveedores/';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          ...tok(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = 'Error al guardar el proveedor.';
        try {
          const errData = await res.json();
          if (typeof errData === 'object' && errData !== null) {
            const firstKey = Object.keys(errData)[0];
            const val = errData[firstKey];
            if (Array.isArray(val) && val.length > 0) {
              msg = `${firstKey}: ${val[0]}`;
            } else if (typeof val === 'string') {
              msg = val;
            } else if (errData.detail) {
              msg = errData.detail;
            } else {
              msg = JSON.stringify(errData);
            }
          }
        } catch (_) {
          msg = `Error ${res.status}: ${res.statusText}`;
        }
        throw new Error(msg);
      }

      const guardado = await res.json();

      queryClient.invalidateQueries({ queryKey: ['inventario-proveedores'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-proveedores-todos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-proveedores-catalogo'] });

      if (onGuardado) {
        onGuardado(guardado);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Ocurrió un error inesperado al procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#df000a] focus:border-transparent transition-colors';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6 border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-[#df000a]">
              <i className="ri-building-line text-lg"></i>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                {isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <p className="text-xs text-gray-500">
                {isEdit
                  ? `Proveedor ID #${proveedorAEditar.id}`
                  : 'Registra un proveedor para compras, órdenes y créditos'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl leading-none"></i>
          </button>
        </div>

        {/* Mensaje de error */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <i className="ri-error-warning-line text-base text-red-500 shrink-0 mt-0.5"></i>
            <span className="flex-1 font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Nombre o Razón Social *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Distribuidora Mayorista de Llantas del Sureste"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputCls}
            />
          </div>

          {/* Contacto y Teléfono */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Contacto / RFC
              </label>
              <input
                type="text"
                placeholder="Ej. Juan Pérez o RFC"
                value={form.contacto}
                onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Teléfono
              </label>
              <input
                type="tel"
                placeholder="Ej. 999 123 4567"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Correo y Días de Crédito */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="ejemplo@proveedor.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Días de Crédito
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={form.dias_credito}
                onChange={(e) => setForm((f) => ({ ...f, dias_credito: e.target.value }))}
                className={inputCls}
              />
              <p className="text-[11px] text-gray-500 mt-0.5">
                Plazo otorgado para vencimiento de facturas
              </p>
            </div>
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Dirección
            </label>
            <textarea
              rows={2}
              placeholder="Calle, número, colonia, código postal y ciudad..."
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Toggle Activo */}
          <div className="pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="w-4 h-4 text-[#df000a] rounded border-gray-300 focus:ring-[#df000a]"
              />
              <div>
                <span className="text-xs font-semibold text-gray-800">Proveedor Activo</span>
                <p className="text-[11px] text-gray-500">
                  Visible en compras, entradas de inventario y cotizaciones
                </p>
              </div>
            </label>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-[#df000a] hover:bg-[#c4000a] disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-red-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{isEdit ? 'Actualizar Proveedor' : 'Guardar Proveedor'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
