from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Usuario, LogAuditoria


@admin.register(Usuario)
class UsuarioAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'rol', 'activo', 'fecha_ultimo_acceso']
    list_filter = ['rol', 'activo', 'is_staff', 'is_superuser']
    search_fields = ['username', 'first_name', 'last_name', 'email']
    
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Información Adicional', {'fields': ('rol', 'telefono', 'activo', 'fecha_ultimo_acceso')}),
    )


@admin.register(LogAuditoria)
class LogAuditoriaAdmin(admin.ModelAdmin):
    list_display = ['usuario', 'accion', 'tabla', 'registro_id', 'ip', 'fecha']
    list_filter = ['accion', 'tabla', 'fecha']
    search_fields = ['usuario__username', 'tabla']
    readonly_fields = ['usuario', 'accion', 'tabla', 'registro_id', 'datos_anteriores', 'datos_nuevos', 'ip', 'fecha']
    
    def has_add_permission(self, request):
        return False
    
    def has_delete_permission(self, request, obj=None):
        return False
