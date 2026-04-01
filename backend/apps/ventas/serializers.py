"""
Serializers para el módulo de Ventas
"""
from rest_framework import serializers
from .models import Venta, DetalleVenta, Servicio
from apps.inventario.models import Producto
from apps.clientes.models import Cliente


class ServicioSerializer(serializers.ModelSerializer):
    """
    Serializer para servicios
    """
    class Meta:
        model = Servicio
        fields = ['id', 'nombre', 'descripcion', 'precio', 'activo']
        read_only_fields = ['id']


class DetalleVentaSerializer(serializers.ModelSerializer):
    """
    Serializer para detalles de venta
    """
    producto_nombre = serializers.CharField(source='producto.descripcion_completa', read_only=True)
    servicio_nombre = serializers.CharField(source='servicio.nombre', read_only=True)
    
    class Meta:
        model = DetalleVenta
        fields = [
            'id', 'producto', 'servicio', 'descripcion', 
            'cantidad', 'precio_unitario', 'subtotal',
            'producto_nombre', 'servicio_nombre'
        ]
        read_only_fields = ['id', 'subtotal']
    
    def validate(self, data):
        """
        Validar que se especifique producto o servicio
        """
        if not data.get('producto') and not data.get('servicio'):
            raise serializers.ValidationError(
                "Debe especificar un producto o un servicio"
            )
        
        if data.get('producto') and data.get('servicio'):
            raise serializers.ValidationError(
                "Solo puede especificar un producto o un servicio, no ambos"
            )
        
        # Calcular subtotal
        data['subtotal'] = data['cantidad'] * data['precio_unitario']
        
        return data


class VentaSerializer(serializers.ModelSerializer):
    """
    Serializer para ventas
    """
    detalles = DetalleVentaSerializer(many=True)
    empleado_nombre = serializers.CharField(source='empleado.nombre_completo', read_only=True)
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True, allow_null=True)
    fecha_formateada = serializers.DateTimeField(source='fecha', format='%Y-%m-%d %H:%M:%S', read_only=True)
    
    class Meta:
        model = Venta
        fields = [
            'id', 'folio', 'fecha', 'fecha_formateada', 'empleado', 'empleado_nombre',
            'cliente', 'cliente_nombre', 'caja', 'metodo_pago', 'monto_efectivo',
            'monto_electronico', 'num_operacion', 'num_referencia',
            'subtotal', 'descuento', 'total', 'notas', 'detalles'
        ]
        read_only_fields = ['id', 'folio', 'fecha', 'caja']
    
    def validate_detalles(self, value):
        """
        Validar que haya al menos un detalle
        """
        if not value:
            raise serializers.ValidationError("Debe agregar al menos un producto o servicio")
        return value
    
    def validate(self, data):
        """
        Validar método de pago y montos
        """
        metodo_pago = data.get('metodo_pago')
        monto_efectivo = data.get('monto_efectivo', 0)
        monto_electronico = data.get('monto_electronico', 0)
        
        if metodo_pago == 'efectivo' and monto_efectivo <= 0:
            raise serializers.ValidationError(
                "El monto en efectivo debe ser mayor a 0 para pago en efectivo"
            )
        
        if metodo_pago in ['tarjeta', 'transferencia'] and monto_electronico <= 0:
            raise serializers.ValidationError(
                "El monto electrónico debe ser mayor a 0 para este método de pago"
            )
        
        if metodo_pago == 'mixto':
            if monto_efectivo <= 0 or monto_electronico <= 0:
                raise serializers.ValidationError(
                    "Para pago mixto, ambos montos deben ser mayores a 0"
                )

        # Validar número de operación para tarjeta
        if metodo_pago in ['tarjeta', 'mixto'] and not data.get('num_operacion', '').strip():
            raise serializers.ValidationError(
                "El número de operación es requerido para pagos con tarjeta"
            )

        # Validar número de referencia para transferencia
        if metodo_pago in ['transferencia', 'mixto'] and not data.get('num_referencia', '').strip():
            raise serializers.ValidationError(
                "El número de referencia es requerido para pagos por transferencia"
            )
        
        return data
    
    def create(self, validated_data):
        """
        Crear venta con sus detalles
        """
        from django.db import transaction
        from apps.inventario.models import SalidaInventario, EntradaInventario
        from django.utils import timezone
        
        detalles_data = validated_data.pop('detalles')
        
        # Generar folio automático
        ultima_venta = Venta.objects.all().order_by('-id').first()
        if ultima_venta and ultima_venta.folio:
            try:
                numero = int(ultima_venta.folio.replace('V-', '')) + 1
            except:
                numero = 1
        else:
            numero = 1
        validated_data['folio'] = f'V-{numero:06d}'
        
        with transaction.atomic():
            # Auto-asignar caja abierta
            from apps.caja.models import Caja as CajaModel
            caja_abierta = CajaModel.objects.filter(estado='abierta').first()
            if caja_abierta:
                validated_data['caja'] = caja_abierta

            # Crear venta
            venta = Venta.objects.create(**validated_data)
            
            # Crear detalles y registrar salidas de inventario
            for detalle_data in detalles_data:
                DetalleVenta.objects.create(venta=venta, **detalle_data)
                
                # Si es un producto, registrar salida de inventario
                if detalle_data.get('producto'):
                    producto = detalle_data['producto']
                    
                    # Verificar stock disponible
                    stock_disponible = producto.stock_actual
                    if stock_disponible < detalle_data['cantidad']:
                        raise serializers.ValidationError(
                            f"Stock insuficiente para {producto.descripcion_completa}. "
                            f"Disponible: {stock_disponible}, Solicitado: {detalle_data['cantidad']}"
                        )
                    
                    # Calcular precio de costo promedio (PEPS - Primera Entrada Primera Salida)
                    # Obtener la entrada más antigua con stock disponible
                    entradas = EntradaInventario.objects.filter(
                        producto=producto,
                        en_inventario=True
                    ).order_by('fecha_compra')
                    
                    # Usar precio promedio de las entradas o el 70% del precio de venta como fallback
                    if entradas.exists():
                        precio_costo = entradas.first().precio_compra
                    else:
                        precio_costo = detalle_data['precio_unitario'] * 0.70  # Estimado
                    
                    # Registrar salida
                    SalidaInventario.objects.create(
                        producto=producto,
                        venta=venta,
                        cantidad=detalle_data['cantidad'],
                        precio_venta=detalle_data['precio_unitario'],
                        precio_costo=precio_costo,
                        fecha_venta=timezone.now().date()
                    )
        
        # Recargar la venta con los detalles para obtener productos actualizados
        venta.refresh_from_db()
        
        return venta
    
    def to_representation(self, instance):
        """
        Personalizar la respuesta para incluir productos actualizados
        """
        representation = super().to_representation(instance)
        
        # Incluir productos actualizados con su stock
        from apps.inventario.serializers import ProductoSerializer
        productos_actualizados = []
        
        for detalle in instance.detalles.all():
            if detalle.producto:
                # Recargar el producto para obtener stock actualizado
                detalle.producto.refresh_from_db()
                productos_actualizados.append({
                    'id': detalle.producto.id,
                    'stock_actual': detalle.producto.stock_actual,
                    'codigo': detalle.producto.codigo,
                    'descripcion_completa': detalle.producto.descripcion_completa
                })
        
        representation['productos_actualizados'] = productos_actualizados
        
        return representation


class VentaListSerializer(serializers.ModelSerializer):
    """
    Serializer simplificado para listado de ventas
    """
    empleado_nombre = serializers.CharField(source='empleado.nombre_completo', read_only=True)
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True, allow_null=True)
    fecha_formateada = serializers.DateTimeField(source='fecha', format='%Y-%m-%d %H:%M', read_only=True)
    total_items = serializers.IntegerField(source='detalles.count', read_only=True)
    
    class Meta:
        model = Venta
        fields = [
            'id', 'folio', 'fecha', 'fecha_formateada', 'empleado_nombre',
            'cliente_nombre', 'caja', 'metodo_pago', 'monto_efectivo',
            'monto_electronico', 'num_operacion', 'num_referencia', 'total', 'total_items'
        ]
