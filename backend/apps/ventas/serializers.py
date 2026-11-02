"""
Serializers para el módulo de Ventas
"""
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Venta, DetalleVenta, Servicio, Cotizacion, OpcionCotizacion,
    SolicitudAutorizacion
)
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
    vehiculo_descripcion = serializers.SerializerMethodField()
    fecha_formateada = serializers.DateTimeField(source='fecha', format='%Y-%m-%d %H:%M:%S', read_only=True)
    editada_por_nombre = serializers.SerializerMethodField()
    autorizada_por_nombre = serializers.SerializerMethodField()
    
    class Meta:
        model = Venta
        fields = [
            'id', 'folio', 'fecha', 'fecha_formateada', 'empleado', 'empleado_nombre',
            'cliente', 'cliente_nombre', 'vehiculo', 'vehiculo_descripcion', 'kilometraje_actual',
            'caja', 'metodo_pago', 'tipo_tarjeta',
            'num_voucher_efectivo', 'num_voucher_tarjeta', 'num_voucher_transferencia',
            'monto_efectivo', 'monto_electronico', 'num_operacion', 'num_referencia',
            'subtotal', 'descuento', 'total', 'notas', 'facturada', 'cfdi_uuid',
            'factura_pendiente', 'detalles',
            'fue_editada', 'fecha_edicion', 'editada_por', 'editada_por_nombre',
            'motivo_edicion', 'autorizada_por', 'autorizada_por_nombre',
            'total_original', 'diferencia_monetaria'
        ]
        read_only_fields = [
            'id', 'folio', 'fecha', 'caja',
            'fue_editada', 'fecha_edicion', 'editada_por', 'autorizada_por',
            'total_original', 'diferencia_monetaria'
        ]

    def get_editada_por_nombre(self, obj):
        if not obj.editada_por:
            return None
        return obj.editada_por.get_full_name() or obj.editada_por.username

    def get_autorizada_por_nombre(self, obj):
        if not obj.autorizada_por:
            return None
        return obj.autorizada_por.get_full_name() or obj.autorizada_por.username

    def get_vehiculo_descripcion(self, obj):
        if not obj.vehiculo:
            return None
        v = obj.vehiculo
        placas = f" ({v.placas})" if v.placas else ""
        return f"{v.marca} {v.modelo} {v.año}{placas}"
    
    def validate_detalles(self, value):
        """
        Validar que haya al menos un detalle
        """
        if not value:
            raise serializers.ValidationError("Debe agregar al menos un producto o servicio")
        return value
    
    def validate(self, data):
        """
        Validar método de pago, montos, tipo de tarjeta y caja abierta
        """
        from apps.caja.models import Caja

        # Validar existencia de caja abierta
        if self.instance is None:
            caja_abierta = Caja.objects.filter(estado='abierta').first()
            if not caja_abierta:
                raise serializers.ValidationError({
                    'caja': 'No existe ninguna caja abierta en este momento. Debe abrir una caja antes de poder registrar ventas.'
                })
            data['caja'] = caja_abierta
        else:
            if not getattr(self.instance, 'caja', None) and not data.get('caja'):
                caja_abierta = Caja.objects.filter(estado='abierta').first()
                if not caja_abierta:
                    raise serializers.ValidationError({
                        'caja': 'No existe ninguna caja abierta en este momento. Debe abrir una caja antes de poder registrar ventas.'
                    })
                data['caja'] = caja_abierta

        metodo_pago = data.get('metodo_pago', getattr(self.instance, 'metodo_pago', None))
        monto_efectivo = data.get('monto_efectivo', getattr(self.instance, 'monto_efectivo', 0))
        monto_electronico = data.get('monto_electronico', getattr(self.instance, 'monto_electronico', 0))
        tipo_tarjeta = data.get('tipo_tarjeta', getattr(self.instance, 'tipo_tarjeta', None))
        total = data.get('total', getattr(self.instance, 'total', None))

        total_val = Decimal(str(total)) if total is not None else Decimal('0')
        monto_efectivo_val = Decimal(str(monto_efectivo)) if monto_efectivo is not None else Decimal('0')
        monto_electronico_val = Decimal(str(monto_electronico)) if monto_electronico is not None else Decimal('0')

        if tipo_tarjeta and tipo_tarjeta not in ['debito', 'credito']:
            raise serializers.ValidationError({
                "tipo_tarjeta": "Tipo de tarjeta inválido. Debe ser 'debito' o 'credito'."
            })
        
        if metodo_pago == 'efectivo':
            if monto_efectivo_val <= Decimal('0'):
                raise serializers.ValidationError(
                    "El monto en efectivo debe ser mayor a 0 para pago en efectivo"
                )
            if total is not None and monto_efectivo_val < total_val:
                raise serializers.ValidationError({
                    'monto_efectivo': 'El monto en efectivo entregado no puede ser menor al total de la venta.'
                })
        
        if metodo_pago in ['tarjeta', 'transferencia'] and monto_electronico_val <= Decimal('0'):
            raise serializers.ValidationError(
                "El monto electrónico debe ser mayor a 0 para este método de pago"
            )
        
        if metodo_pago == 'mixto':
            if monto_efectivo_val <= Decimal('0') or monto_electronico_val <= Decimal('0'):
                raise serializers.ValidationError(
                    "Para pago mixto, ambos montos deben ser mayores a 0"
                )
            if total is not None and (monto_efectivo_val + monto_electronico_val) < total_val:
                raise serializers.ValidationError({
                    'monto_efectivo': 'La suma del monto en efectivo y electrónico no puede ser menor al total de la venta.'
                })

        # Validar número de operación para tarjeta
        if metodo_pago == 'tarjeta' and not data.get('num_operacion', getattr(self.instance, 'num_operacion', '')).strip():
            raise serializers.ValidationError(
                "El número de operación es requerido para pagos con tarjeta"
            )

        # Validar número de referencia para transferencia
        if metodo_pago == 'transferencia' and not data.get('num_referencia', getattr(self.instance, 'num_referencia', '')).strip():
            raise serializers.ValidationError(
                "El número de referencia es requerido para pagos por transferencia"
            )
        
        return data
    
    def create(self, validated_data):
        """
        Crear venta con sus detalles y actualizar expediente clínico del vehículo si aplica
        """
        from django.db import transaction, models
        from apps.inventario.models import SalidaInventario, EntradaInventario
        from django.utils import timezone
        from apps.ventas.services import generar_siguiente_folio_atomico
        from apps.caja.models import Caja as CajaModel
        
        detalles_data = validated_data.pop('detalles')
        
        with transaction.atomic():
            # Generar folio automático atómico
            validated_data['folio'] = generar_siguiente_folio_atomico('VENTA', Venta, 'V-', 6)
            
            # Auto-asignar caja abierta
            caja_abierta = CajaModel.objects.filter(estado='abierta').first()
            if caja_abierta:
                validated_data['caja'] = caja_abierta

            # Correlativos del día
            hoy = timezone.localdate()
            ventas_hoy = Venta.objects.filter(fecha__date=hoy)

            metodo = validated_data.get('metodo_pago')
            m_efectivo = validated_data.get('monto_efectivo', 0)
            m_electronico = validated_data.get('monto_electronico', 0)

            if (metodo in ['efectivo', 'mixto']) and m_efectivo > 0:
                max_ef = ventas_hoy.aggregate(m=models.Max('num_voucher_efectivo'))['m'] or 0
                validated_data['num_voucher_efectivo'] = max_ef + 1

            if metodo == 'tarjeta' and m_electronico > 0:
                max_tarj = ventas_hoy.aggregate(m=models.Max('num_voucher_tarjeta'))['m'] or 0
                validated_data['num_voucher_tarjeta'] = max_tarj + 1
            elif metodo == 'transferencia' and m_electronico > 0:
                max_trans = ventas_hoy.aggregate(m=models.Max('num_voucher_transferencia'))['m'] or 0
                validated_data['num_voucher_transferencia'] = max_trans + 1
            elif metodo == 'mixto' and m_electronico > 0:
                if validated_data.get('tipo_tarjeta') or validated_data.get('num_operacion'):
                    max_tarj = ventas_hoy.aggregate(m=models.Max('num_voucher_tarjeta'))['m'] or 0
                    validated_data['num_voucher_tarjeta'] = max_tarj + 1
                elif validated_data.get('num_referencia'):
                    max_trans = ventas_hoy.aggregate(m=models.Max('num_voucher_transferencia'))['m'] or 0
                    validated_data['num_voucher_transferencia'] = max_trans + 1
                else:
                    max_tarj = ventas_hoy.aggregate(m=models.Max('num_voucher_tarjeta'))['m'] or 0
                    validated_data['num_voucher_tarjeta'] = max_tarj + 1

            # Crear venta
            venta = Venta.objects.create(**validated_data)

            # Actualizar expediente clínico del vehículo si viene asociado
            if venta.vehiculo:
                vehiculo = venta.vehiculo
                vehiculo.fecha_ultimo_servicio = hoy
                vehiculo.fecha_proximo_servicio = hoy + timedelta(days=180)
                if venta.kilometraje_actual and venta.kilometraje_actual > 0:
                    vehiculo.kilometraje_ultimo = venta.kilometraje_actual
                vehiculo.save(update_fields=[
                    'fecha_ultimo_servicio',
                    'fecha_proximo_servicio',
                    'kilometraje_ultimo'
                ])
            
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
                    
                    # Calcular precio de costo PEPS
                    entradas = EntradaInventario.objects.filter(
                        producto=producto,
                        en_inventario=True
                    ).order_by('fecha_compra')
                    
                    if entradas.exists():
                        precio_costo = entradas.first().precio_compra
                    else:
                        precio_costo = detalle_data['precio_unitario'] * Decimal('0.70')  # Estimado
                    
                    # Registrar salida
                    SalidaInventario.objects.create(
                        producto=producto,
                        venta=venta,
                        cantidad=detalle_data['cantidad'],
                        precio_venta=detalle_data['precio_unitario'],
                        precio_costo=precio_costo,
                        fecha_venta=timezone.localdate()
                    )
        
        # Recargar la venta con los detalles para obtener productos actualizados
        venta.refresh_from_db()
        
        return venta

    def update(self, instance, validated_data):
        """
        Actualizar venta y sus detalles de forma transaccional
        """
        from django.db import transaction
        from apps.inventario.models import SalidaInventario, EntradaInventario
        from django.utils import timezone

        detalles_data = validated_data.pop('detalles', None)

        with transaction.atomic():
            # Si vienen detalles, revertir salidas previas y reemplazar detalles
            if detalles_data is not None:
                SalidaInventario.objects.filter(venta=instance).delete()
                instance.detalles.all().delete()

                for detalle_data in detalles_data:
                    DetalleVenta.objects.create(venta=instance, **detalle_data)

                    if detalle_data.get('producto'):
                        producto = detalle_data['producto']
                        stock_disponible = producto.stock_actual
                        if stock_disponible < detalle_data['cantidad']:
                            raise serializers.ValidationError(
                                f"Stock insuficiente para {producto.descripcion_completa}. "
                                f"Disponible: {stock_disponible}, Solicitado: {detalle_data['cantidad']}"
                            )

                        entradas = EntradaInventario.objects.filter(
                            producto=producto,
                            en_inventario=True
                        ).order_by('fecha_compra')

                        if entradas.exists():
                            precio_costo = entradas.first().precio_compra
                        else:
                            precio_costo = detalle_data['precio_unitario'] * Decimal('0.70')

                        SalidaInventario.objects.create(
                            producto=producto,
                            venta=instance,
                            cantidad=detalle_data['cantidad'],
                            precio_venta=detalle_data['precio_unitario'],
                            precio_costo=precio_costo,
                            fecha_venta=instance.fecha.date() if instance.fecha else timezone.localdate()
                        )

            # Actualizar campos de la venta
            for attr, value in validated_data.items():
                setattr(instance, attr, value)

            instance.save()

        instance.refresh_from_db()
        return instance
    
    def to_representation(self, instance):
        """
        Personalizar la respuesta para incluir productos actualizados
        """
        representation = super().to_representation(instance)
        
        # Incluir productos actualizados con su stock
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
    editada_por_nombre = serializers.SerializerMethodField()
    autorizada_por_nombre = serializers.SerializerMethodField()
    
    class Meta:
        model = Venta
        fields = [
            'id', 'folio', 'fecha', 'fecha_formateada', 'empleado_nombre',
            'cliente', 'cliente_nombre', 'vehiculo', 'kilometraje_actual',
            'caja', 'metodo_pago', 'tipo_tarjeta',
            'num_voucher_efectivo', 'num_voucher_tarjeta', 'num_voucher_transferencia',
            'monto_efectivo', 'monto_electronico', 'num_operacion', 'num_referencia',
            'total', 'total_items', 'facturada', 'factura_pendiente',
            'fue_editada', 'fecha_edicion', 'editada_por', 'editada_por_nombre',
            'motivo_edicion', 'autorizada_por', 'autorizada_por_nombre',
            'total_original', 'diferencia_monetaria'
        ]

    def get_editada_por_nombre(self, obj):
        if not obj.editada_por:
            return None
        return obj.editada_por.get_full_name() or obj.editada_por.username

    def get_autorizada_por_nombre(self, obj):
        if not obj.autorizada_por:
            return None
        return obj.autorizada_por.get_full_name() or obj.autorizada_por.username


class OpcionCotizacionSerializer(serializers.ModelSerializer):
    """
    Serializer para opciones comparativas de cotización (con calculadora de margen interna)
    """
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True, allow_null=True)
    utilidad_unitaria = serializers.SerializerMethodField()
    utilidad_total = serializers.SerializerMethodField()
    desglose_msi = serializers.SerializerMethodField()
    precio_unitario_publico = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)

    class Meta:
        model = OpcionCotizacion
        fields = [
            'id', 'cotizacion', 'gama', 'origen',
            'producto', 'proveedor', 'proveedor_nombre', 'proveedor_nombre_libre',
            'marca', 'modelo', 'medida', 'tiempo_entrega',
            'costo_proveedor', 'costo_incluye_iva', 'costo_con_iva',
            'utiliza_tabulador', 'categoria_rin',
            'margen_unitario_1', 'margen_unitario_2', 'margen_unitario_4',
            'tipo_margen', 'valor_margen',
            'precio_unitario_publico', 'precio_par', 'precio_juego_4',
            'precio_cantidad_solicitada', 'recomendada',
            'utilidad_unitaria', 'utilidad_total', 'desglose_msi'
        ]
        read_only_fields = ['id', 'cotizacion']

    def get_utilidad_unitaria(self, obj):
        costo = Decimal(str(obj.costo_proveedor or 0))
        precio = Decimal(str(obj.precio_unitario_publico or 0))
        return float(round(precio - costo, 2))

    def get_utilidad_total(self, obj):
        costo = Decimal(str(obj.costo_proveedor or 0))
        precio = Decimal(str(obj.precio_unitario_publico or 0))
        cant = getattr(obj.cotizacion, 'cantidad_requerida', 4) or 4
        return float(round((precio - costo) * Decimal(str(cant)), 2))

    def get_desglose_msi(self, obj):
        """
        Retorna la opción de financiamiento a 3 Meses Sin Intereses.
        El precio al público ya incluye el financiamiento bancario.
        """
        pu = Decimal(str(obj.precio_unitario_publico or 0))
        p_sol = Decimal(str(obj.precio_cantidad_solicitada or 0))
        if p_sol <= Decimal('0'):
            cant = getattr(obj.cotizacion, 'cantidad_requerida', 4) or 4
            p_sol = (pu * Decimal(str(cant))).quantize(Decimal('0.01'))

        p_j4 = Decimal(str(obj.precio_juego_4 or (pu * Decimal('4'))))
        total = float(p_sol) if p_sol > Decimal('0') else float(p_j4)
        mensualidad = round(total / 3, 2)

        return {
            '3_meses': {
                'meses': 3,
                'total': total,
                'mensualidad': mensualidad,
                'total_solicitado': total,
                'mensualidad_solicitada': mensualidad,
                'factor': 1.0,
                'label': '3 Meses Sin Intereses',
            }
        }

    def validate(self, data):
        costo = Decimal(str(data.get('costo_proveedor', getattr(self.instance, 'costo_proveedor', 0)) or 0))
        tipo_margen = data.get('tipo_margen', getattr(self.instance, 'tipo_margen', 'porcentaje'))
        valor_margen = Decimal(str(data.get('valor_margen', getattr(self.instance, 'valor_margen', 0)) or 0))
        precio_pub = data.get('precio_unitario_publico')

        if precio_pub is None or Decimal(str(precio_pub)) <= Decimal('0'):
            if costo > Decimal('0'):
                if tipo_margen == 'porcentaje':
                    precio_pub = (costo * (Decimal('1') + (valor_margen / Decimal('100')))).quantize(Decimal('0.01'))
                else:
                    precio_pub = (costo + valor_margen).quantize(Decimal('0.01'))
            else:
                precio_pub = Decimal('0.00')
            data['precio_unitario_publico'] = precio_pub
        else:
            precio_pub = Decimal(str(precio_pub)).quantize(Decimal('0.01'))
            data['precio_unitario_publico'] = precio_pub

        if not data.get('precio_par') or Decimal(str(data.get('precio_par', 0))) <= Decimal('0'):
            data['precio_par'] = (precio_pub * Decimal('2')).quantize(Decimal('0.01'))

        if not data.get('precio_juego_4') or Decimal(str(data.get('precio_juego_4', 0))) <= Decimal('0'):
            data['precio_juego_4'] = (precio_pub * Decimal('4')).quantize(Decimal('0.01'))

        # Auto-completar costo_con_iva si no viene provisto pero se especifica costo_proveedor
        if 'costo_con_iva' not in data or Decimal(str(data.get('costo_con_iva', 0) or 0)) <= Decimal('0'):
            incluye_iva = data.get('costo_incluye_iva', getattr(self.instance, 'costo_incluye_iva', False))
            if incluye_iva:
                data['costo_con_iva'] = costo.quantize(Decimal('0.01'))
            elif 'costo_incluye_iva' in data and costo > Decimal('0'):
                data['costo_con_iva'] = (costo * Decimal('1.16')).quantize(Decimal('0.01'))
            elif costo > Decimal('0'):
                data['costo_con_iva'] = costo.quantize(Decimal('0.01'))

        return data


class CotizacionSerializer(serializers.ModelSerializer):
    """
    Serializer completo para Cotizaciones Multimarca con creación/edición anidada de opciones
    """
    opciones = OpcionCotizacionSerializer(many=True)
    elaborado_por_nombre = serializers.SerializerMethodField()
    fecha_formateada = serializers.DateTimeField(source='fecha', format='%Y-%m-%d %H:%M', read_only=True)
    fecha_vencimiento = serializers.SerializerMethodField()

    class Meta:
        model = Cotizacion
        fields = [
            'id', 'folio', 'fecha', 'fecha_formateada', 'vigencia_dias', 'fecha_vencimiento',
            'cliente', 'vehiculo', 'nombre_cliente', 'telefono_cliente',
            'vehiculo_referencia', 'medida_solicitada', 'cantidad_requerida',
            'mostrar_msi', 'factor_interes',
            'incluye_montaje', 'incluye_balanceo', 'incluye_valvula', 'incluye_alineacion',
            'servicios_adicionales',
            'notas_cliente', 'notas_internas', 'estado',
            'elaborado_por', 'elaborado_por_nombre', 'opciones'
        ]
        read_only_fields = ['id', 'folio', 'fecha', 'elaborado_por']

    def get_elaborado_por_nombre(self, obj):
        if not obj.elaborado_por:
            return 'Asesor EmirS'
        return obj.elaborado_por.get_full_name() or obj.elaborado_por.username

    def get_fecha_vencimiento(self, obj):
        if not obj.fecha:
            return None
        venc = obj.fecha.date() + timedelta(days=obj.vigencia_dias or 5)
        return str(venc)

    def validate_servicios_adicionales(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("servicios_adicionales debe ser una lista de textos.")
        return [str(item).strip() for item in value if item and str(item).strip()]

    def validate_factor_interes(self, value):
        if value is None:
            return Decimal('1.0790')
        try:
            val = Decimal(str(value))
        except Exception:
            raise serializers.ValidationError("El factor de financiamiento/interés debe ser un número decimal válido.")
        if val < Decimal('1.0000'):
            raise serializers.ValidationError("El factor de financiamiento no puede ser menor a 1.0 (no se permiten valores negativos ni menores al costo).")
        if val > Decimal('2.5000'):
            raise serializers.ValidationError("El factor de financiamiento no puede exceder 2.50 (250%).")
        return val

    def validate_opciones(self, value):
        if not value:
            raise serializers.ValidationError("Debe incluir al menos una opción en la cotización.")
        return value

    def create(self, validated_data):
        from django.db import transaction
        from apps.ventas.services import generar_siguiente_folio_atomico

        opciones_data = validated_data.pop('opciones', [])
        cliente = validated_data.get('cliente')
        vehiculo = validated_data.get('vehiculo')

        if cliente:
            if not validated_data.get('nombre_cliente'):
                validated_data['nombre_cliente'] = cliente.nombre
            if not validated_data.get('telefono_cliente'):
                validated_data['telefono_cliente'] = cliente.telefono

        if vehiculo and not validated_data.get('vehiculo_referencia'):
            placas = f" ({vehiculo.placas})" if vehiculo.placas else ""
            validated_data['vehiculo_referencia'] = f"{vehiculo.marca} {vehiculo.modelo} {vehiculo.año}{placas}"

        cant_req = Decimal(str(validated_data.get('cantidad_requerida', 4) or 4))

        with transaction.atomic():
            validated_data['folio'] = generar_siguiente_folio_atomico('COTIZACION', Cotizacion, 'COT-', 6)
            cotizacion = Cotizacion.objects.create(**validated_data)

            for op_data in opciones_data:
                pu = Decimal(str(op_data.get('precio_unitario_publico', 0)))
                if not op_data.get('precio_cantidad_solicitada') or Decimal(str(op_data.get('precio_cantidad_solicitada', 0))) <= Decimal('0'):
                    op_data['precio_cantidad_solicitada'] = (pu * cant_req).quantize(Decimal('0.01'))
                OpcionCotizacion.objects.create(cotizacion=cotizacion, **op_data)

        cotizacion.refresh_from_db()
        return cotizacion

    def update(self, instance, validated_data):
        from django.db import transaction

        opciones_data = validated_data.pop('opciones', None)

        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            if opciones_data is not None:
                instance.opciones.all().delete()
                cant_req = Decimal(str(instance.cantidad_requerida or 4))
                for op_data in opciones_data:
                    pu = Decimal(str(op_data.get('precio_unitario_publico', 0)))
                    if not op_data.get('precio_cantidad_solicitada') or Decimal(str(op_data.get('precio_cantidad_solicitada', 0))) <= Decimal('0'):
                        op_data['precio_cantidad_solicitada'] = (pu * cant_req).quantize(Decimal('0.01'))
                    OpcionCotizacion.objects.create(cotizacion=instance, **op_data)

        instance.refresh_from_db()
        return instance


class SolicitudAutorizacionSerializer(serializers.ModelSerializer):
    """
    Serializer para el flujo de autorización de eliminación/edición de ventas
    """
    solicitado_por_nombre = serializers.SerializerMethodField(read_only=True)
    autorizado_por_nombre = serializers.SerializerMethodField(read_only=True)
    venta_folio = serializers.CharField(source='venta.folio', read_only=True)
    venta_total = serializers.DecimalField(source='venta.total', max_digits=10, decimal_places=2, read_only=True)
    esta_expirada = serializers.BooleanField(read_only=True)
    segundos_restantes = serializers.SerializerMethodField(read_only=True)
    whatsapp_mensaje = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SolicitudAutorizacion
        fields = [
            'id', 'token', 'codigo_otp', 'accion', 'venta', 'venta_folio', 'venta_total',
            'solicitado_por', 'solicitado_por_nombre', 'autorizado_por', 'autorizado_por_nombre',
            'motivo', 'estado', 'created_at', 'expires_at', 'esta_expirada',
            'segundos_restantes', 'whatsapp_mensaje'
        ]
        read_only_fields = [
            'id', 'token', 'codigo_otp', 'solicitado_por', 'autorizado_por',
            'estado', 'created_at', 'expires_at', 'esta_expirada'
        ]

    def get_solicitado_por_nombre(self, obj):
        if obj.solicitado_por:
            return obj.solicitado_por.get_full_name() or obj.solicitado_por.username
        return ''

    def get_autorizado_por_nombre(self, obj):
        if obj.autorizado_por:
            return obj.autorizado_por.get_full_name() or obj.autorizado_por.username
        return None

    def get_segundos_restantes(self, obj):
        if not obj.expires_at:
            return 0
        now = timezone.now()
        if now >= obj.expires_at:
            return 0
        return int((obj.expires_at - now).total_seconds())

    def get_whatsapp_mensaje(self, obj):
        accion_texto = 'Cancelación de Venta' if obj.accion == 'eliminar_venta' else 'Edición de Venta'
        vendedor = self.get_solicitado_por_nombre(obj)
        folio = obj.venta.folio if obj.venta else 'N/A'
        total = f"${obj.venta.total:,.2f}" if obj.venta else '$0.00'
        return (
            f"*SOLICITUD DE AUTORIZACIÓN - CENTRO LLANTERO EMIRS*\n\n"
            f"*Acción:* {accion_texto}\n"
            f"*Folio:* {folio}\n"
            f"*Monto:* {total}\n"
            f"*Solicitado por:* {vendedor}\n"
            f"*Motivo:* {obj.motivo}\n\n"
            f"*Enlace para autorizar en 1 clic:*\n"
            f"/autorizar/{obj.token}\n\n"
            f"*Código OTP (opcional):* {obj.codigo_otp}\n"
            f"*Vence en:* 15 minutos"
        )


