from django.contrib import admin
from .models import Empleado


@admin.register(Empleado)
class EmpleadoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'apellido', 'telefono', 'puesto', 'activo', 'fecha_ingreso']
    list_filter = ['activo', 'puesto']
    search_fields = ['nombre', 'apellido', 'telefono']
    list_editable = ['activo']
    ordering = ['apellido', 'nombre']
    
    fieldsets = (
        ('Información Personal', {
            'fields': ('nombre', 'apellido', 'telefono')
        }),
        ('Información Laboral', {
            'fields': ('puesto', 'fecha_ingreso', 'activo')
        }),
        ('Notas', {
            'fields': ('notas',),
            'classes': ('collapse',)
        }),
    )

