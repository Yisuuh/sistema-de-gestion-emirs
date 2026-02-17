from django.contrib import admin
from .models import Caja, MovimientoCaja, ArqueoCaja


@admin.register(Caja)
class CajaAdmin(admin.ModelAdmin):
    """Admin para Caja"""
    list_display = [
        'folio', 'fecha_apertura', 'empleado_apertura', 
        'monto_inicial', 'estado', 'saldo_esperado'
    ]
    list_filter = ['estado', 'fecha_apertura']
    search_fields = ['folio', 'empleado_apertura__nombre', 'empleado_apertura__apellido']
    readonly_fields = [
        'folio', 'fecha_apertura', 'total_ingresos', 
        'total_egresos', 'saldo_esperado', 'diferencia'
    ]
    fieldsets = (
        ('Información General', {
            'fields': ('folio', 'estado')
        }),
        ('Apertura', {
            'fields': ('fecha_apertura', 'empleado_apertura', 'monto_inicial', 'notas_apertura')
        }),
        ('Cierre', {
            'fields': ('fecha_cierre', 'empleado_cierre', 'monto_final', 'notas_cierre')
        }),
        ('Resumen', {
            'fields': ('total_ingresos', 'total_egresos', 'saldo_esperado', 'diferencia')
        }),
    )


@admin.register(MovimientoCaja)
class MovimientoCajaAdmin(admin.ModelAdmin):
    """Admin para MovimientoCaja"""
    list_display = ['caja', 'tipo', 'concepto', 'monto', 'fecha', 'empleado']
    list_filter = ['tipo', 'categoria', 'fecha']
    search_fields = ['concepto', 'descripcion', 'categoria']
    readonly_fields = ['fecha']
    fieldsets = (
        ('Información General', {
            'fields': ('caja', 'tipo', 'categoria')
        }),
        ('Detalles', {
            'fields': ('concepto', 'descripcion', 'monto', 'empleado')
        }),
        ('Fecha', {
            'fields': ('fecha',)
        }),
    )


@admin.register(ArqueoCaja)
class ArqueoCajaAdmin(admin.ModelAdmin):
    """Admin para ArqueoCaja"""
    list_display = ['caja', 'fecha', 'empleado', 'total']
    list_filter = ['fecha']
    search_fields = ['caja__folio', 'empleado__nombre', 'empleado__apellido']
    readonly_fields = ['fecha', 'total']
    fieldsets = (
        ('Información General', {
            'fields': ('caja', 'empleado', 'fecha', 'total')
        }),
        ('Billetes', {
            'fields': (
                'billetes_1000', 'billetes_500', 'billetes_200',
                'billetes_100', 'billetes_50', 'billetes_20'
            )
        }),
        ('Monedas', {
            'fields': (
                'monedas_20', 'monedas_10', 'monedas_5',
                'monedas_2', 'monedas_1', 'monedas_050'
            )
        }),
        ('Notas', {
            'fields': ('notas',)
        }),
    )
