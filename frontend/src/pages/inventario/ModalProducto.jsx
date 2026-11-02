import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  detectarMedidaFormateada,
  calcularPreciosEscalonados,
  obtenerCategoriaRin,
} from '../../lib/medidaUtils';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const INDICES_VELOCIDAD = [
  { val: 'T', label: 'T (hasta 190 km/h)' },
  { val: 'H', label: 'H (hasta 210 km/h)' },
  { val: 'V', label: 'V (hasta 240 km/h)' },
  { val: 'W', label: 'W (hasta 270 km/h)' },
  { val: 'Y', label: 'Y (hasta 300 km/h)' },
  { val: 'Z', label: 'Z (más de 240 km/h)' },
];

export default function ModalProducto({ isOpen, onClose, producto = null, onGuardado }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    codigo: '',
    marca: '',
    medida: '',
    modelo: '',
    indice_carga: 82,
    indice_velocidad: 'H',
    precio_venta: '',
    precio_descuento: '',
    stock_minimo: 2,
    activo: true,
  });

  const [creandoMarca, setCreandoMarca] = useState(false);
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mostrarTabulador, setMostrarTabulador] = useState(false);
  const [costoEstimado, setCostoEstimado] = useState('');
  const [notaTabulador, setNotaTabulador] = useState(null);

  // Cargar marcas
  const { data: marcas = [] } = useQuery({
    queryKey: ['inventario-marcas'],
    queryFn: async () => {
      const res = await fetch('/api/inventario/marcas/', { headers: tok() });
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : (d.results ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  // Inicializar formulario al abrir o cambiar de producto
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setCreandoMarca(false);
      setNuevaMarcaNombre('');
      setMostrarTabulador(false);
      setNotaTabulador(null);
      if (producto) {
        setCostoEstimado(producto.ultimo_precio_compra ? String(producto.ultimo_precio_compra) : '');
        setForm({
          codigo: producto.codigo || '',
          marca: producto.marca_id || producto.marca || '',
          medida: producto.medida || '',
          modelo: producto.modelo || '',
          indice_carga: producto.indice_carga ?? 82,
          indice_velocidad: producto.indice_velocidad || 'H',
          precio_venta: producto.precio_venta ?? '',
          precio_descuento: producto.precio_descuento ?? '',
          stock_minimo: producto.stock_minimo ?? 2,
          activo: producto.activo !== undefined ? Boolean(producto.activo) : true,
        });
      } else {
        setCostoEstimado('');
        setForm({
          codigo: '',
          marca: '',
          medida: '',
          modelo: '',
          indice_carga: 82,
          indice_velocidad: 'H',
          precio_venta: '',
          precio_descuento: '',
          stock_minimo: 2,
          activo: true,
        });
      }
    }
  }, [isOpen, producto]);

  const categoriaRin = useMemo(() => obtenerCategoriaRin(form.medida), [form.medida]);

  const aplicarTabulador = (costoVal = costoEstimado) => {
    const c = parseFloat(costoVal);
    if (!isNaN(c) && c > 0) {
      const cat = obtenerCategoriaRin(form.medida);
      const res = calcularPreciosEscalonados({
        costo: c,
        costoIncluyeIva: false,
        categoriaRin: cat,
      });
      if (res?.precioUnitario > 0) {
        setForm((f) => ({ ...f, precio_venta: res.precioUnitario }));
        setNotaTabulador(`Calculado con Tabulador Rin: ${cat} (IVA + factor 1.079 + margen)`);
      }
    }
  };

  const handleToggleTabulador = () => {
    const nuevoEstado = !mostrarTabulador;
    setMostrarTabulador(nuevoEstado);
    if (nuevoEstado && parseFloat(costoEstimado) > 0) {
      aplicarTabulador(costoEstimado);
    }
  };

  const handleCostoEstimadoChange = (val) => {
    setCostoEstimado(val);
    const c = parseFloat(val);
    if (!isNaN(c) && c > 0) {
      aplicarTabulador(val);
    }
  };

  // Si marca es texto (en producto consolidado viene 'marca: "Pirelli"'), encontrar ID
  useEffect(() => {
    if (isOpen && producto && marcas.length > 0) {
      if (typeof form.marca === 'string' && isNaN(Number(form.marca))) {
        const encontrada = marcas.find(
          (m) => m.nombre?.toLowerCase() === form.marca?.toLowerCase()
        );
        if (encontrada) {
          setForm((prev) => ({ ...prev, marca: encontrada.id }));
        }
      }
    }
  }, [isOpen, producto, marcas, form.marca]);

  // Medida formateada sugerida
  const medidaSugerida = useMemo(() => {
    if (!form.medida) return null;
    const f = detectarMedidaFormateada(form.medida);
    return f && f !== form.medida ? f : null;
  }, [form.medida]);

  // Mutación para crear nueva marca al vuelo
  const crearMarcaMut = useMutation({
    mutationFn: async (nombre) => {
      const res = await fetch('/api/inventario/marcas/', {
        method: 'POST',
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), activa: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.nombre?.[0] || err.detail || 'Error al crear marca');
      }
      return res.json();
    },
    onSuccess: (nuevaMarca) => {
      queryClient.invalidateQueries({ queryKey: ['inventario-marcas'] });
      setForm((f) => ({ ...f, marca: nuevaMarca.id }));
      setCreandoMarca(false);
      setNuevaMarcaNombre('');
    },
    onError: (err) => {
      setErrorMsg(err.message);
    },
  });

  const handleCrearMarca = (e) => {
    e.preventDefault();
    if (!nuevaMarcaNombre.trim()) return;
    crearMarcaMut.mutate(nuevaMarcaNombre);
  };

  // Autogenerar código
  const handleAutogenerarCodigo = () => {
    const marcaObj = marcas.find((m) => String(m.id) === String(form.marca));
    const marcaTxt = marcaObj ? marcaObj.nombre : (typeof form.marca === 'string' ? form.marca : '');
    const medidaLimpia = form.medida
      ? form.medida.replace(/[\s/]/g, '').toUpperCase()
      : 'LLANTA';
    const marcaLimpia = marcaTxt ? marcaTxt.replace(/[\s-]/g, '').toUpperCase() : '';
    const modeloLimpio = form.modelo ? form.modelo.replace(/[\s-]/g, '').substring(0, 4).toUpperCase() : '';

    const partes = [medidaLimpia];
    if (marcaLimpia) partes.push(marcaLimpia);
    if (modeloLimpio) partes.push(modeloLimpio);

    const autogen = partes.join('-');
    setForm((f) => ({ ...f, codigo: autogen }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.codigo.trim()) {
      setErrorMsg('El código SKU es obligatorio.');
      return;
    }
    if (!form.marca) {
      setErrorMsg('Debe seleccionar o registrar una marca.');
      return;
    }
    if (!form.medida.trim()) {
      setErrorMsg('La medida es obligatoria.');
      return;
    }
    if (!form.modelo.trim()) {
      setErrorMsg('El modelo es obligatorio.');
      return;
    }
    if (form.precio_venta === '' || Number(form.precio_venta) < 0) {
      setErrorMsg('El precio de venta debe ser un número válido mayor o igual a 0.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        codigo: form.codigo.trim().toUpperCase(),
        marca: Number(form.marca),
        medida: form.medida.trim(),
        modelo: form.modelo.trim(),
        indice_carga: parseInt(form.indice_carga, 10) || 82,
        indice_velocidad: form.indice_velocidad,
        precio_venta: parseFloat(form.precio_venta),
        precio_descuento: form.precio_descuento !== '' && form.precio_descuento !== null
          ? parseFloat(form.precio_descuento)
          : null,
        stock_minimo: parseInt(form.stock_minimo, 10) || 0,
        activo: Boolean(form.activo),
      };

      const isEdit = Boolean(producto?.id);
      const url = isEdit
        ? `/api/inventario/productos/${producto.id}/`
        : '/api/inventario/productos/';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { ...tok(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        let errText = 'Error al guardar el producto.';
        if (typeof errorData === 'object') {
          const keys = Object.keys(errorData);
          if (keys.length > 0) {
            const first = errorData[keys[0]];
            errText = Array.isArray(first) ? `${keys[0]}: ${first[0]}` : String(first);
          }
        }
        throw new Error(errText);
      }

      const prodGuardado = await res.json();

      queryClient.invalidateQueries({ queryKey: ['inventario-productos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-consolidado'] });

      if (onGuardado) {
        onGuardado(prodGuardado);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isEdit = Boolean(producto?.id);
  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#df000a] focus:border-[#df000a] bg-white text-gray-900 transition-colors';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[70] p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-6 border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-[#df000a]">
              <i className="ri-roadster-line text-lg"></i>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                {isEdit ? 'Editar Producto' : 'Nuevo Producto en Catálogo'}
              </h2>
              <p className="text-xs text-gray-500">
                {isEdit ? `SKU: ${producto.codigo}` : 'Registra una llanta para inventario y cotizaciones'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
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
          {/* Fila 1: Código + Botón autogenerar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Código SKU *
              </label>
              <button
                type="button"
                onClick={handleAutogenerarCodigo}
                className="inline-flex items-center gap-1 text-xs text-[#df000a] hover:text-[#b80008] font-medium hover:underline cursor-pointer"
                title="Generar código sugerido basado en Medida y Marca"
              >
                <i className="ri-magic-line text-sm"></i> Autogenerar SKU
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="Ej. 205-55R16-PIRELLI"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value.toUpperCase() }))}
              className={`${inputCls} font-mono`}
            />
          </div>

          {/* Fila 2: Marca (con opción de crear rápido) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Marca *
              </label>
              <button
                type="button"
                onClick={() => setCreandoMarca((v) => !v)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
              >
                <i className="ri-add-line text-xs"></i>
                {creandoMarca ? 'Seleccionar existente' : '+ Nueva marca'}
              </button>
            </div>

            {creandoMarca ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nombre de la nueva marca..."
                  value={nuevaMarcaNombre}
                  onChange={(e) => setNuevaMarcaNombre(e.target.value)}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={handleCrearMarca}
                  disabled={crearMarcaMut.isPending || !nuevaMarcaNombre.trim()}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shrink-0"
                >
                  {crearMarcaMut.isPending ? 'Guardando...' : 'Crear'}
                </button>
              </div>
            ) : (
              <select
                required
                value={form.marca}
                onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
                className={inputCls}
              >
                <option value="">— Seleccionar Marca —</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Fila 3: Medida y Modelo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Medida *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. 205/55 R16 o 2055516"
                value={form.medida}
                onChange={(e) => setForm((f) => ({ ...f, medida: e.target.value }))}
                className={inputCls}
              />
              {medidaSugerida && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, medida: medidaSugerida }))}
                  className="mt-1 text-[11px] text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                >
                  <span>Formato detectado: <strong>{medidaSugerida}</strong></span>
                  <i className="ri-check-line text-xs text-amber-400"></i>
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Modelo / Línea *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Cinturato P7, Primacy 4"
                value={form.modelo}
                onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Fila 4: Índice Carga & Velocidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Índice Carga (IC) *
              </label>
              <input
                type="number"
                required
                min="50"
                max="180"
                value={form.indice_carga}
                onChange={(e) => setForm((f) => ({ ...f, indice_carga: e.target.value }))}
                className={inputCls}
                placeholder="82, 91, 94..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Índice Velocidad (IV) *
              </label>
              <select
                required
                value={form.indice_velocidad}
                onChange={(e) => setForm((f) => ({ ...f, indice_velocidad: e.target.value }))}
                className={inputCls}
              >
                {INDICES_VELOCIDAD.map((iv) => (
                  <option key={iv.val} value={iv.val}>
                    {iv.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fila 5: Herramienta Tabulador Rin + Precio Venta & Precio Descuento */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Precios (MXN)
              </span>
              <button
                type="button"
                onClick={handleToggleTabulador}
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/25 px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors shadow-xs"
                title="Sugerir precio según costo y Rin"
              >
                <i className="ri-flashlight-line text-amber-400"></i>
                <span>Sugerir precio con Tabulador Rin</span>
              </button>
            </div>

            {mostrarTabulador && (
              <div className="p-3.5 bg-[#161a29] border border-amber-500/30 rounded-xl space-y-2.5 shadow-lg animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-amber-400/15 text-amber-400 flex items-center justify-center text-xs">
                      <i className="ri-flashlight-fill"></i>
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      Tabulador detectado:
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 font-mono font-bold text-xs">
                      {categoriaRin.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostrarTabulador(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/5 cursor-pointer transition-colors"
                    title="Cerrar panel"
                  >
                    <i className="ri-close-line text-sm"></i>
                  </button>
                </div>
                <div className="flex items-end gap-2.5 pt-1">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Costo compra estimado (sin IVA):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Ej. 1200.00"
                        value={costoEstimado}
                        onChange={(e) => handleCostoEstimadoChange(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-white/15 rounded-lg bg-[#0e111a] text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400 font-mono font-semibold transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => aplicarTabulador(costoEstimado)}
                      disabled={!parseFloat(costoEstimado)}
                      className="px-3.5 py-1.5 bg-[#df000a] hover:bg-[#c4000a] disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <i className="ri-check-line text-sm"></i>
                      <span>Aplicar Precio</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                  <i className="ri-information-line text-amber-400/80"></i>
                  <span>Fórmula: Costo + IVA (16%) × 1.079 financiamiento + margen Rin redondeado a múltiplo de 5.</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Precio Venta (MXN) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={form.precio_venta}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, precio_venta: e.target.value }));
                      setNotaTabulador(null);
                    }}
                    className={`${inputCls} pl-7 font-mono font-semibold`}
                  />
                </div>
                {notaTabulador && (
                  <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                    {notaTabulador}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Precio Descuento (Opcional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.precio_descuento}
                    onChange={(e) => setForm((f) => ({ ...f, precio_descuento: e.target.value }))}
                    className={`${inputCls} pl-7 font-mono`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Fila 6: Stock mínimo & Activo */}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Stock Mínimo (Alerta)
              </label>
              <input
                type="number"
                min="0"
                value={form.stock_minimo}
                onChange={(e) => setForm((f) => ({ ...f, stock_minimo: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                  className="w-4 h-4 text-[#df000a] rounded border-gray-300 focus:ring-[#df000a]"
                />
                <div>
                  <span className="text-xs font-semibold text-gray-800">Producto Activo</span>
                  <p className="text-[11px] text-gray-500">Disponible en cotizaciones y ventas</p>
                </div>
              </label>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-[#df000a] hover:bg-[#c4000a] disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-md shadow-red-500/20 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>{isEdit ? 'Actualizar Producto' : 'Guardar Producto'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
