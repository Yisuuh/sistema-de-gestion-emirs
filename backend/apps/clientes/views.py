from datetime import timedelta, datetime
from django.db.models import Q
from django.utils import timezone
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Cliente, Vehiculo
from .serializers import ClienteSerializer, VehiculoSerializer


class ClienteViewSet(viewsets.ModelViewSet):
    queryset = Cliente.objects.prefetch_related('vehiculos', 'ventas').all()
    serializer_class = ClienteSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'nombre', 'telefono', 'email', 'rfc',
        'vehiculos__placas', 'vehiculos__marca',
        'vehiculos__modelo', 'vehiculos__medida_llantas'
    ]
    ordering_fields = ['nombre', 'created_at']
    ordering = ['nombre']

    def get_queryset(self):
        return super().get_queryset().distinct()

    @action(detail=True, methods=['get'])
    def ventas(self, request, pk=None):
        from apps.ventas.serializers import VentaSerializer
        cliente = self.get_object()
        ventas = cliente.ventas.order_by('-fecha')[:20]
        serializer = VentaSerializer(ventas, many=True)
        return Response(serializer.data)


class VehiculoViewSet(viewsets.ModelViewSet):
    queryset = Vehiculo.objects.select_related('cliente').all()
    serializer_class = VehiculoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['cliente']
    search_fields = [
        'marca', 'modelo', 'placas', 'medida_llantas',
        'medida_llanta_delantera', 'medida_llanta_trasera',
        'cliente__nombre', 'cliente__telefono'
    ]
    ordering_fields = ['fecha_proximo_servicio', 'fecha_ultimo_servicio', 'created_at', 'marca']

    @action(detail=True, methods=['post'])
    def programar_servicio(self, request, pk=None):
        """
        POST /api/clientes/vehiculos/{id}/programar_servicio/
        Recibe fecha_proximo_servicio (YYYY-MM-DD) y opcionalmente
        fecha_ultimo_servicio, kilometraje_ultimo y notas.
        Actualiza el vehículo y retorna VehiculoSerializer(vehiculo).data.
        """
        vehiculo = self.get_object()
        fecha_prox_str = request.data.get('fecha_proximo_servicio')
        if not fecha_prox_str:
            return Response(
                {'error': 'Debe proporcionar fecha_proximo_servicio (YYYY-MM-DD).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            fecha_prox = datetime.strptime(str(fecha_prox_str), '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Formato de fecha_proximo_servicio inválido. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        vehiculo.fecha_proximo_servicio = fecha_prox
        update_fields = ['fecha_proximo_servicio']

        fecha_ult_str = request.data.get('fecha_ultimo_servicio')
        if fecha_ult_str:
            try:
                vehiculo.fecha_ultimo_servicio = datetime.strptime(str(fecha_ult_str), '%Y-%m-%d').date()
                update_fields.append('fecha_ultimo_servicio')
            except ValueError:
                return Response(
                    {'error': 'Formato de fecha_ultimo_servicio inválido. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if 'kilometraje_ultimo' in request.data and request.data.get('kilometraje_ultimo') not in (None, ''):
            try:
                km = int(request.data.get('kilometraje_ultimo'))
                if km >= 0:
                    vehiculo.kilometraje_ultimo = km
                    update_fields.append('kilometraje_ultimo')
            except (ValueError, TypeError):
                return Response(
                    {'error': 'kilometraje_ultimo debe ser un número entero válido.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if 'notas' in request.data and request.data.get('notas') is not None:
            vehiculo.notas = str(request.data.get('notas'))
            update_fields.append('notas')

        vehiculo.save(update_fields=update_fields)
        return Response(VehiculoSerializer(vehiculo).data)

    @action(detail=True, methods=['get'])
    def expediente(self, request, pk=None):
        """
        GET /api/clientes/vehiculos/{id}/expediente/
        Retorna el expediente clínico del vehículo: datos del vehículo, cliente,
        historial de ventas (vinculadas al vehículo o cliente) e historial de rescates.
        """
        from apps.ventas.models import Venta
        from apps.rescates.models import Rescate

        vehiculo = self.get_object()
        cliente = vehiculo.cliente

        ventas_qs = (
            Venta.objects
            .filter(Q(vehiculo=vehiculo) | Q(cliente=cliente, vehiculo__isnull=True))
            .select_related('empleado')
            .prefetch_related('detalles', 'detalles__producto', 'detalles__servicio')
            .order_by('-fecha')
        )

        historial_ventas = []
        for v in ventas_qs:
            detalles_list = [
                {
                    'id': d.id,
                    'descripcion': d.descripcion,
                    'cantidad': d.cantidad,
                    'precio_unitario': float(d.precio_unitario),
                    'subtotal': float(d.subtotal),
                    'tipo': 'producto' if d.producto_id else 'servicio',
                }
                for d in v.detalles.all()
            ]
            historial_ventas.append({
                'id': v.id,
                'folio': v.folio,
                'fecha': v.fecha.strftime('%Y-%m-%d %H:%M:%S'),
                'fecha_corta': v.fecha.strftime('%Y-%m-%d'),
                'empleado_nombre': v.empleado.nombre_completo if v.empleado else '',
                'metodo_pago': v.metodo_pago,
                'subtotal': float(v.subtotal),
                'descuento': float(v.descuento),
                'total': float(v.total),
                'kilometraje_actual': v.kilometraje_actual,
                'notas': v.notas,
                'vinculado_directo': v.vehiculo_id == vehiculo.id,
                'detalles': detalles_list,
            })

        rescates_q = Q(vehiculo=vehiculo) | Q(cliente=cliente)
        if vehiculo.placas:
            rescates_q |= Q(vehiculo_placas__iexact=vehiculo.placas)

        rescates_qs = (
            Rescate.objects
            .filter(rescates_q)
            .select_related('operador', 'unidad')
            .prefetch_related('detalles')
            .order_by('-fecha_solicitud')
            .distinct()
        )

        historial_rescates = []
        for r in rescates_qs:
            detalles_res = [
                {
                    'id': d.id,
                    'descripcion': d.descripcion,
                    'cantidad': d.cantidad,
                    'precio_unitario': float(d.precio_unitario),
                    'subtotal': float(d.subtotal),
                }
                for d in r.detalles.all()
            ]
            historial_rescates.append({
                'id': r.id,
                'folio': r.folio,
                'fecha_solicitud': r.fecha_solicitud.strftime('%Y-%m-%d %H:%M:%S'),
                'fecha_corta': r.fecha_solicitud.strftime('%Y-%m-%d'),
                'estado': r.estado,
                'ubicacion_texto': r.ubicacion_texto,
                'operador_nombre': r.operador.nombre_completo if r.operador else '',
                'unidad_nombre': f"{r.unidad.numero_economico} - {r.unidad.nombre}" if r.unidad else '',
                'total': float(r.total),
                'notas': r.notas,
                'detalles': detalles_res,
            })

        return Response({
            'vehiculo': VehiculoSerializer(vehiculo).data,
            'cliente': {
                'id': cliente.id,
                'nombre': cliente.nombre,
                'telefono': cliente.telefono,
                'email': cliente.email,
                'rfc': cliente.rfc,
                'direccion': cliente.direccion,
                'notas': cliente.notas,
            },
            'resumen': {
                'total_visitas_taller': len(historial_ventas),
                'total_rescates_viales': len(historial_rescates),
                'inversion_total': round(
                    sum(v['total'] for v in historial_ventas) +
                    sum(r['total'] for r in historial_rescates if r['estado'] == 'completado'),
                    2
                ),
            },
            'historial_ventas': historial_ventas,
            'historial_rescates': historial_rescates,
        })

    @action(detail=False, methods=['get'])
    def alertas_servicio(self, request):
        """
        GET /api/clientes/vehiculos/alertas_servicio/
        Retorna vehículos con servicio vencido o próximo (en los siguientes 30 días),
        ordenados por fecha_proximo_servicio ascendente.
        """
        hoy = timezone.localdate()
        limite = hoy + timedelta(days=30)
        vehiculos = (
            self.get_queryset()
            .filter(
                fecha_proximo_servicio__isnull=False,
                fecha_proximo_servicio__lte=limite
            )
            .order_by('fecha_proximo_servicio')
        )
        serializer = self.get_serializer(vehiculos, many=True)
        return Response(serializer.data)

