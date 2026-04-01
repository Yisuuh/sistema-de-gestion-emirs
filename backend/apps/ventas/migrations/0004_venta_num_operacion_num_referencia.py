from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ventas', '0003_venta_caja'),
    ]

    operations = [
        migrations.AddField(
            model_name='venta',
            name='num_operacion',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Número de operación para pagos con tarjeta',
                max_length=100,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='venta',
            name='num_referencia',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Número de referencia para pagos por transferencia',
                max_length=100,
            ),
            preserve_default=False,
        ),
    ]
