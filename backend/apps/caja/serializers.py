"""
Serializers para el módulo de Caja
"""
from rest_framework import serializers
from .models import Caja, MovimientoCaja, ArqueoCaja
from django.utils import timezone


class MovimientoCajaSerializer(serializers.ModelSerializer):
    """
    Serializer para movimientos de caja
    """
    empleado_nombre = serializers.CharField(source='empleado.nombre_completo', read_only=True)
    fecha_formateada = serializers.DateTimeField(source='fecha', format='%Y-%m-%d %H:%M:%S', read_only=True)
    
    class Meta:
        model = MovimientoCaja
        fields = [
            'id', 'caja', 'tipo', 'concepto', 'descripcion', 
            'monto', 'fecha', 'fecha_formateada', 'empleado', 
            'empleado_nombre', 'categoria'
        ]
        read_only_fields = ['id', 'fecha']
    
    def validate_monto(self, value):
        """Validar que el monto sea positivo"""
        if value <= 0:
            raise serializers.ValidationError("El monto debe ser mayor a 0")
        return value


class ArqueoCajaSerializer(serializers.ModelSerializer):
    """
    Serializer para arqueos de caja
    """
    empleado_nombre = serializers.CharField(source='empleado.nombre_completo', read_only=True)
    fecha_formateada = serializers.DateTimeField(source='fecha', format='%Y-%m-%d %H:%M:%S', read_only=True)
    caja_folio = serializers.CharField(source='caja.folio', read_only=True)
    
    class Meta:
        model = ArqueoCaja
        fields = [
            'id', 'caja', 'caja_folio', 'fecha', 'fecha_formateada', 
            'empleado', 'empleado_nombre',
            'billetes_1000', 'billetes_500', 'billetes_200', 
            'billetes_100', 'billetes_50', 'billetes_20',
            'monedas_20', 'monedas_10', 'monedas_5', 
            'monedas_2', 'monedas_1', 'monedas_050',
            'total', 'notas'
        ]
        read_only_fields = ['id', 'fecha', 'total']


class CajaSerializer(serializers.ModelSerializer):
    """
    Serializer para cajas
    """
    empleado_apertura_nombre = serializers.CharField(
        source='empleado_apertura.nombre_completo', 
        read_only=True
    )
    empleado_cierre_nombre = serializers.CharField(
        source='empleado_cierre.nombre_completo', 
        read_only=True,
        allow_null=True
    )
    fecha_apertura_formateada = serializers.DateTimeField(
        source='fecha_apertura', 
        format='%Y-%m-%d %H:%M:%S', 
        read_only=True
    )
    fecha_cierre_formateada = serializers.DateTimeField(
        source='fecha_cierre', 
        format='%Y-%m-%d %H:%M:%S', 
        read_only=True,
        allow_null=True
    )
    
    # Campos calculados
    total_ingresos = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    total_egresos = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    saldo_esperado = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    diferencia = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True,
        allow_null=True
    )
    
    movimientos = MovimientoCajaSerializer(many=True, read_only=True)
    arqueos = ArqueoCajaSerializer(many=True, read_only=True)
    
    class Meta:
        model = Caja
        fields = [
            'id', 'folio', 'fecha_apertura', 'fecha_apertura_formateada',
            'fecha_cierre', 'fecha_cierre_formateada', 
            'empleado_apertura', 'empleado_apertura_nombre',
            'empleado_cierre', 'empleado_cierre_nombre',
            'monto_inicial', 'monto_final', 'estado',
            'notas_apertura', 'notas_cierre',
            'total_ingresos', 'total_egresos', 'saldo_esperado', 'diferencia',
            'movimientos', 'arqueos'
        ]
        read_only_fields = ['id', 'folio', 'fecha_apertura', 'estado']
    
    def validate(self, data):
        """Validaciones personalizadas"""
        # Validar que el monto inicial sea positivo
        if 'monto_inicial' in data and data['monto_inicial'] < 0:
            raise serializers.ValidationError({
                'monto_inicial': 'El monto inicial no puede ser negativo'
            })
        
        return data
    
    def create(self, validated_data):
        """Crear caja con folio automático"""
        # Verificar que no haya una caja abierta
        caja_abierta = Caja.objects.filter(estado='abierta').first()
        if caja_abierta:
            raise serializers.ValidationError(
                f"Ya existe una caja abierta con folio {caja_abierta.folio}. "
                "Debe cerrarla antes de abrir una nueva."
            )
        
        # Generar folio automático
        ultima_caja = Caja.objects.all().order_by('-id').first()
        if ultima_caja and ultima_caja.folio:
            try:
                numero = int(ultima_caja.folio.replace('C-', '')) + 1
            except:
                numero = 1
        else:
            numero = 1
        validated_data['folio'] = f'C-{numero:06d}'
        
        return super().create(validated_data)


class CajaListSerializer(serializers.ModelSerializer):
    """
    Serializer simplificado para listado de cajas
    """
    empleado_apertura_nombre = serializers.CharField(
        source='empleado_apertura.nombre_completo', 
        read_only=True
    )
    fecha_apertura_formateada = serializers.DateTimeField(
        source='fecha_apertura', 
        format='%Y-%m-%d %H:%M', 
        read_only=True
    )
    total_ingresos = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    total_egresos = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    saldo_esperado = serializers.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        read_only=True
    )
    
    class Meta:
        model = Caja
        fields = [
            'id', 'folio', 'fecha_apertura_formateada', 
            'empleado_apertura_nombre', 'monto_inicial',
            'estado', 'total_ingresos', 'total_egresos', 'saldo_esperado'
        ]


class CerrarCajaSerializer(serializers.Serializer):
    """
    Serializer para cerrar caja
    """
    empleado_cierre = serializers.IntegerField(required=True)
    monto_final = serializers.DecimalField(max_digits=10, decimal_places=2, required=True)
    notas_cierre = serializers.CharField(required=False, allow_blank=True)
    
    def validate_monto_final(self, value):
        """Validar que el monto final sea positivo o cero"""
        if value < 0:
            raise serializers.ValidationError("El monto final no puede ser negativo")
        return value
