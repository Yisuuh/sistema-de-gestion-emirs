import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventario', '0002_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PagoProveedor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monto', models.DecimalField(decimal_places=2, max_digits=10)),
                ('fecha', models.DateField()),
                ('referencia', models.CharField(blank=True, help_text='No. de transferencia, cheque, recibo, etc.', max_length=100)),
                ('notas', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('proveedor', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='pagos',
                    to='inventario.proveedor',
                )),
                ('registrado_por', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pagos_proveedores',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Pago a Proveedor',
                'verbose_name_plural': 'Pagos a Proveedores',
                'ordering': ['-fecha', '-created_at'],
            },
        ),
    ]
