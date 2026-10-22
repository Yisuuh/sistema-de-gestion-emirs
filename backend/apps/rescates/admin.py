from django.contrib import admin
from .models import UnidadMovil, TipoServicioRescate, Rescate, DetalleRescate


class DetalleRescateInline(admin.TabularInline):
    model = DetalleRescate
    extra = 1


@admin.register(UnidadMovil)
class UnidadMovilAdmin(admin.ModelAdmin):
    list_display = ['numero_economico', 'nombre', 'placas', 'modelo', 'chofer_habitual', 'activo']
    list_filter = ['activo']
    search_fields = ['numero_economico', 'nombre', 'placas']


@admin.register(TipoServicioRescate)
class TipoServicioRescateAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'precio_base', 'comision_operador', 'activo']
    list_filter = ['activo']
    search_fields = ['nombre']


@admin.register(Rescate)
class RescateAdmin(admin.ModelAdmin):
    list_display = ['folio', 'nombre_cliente', 'estado', 'operador', 'unidad', 'total', 'metodo_pago', 'fecha_solicitud']
    list_filter = ['estado', 'metodo_pago', 'fecha_solicitud']
    search_fields = ['folio', 'nombre_cliente', 'telefono_cliente', 'vehiculo_placas']
    inlines = [DetalleRescateInline]
