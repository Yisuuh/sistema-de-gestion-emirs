import { useState } from 'react';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import TicketImpresion from './TicketImpresion';

export default function ModalTicket({ venta, onClose }) {
  const [descargando, setDescargando] = useState(false);

  if (!venta) return null;

  const descargarPDF = async () => {
    if (!venta?.id) return;
    try {
      setDescargando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/ventas/ventas/${venta.id}/ticket_pdf/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('No se pudo generar el PDF del ticket');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket_${venta.folio || venta.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.warn('Fallback a apertura de PDF en nueva pestaña:', e);
      window.open(`/api/ventas/ventas/${venta.id}/ticket_pdf/`, '_blank');
    } finally {
      setDescargando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#fff', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #e5e7eb' }}
        >
          <div className="flex items-center gap-2">
            <PrinterIcon style={{ width: '18px', height: '18px', color: '#df000a' }} />
            <h3 style={{ fontWeight: 'bold', color: '#111827', fontSize: '15px', margin: 0 }}>
              Vista Previa del Ticket
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <XMarkIcon style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Vista previa */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ backgroundColor: '#f3f4f6' }}
        >
          <div style={{ backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <TicketImpresion venta={venta} />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2.5 px-5 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px',
              fontSize: '13px',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={descargarPDF}
            disabled={descargando}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              background: '#fff',
              cursor: descargando ? 'not-allowed' : 'pointer',
              opacity: descargando ? 0.7 : 1,
            }}
            title="Descargar ticket en formato PDF"
          >
            <ArrowDownTrayIcon style={{ width: '16px', height: '16px', color: '#4b5563' }} />
            {descargando ? 'Generando...' : 'Descargar PDF'}
          </button>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#fff',
              background: '#df000a',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <PrinterIcon style={{ width: '16px', height: '16px' }} />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
