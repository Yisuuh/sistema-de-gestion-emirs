from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count
from django.utils import timezone
from .models import CategoriaGasto, Gasto
from .serializers import CategoriaGastoSerializer, GastoSerializer


class CategoriaGastoViewSet(viewsets.ModelViewSet):
    queryset = CategoriaGasto.objects.filter(activo=True)
    serializer_class = CategoriaGastoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['nombre']


class GastoViewSet(viewsets.ModelViewSet):
    queryset = Gasto.objects.select_related('categoria', 'responsable', 'caja').order_by('-fecha', '-created_at')
    serializer_class = GastoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['concepto', 'notas']
    ordering_fields = ['fecha', 'monto', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        fecha_inicio = params.get('fecha_inicio')
        fecha_fin = params.get('fecha_fin')
        if fecha_inicio:
            qs = qs.filter(fecha__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(fecha__lte=fecha_fin)

        categoria_id = params.get('categoria')
        if categoria_id:
            qs = qs.filter(categoria_id=categoria_id)

        metodo_pago = params.get('metodo_pago')
        if metodo_pago:
            qs = qs.filter(metodo_pago=metodo_pago)

        responsable_id = params.get('responsable')
        if responsable_id:
            qs = qs.filter(responsable_id=responsable_id)

        return qs

    def perform_create(self, serializer):
        gasto = serializer.save()
        # Si se asocia a caja abierta y es efectivo, registrar egreso en caja
        if gasto.caja and gasto.metodo_pago == 'efectivo':
            from apps.caja.models import MovimientoCaja
            from apps.nomina.models import Empleado
            # Usar el responsable del gasto o primer empleado activo como fallback
            empleado = gasto.responsable or Empleado.objects.filter(activo=True).first()
            if empleado:
                MovimientoCaja.objects.create(
                    caja=gasto.caja,
                    tipo='egreso',
                    concepto=f'Gasto: {gasto.concepto}',
                    monto=gasto.monto,
                    empleado=empleado,
                    categoria=gasto.categoria.nombre if gasto.categoria else 'Gasto',
                )

    @action(detail=False, methods=['get'])
    def resumen(self, request):
        """Resumen de gastos: total por día, semana, mes y por categoría."""
        hoy = timezone.now().date()
        inicio_mes = hoy.replace(day=1)

        gastos_hoy = Gasto.objects.filter(fecha=hoy)
        gastos_mes = Gasto.objects.filter(fecha__gte=inicio_mes)

        por_categoria = (
            gastos_mes
            .values('categoria__nombre')
            .annotate(total=Sum('monto'), cantidad=Count('id'))
            .order_by('-total')
        )

        return Response({
            'hoy': {
                'total': float(gastos_hoy.aggregate(t=Sum('monto'))['t'] or 0),
                'cantidad': gastos_hoy.count(),
            },
            'mes': {
                'total': float(gastos_mes.aggregate(t=Sum('monto'))['t'] or 0),
                'cantidad': gastos_mes.count(),
            },
            'por_categoria': list(por_categoria),
        })
