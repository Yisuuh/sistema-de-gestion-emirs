from django.contrib import admin
from .models import Venta, DetalleVenta, Servicio


@admin.register(Servicio)
class ServicioAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'precio', 'activo']
    list_filter = ['activo']
    search_fields = ['nombre']
