"""
Migration 0004 – agrega las columnas FK que faltaron en 0001_initial.
Las tablas Producto, EntradaInventario y SalidaInventario se crearon sin sus
relaciones ForeignKey. Esta migración las añade como nullable para que sea
compatible con filas existentes en producción.
"""
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0003_pagoproveedor'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Producto.marca ───────────────────────────────────────────────────
        migrations.AddField(
            model_name='producto',
            name='marca',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='productos',
                to='inventario.marca',
            ),
        ),

        # ── EntradaInventario.producto ───────────────────────────────────────
        migrations.AddField(
            model_name='entradainventario',
            name='producto',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='entradas',
                to='inventario.producto',
            ),
        ),

        # ── EntradaInventario.proveedor ──────────────────────────────────────
        migrations.AddField(
            model_name='entradainventario',
            name='proveedor',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='entradas',
                to='inventario.proveedor',
            ),
        ),

        # ── EntradaInventario.created_by ─────────────────────────────────────
        migrations.AddField(
            model_name='entradainventario',
            name='created_by',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='entradas_creadas',
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # ── SalidaInventario.producto ────────────────────────────────────────
        migrations.AddField(
            model_name='salidainventario',
            name='producto',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='salidas',
                to='inventario.producto',
            ),
        ),
    ]
