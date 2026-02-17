from django.contrib import admin
from .models import Venta, DetalleVenta, Servicio


class DetalleVentaInline(admin.TabularInline):
    model = DetalleVenta
    extra = 1
    fields = ['producto', 'servicio', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal']
    readonly_fields = ['subtotal']


@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ['folio', 'fecha', 'empleado', 'cliente', 'metodo_pago', 'total']
    list_filter = ['metodo_pago', 'fecha']
    search_fields = ['folio', 'cliente__nombre', 'empleado__username']
    readonly_fields = ['folio', 'fecha']
    inlines = [DetalleVentaInline]
    
    fieldsets = (
        ('Información de Venta', {
            'fields': ('folio', 'fecha', 'empleado', 'cliente')
        }),
        ('Pago', {
            'fields': ('metodo_pago', 'monto_efectivo', 'monto_electronico')
        }),
        ('Totales', {
            'fields': ('subtotal', 'descuento', 'total', 'notas')
        }),
    )


@admin.register(Servicio)
class ServicioAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'precio', 'activo']
    list_filter = ['activo']
    search_fields = ['nombre', 'descripcion']
    list_editable = ['precio', 'activo']


@admin.register(DetalleVenta)
class DetalleVentaAdmin(admin.ModelAdmin):
    list_display = ['venta', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal']
    list_filter = ['venta__fecha']
    search_fields = ['venta__folio', 'descripcion']
    readonly_fields = ['subtotal']
