import { useState, useEffect } from 'react';
import API_BASE from '../../config/api';
import { 
  CurrencyDollarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  PlusIcon,
  XMarkIcon,
  BanknotesIcon,
  CalculatorIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

export default function Caja() {
  // Estados
  const [cajaActual, setCajaActual] = useState(null);
  const [empleados, setEmpleados] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Estados para modales
  const [mostrarModalApertura, setMostrarModalApertura] = useState(false);
  const [mostrarModalCierre, setMostrarModalCierre] = useState(false);
  const [mostrarModalMovimiento, setMostrarModalMovimiento] = useState(false);
  const [mostrarModalArqueo, setMostrarModalArqueo] = useState(false);
  
  // Formulario apertura
  const [formApertura, setFormApertura] = useState({
    empleado_apertura: '',
    monto_inicial: '',
    notas_apertura: ''
  });
  
  // Formulario cierre
  const [formCierre, setFormCierre] = useState({
    empleado_cierre: '',
    monto_final: '',
    notas_cierre: ''
  });
  
  // Formulario movimiento
  const [formMovimiento, setFormMovimiento] = useState({
    tipo: 'ingreso',
    concepto: '',
    descripcion: '',
    monto: '',
    empleado: '',
    categoria: ''
  });
  
  // Formulario arqueo
  const [formArqueo, setFormArqueo] = useState({
    empleado: '',
    billetes_1000: 0,
    billetes_500: 0,
    billetes_200: 0,
    billetes_100: 0,
    billetes_50: 0,
    billetes_20: 0,
    monedas_20: 0,
    monedas_10: 0,
    monedas_5: 0,
    monedas_2: 0,
    monedas_1: 0,
    monedas_050: 0,
    notas: ''
  });

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    await Promise.all([
      cargarCajaActual(),
      cargarEmpleados()
    ]);
  };

  const cargarCajaActual = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/caja/cajas/caja_actual/`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCajaActual(data);
        if (data.id) {
          cargarMovimientos(data.id);
        }
      } else {
        setCajaActual(null);
      }
    } catch (error) {
      console.error('Error al cargar caja actual:', error);
      setCajaActual(null);
    }
  };

  const cargarEmpleados = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/nomina/empleados/?activos=true`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setEmpleados(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (error) {
      console.error('Error al cargar empleados:', error);
    }
  };

  const cargarMovimientos = async (cajaId) => {
    try {
      const response = await fetch(`${API_BASE}/api/caja/movimientos/?caja=${cajaId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setMovimientos(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (error) {
      console.error('Error al cargar movimientos:', error);
    }
  };

  const abrirCaja = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/caja/cajas/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formApertura)
      });

      if (response.ok) {
        const data = await response.json();
        setCajaActual(data);
        setMostrarModalApertura(false);
        setFormApertura({ empleado_apertura: '', monto_inicial: '', notas_apertura: '' });
        alert('Caja abierta exitosamente');
      } else {
        const error = await response.json();
        setError(error.detail || 'Error al abrir caja');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error al abrir caja');
    } finally {
      setLoading(false);
    }
  };

  const cerrarCaja = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/caja/cajas/${cajaActual.id}/cerrar/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formCierre)
      });

      if (response.ok) {
        const data = await response.json();
        setCajaActual(data);
        setMostrarModalCierre(false);
        setFormCierre({ empleado_cierre: '', monto_final: '', notas_cierre: '' });
        alert(`Caja cerrada. Diferencia: $${data.diferencia?.toFixed(2) || '0.00'}`);
      } else {
        const error = await response.json();
        setError(error.detail || 'Error al cerrar caja');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error al cerrar caja');
    } finally {
      setLoading(false);
    }
  };

  const registrarMovimiento = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/caja/movimientos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formMovimiento,
          caja: cajaActual.id
        })
      });

      if (response.ok) {
        await cargarCajaActual();
        setMostrarModalMovimiento(false);
        setFormMovimiento({ tipo: 'ingreso', concepto: '', descripcion: '', monto: '', empleado: '', categoria: '' });
        alert('Movimiento registrado exitosamente');
      } else {
        const error = await response.json();
        setError(JSON.stringify(error));
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  const registrarArqueo = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/caja/arqueos/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formArqueo,
          caja: cajaActual.id
        })
      });

      if (response.ok) {
        const arqueo = await response.json();
        await cargarCajaActual();
        setMostrarModalArqueo(false);
        setFormArqueo({
          empleado: '',
          billetes_1000: 0, billetes_500: 0, billetes_200: 0,
          billetes_100: 0, billetes_50: 0, billetes_20: 0,
          monedas_20: 0, monedas_10: 0, monedas_5: 0,
          monedas_2: 0, monedas_1: 0, monedas_050: 0,
          notas: ''
        });
        alert(`Arqueo registrado. Total: $${arqueo.total}`);
      } else {
        const error = await response.json();
        setError(JSON.stringify(error));
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error al registrar arqueo');
    } finally {
      setLoading(false);
    }
  };

  const calcularTotalArqueo = () => {
    const total = (
      (parseInt(formArqueo.billetes_1000) || 0) * 1000 +
      (parseInt(formArqueo.billetes_500) || 0) * 500 +
      (parseInt(formArqueo.billetes_200) || 0) * 200 +
      (parseInt(formArqueo.billetes_100) || 0) * 100 +
      (parseInt(formArqueo.billetes_50) || 0) * 50 +
      (parseInt(formArqueo.billetes_20) || 0) * 20 +
      (parseInt(formArqueo.monedas_20) || 0) * 20 +
      (parseInt(formArqueo.monedas_10) || 0) * 10 +
      (parseInt(formArqueo.monedas_5) || 0) * 5 +
      (parseInt(formArqueo.monedas_2) || 0) * 2 +
      (parseInt(formArqueo.monedas_1) || 0) * 1 +
      (parseInt(formArqueo.monedas_050) || 0) * 0.50
    );
    return total.toFixed(2);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caja y Arqueo</h1>
          <p className="text-gray-600">Gestión de caja diaria</p>
        </div>
        {!cajaActual || cajaActual.estado === 'cerrada' ? (
          <button
            onClick={() => setMostrarModalApertura(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <PlusIcon className="h-5 w-5" />
            Abrir Caja
          </button>
        ) : (
          <button
            onClick={() => setMostrarModalCierre(true)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-2"
          >
            <XMarkIcon className="h-5 w-5" />
            Cerrar Caja
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {cajaActual && cajaActual.estado === 'abierta' ? (
        <div className="space-y-6">
          {/* Resumen de caja */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Monto Inicial</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${parseFloat(cajaActual.monto_inicial || 0).toFixed(2)}
                  </p>
                </div>
                <CurrencyDollarIcon className="h-12 w-12 text-blue-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Ingresos</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${parseFloat(cajaActual.total_ingresos || 0).toFixed(2)}
                  </p>
                </div>
                <ArrowUpIcon className="h-12 w-12 text-green-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Egresos</p>
                  <p className="text-2xl font-bold text-red-600">
                    ${parseFloat(cajaActual.total_egresos || 0).toFixed(2)}
                  </p>
                </div>
                <ArrowDownIcon className="h-12 w-12 text-red-600" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Saldo Esperado</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ${parseFloat(cajaActual.saldo_esperado || 0).toFixed(2)}
                  </p>
                </div>
                <BanknotesIcon className="h-12 w-12 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Información de la caja */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Información de Caja</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Folio:</span>
                <span className="ml-2 font-medium text-gray-900">{cajaActual.folio}</span>
              </div>
              <div>
                <span className="text-gray-600">Apertura:</span>
                <span className="ml-2 font-medium text-gray-900">{cajaActual.fecha_apertura_formateada}</span>
              </div>
              <div>
                <span className="text-gray-600">Empleado:</span>
                <span className="ml-2 font-medium text-gray-900">{cajaActual.empleado_apertura_nombre}</span>
              </div>
              <div>
                <span className="text-gray-600">Estado:</span>
                <span className="ml-2 font-medium text-green-600">{cajaActual.estado}</span>
              </div>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setMostrarModalMovimiento(true)}
              className="bg-blue-600 text-white p-4 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              <DocumentTextIcon className="h-6 w-6" />
              Registrar Movimiento
            </button>
            <button
              onClick={() => setMostrarModalArqueo(true)}
              className="bg-purple-600 text-white p-4 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
            >
              <CalculatorIcon className="h-6 w-6" />
              Realizar Arqueo
            </button>
            <button
              onClick={() => setMostrarModalCierre(true)}
              className="bg-red-600 text-white p-4 rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
            >
              <XMarkIcon className="h-6 w-6" />
              Cerrar Caja
            </button>
          </div>

          {/* Movimientos recientes */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Movimientos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Concepto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {movimientos.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                        No hay movimientos registrados
                      </td>
                    </tr>
                  ) : (
                    movimientos.map((mov) => (
                      <tr key={mov.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            mov.tipo === 'ingreso' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {mov.tipo}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{mov.concepto}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{mov.categoria || '-'}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          ${parseFloat(mov.monto).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{mov.fecha_formateada}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <CurrencyDollarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No hay caja abierta</h2>
          <p className="text-gray-600 mb-6">Abre una caja para comenzar a registrar movimientos</p>
          <button
            onClick={() => setMostrarModalApertura(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Abrir Caja
          </button>
        </div>
      )}

      {/* Modal Apertura Caja */}
      {mostrarModalApertura && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Abrir Caja</h2>
            <form onSubmit={abrirCaja} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empleado *
                </label>
                <select
                  required
                  value={formApertura.empleado_apertura}
                  onChange={(e) => setFormApertura({...formApertura, empleado_apertura: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="">Seleccionar empleado</option>
                  {empleados.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre_completo || `${emp.nombre} ${emp.apellido}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto Inicial *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formApertura.monto_inicial}
                  onChange={(e) => setFormApertura({...formApertura, monto_inicial: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={formApertura.notas_apertura}
                  onChange={(e) => setFormApertura({...formApertura, notas_apertura: e.target.value})}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalApertura(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Abriendo...' : 'Abrir Caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cierre Caja */}
      {mostrarModalCierre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Cerrar Caja</h2>
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Saldo Esperado:</span> ${parseFloat(cajaActual?.saldo_esperado || 0).toFixed(2)}
              </p>
            </div>
            <form onSubmit={cerrarCaja} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empleado *
                </label>
                <select
                  required
                  value={formCierre.empleado_cierre}
                  onChange={(e) => setFormCierre({...formCierre, empleado_cierre: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="">Seleccionar empleado</option>
                  {empleados.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre_completo || `${emp.nombre} ${emp.apellido}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto Final *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formCierre.monto_final}
                  onChange={(e) => setFormCierre({...formCierre, monto_final: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas de Cierre
                </label>
                <textarea
                  value={formCierre.notas_cierre}
                  onChange={(e) => setFormCierre({...formCierre, notas_cierre: e.target.value})}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalCierre(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                >
                  {loading ? 'Cerrando...' : 'Cerrar Caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Movimiento */}
      {mostrarModalMovimiento && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Registrar Movimiento</h2>
            <form onSubmit={registrarMovimiento} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo *
                </label>
                <select
                  required
                  value={formMovimiento.tipo}
                  onChange={(e) => setFormMovimiento({...formMovimiento, tipo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Concepto *
                </label>
                <input
                  type="text"
                  required
                  value={formMovimiento.concepto}
                  onChange={(e) => setFormMovimiento({...formMovimiento, concepto: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoría
                </label>
                <input
                  type="text"
                  value={formMovimiento.categoria}
                  onChange={(e) => setFormMovimiento({...formMovimiento, categoria: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                  placeholder="Ej: Servicios, Gastos operativos"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formMovimiento.monto}
                  onChange={(e) => setFormMovimiento({...formMovimiento, monto: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empleado *
                </label>
                <select
                  required
                  value={formMovimiento.empleado}
                  onChange={(e) => setFormMovimiento({...formMovimiento, empleado: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="">Seleccionar empleado</option>
                  {empleados.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre_completo || `${emp.nombre} ${emp.apellido}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={formMovimiento.descripcion}
                  onChange={(e) => setFormMovimiento({...formMovimiento, descripcion: e.target.value})}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalMovimiento(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Arqueo */}
      {mostrarModalArqueo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full m-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Realizar Arqueo de Caja</h2>
            <form onSubmit={registrarArqueo} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Empleado *
                </label>
                <select
                  required
                  value={formArqueo.empleado}
                  onChange={(e) => setFormArqueo({...formArqueo, empleado: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                >
                  <option value="">Seleccionar empleado</option>
                  {empleados.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre_completo || `${emp.nombre} ${emp.apellido}`}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">Billetes</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {label: '$1,000', field: 'billetes_1000', valor: 1000},
                    {label: '$500', field: 'billetes_500', valor: 500},
                    {label: '$200', field: 'billetes_200', valor: 200},
                    {label: '$100', field: 'billetes_100', valor: 100},
                    {label: '$50', field: 'billetes_50', valor: 50},
                    {label: '$20', field: 'billetes_20', valor: 20}
                  ].map(({label, field, valor}) => (
                    <div key={field} className="flex items-center gap-2">
                      <label className="w-20 text-sm text-gray-700">{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={formArqueo[field]}
                        onChange={(e) => setFormArqueo({...formArqueo, [field]: parseInt(e.target.value) || 0})}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-900 text-sm"
                      />
                      <span className="w-20 text-sm text-gray-600 text-right">
                        ${(formArqueo[field] * valor).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">Monedas</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {label: '$20', field: 'monedas_20', valor: 20},
                    {label: '$10', field: 'monedas_10', valor: 10},
                    {label: '$5', field: 'monedas_5', valor: 5},
                    {label: '$2', field: 'monedas_2', valor: 2},
                    {label: '$1', field: 'monedas_1', valor: 1},
                    {label: '$0.50', field: 'monedas_050', valor: 0.50}
                  ].map(({label, field, valor}) => (
                    <div key={field} className="flex items-center gap-2">
                      <label className="w-20 text-sm text-gray-700">{label}</label>
                      <input
                        type="number"
                        min="0"
                        value={formArqueo[field]}
                        onChange={(e) => setFormArqueo({...formArqueo, [field]: parseInt(e.target.value) || 0})}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-900 text-sm"
                      />
                      <span className="w-20 text-sm text-gray-600 text-right">
                        ${(formArqueo[field] * valor).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-lg font-bold text-blue-900">
                    Total Contado: ${calcularTotalArqueo()}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas
                </label>
                <textarea
                  value={formArqueo.notas}
                  onChange={(e) => setFormArqueo({...formArqueo, notas: e.target.value})}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarModalArqueo(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {loading ? 'Registrando...' : 'Registrar Arqueo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
