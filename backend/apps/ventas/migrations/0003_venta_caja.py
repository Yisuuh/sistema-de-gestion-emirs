import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ventas', '0002_alter_venta_empleado'),
        ('caja', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='venta',
            name='caja',
            field=models.ForeignKey(
                blank=True,
                help_text='Caja en la que se registró la venta',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='ventas',
                to='caja.caja',
            ),
        ),
    ]
