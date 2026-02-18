import { useState, useEffect } from 'react';
import API_BASE from '../../config/api';
import { 
  PlusIcon, 
  MagnifyingGlassIcon, 
  PencilIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

export default function Inventario() {
  const [vistaActual, setVistaActual] = useState('productos'); // 'productos' | 'entradas'
  const [productos, setProductos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  
  // Estados para modal de entrada de inventario
  const [modalEntrada, setModalEntrada] = useState(false);
  const [entradaForm, setEntradaForm] = useState({
    producto: '',
    proveedor: '',
    cantidad: 1,
    precio_compra: 0,
    fecha_compra: new Date().toISOString().split('T')[0],
    numero_factura: '',
    notas: ''
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      await Promise.all([
        cargarProductos(),
        cargarMarcas(),
        cargarProveedores()
      ]);
    } catch (err) {
      setError('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const cargarProductos = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/inventario/productos/`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProductos(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (error) {
      console.error('Error al cargar productos:', error);
    }
  };

  const cargarMarcas = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/inventario/marcas/`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMarcas(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (error) {
      console.error('Error al cargar marcas:', error);
    }
  };

  const cargarProveedores = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/inventario/proveedores/?activo=true`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProveedores(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (error) {
      console.error('Error al cargar proveedores:', error);
    }
  };

  const registrarEntrada = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/inventario/entradas/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(entradaForm)
      });

      if (response.ok) {
        setExito('Entrada registrada exitosamente');
        setModalEntrada(false);
        setEntradaForm({
          producto: '',
          proveedor: '',
          cantidad: 1,
          precio_compra: 0,
          fecha_compra: new Date().toISOString().split('T')[0],
          numero_factura: '',
          notas: ''
        });
        await cargarProductos();
        setTimeout(() => setExito(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Error al registrar entrada');
      }
    } catch (error) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const productosFiltrados = productos.filter(p =>
    p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.medida?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.marca_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.modelo?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const productosStockBajo = productos.filter(p => p.tiene_stock_bajo && !p.stock_agotado);
  const productosAgotados = productos.filter(p => p.stock_agotado);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-gray-600">Gestión de productos y stock</p>
      </div>

      {/* Alertas */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <XCircleIcon className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {exito && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5" />
          <span>{exito}</span>
        </div>
      )}

      {/* Alertas de Stock */}
      {productosAgotados.length > 0 && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-center gap-2">
            <XCircleIcon className="h-5 w-5 text-red-500" />
            <p className="font-medium text-red-800">
              {productosAgotados.length} producto(s) agotado(s)
            </p>
          </div>
        </div>
      )}

      {productosStockBajo.length > 0 && (
        <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-500 p-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
            <p className="font-medium text-yellow-800">
              {productosStockBajo.length} producto(s) con stock bajo
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setVistaActual('productos')}
          className={`px-4 py-2 rounded-lg font-medium ${
            vistaActual === 'productos'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Productos ({productos.length})
        </button>
        <button
          onClick={() => setVistaActual('entradas')}
          className={`px-4 py-2 rounded-lg font-medium ${
            vistaActual === 'entradas'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Registrar Entrada
        </button>
      </div>

      {/* Vista de Productos */}
      {vistaActual === 'productos' && (
        <div>
          {/* Barra de búsqueda */}
          <div className="mb-4 flex gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por código, medida, marca o modelo..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setModalEntrada(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              Registrar Entrada
            </button>
          </div>

          {/* Tabla de productos */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medida</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mín.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productosFiltrados.map((producto) => (
                  <tr key={producto.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {producto.codigo}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{producto.marca_nombre}</div>
                      <div className="text-gray-500">{producto.modelo}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {producto.medida}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`font-bold ${
                        producto.stock_agotado ? 'text-red-600' :
                        producto.tiene_stock_bajo ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {producto.stock_actual}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {producto.stock_minimo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${producto.precio_venta}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {producto.stock_agotado ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          Agotado
                        </span>
                      ) : producto.tiene_stock_bajo ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Stock Bajo
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          Disponible
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Entrada de Inventario */}
      {modalEntrada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Registrar Entrada de Inventario</h2>
            
            <form onSubmit={registrarEntrada} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Producto *
                </label>
                <select
                  value={entradaForm.producto}
                  onChange={(e) => setEntradaForm({...entradaForm, producto: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                >
                  <option value="">Seleccionar producto</option>
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} - {p.descripcion_completa}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Proveedor *
                </label>
                <select
                  value={entradaForm.proveedor}
                  onChange={(e) => setEntradaForm({...entradaForm, proveedor: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                >
                  <option value="">Seleccionar proveedor</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cantidad *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={entradaForm.cantidad}
                    onChange={(e) => setEntradaForm({...entradaForm, cantidad: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio Compra *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={entradaForm.precio_compra}
                    onChange={(e) => setEntradaForm({...entradaForm, precio_compra: parseFloat(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Compra *
                </label>
                <input
                  type="date"
                  value={entradaForm.fecha_compra}
                  onChange={(e) => setEntradaForm({...entradaForm, fecha_compra: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  No. Factura *
                </label>
                <input
                  type="text"
                  value={entradaForm.numero_factura}
                  onChange={(e) => setEntradaForm({...entradaForm, numero_factura: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notas (opcional)
                </label>
                <textarea
                  value={entradaForm.notas}
                  onChange={(e) => setEntradaForm({...entradaForm, notas: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  rows="2"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setModalEntrada(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-900"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Guardando...' : 'Registrar Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
