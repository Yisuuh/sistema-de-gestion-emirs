import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveBoxXMarkIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  DocumentMagnifyingGlassIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LinkSlashIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useConfirm } from '../../lib/confirm';
import VistaPreviaCFDI from './VistaPreviaCFDI';

const tok = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmt = (n, d = 2) =>
  Number(n ?? 0).toLocaleString('es-MX', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

const ESTADO_BADGES = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  importada: { label: 'Importada', cls: 'bg-emerald-100 text-emerald-800' },
  descartada: { label: 'Descartada', cls: 'bg-gray-100 text-gray-600' },
  error: { label: 'Con error', cls: 'bg-red-100 text-red-800' },
};

const ESTADO_PILLS = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'importada', label: 'Importadas' },
  { id: 'descartada', label: 'Descartadas' },
  { id: 'error', label: 'Con error' },
  { id: 'todos', label: 'Todos' },
];

const INVALIDATE_ON_IMPORT = [
  ['xml-bandeja'],
  ['gmail-status'],
  ['inventario-consolidado'],
  ['inventario-entradas'],
  ['inventario-productos'],
  ['inventario-kardex'],
  ['inventario-proveedores'],
  ['inventario-proveedores-catalogo'],
  ['inventario-marcas'],
  ['inventario-marcas-catalogo'],
  ['pos-productos'],
  ['dashboard-resumen'],
  ['inventario-llantas-rescate'],
];

function formatDateTime(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(val) {
  if (!val) return '—';
  const str = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return formatDateTime(val);
}

function extractFilename(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ''));
    } catch (_) {
      return utf8Match[1].replace(/["']/g, '');
    }
  }
  const plainMatch = contentDisposition.match(/filename=([^;\n]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  return fallback;
}

async function parseErrorResponse(res, fallbackMsg) {
  try {
    const data = await res.json();
    return data?.error || data?.detail || fallbackMsg;
  } catch (_) {
    return `${fallbackMsg} (HTTP ${res.status})`;
  }
}

export default function TabBandejaXml({
  oauthNotice = null,
  onClearOauthNotice,
  onImportado,
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const rol = localStorage.getItem('rol') || '';
  const esAdmin = ['admin', 'administrador'].includes(rol.toLowerCase());

  const [estadoFiltro, setEstadoFiltro] = useState('pendiente');
  const [busqueda, setBusqueda] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [banner, setBanner] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [loadingPreviewId, setLoadingPreviewId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [actionRowId, setActionRowId] = useState(null);

  const [previewModal, setPreviewModal] = useState(null); // { item, datos }
  const [previewError, setPreviewError] = useState(null);

  // Debounce 300ms para buscador
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(busqueda.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [busqueda]);

  const showBanner = (tipo, txt) => {
    setBanner({ tipo, txt });
  };

  // Estado Gmail OAuth2
  const {
    data: gmailStatus,
    isLoading: loadingStatus,
    isError: errorStatus,
  } = useQuery({
    queryKey: ['gmail-status'],
    queryFn: async () => {
      const res = await fetch('/api/inventario/xml-bandeja/gmail/status/', {
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, 'No se pudo consultar el estado de Gmail'));
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  // Listado de XML en bandeja
  const {
    data: bandejaData,
    isLoading: loadingBandeja,
    isFetching: fetchingBandeja,
    isError: errorBandeja,
    error: bandejaErrObj,
    refetch: refetchBandeja,
  } = useQuery({
    queryKey: ['xml-bandeja', estadoFiltro, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (estadoFiltro && estadoFiltro !== 'todos') {
        params.set('estado', estadoFiltro);
      }
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }
      params.set('page', String(page));

      const res = await fetch(`/api/inventario/xml-bandeja/?${params.toString()}`, {
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, 'Error al cargar la bandeja XML'));
      }
      const d = await res.json();
      if (Array.isArray(d)) {
        return { results: d, count: d.length, next: null, previous: null };
      }
      return {
        results: d.results ?? [],
        count: d.count ?? (d.results?.length ?? 0),
        next: d.next ?? null,
        previous: d.previous ?? null,
      };
    },
  });

  const items = bandejaData?.results ?? [];
  const totalCount = bandejaData?.count ?? items.length;
  const hasNext = Boolean(bandejaData?.next);
  const hasPrev = Boolean(bandejaData?.previous);

  // Sincronizar ahora
  const sincronizarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventario/xml-bandeja/sincronizar/', {
        method: 'POST',
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, 'Error al sincronizar correos de Gmail'));
      }
      return res.json();
    },
    onSuccess: async (res) => {
      const nuevas = Number(res?.nuevas ?? res?.nuevos ?? 0);
      const duplicadas = Number(res?.duplicadas ?? res?.duplicados_omitidos ?? 0);
      const errores = Number(res?.errores ?? 0);
      const erroresConexion = Number(res?.errores_conexion ?? 0);
      const tipo = erroresConexion > 0 ? 'err' : errores > 0 ? 'warn' : 'ok';
      const detalleConexion =
        erroresConexion > 0 ? `, ${erroresConexion} error(es) de conexión` : '';
      showBanner(
        tipo,
        `Sincronización finalizada: ${nuevas} nuevo(s), ${duplicadas} duplicado(s) omitido(s), ${errores} error(es)${detalleConexion}.`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['xml-bandeja'] }),
        queryClient.invalidateQueries({ queryKey: ['gmail-status'] }),
      ]);
    },
    onError: (err) => {
      showBanner('err', err.message || 'No se pudo completar la sincronización.');
    },
  });

  // Desconectar Gmail
  const desconectarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/inventario/xml-bandeja/gmail/disconnect/', {
        method: 'POST',
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, 'Error al desconectar Gmail'));
      }
      return res.json();
    },
    onSuccess: async () => {
      showBanner('ok', 'Cuenta de Gmail desconectada correctamente.');
      await queryClient.invalidateQueries({ queryKey: ['gmail-status'] });
    },
    onError: (err) => {
      showBanner('err', err.message || 'No se pudo desconectar la cuenta de Gmail.');
    },
  });

  // Importar factura desde bandeja
  const importarMut = useMutation({
    mutationFn: async (id) => {
      const res = await fetch(`/api/inventario/xml-bandeja/${id}/importar/`, {
        method: 'POST',
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, 'Error al importar la factura XML'));
      }
      return res.json();
    },
    onSuccess: async (data) => {
      const res = data?.resultado ?? data;
      const factura = res?.numero_factura || previewModal?.item?.numero_factura || '';
      const totalItems = res?.total_items ?? previewModal?.datos?.items?.length ?? 0;
      const proveedor = res?.proveedor || previewModal?.datos?.proveedor?.nombre || '';

      setPreviewModal(null);
      setPreviewError(null);
      showBanner(
        'ok',
        `Factura ${factura} importada — ${totalItems} línea(s)${proveedor ? ` de ${proveedor}` : ''}.`
      );

      await Promise.all(
        INVALIDATE_ON_IMPORT.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
      onImportado?.(res);
    },
    onError: (err) => {
      setPreviewError(err.message || 'No se pudo importar la factura.');
    },
  });

  // Cerrar modal de vista previa con Escape si no está importando
  useEffect(() => {
    if (!previewModal) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !importarMut.isPending) {
        setPreviewModal(null);
        setPreviewError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewModal, importarMut.isPending]);

  // Descartar o Restaurar
  const estadoMut = useMutation({
    mutationFn: async ({ id, accion }) => {
      setActionRowId(id);
      const res = await fetch(`/api/inventario/xml-bandeja/${id}/${accion}/`, {
        method: 'PATCH',
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(
          await parseErrorResponse(
            res,
            accion === 'descartar'
              ? 'Error al descartar el archivo XML'
              : 'Error al restaurar el archivo XML'
          )
        );
      }
      return res.json();
    },
    onSuccess: async (_, { accion }) => {
      showBanner(
        'ok',
        accion === 'descartar'
          ? 'XML movido a descartadas.'
          : 'XML restaurado a pendientes.'
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['xml-bandeja'] }),
        queryClient.invalidateQueries({ queryKey: ['gmail-status'] }),
      ]);
    },
    onError: (err) => {
      showBanner('err', err.message || 'No se pudo actualizar el estado del registro.');
    },
    onSettled: () => {
      setActionRowId(null);
    },
  });

  const handleConectarGmail = async () => {
    setConnecting(true);
    setBanner(null);
    try {
      const res = await fetch('/api/inventario/xml-bandeja/gmail/auth-url/', {
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(
          await parseErrorResponse(res, 'No se pudo obtener la URL de autorización de Google')
        );
      }
      const data = await res.json();
      if (!data?.auth_url) {
        throw new Error('El servidor no devolvió una URL de autorización válida.');
      }
      window.location.href = data.auth_url;
    } catch (err) {
      showBanner('err', err.message || 'Error al iniciar conexión con Google.');
      setConnecting(false);
    }
  };

  const handleDesconectarGmail = async () => {
    const ok = await confirm({
      title: 'Desconectar cuenta de Gmail',
      message: `Se desvinculará la cuenta ${gmailStatus?.email_cuenta || 'conectada'}. Los XML ya descargados permanecerán disponibles en la bandeja.`,
      variant: 'danger',
    });
    if (!ok) return;
    desconectarMut.mutate();
  };

  const handleRevisar = async (item) => {
    setLoadingPreviewId(item.id);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/inventario/xml-bandeja/${item.id}/preview/`, {
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(
          await parseErrorResponse(res, 'No se pudo obtener la vista previa del XML')
        );
      }
      const data = await res.json();
      if (!data?.datos) {
        throw new Error('Respuesta de vista previa inválida.');
      }
      setPreviewModal({ item, datos: data.datos });
    } catch (err) {
      showBanner('err', err.message || 'Error al cargar la vista previa.');
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const handleDescargar = async (item) => {
    setDownloadingId(item.id);
    try {
      const res = await fetch(`/api/inventario/xml-bandeja/${item.id}/descargar/`, {
        headers: tok(),
      });
      if (!res.ok) {
        throw new Error(await parseErrorResponse(res, 'No se pudo descargar el archivo XML'));
      }
      const blob = await res.blob();
      const fallbackName =
        item.nombre_archivo || `factura_${item.numero_factura || item.id}.xml`;
      const filename = extractFilename(
        res.headers.get('Content-Disposition'),
        fallbackName
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showBanner('err', err.message || 'Error al descargar el XML.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleCambiarEstadoFiltro = (nuevoEstado) => {
    setEstadoFiltro(nuevoEstado);
    setPage(1);
  };

  const configuredEnv = (gmailStatus?.configured_env ?? gmailStatus?.oauth_configurado) !== false;
  const connected = Boolean(gmailStatus?.connected ?? gmailStatus?.conectado);

  return (
    <div className="space-y-4">
      {/* Notificación de callback OAuth2 */}
      {oauthNotice && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            oauthNotice.tipo === 'ok'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {oauthNotice.tipo === 'ok' ? (
              <CheckCircleIcon className="h-5 w-5 shrink-0" />
            ) : (
              <XCircleIcon className="h-5 w-5 shrink-0" />
            )}
            <span className="font-medium">{oauthNotice.txt}</span>
          </div>
          {onClearOauthNotice && (
            <button
              type="button"
              onClick={onClearOauthNotice}
              className="p-1 rounded hover:bg-white/10 cursor-pointer shrink-0"
              aria-label="Cerrar notificación"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Banner de acciones locales */}
      {banner && (
        <div
          className={`px-4 py-3 rounded-xl border text-sm flex items-center justify-between gap-3 ${
            banner.tipo === 'ok'
              ? 'bg-green-50 border-green-200 text-green-700'
              : banner.tipo === 'warn'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {banner.tipo === 'ok' ? (
              <CheckCircleIcon className="h-5 w-5 shrink-0" />
            ) : banner.tipo === 'warn' ? (
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
            ) : (
              <XCircleIcon className="h-5 w-5 shrink-0" />
            )}
            <span className="font-medium">{banner.txt}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 rounded hover:bg-white/10 cursor-pointer shrink-0"
            aria-label="Cerrar mensaje"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Panel de Estado Gmail OAuth2 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        {loadingStatus ? (
          <div className="flex items-center gap-3 py-2">
            <div className="w-5 h-5 border-2 border-[#df000a] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">Verificando conexión con Gmail…</span>
          </div>
        ) : errorStatus ? (
          <div className="flex items-center gap-2 text-sm text-red-700">
            <XCircleIcon className="h-5 w-5 shrink-0" />
            <span>No se pudo consultar el estado de la integración con Gmail.</span>
          </div>
        ) : !configuredEnv ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-3">
            <InformationCircleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              <p className="font-semibold">
                Configuración de Google OAuth2 pendiente en el servidor
              </p>
              <p className="text-xs leading-relaxed">
                Falta configurar{' '}
                <code className="font-mono px-1.5 py-0.5 rounded bg-amber-100">
                  GOOGLE_OAUTH_CLIENT_ID
                </code>{' '}
                y{' '}
                <code className="font-mono px-1.5 py-0.5 rounded bg-amber-100">
                  GOOGLE_OAUTH_CLIENT_SECRET
                </code>{' '}
                en <code className="font-mono">backend/.env</code> para activar la conexión con
                Google. Mientras tanto, puedes consultar o descargar los XML ya registrados en la
                bandeja o usar la pestaña de subida manual.
              </p>
            </div>
          </div>
        ) : !connected ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                <EnvelopeIcon className="h-5 w-5 text-gray-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-900">Bandeja de Gmail</h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
                    No conectado
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {esAdmin
                    ? 'Vincula una cuenta de Gmail en modo solo lectura para descargar automáticamente facturas CFDI (.xml y .zip).'
                    : 'Aún no hay una cuenta de Gmail vinculada. Solicita a un administrador realizar la conexión.'}
                </p>
              </div>
            </div>

            {esAdmin && (
              <button
                type="button"
                onClick={handleConectarGmail}
                disabled={connecting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#df000a] hover:bg-[#c4000a] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {connecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Redirigiendo a Google…</span>
                  </>
                ) : (
                  <>
                    <i className="ri-google-line text-base" />
                    <span>Conectar Gmail</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <EnvelopeIcon className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Conectado
                    </span>
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {gmailStatus.email_cuenta}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Última sincronización:{' '}
                    <span className="text-gray-700 font-medium">
                      {gmailStatus.ultima_sincronizacion
                        ? formatDateTime(gmailStatus.ultima_sincronizacion)
                        : 'Aún sin sincronizar'}
                    </span>
                  </p>
                </div>
              </div>

              {esAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => sincronizarMut.mutate()}
                    disabled={sincronizarMut.isPending || desconectarMut.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#df000a] hover:bg-[#c4000a] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowPathIcon
                      className={`h-4 w-4 ${sincronizarMut.isPending ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {sincronizarMut.isPending ? 'Sincronizando…' : 'Sincronizar ahora'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDesconectarGmail}
                    disabled={desconectarMut.isPending || sincronizarMut.isPending}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <LinkSlashIcon className="h-4 w-4" />
                    <span>
                      {desconectarMut.isPending ? 'Desconectando…' : 'Desconectar Gmail'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {gmailStatus.ultimo_error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Último error registrado: </span>
                  <span>{gmailStatus.ultimo_error}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filtros y buscador */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {ESTADO_PILLS.map((pill) => {
            const active = estadoFiltro === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => handleCambiarEstadoFiltro(pill.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#df000a] text-white shadow-xs'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-1 lg:max-w-md">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por proveedor, RFC, factura, UUID o asunto…"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <XCircleIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => refetchBandeja()}
            disabled={fetchingBandeja}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            title="Actualizar bandeja"
          >
            <ArrowPathIcon className={`h-4 w-4 ${fetchingBandeja ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Listado de facturas XML */}
      {loadingBandeja ? (
        <div className="flex justify-center py-14 bg-white rounded-xl border border-gray-200">
          <div className="w-8 h-8 border-4 border-[#df000a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : errorBandeja ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm text-red-700">
          <XCircleIcon className="h-8 w-8 mx-auto mb-2" />
          <p className="font-semibold">
            {bandejaErrObj?.message || 'No se pudo cargar la bandeja de facturas XML.'}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <EnvelopeIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-800">
            No hay facturas XML en esta vista
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {debouncedSearch
              ? 'Prueba ajustando el texto de búsqueda o cambiando el filtro de estado.'
              : connected && esAdmin
              ? 'Pulsa "Sincronizar ahora" para buscar adjuntos .xml o .zip recientes en Gmail.'
              : 'Cuando lleguen archivos XML desde Gmail aparecerán aquí.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    'Factura / Archivo',
                    'Emisor / RFC',
                    'Correo origen',
                    'Emisión / Conceptos',
                    'Total',
                    'Estado',
                    'Acciones',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3.5 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const badge = ESTADO_BADGES[item.estado] || {
                    label: item.estado,
                    cls: 'bg-gray-100 text-gray-600',
                  };
                  const isBusyRow =
                    loadingPreviewId === item.id ||
                    downloadingId === item.id ||
                    actionRowId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50 align-top">
                      <td className="px-3.5 py-3">
                        <div className="font-mono font-semibold text-gray-900 text-xs">
                          {item.numero_factura || 'Sin folio'}
                        </div>
                        <div
                          className="text-xs text-gray-500 truncate max-w-[200px] mt-0.5"
                          title={item.nombre_archivo}
                        >
                          {item.nombre_archivo}
                        </div>
                        {item.cfdi_uuid && (
                          <div
                            className="font-mono text-[11px] text-gray-400 truncate max-w-[200px] mt-0.5"
                            title={`UUID: ${item.cfdi_uuid}`}
                          >
                            {item.cfdi_uuid}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-3">
                        <div className="font-medium text-gray-900 text-xs max-w-[210px]">
                          {item.emisor_nombre || 'Emisor no detectado'}
                        </div>
                        <div className="font-mono text-xs text-gray-500 mt-0.5">
                          {item.emisor_rfc || '—'}
                        </div>
                      </td>

                      <td className="px-3.5 py-3">
                        <div className="text-xs font-medium text-gray-800 max-w-[210px] truncate">
                          {item.remitente_nombre || item.remitente_email || '—'}
                        </div>
                        {item.asunto && (
                          <div
                            className="text-xs text-gray-500 max-w-[210px] truncate mt-0.5"
                            title={item.asunto}
                          >
                            {item.asunto}
                          </div>
                        )}
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {formatDateTime(item.fecha_correo)}
                        </div>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="text-xs text-gray-800">
                          {formatDateOnly(item.fecha_emision)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.total_items ?? 0} concepto(s)
                        </div>
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-gray-900">
                          ${fmt(item.total)}
                        </div>
                        <div className="font-mono text-[11px] text-gray-500">
                          Sub: ${fmt(item.subtotal)}
                        </div>
                      </td>

                      <td className="px-3.5 py-3">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        {item.estado === 'error' && item.error_detalle && (
                          <p
                            className="text-[11px] text-red-600 mt-1 max-w-[190px] line-clamp-2"
                            title={item.error_detalle}
                          >
                            {item.error_detalle}
                          </p>
                        )}
                        {item.estado === 'importada' && item.importado_at && (
                          <p className="text-[11px] text-gray-400 mt-1 whitespace-nowrap">
                            {formatDateTime(item.importado_at)}
                          </p>
                        )}
                      </td>

                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {esAdmin && item.estado === 'pendiente' && (
                            <button
                              type="button"
                              onClick={() => handleRevisar(item)}
                              disabled={isBusyRow}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {loadingPreviewId === item.id ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <DocumentMagnifyingGlassIcon className="h-3.5 w-3.5" />
                              )}
                              <span>Revisar e Importar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDescargar(item)}
                            disabled={downloadingId === item.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                            title="Descargar XML original"
                          >
                            {downloadingId === item.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                            )}
                            <span>Descargar XML</span>
                          </button>

                          {esAdmin &&
                            (item.estado === 'pendiente' || item.estado === 'error') && (
                              <button
                                type="button"
                                onClick={() =>
                                  estadoMut.mutate({ id: item.id, accion: 'descartar' })
                                }
                                disabled={isBusyRow}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-red-50 hover:text-red-700 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                                title="Descartar XML"
                              >
                                <ArchiveBoxXMarkIcon className="h-3.5 w-3.5" />
                                <span>Descartar</span>
                              </button>
                            )}

                          {esAdmin && item.estado === 'descartada' && (
                            <button
                              type="button"
                              onClick={() =>
                                estadoMut.mutate({ id: item.id, accion: 'restaurar' })
                              }
                              disabled={isBusyRow}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-medium transition-colors disabled:opacity-50 cursor-pointer"
                              title="Restaurar a pendientes"
                            >
                              <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                              <span>Restaurar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación DRF */}
          <div className="px-4 py-2.5 text-xs text-gray-500 border-t flex flex-wrap items-center justify-between gap-2">
            <span>
              Mostrando {items.length} de {totalCount} registro(s) • Página {page}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrev && page <= 1}
                className="px-3 py-1 rounded border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                className="px-3 py-1 rounded border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Vista Previa e Importación */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!importarMut.isPending) {
              setPreviewModal(null);
              setPreviewError(null);
            }
          }}
        >
          <div
            className="w-full max-w-6xl my-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {previewError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                <XCircleIcon className="h-5 w-5 shrink-0" />
                <span>{previewError}</span>
              </div>
            )}

            <VistaPreviaCFDI
              preview={previewModal.datos}
              origen={{
                cfdi_uuid: previewModal.item.cfdi_uuid,
                remitente_email: previewModal.item.remitente_email,
                remitente_nombre: previewModal.item.remitente_nombre,
                asunto: previewModal.item.asunto,
                fecha_correo: previewModal.item.fecha_correo,
                nombre_archivo: previewModal.item.nombre_archivo,
              }}
              loading={importarMut.isPending}
              canConfirm={esAdmin}
              onCancelar={() => {
                setPreviewModal(null);
                setPreviewError(null);
              }}
              onConfirmar={() => {
                setPreviewError(null);
                importarMut.mutate(previewModal.item.id);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
