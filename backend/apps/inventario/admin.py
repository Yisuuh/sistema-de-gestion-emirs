from django.contrib import admin
from .models import Marca, Proveedor, Producto, EntradaInventario, SalidaInventario, PagoProveedor


@admin.register(Marca)
class MarcaAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'activa', 'created_at']
    list_filter = ['activa']
    search_fields = ['nombre']


@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'contacto', 'telefono', 'dias_credito', 'activo', 'created_at']
    list_filter = ['activo']
    search_fields = ['nombre', 'contacto', 'telefono']


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ['codigo', 'marca', 'modelo', 'medida', 'precio_venta', 'stock_actual', 'activo']
    list_filter = ['marca', 'activo', 'indice_velocidad']
    search_fields = ['codigo', 'modelo', 'medida']
    readonly_fields = ['created_at', 'updated_at']
    
    def stock_actual(self, obj):
        return obj.stock_actual
    stock_actual.short_description = 'Stock Actual'


@admin.register(EntradaInventario)
class EntradaInventarioAdmin(admin.ModelAdmin):
    list_display = ['producto', 'proveedor', 'cantidad', 'precio_compra', 'fecha_compra', 'numero_factura', 'en_inventario']
    list_filter = ['proveedor', 'en_inventario', 'factura_consumida', 'fecha_compra']
    search_fields = ['producto__codigo', 'numero_factura']
    readonly_fields = ['created_at', 'created_by']


@admin.register(SalidaInventario)
class SalidaInventarioAdmin(admin.ModelAdmin):
    list_display = ['producto', 'cantidad', 'precio_venta', 'precio_costo', 'utilidad', 'fecha_venta']
    list_filter = ['fecha_venta']
    search_fields = ['producto__codigo']
    readonly_fields = ['utilidad', 'created_at']


@admin.register(PagoProveedor)
class PagoProveedorAdmin(admin.ModelAdmin):
    list_display = ['proveedor', 'monto', 'fecha', 'referencia', 'registrado_por', 'created_at']
    list_filter = ['proveedor', 'fecha']
    search_fields = ['proveedor__nombre', 'referencia', 'notas']
    readonly_fields = ['created_at', 'registrado_por']
