import { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';

export default function ModalEditarPagoProveedor({ isOpen, onClose, pago, onGuardado }) {
  const [form, setForm] = useState({
    numero_factura: pago?.numero_factura || '',
    referencia: pago?.referencia || pago?.numero_referencia || '',
    metodo_pago: pago?.metodo_pago || 'transferencia',
    notas: pago?.notas || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen || !pago) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        numero_factura: form.numero_factura.trim(),
        referencia: form.referencia.trim(),
        numero_referencia: form.referencia.trim(),
        metodo_pago: form.metodo_pago,
        notas: form.notas.trim(),
      };

      const res = await apiClient.patch(`/api/inventario/pagos-proveedores/${pago.id}/`, payload);
      onGuardado(res);
      onClose();
    } catch (err) {
      const d = err.response?.data;
      const msg = d?.detail || d?.error || (typeof d === 'object' ? Object.values(d).flat().join(' ') : null) || err.message || 'Error al actualizar datos de pago';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-50 text-[#df000a]">
              <i className="ri-edit-line text-lg font-bold"></i>
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900">
                Editar Datos de Pago
              </h3>
              <p className="text-xs text-gray-500">
                {pago.proveedor_nombre || pago.proveedor || 'Proveedor'} • {pago.fecha}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <i className="ri-error-warning-line text-base flex-shrink-0"></i>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-file-text-line text-[#df000a]"></i>
              No. de Factura / Remisión Asociada
            </label>
            <input
              type="text"
              placeholder="Ej. FAC-48201 o REM-9821"
              value={form.numero_factura}
              onChange={(e) => setForm({ ...form, numero_factura: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-[#df000a] focus:ring-1 focus:ring-red-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-hashtag text-[#df000a]"></i>
              No. de Referencia / Rastreo / Cheque
            </label>
            <input
              type="text"
              placeholder="Ej. REF-987213 o Cheque #4412"
              value={form.referencia}
              onChange={(e) => setForm({ ...form, referencia: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:border-[#df000a] focus:ring-1 focus:ring-red-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-bank-card-line text-[#df000a]"></i>
              Método de Pago
            </label>
            <select
              value={form.metodo_pago}
              onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-medium focus:border-[#df000a] focus:ring-1 focus:ring-red-500"
            >
              <option value="transferencia">Transferencia Electrónica</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="tarjeta">Tarjeta Bancaria</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <i className="ri-sticky-note-line text-gray-500"></i>
              Notas / Observaciones
            </label>
            <textarea
              rows={3}
              placeholder="Notas aclaratorias sobre este pago..."
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:border-[#df000a] focus:ring-1 focus:ring-red-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 rounded-xl bg-[#df000a] hover:bg-[#b80008] text-white font-bold text-xs shadow-md shadow-red-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Guardar Cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
