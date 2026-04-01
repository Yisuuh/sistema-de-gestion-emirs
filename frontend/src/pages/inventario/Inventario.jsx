import { useState, useEffect, useRef } from 'react';
import { 
  PlusIcon, 
  MagnifyingGlassIcon, 
  PencilIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  DocumentArrowUpIcon,
  ArrowUpTrayIcon,
  BuildingStorefrontIcon,
  DocumentTextIcon,
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
  
  // ── Estados XML import ───────────────────────────────────────────────────
  const [xmlFile, setXmlFile] = useState(null);
  const [xmlPreview, setXmlPreview] = useState(null);   // datos parseados
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlError, setXmlError] = useState(null);
  const [xmlExito, setXmlExito] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

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
      const response = await fetch('http://localhost:8000/api/inventario/productos/', {
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
      const response = await fetch('http://localhost:8000/api/inventario/marcas/', {
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
      const response = await fetch('http://localhost:8000/api/inventario/proveedores/?activo=true', {
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

  // ─── Funciones XML import ────────────────────────────────────────────────

  const handleXmlFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.xml')) {
      setXmlError('Solo se aceptan archivos .xml');
      return;
    }
    setXmlFile(file);
    setXmlPreview(null);
    setXmlError(null);
    setXmlExito(null);
    await previsualizarXml(file);
  };

  const previsualizarXml = async (file) => {
    setXmlLoading(true);
    setXmlError(null);
    try {
      const formData = new FormData();
      formData.append('xml', file);
      formData.append('accion', 'preview');

      const res = await fetch('http://localhost:8000/api/inventario/importar-xml/', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setXmlError(data.error || 'Error al parsear el XML');
        return;
      }
      setXmlPreview(data.datos);
    } catch (err) {
      setXmlError('Error de conexión al procesar el XML');
    } finally {
      setXmlLoading(false);
    }
  };

  const confirmarImportacion = async () => {
    if (!xmlFile) return;
    setXmlLoading(true);
    setXmlError(null);
    try {
      const formData = new FormData();
      formData.append('xml', xmlFile);
      formData.append('accion', 'guardar');

      const res = await fetch('http://localhost:8000/api/inventario/importar-xml/', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setXmlError(data.error || 'Error al guardar');
        return;
      }
      const r = data.resultado;
      setXmlExito(
        `✅ Factura ${r.numero_factura} importada — ${r.total_items} línea(s) registrada(s) de ${r.proveedor}`
      );
      setXmlPreview(null);
      setXmlFile(null);
      await cargarProductos();   // refrescar tabla de productos
      setTimeout(() => setXmlExito(null), 6000);
    } catch (err) {
      setXmlError('Error de conexión');
    } finally {
      setXmlLoading(false);
    }
  };

  const cancelarXml = () => {
    setXmlFile(null);
    setXmlPreview(null);
    setXmlError(null);
    setXmlExito(null);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const registrarEntrada = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/inventario/entradas/', {
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
        <button
          onClick={() => { setVistaActual('xml'); cancelarXml(); }}
          className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
            vistaActual === 'xml'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <DocumentArrowUpIcon className="h-5 w-5" />
          Importar Factura XML
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

      {/* ── Vista: Importar XML ────────────────────────────────────────── */}
      {vistaActual === 'xml' && (
        <div className="max-w-4xl">

          {/* Mensajes de estado */}
          {xmlError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <XCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{xmlError}</span>
            </div>
          )}
          {xmlExito && (
            <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
              <span>{xmlExito}</span>
            </div>
          )}

          {/* Zona de subida */}
          {!xmlPreview && (
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-300 bg-white hover:border-purple-400 hover:bg-purple-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleXmlFile(f);
              }}
            >
              <ArrowUpTrayIcon className="h-12 w-12 text-purple-400 mx-auto mb-3" />
              <p className="text-lg font-medium text-gray-700">
                {xmlLoading ? 'Procesando...' : 'Arrastra el XML aquí o haz clic para seleccionar'}
              </p>
              <p className="text-sm text-gray-500 mt-1">Facturas CFDI 4.0 del SAT (.xml)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) handleXmlFile(f);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {/* Preview de datos parseados */}
          {xmlPreview && (
            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">

              {/* Encabezado de la factura */}
              <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
                <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
                  <DocumentTextIcon className="h-6 w-6" />
                  Vista previa de la factura
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                  <div className="flex gap-2">
                    <span className="text-gray-500 font-medium">Proveedor:</span>
                    <span className="text-gray-900 font-semibold flex items-center gap-1">
                      <BuildingStorefrontIcon className="h-4 w-4 text-purple-500" />
                      {xmlPreview.proveedor?.nombre}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 font-medium">RFC Emisor:</span>
                    <span className="text-gray-900 font-mono">{xmlPreview.proveedor?.rfc}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 font-medium">No. Factura:</span>
                    <span className="text-gray-900 font-mono">{xmlPreview.numero_factura}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 font-medium">Fecha:</span>
                    <span className="text-gray-900">{xmlPreview.fecha_compra}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 font-medium">Subtotal:</span>
                    <span className="text-gray-900">${parseFloat(xmlPreview.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-500 font-medium">Total con IVA:</span>
                    <span className="text-gray-900 font-semibold">${parseFloat(xmlPreview.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Tabla de artículos */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Medida</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modelo</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">IC / IV</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cant.</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. Compra</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {xmlPreview.items?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-purple-50">
                        <td className="px-4 py-3 font-mono text-gray-800 whitespace-nowrap">{item.codigo}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs">
                          <span className="line-clamp-2">{item.descripcion}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.medida ? (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-xs">{item.medida}</span>
                          ) : (
                            <span className="text-red-500 text-xs">No detectada</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{item.marca_nombre || '—'}</td>
                        <td className="px-4 py-3 text-gray-700">{item.modelo || '—'}</td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="font-mono text-gray-700">{item.indice_carga}{item.indice_velocidad}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-gray-900">{item.cantidad}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          ${item.precio_compra?.toLocaleString('es-MX', { minimumFractionDigits: 4 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Nota informativa */}
              <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-100 text-xs text-yellow-800">
                ℹ️ Si el producto (código) ya existe en inventario se registrará la entrada sin duplicarlo.
                Si es nuevo, se creará automáticamente con precio de venta sugerido (+30&nbsp;% margen).
              </div>

              {/* Acciones */}
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
                <button
                  onClick={cancelarXml}
                  className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={xmlLoading}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarImportacion}
                  disabled={xmlLoading}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {xmlLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Importando...
                    </>
                  ) : (
                    <>
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Confirmar e Importar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
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
