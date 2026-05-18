from decimal import Decimal

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Empleado, LineaNomina, PeriodoNomina
from .serializers import (
    EmpleadoSerializer,
    LineaNominaSerializer,
    PeriodoNominaDetalleSerializer,
    PeriodoNominaSerializer,
)


class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.all()
    serializer_class = EmpleadoSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['activo', 'puesto', 'metodo_pago', 'tipo_pago']
    search_fields = ['nombre', 'apellido', 'telefono', 'puesto']
    ordering_fields = ['nombre', 'apellido', 'fecha_ingreso', 'salario_base']
    ordering = ['apellido', 'nombre']


class PeriodoNominaViewSet(viewsets.ModelViewSet):
    queryset = PeriodoNomina.objects.all()
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['estado']
    ordering_fields = ['fecha_inicio', 'fecha_fin']
    ordering = ['-fecha_inicio']

    def get_serializer_class(self):
        if self.action in ('retrieve', 'guardar_lineas'):
            return PeriodoNominaDetalleSerializer
        return PeriodoNominaSerializer

    def perform_create(self, serializer):
        fecha_inicio = serializer.validated_data['fecha_inicio']
        fecha_fin = serializer.validated_data['fecha_fin']
        # Validate no overlapping periods
        overlap = PeriodoNomina.objects.filter(
            fecha_inicio__lte=fecha_fin,
            fecha_fin__gte=fecha_inicio,
        )
        if overlap.exists():
            raise serializers.ValidationError(
                'El período se traslapa con un período de nómina existente.'
            )
        periodo = serializer.save()
        # Auto-populate all active employees
        empleados = Empleado.objects.filter(activo=True)
        LineaNomina.objects.bulk_create([
            LineaNomina(
                periodo=periodo,
                empleado=emp,
                sueldo=emp.salario_base,
            )
            for emp in empleados
        ])

    @action(detail=True, methods=['post'])
    def guardar_lineas(self, request, pk=None):
        """Bulk-upsert de todas las líneas de un período (borrador)."""
        periodo = self.get_object()
        if periodo.estado in ('cerrada', 'pagada'):
            return Response(
                {'error': 'No se puede editar un período cerrado o pagado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lineas_data = request.data.get('lineas', [])
        saved = []
        errors = []
        for data in lineas_data:
            linea_id = data.get('id')
            if linea_id:
                try:
                    linea = LineaNomina.objects.get(id=linea_id, periodo=periodo)
                    ser = LineaNominaSerializer(linea, data=data, partial=True)
                except LineaNomina.DoesNotExist:
                    errors.append(f'Línea {linea_id} no encontrada.')
                    continue
            else:
                ser = LineaNominaSerializer(data={**data, 'periodo': periodo.id})
            if ser.is_valid():
                saved.append(ser.save())
            else:
                errors.append(ser.errors)
        # Recalculate period totals
        periodo.recalcular_totales()
        PeriodoNomina.objects.filter(pk=periodo.pk).update(
            total_efectivo=periodo.total_efectivo,
            total_transferencia=periodo.total_transferencia,
            total_general=periodo.total_general,
            total_comisiones=periodo.total_comisiones,
            total_domingos=periodo.total_domingos,
        )
        periodo.refresh_from_db()
        if errors:
            return Response(
                {'guardadas': len(saved), 'errores': errors},
                status=status.HTTP_207_MULTI_STATUS,
            )
        return Response(PeriodoNominaDetalleSerializer(periodo).data)

    @action(detail=True, methods=['post'])
    def cerrar(self, request, pk=None):
        """Cierra el período validando que no haya diferencias en pagos."""
        periodo = self.get_object()
        if periodo.estado != 'borrador':
            return Response(
                {'error': 'Solo se pueden cerrar períodos en estado borrador.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        diferencias = []
        for linea in periodo.lineas.select_related('empleado').all():
            diff = abs(linea.efectivo + linea.transferencia - linea.neto)
            if diff > Decimal('0.01'):
                diferencias.append({
                    'empleado': linea.empleado.nombre_completo,
                    'neto': str(linea.neto),
                    'suma_pagos': str(linea.efectivo + linea.transferencia),
                    'diferencia': str(diff),
                })
        if diferencias:
            return Response(
                {'error': 'Existen diferencias entre efectivo+transferencia y neto.', 'diferencias': diferencias},
                status=status.HTTP_400_BAD_REQUEST,
            )
        periodo.recalcular_totales()
        periodo.estado = 'cerrada'
        periodo.save()
        return Response(PeriodoNominaSerializer(periodo).data)

    @action(detail=True, methods=['post'])
    def marcar_pagada(self, request, pk=None):
        """Marca el período como pagado."""
        periodo = self.get_object()
        if periodo.estado != 'cerrada':
            return Response(
                {'error': 'Solo se pueden marcar como pagados períodos cerrados.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        periodo.estado = 'pagada'
        periodo.save(update_fields=['estado', 'updated_at'])
        return Response(PeriodoNominaSerializer(periodo).data)

    @action(detail=True, methods=['post'])
    def reabrir(self, request, pk=None):
        """Regresa un período cerrado a borrador."""
        periodo = self.get_object()
        if periodo.estado == 'pagada':
            return Response(
                {'error': 'No se puede reabrir un período ya pagado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        periodo.estado = 'borrador'
        periodo.save(update_fields=['estado', 'updated_at'])
        return Response(PeriodoNominaSerializer(periodo).data)


class LineaNominaViewSet(viewsets.ModelViewSet):
    queryset = LineaNomina.objects.select_related('empleado', 'periodo').all()
    serializer_class = LineaNominaSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['periodo', 'empleado']

