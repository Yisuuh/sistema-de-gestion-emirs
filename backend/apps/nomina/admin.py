from django.contrib import admin
from .models import Empleado, PeriodoNomina, LineaNomina


@admin.register(Empleado)
class EmpleadoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'apellido', 'telefono', 'puesto', 'salario_base', 'metodo_pago', 'tipo_pago', 'activo']
    list_filter = ['activo', 'puesto', 'metodo_pago', 'tipo_pago']
    search_fields = ['nombre', 'apellido', 'telefono', 'rfc', 'curp']
    list_editable = ['activo']
    ordering = ['apellido', 'nombre']

    fieldsets = (
        ('Información Personal', {
            'fields': ('nombre', 'apellido', 'telefono')
        }),
        ('Información Laboral', {
            'fields': ('puesto', 'fecha_ingreso', 'activo', 'salario_base', 'tipo_pago', 'metodo_pago')
        }),
        ('Comisión y Domingo', {
            'fields': ('comision_porcentaje', 'pago_dominical'),
        }),
        ('Datos Fiscales', {
            'fields': ('curp', 'rfc', 'nss'),
            'classes': ('collapse',),
        }),
        ('Datos Bancarios', {
            'fields': ('banco', 'cuenta_bancaria'),
            'classes': ('collapse',),
        }),
        ('Notas', {
            'fields': ('notas',),
            'classes': ('collapse',),
        }),
    )


class LineaNominaInline(admin.TabularInline):
    model = LineaNomina
    extra = 0
    readonly_fields = ['total_percepciones', 'neto']
    fields = [
        'empleado', 'sueldo', 'comision', 'bonos', 'domingo',
        'descuentos', 'efectivo', 'transferencia',
        'total_percepciones', 'neto', 'observaciones',
    ]


@admin.register(PeriodoNomina)
class PeriodoNominaAdmin(admin.ModelAdmin):
    list_display = [
        'fecha_inicio', 'fecha_fin', 'estado',
        'total_efectivo', 'total_transferencia', 'total_general',
    ]
    list_filter = ['estado']
    ordering = ['-fecha_inicio']
    readonly_fields = ['total_efectivo', 'total_transferencia', 'total_general', 'total_comisiones', 'total_domingos', 'created_at', 'updated_at']
    inlines = [LineaNominaInline]

    fieldsets = (
        ('Período', {'fields': ('fecha_inicio', 'fecha_fin', 'estado', 'observaciones')}),
        ('Totales', {'fields': ('total_efectivo', 'total_transferencia', 'total_general', 'total_comisiones', 'total_domingos')}),
    )


@admin.register(LineaNomina)
class LineaNominaAdmin(admin.ModelAdmin):
    list_display = ['empleado', 'periodo', 'sueldo', 'comision', 'domingo', 'efectivo', 'transferencia', 'neto']
    list_filter = ['periodo__estado']
    search_fields = ['empleado__nombre', 'empleado__apellido']
    readonly_fields = ['total_percepciones', 'neto']


