from rest_framework import serializers
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .models import UnidadMovil, TipoServicioRescate, Rescate, DetalleRescate
from apps.inventario.models import Producto, SalidaInventario, EntradaInventario


class UnidadMovilSerializer(serializers.ModelSerializer):
    chofer_habitual_nombre = serializers.CharField(
        source='chofer_habitual.nombre_completo', read_only=True, allow_null=True
    )

    class Meta:
        model = UnidadMovil
        fields = [
            'id', 'numero_economico', 'nombre', 'placas', 'modelo',
            'chofer_habitual', 'chofer_habitual_nombre', 'activo',
            'notas', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TipoServicioRescateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoServicioRescate
        fields = [
            'id', 'nombre', 'descripcion', 'precio_base',
            'comision_operador', 'activo', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class DetalleRescateSerializer(serializers.ModelSerializer):
    servicio_rescate_nombre = serializers.CharField(
        source='servicio_rescate.nombre', read_only=True, allow_null=True
    )
    producto_nombre = serializers.CharField(
        source='producto.descripcion_completa', read_only=True, allow_null=True
    )

    class Meta:
        model = DetalleRescate
        fields = [
            'id', 'rescate', 'servicio_rescate', 'servicio_rescate_nombre',
            'producto', 'producto_nombre', 'descripcion', 'cantidad',
            'precio_unitario', 'subtotal'
        ]
        read_only_fields = ['id', 'rescate', 'subtotal']

    def validate(self, data):
        cantidad = data.get('cantidad', 1)
        precio_unitario = data.get('precio_unitario', Decimal('0.00'))

        if cantidad <= 0:
            raise serializers.ValidationError({"cantidad": "La cantidad debe ser mayor a 0."})

        if not data.get('servicio_rescate') and not data.get('producto') and not data.get('descripcion'):
            raise serializers.ValidationError("Debe indicar un servicio, producto o descripción.")

        if not data.get('descripcion'):
            if data.get('servicio_rescate'):
                data['descripcion'] = data['servicio_rescate'].nombre
            elif data.get('producto'):
                data['descripcion'] = data['producto'].descripcion_completa

        data['subtotal'] = Decimal(str(cantidad)) * Decimal(str(precio_unitario))
        return data


class RescateSerializer(serializers.ModelSerializer):
    detalles = DetalleRescateSerializer(many=True, required=False)
    operador_nombre = serializers.CharField(source='operador.nombre_completo', read_only=True, allow_null=True)
    unidad_nombre = serializers.CharField(source='unidad.nombre', read_only=True, allow_null=True)
    unidad_numero = serializers.CharField(source='unidad.numero_economico', read_only=True, allow_null=True)
    cliente_nombre_db = serializers.CharField(source='cliente.nombre', read_only=True, allow_null=True)
    fecha_solicitud_formateada = serializers.DateTimeField(
        source='fecha_solicitud', format='%Y-%m-%d %H:%M:%S', read_only=True
    )
    fecha_cierre_formateada = serializers.DateTimeField(
        source='fecha_cierre', format='%Y-%m-%d %H:%M:%S', read_only=True, allow_null=True
    )

    class Meta:
        model = Rescate
        fields = [
            'id', 'folio', 'fecha_solicitud', 'fecha_solicitud_formateada',
            'fecha_cierre', 'fecha_cierre_formateada', 'estado',
            'unidad', 'unidad_nombre', 'unidad_numero',
            'operador', 'operador_nombre',
            'cliente', 'cliente_nombre_db', 'vehiculo', 'nombre_cliente', 'telefono_cliente',
            'ubicacion_texto', 'coordenadas_gps',
            'vehiculo_marca_modelo', 'vehiculo_placas', 'medida_llanta',
            'caja', 'metodo_pago', 'tipo_tarjeta',
            'monto_efectivo', 'monto_electronico', 'num_operacion', 'num_referencia',
            'costo_traslado', 'distancia_km', 'total_servicios', 'total_productos',
            'subtotal', 'descuento', 'total', 'notas',
            'detalles', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'folio', 'fecha_solicitud', 'caja', 'created_at', 'updated_at']

    def validate(self, data):
        metodo_pago = data.get('metodo_pago', getattr(self.instance, 'metodo_pago', 'efectivo'))
        tipo_tarjeta = data.get('tipo_tarjeta', getattr(self.instance, 'tipo_tarjeta', None))
        monto_efectivo = Decimal(str(data.get('monto_efectivo', getattr(self.instance, 'monto_efectivo', 0))))
        monto_electronico = Decimal(str(data.get('monto_electronico', getattr(self.instance, 'monto_electronico', 0))))
        estado = data.get('estado', getattr(self.instance, 'estado', 'solicitado'))

        if tipo_tarjeta and tipo_tarjeta not in ['debito', 'credito']:
            raise serializers.ValidationError({
                "tipo_tarjeta": "Tipo de tarjeta inválido. Debe ser 'debito' o 'credito'."
            })

        if estado == 'completado':
            if metodo_pago == 'efectivo' and monto_efectivo <= 0:
                raise serializers.ValidationError({
                    "monto_efectivo": "El monto en efectivo debe ser mayor a 0 para pago en efectivo."
                })
            if metodo_pago in ['tarjeta', 'transferencia'] and monto_electronico <= 0:
                raise serializers.ValidationError({
                    "monto_electronico": "El monto electrónico debe ser mayor a 0 para este método de pago."
                })
            if metodo_pago == 'mixto' and (monto_efectivo <= 0 or monto_electronico <= 0):
                raise serializers.ValidationError(
                    "Para pago mixto, ambos montos (efectivo y electrónico) deben ser mayores a 0."
                )

        return data

    def create(self, validated_data):
        from apps.ventas.services import generar_siguiente_folio_atomico
        from apps.caja.models import Caja as CajaModel

        detalles_data = validated_data.pop('detalles', [])

        with transaction.atomic():
            validated_data['folio'] = generar_siguiente_folio_atomico('RESCATE', Rescate, 'RES-', 6)

            # Auto-asignar caja abierta si está disponible
            caja_abierta = CajaModel.objects.filter(estado='abierta').first()
            if caja_abierta:
                validated_data['caja'] = caja_abierta

            rescate = Rescate.objects.create(**validated_data)

            # Calcular subtotales de detalles si vienen incluidos
            total_serv = Decimal(str(rescate.costo_traslado or 0))
            total_prod = Decimal('0.00')
            for det in detalles_data:
                cant = det.get('cantidad', 1)
                pu = Decimal(str(det.get('precio_unitario', 0)))
                subt = Decimal(str(cant)) * pu
                det['subtotal'] = subt
                if det.get('producto'):
                    total_prod += subt
                else:
                    total_serv += subt
                DetalleRescate.objects.create(rescate=rescate, **det)

            # Si se crearon detalles, actualizar totales segregados
            if detalles_data:
                rescate.total_servicios = total_serv
                rescate.total_productos = total_prod
                rescate.subtotal = total_serv + total_prod
                rescate.total = max(Decimal('0.00'), rescate.subtotal - Decimal(str(rescate.descuento or 0)))
                # Si el método de pago es efectivo y monto_efectivo era 0, ajustar al total
                if rescate.metodo_pago == 'efectivo' and rescate.monto_efectivo == 0:
                    rescate.monto_efectivo = rescate.total
                elif rescate.metodo_pago in ['tarjeta', 'transferencia'] and rescate.monto_electronico == 0:
                    rescate.monto_electronico = rescate.total
                rescate.save(update_fields=['total_servicios', 'total_productos', 'subtotal', 'total', 'monto_efectivo', 'monto_electronico'])

        rescate.refresh_from_db()
        return rescate

    def update(self, instance, validated_data):
        detalles_data = validated_data.pop('detalles', None)

        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()

            if detalles_data is not None:
                instance.detalles.all().delete()
                total_serv = Decimal(str(instance.costo_traslado or 0))
                total_prod = Decimal('0.00')
                for det in detalles_data:
                    cant = det.get('cantidad', 1)
                    pu = Decimal(str(det.get('precio_unitario', 0)))
                    subt = Decimal(str(cant)) * pu
                    det['subtotal'] = subt
                    if det.get('producto'):
                        total_prod += subt
                    else:
                        total_serv += subt
                    DetalleRescate.objects.create(rescate=instance, **det)

                instance.total_servicios = total_serv
                instance.total_productos = total_prod
                instance.subtotal = total_serv + total_prod
                instance.total = max(Decimal('0.00'), instance.subtotal - Decimal(str(instance.descuento or 0)))
                instance.save(update_fields=['total_servicios', 'total_productos', 'subtotal', 'total'])

        instance.refresh_from_db()
        return instance


class RescateListSerializer(serializers.ModelSerializer):
    operador_nombre = serializers.CharField(source='operador.nombre_completo', read_only=True, allow_null=True)
    unidad_nombre = serializers.CharField(source='unidad.nombre', read_only=True, allow_null=True)
    unidad_numero = serializers.CharField(source='unidad.numero_economico', read_only=True, allow_null=True)
    total_detalles = serializers.IntegerField(source='detalles.count', read_only=True)
    detalles = DetalleRescateSerializer(many=True, read_only=True)

    class Meta:
        model = Rescate
        fields = [
            'id', 'folio', 'fecha_solicitud', 'fecha_cierre', 'estado',
            'unidad', 'unidad_nombre', 'unidad_numero',
            'operador', 'operador_nombre', 'cliente', 'vehiculo',
            'nombre_cliente', 'telefono_cliente',
            'ubicacion_texto', 'coordenadas_gps', 'vehiculo_marca_modelo', 'vehiculo_placas',
            'medida_llanta', 'metodo_pago', 'tipo_tarjeta', 'monto_efectivo', 'monto_electronico',
            'costo_traslado', 'distancia_km', 'total_servicios', 'total_productos',
            'subtotal', 'descuento', 'total', 'notas',
            'total_detalles', 'detalles'
        ]
