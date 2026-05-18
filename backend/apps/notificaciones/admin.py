from django.contrib import admin
from .models import PlantillaCorreo, Recordatorio, EnvioCorreo


@admin.register(PlantillaCorreo)
class PlantillaCorreoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'tipo', 'asunto', 'activa', 'updated_at']
    list_filter = ['tipo', 'activa']
    search_fields = ['nombre', 'asunto']


@admin.register(Recordatorio)
class RecordatorioAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'plantilla', 'frecuencia', 'proxima_ejecucion', 'estado']
    list_filter = ['frecuencia', 'estado']
    search_fields = ['nombre']


@admin.register(EnvioCorreo)
class EnvioCorreoAdmin(admin.ModelAdmin):
    list_display = ['destinatario_email', 'asunto', 'estado', 'enviado_at']
    list_filter = ['estado']
    search_fields = ['destinatario_email', 'asunto']
    readonly_fields = ['enviado_at']
