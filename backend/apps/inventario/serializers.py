from rest_framework import serializers
from .models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario, PagoProveedor


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
