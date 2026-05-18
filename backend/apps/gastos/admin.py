from django.contrib import admin
from .models import CategoriaGasto, Gasto


@admin.register(CategoriaGasto)
class CategoriaGastoAdmin(admin.ModelAdmin):
    list_display = ['nombre', 'tipo', 'activo']
    list_filter = ['tipo', 'activo']


@admin.register(Gasto)
class GastoAdmin(admin.ModelAdmin):
    list_display = ['fecha', 'concepto', 'categoria', 'monto', 'metodo_pago', 'responsable']
    list_filter = ['fecha', 'metodo_pago', 'categoria']
    search_fields = ['concepto', 'notas']
    date_hierarchy = 'fecha'
    raw_id_fields = ['responsable', 'caja']
