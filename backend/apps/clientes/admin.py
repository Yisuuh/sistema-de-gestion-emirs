from django.contrib import admin
from .models import Cliente, Vehiculo


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'telefono', 'email', 'created_at']
    search_fields = ['nombre', 'telefono', 'email']


@admin.register(Vehiculo)
class VehiculoAdmin(admin.ModelAdmin):
    list_display = ['marca', 'modelo', 'año', 'placas', 'cliente', 'medida_llantas']
    search_fields = ['marca', 'modelo', 'placas', 'cliente__nombre']
    list_filter = ['marca', 'año']
