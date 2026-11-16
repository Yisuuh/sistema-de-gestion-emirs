from decimal import Decimal
from rest_framework import serializers
from .models import (
    Marca, Proveedor, Producto, EntradaInventario,
    SalidaInventario, PagoProveedor, FacturaXMLBandeja,
)


class MarcaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Marca
        fields = '__all__'


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = '__all__'


class ProductoSerializer(serializers.ModelSerializer):
    marca_nombre = serializers.CharField(source='marca.nombre', read_only=True)
    descripcion_completa = serializers.CharField(read_only=True)
    stock_actual = serializers.IntegerField(read_only=True)
    tiene_stock_bajo = serializers.BooleanField(read_only=True)
    stock_agotado = serializers.BooleanField(read_only=True)
    ultimo_precio_compra = serializers.SerializerMethodField()
    ultimo_precio_incluye_iva = serializers.SerializerMethodField()

    def validate_precio_venta(self, value):
        if value is None or value <= Decimal('0'):
            raise serializers.ValidationError('El precio de venta debe ser mayor a 0.')
        return value

    def get_ultimo_precio_compra(self, obj):
        if hasattr(obj, 'ultimo_precio_compra'):
            val = obj.ultimo_precio_compra
            return float(val) if val is not None else None
        ultima = (
            obj.entradas.order_by('-fecha_compra', '-created_at', '-id')
            .values_list('precio_compra', flat=True)
            .first()
        )
        return float(ultima) if ultima is not None else None

    def get_ultimo_precio_incluye_iva(self, obj):
        if hasattr(obj, 'ultimo_precio_incluye_iva'):
            val = obj.ultimo_precio_incluye_iva
            return bool(val) if val is not None else None
        ultima = (
            obj.entradas.order_by('-fecha_compra', '-created_at', '-id')
            .values_list('precio_incluye_iva', flat=True)
            .first()
        )
        return bool(ultima) if ultima is not None else None

    class Meta:
        model = Producto
        fields = '__all__'


class EntradaInventarioSerializer(serializers.ModelSerializer):
    producto_descripcion = serializers.CharField(source='producto.descripcion_completa', read_only=True)
    producto_codigo = serializers.CharField(source='producto.codigo', read_only=True)
    producto_medida = serializers.CharField(source='producto.medida', read_only=True)
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True)
    total_compra = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    dias_restantes = serializers.IntegerField(read_only=True)
    estado_alerta = serializers.CharField(read_only=True)

    def validate_cantidad(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('La cantidad debe ser mayor a 0.')
        return value

    def validate_precio_compra(self, value):
        if value is None or value <= Decimal('0'):
            raise serializers.ValidationError('El precio de compra debe ser mayor a 0.')
        return value
    
    class Meta:
        model = EntradaInventario
        fields = '__all__'
        read_only_fields = ['created_by']


class SalidaInventarioSerializer(serializers.ModelSerializer):
    producto_descripcion = serializers.CharField(source='producto.descripcion_completa', read_only=True)
    producto_codigo = serializers.CharField(source='producto.codigo', read_only=True)
    producto_medida = serializers.CharField(source='producto.medida', read_only=True)
    marca_nombre = serializers.CharField(source='producto.marca.nombre', read_only=True)
    venta_folio = serializers.CharField(source='venta.folio', read_only=True)
    total_venta = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = SalidaInventario
        fields = '__all__'
        read_only_fields = ['utilidad']


class PagoProveedorSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True)
    registrado_por_username = serializers.CharField(source='registrado_por.username', read_only=True)
    comprobante_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PagoProveedor
        fields = '__all__'
        read_only_fields = ['registrado_por']

    def validate_comprobante(self, value):
        if value:
            max_size = 5 * 1024 * 1024  # 5 MB
            if value.size > max_size:
                raise serializers.ValidationError('El archivo de comprobante no puede exceder 5 MB.')
        return value

    def validate(self, attrs):
        if self.instance is not None:
            if 'monto' in attrs and attrs['monto'] != self.instance.monto:
                raise serializers.ValidationError({'monto': 'No se permite modificar el monto de un pago ya registrado.'})
            if 'proveedor' in attrs and attrs['proveedor'] != self.instance.proveedor:
                raise serializers.ValidationError({'proveedor': 'No se permite modificar el proveedor de un pago ya registrado.'})
        return super().validate(attrs)

    def get_comprobante_url(self, obj):
        if obj.comprobante:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.comprobante.url)
            return obj.comprobante.url
        return None


class FacturaXMLBandejaSerializer(serializers.ModelSerializer):
    cuenta_email = serializers.CharField(source='cuenta.email_cuenta', read_only=True)
    importado_por_username = serializers.CharField(source='importado_por.username', read_only=True, default=None)
    proveedor_vinculado_nombre = serializers.CharField(source='proveedor_vinculado.nombre', read_only=True, default=None)

    class Meta:
        model = FacturaXMLBandeja
        fields = [
            'id',
            'cuenta',
            'cuenta_email',
            'archivo_sha256',
            'remitente_email',
            'remitente_nombre',
            'asunto',
            'fecha_correo',
            'nombre_archivo',
            'cfdi_uuid',
            'emisor_rfc',
            'emisor_nombre',
            'numero_factura',
            'fecha_emision',
            'subtotal',
            'total',
            'total_items',
            'estado',
            'error_detalle',
            'importado_por',
            'importado_por_username',
            'importado_at',
            'proveedor_vinculado',
            'proveedor_vinculado_nombre',
            'created_at',
        ]
        read_only_fields = fields
