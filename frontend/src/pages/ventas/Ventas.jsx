import { useState, useEffect } from 'react';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, ShoppingCartIcon, PrinterIcon } from '@heroicons/react/24/outline';

export default function Ventas() {
  // Estados
  const [productos, setProductos] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [montoEfectivo, setMontoEfectivo] = useState(0);
  const [montoElectronico, setMontoElectronico] = useState(0);
  const [descuento, setDescuento] = useState(0);
  const [notas, setNotas] = useState('');
  const [mostrarProductos, setMostrarProductos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [ventaExitosa, setVentaExitosa] = useState(null);
  const [error, setError] = useState(null);

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  const cargarDatosIniciales = async () => {
    setLoadingData(true);
    setError(null);
    try {
      await Promise.all([
        cargarProductos(),
        cargarServicios(),
        cargarClientes(),
        cargarEmpleados()
      ]);
    } catch (err) {
      console.error('Error al cargar datos iniciales:', err);
      setError('Error al cargar datos. Por favor, verifica que el servidor esté funcionando.');
    } finally {
      setLoadingData(false);
    }
  };

  const cargarProductos = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/inventario/productos/?activos=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Manejar respuesta paginada o array directo
        setProductos(Array.isArray(data) ? data : (data.results || []));
      } else {
        console.error('Error al cargar productos:', response.status, response.statusText);
        setProductos([]);
      }
    } catch (error) {
      console.error('Error al cargar productos:', error);
      setProductos([]);
      throw error;
    }
  };

  const cargarServicios = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/ventas/servicios/?activos=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Manejar respuesta paginada o array directo
        setServicios(Array.isArray(data) ? data : (data.results || []));
      } else {
        console.error('Error al cargar servicios:', response.status, response.statusText);
        setServicios([]);
      }
    } catch (error) {
      console.error('Error al cargar servicios:', error);
      setServicios([]);
      throw error;
    }
  };

  const cargarClientes = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/clientes/clientes/', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Manejar respuesta paginada o array directo
        setClientes(Array.isArray(data) ? data : (data.results || []));
      } else {
        console.error('Error al cargar clientes:', response.status, response.statusText);
        setClientes([]);
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setClientes([]);
      throw error;
    }
  };

  const cargarEmpleados = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/nomina/empleados/?activos=true', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Manejar respuesta paginada o array directo
        setEmpleados(Array.isArray(data) ? data : (data.results || []));
      } else {
        console.error('Error al cargar empleados:', response.status, response.statusText);
        setEmpleados([]);
      }
    } catch (error) {
      console.error('Error al cargar empleados:', error);
      setEmpleados([]);
      throw error;
    }
  };

  // Filtrar productos/servicios por búsqueda
  const itemsFiltrados = mostrarProductos
    ? (productos || []).filter(p => 
        p.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.medida?.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.marca?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.modelo?.toLowerCase().includes(busqueda.toLowerCase())
      )
    : (servicios || []).filter(s => 
        s.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        s.descripcion?.toLowerCase().includes(busqueda.toLowerCase())
      );

  // Agregar item al carrito
  const agregarAlCarrito = (item, esProducto = true) => {
    const itemExistente = carrito.find(i => 
      esProducto ? i.producto?.id === item.id : i.servicio?.id === item.id
    );

    if (itemExistente) {
      setCarrito(carrito.map(i => {
        if ((esProducto && i.producto?.id === item.id) || (!esProducto && i.servicio?.id === item.id)) {
          const nuevaCantidad = i.cantidad + 1;
          return { ...i, cantidad: nuevaCantidad, subtotal: nuevaCantidad * i.precio_unitario };
        }
        return i;
      }));
    } else {
      const precioUnitario = parseFloat(item.precio_descuento || item.precio_venta || item.precio) || 0;
      const nuevoItem = {
        id: Date.now(),
        producto: esProducto ? item : null,
        servicio: esProducto ? null : item,
        descripcion: esProducto ? item.descripcion_completa : item.nombre,
        cantidad: 1,
        precio_unitario: precioUnitario,
        subtotal: precioUnitario
      };
      setCarrito([...carrito, nuevoItem]);
    }
    setBusqueda('');
  };

  // Eliminar item del carrito
  const eliminarDelCarrito = (itemId) => {
    setCarrito(carrito.filter(i => i.id !== itemId));
  };

  // Actualizar cantidad de item
  const actualizarCantidad = (itemId, nuevaCantidad) => {
    const cantidad = parseInt(nuevaCantidad) || 0;
    if (cantidad < 1) return;
    setCarrito(carrito.map(i => 
      i.id === itemId 
        ? { ...i, cantidad: cantidad, subtotal: cantidad * parseFloat(i.precio_unitario) }
        : i
    ));
  };

  // Actualizar precio de item
  const actualizarPrecio = (itemId, nuevoPrecio) => {
    const precio = parseFloat(nuevoPrecio) || 0;
    if (precio < 0) return;
    setCarrito(carrito.map(i => 
      i.id === itemId 
        ? { ...i, precio_unitario: precio, subtotal: i.cantidad * precio }
        : i
    ));
  };

  // Calcular totales
  const subtotal = carrito.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);
  const total = subtotal - parseFloat(descuento || 0);

  // Procesar venta
  const procesarVenta = async () => {
    if (carrito.length === 0) {
      alert('El carrito está vacío');
      return;
    }

    if (!empleadoSeleccionado) {
      alert('Debe seleccionar el empleado que realizó la venta');
      return;
    }

    if (total <= 0) {
      alert('El total debe ser mayor a 0');
      return;
    }

    // Validar montos según método de pago
    if (metodoPago === 'efectivo' && montoEfectivo <= 0) {
      alert('Ingrese el monto en efectivo');
      return;
    }

    if ((metodoPago === 'tarjeta' || metodoPago === 'transferencia') && montoElectronico <= 0) {
      alert('Ingrese el monto del pago electrónico');
      return;
    }

    if (metodoPago === 'mixto' && (montoEfectivo <= 0 || montoElectronico <= 0)) {
      alert('Para pago mixto, ingrese ambos montos');
      return;
    }

    setLoading(true);

    try {
      const ventaData = {
        empleado: parseInt(empleadoSeleccionado),
        cliente: clienteSeleccionado,
        metodo_pago: metodoPago,
        monto_efectivo: metodoPago === 'efectivo' || metodoPago === 'mixto' ? parseFloat(montoEfectivo) : 0,
        monto_electronico: metodoPago === 'tarjeta' || metodoPago === 'transferencia' || metodoPago === 'mixto' ? parseFloat(montoElectronico) : 0,
        subtotal: subtotal,
        descuento: descuento,
        total: total,
        notas: notas,
        detalles: carrito.map(item => ({
          producto: item.producto?.id || null,
          servicio: item.servicio?.id || null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario
        }))
      };

      const response = await fetch('http://localhost:8000/api/ventas/ventas/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(ventaData)
      });

      if (response.ok) {
        const venta = await response.json();
        setVentaExitosa(venta);
        
        // Actualizar el stock de los productos en el estado sin recargar
        if (venta.productos_actualizados && venta.productos_actualizados.length > 0) {
          setProductos(prevProductos => 
            prevProductos.map(producto => {
              const productoActualizado = venta.productos_actualizados.find(p => p.id === producto.id);
              if (productoActualizado) {
                return {
                  ...producto,
                  stock_actual: productoActualizado.stock_actual
                };
              }
              return producto;
            })
          );
        }
        
        limpiarFormulario();
        alert(`Venta ${venta.folio} registrada exitosamente`);
      } else {
        const error = await response.json();
        alert(`Error al procesar la venta: ${JSON.stringify(error)}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  // Limpiar formulario
  const limpiarFormulario = () => {
    setCarrito([]);
    setEmpleadoSeleccionado('');
    setClienteSeleccionado(null);
    setMetodoPago('efectivo');
    setMontoEfectivo(0);
    setMontoElectronico(0);
    setDescuento(0);
    setNotas('');
    setBusqueda('');
  };

  // Calcular cambio
  const calcularCambio = () => {
    const totalPagado = parseFloat(montoEfectivo || 0) + parseFloat(montoElectronico || 0);
    return totalPagado - total;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Punto de Venta (POS)</h1>
        <p className="text-gray-600">Sistema de ventas rápido</p>
      </div>

      {/* Mostrar error si existe */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
          <button 
            onClick={cargarDatosIniciales}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Mostrar loading mientras carga */}
      {loadingData ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando datos...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel izquierdo - Búsqueda y productos */}
        <div className="lg:col-span-2 space-y-4">
          {/* Búsqueda */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMostrarProductos(true)}
                className={`flex-1 py-2 px-4 rounded ${
                  mostrarProductos 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Productos
              </button>
              <button
                onClick={() => setMostrarProductos(false)}
                className={`flex-1 py-2 px-4 rounded ${
                  !mostrarProductos 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Servicios
              </button>
            </div>

            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={mostrarProductos ? "Buscar por código, medida, marca..." : "Buscar servicio..."}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>
          </div>

          {/* Lista de productos/servicios */}
          <div className="bg-white rounded-lg shadow">
            <div className="max-h-96 overflow-y-auto">
              {itemsFiltrados.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No se encontraron {mostrarProductos ? 'productos' : 'servicios'}
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {itemsFiltrados.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => agregarAlCarrito(item, mostrarProductos)}
                      className="p-4 hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      {mostrarProductos ? (
                        <div>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.codigo}</p>
                              <p className="text-sm text-gray-600">{item.descripcion_completa}</p>
                              <p className="text-xs text-gray-500 mt-1">Stock: {item.stock_actual}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-blue-600">
                                ${item.precio_descuento || item.precio_venta}
                              </p>
                              {item.precio_descuento && (
                                <p className="text-xs text-gray-500 line-through">
                                  ${item.precio_venta}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{item.nombre}</p>
                            <p className="text-sm text-gray-600">{item.descripcion}</p>
                          </div>
                          <p className="font-bold text-blue-600">${item.precio}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel derecho - Carrito y pago */}
        <div className="space-y-4">
          {/* Carrito */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <ShoppingCartIcon className="h-6 w-6 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Carrito ({carrito.length})</h2>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-gray-200">
              {carrito.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Carrito vacío
                </div>
              ) : (
                carrito.map((item) => (
                  <div key={item.id} className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-medium text-gray-900 flex-1">
                        {item.descripcion}
                      </p>
                      <button
                        onClick={() => eliminarDelCarrito(item.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <label className="text-xs text-gray-500">Cant.</label>
                        <input
                          type="number"
                          min="1"
                          value={item.cantidad}
                          onChange={(e) => actualizarCantidad(item.id, parseInt(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Precio</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.precio_unitario}
                          onChange={(e) => actualizarPrecio(item.id, parseFloat(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Subtotal</label>
                        <p className="font-medium text-blue-600 px-2 py-1">
                          ${item.subtotal.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Empleado */}
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Empleado que realiza la venta *
            </label>
            <select
              value={empleadoSeleccionado}
              onChange={(e) => setEmpleadoSeleccionado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
              required
            >
              <option value="">Seleccionar empleado</option>
              {empleados.map((empleado) => (
                <option key={empleado.id} value={empleado.id}>
                  {empleado.nombre_completo || `${empleado.nombre} ${empleado.apellido}`}
                </option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cliente (opcional)
            </label>
            <select
              value={clienteSeleccionado || ''}
              onChange={(e) => setClienteSeleccionado(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
            >
              <option value="">Venta sin cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre} - {cliente.telefono}
                </option>
              ))}
            </select>
          </div>

          {/* Método de pago */}
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Método de Pago
            </label>
            <select
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mb-3 text-gray-900"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="mixto">Mixto</option>
            </select>

            {(metodoPago === 'efectivo' || metodoPago === 'mixto') && (
              <div className="mb-3">
                <label className="block text-sm text-gray-700 mb-1">Monto Efectivo</label>
                <input
                  type="number"
                  step="0.01"
                  value={montoEfectivo}
                  onChange={(e) => setMontoEfectivo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            )}

            {(metodoPago === 'tarjeta' || metodoPago === 'transferencia' || metodoPago === 'mixto') && (
              <div className="mb-3">
                <label className="block text-sm text-gray-700 mb-1">Monto Electrónico</label>
                <input
                  type="number"
                  step="0.01"
                  value={montoElectronico}
                  onChange={(e) => setMontoElectronico(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900"
                />
              </div>
            )}
          </div>

          {/* Totales */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">${subtotal.toFixed(2)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Descuento:</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={descuento}
                  onChange={(e) => setDescuento(parseFloat(e.target.value) || 0)}
                  className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-gray-900"
                />
              </div>

              <div className="border-t border-gray-300 pt-2">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-blue-600">${total.toFixed(2)}</span>
                </div>
              </div>

              {metodoPago === 'efectivo' && montoEfectivo > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Cambio:</span>
                  <span className="font-bold">${calcularCambio().toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-700 mb-1">Notas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows="2"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                placeholder="Notas adicionales..."
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={limpiarFormulario}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Limpiar
            </button>
            <button
              onClick={procesarVenta}
              disabled={carrito.length === 0 || loading}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Procesando...' : 'Procesar Venta'}
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
