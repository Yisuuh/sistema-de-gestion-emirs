from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('nomina', '0001_initial'),
    ]

    operations = [
        # Nuevos campos en Empleado
        migrations.AddField(
            model_name='empleado',
            name='salario_base',
            field=models.DecimalField(
                decimal_places=2, default=0, max_digits=10,
                help_text='Salario base mensual en MXN'
            ),
        ),
        migrations.AddField(
            model_name='empleado',
            name='tipo_pago',
            field=models.CharField(
                choices=[('semanal', 'Semanal'), ('quincenal', 'Quincenal'), ('mensual', 'Mensual')],
                default='quincenal', max_length=20
            ),
        ),
        migrations.AddField(
            model_name='empleado',
            name='curp',
            field=models.CharField(blank=True, max_length=18),
        ),
        migrations.AddField(
            model_name='empleado',
            name='rfc',
            field=models.CharField(blank=True, max_length=13),
        ),
        migrations.AddField(
            model_name='empleado',
            name='nss',
            field=models.CharField(blank=True, max_length=11, verbose_name='NSS'),
        ),
        migrations.AddField(
            model_name='empleado',
            name='banco',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='empleado',
            name='cuenta_bancaria',
            field=models.CharField(blank=True, max_length=25),
        ),
        # Nuevo modelo Nomina
        migrations.CreateModel(
            name='Nomina',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('periodo_inicio', models.DateField()),
                ('periodo_fin', models.DateField()),
                ('tipo_periodo', models.CharField(
                    choices=[('semanal', 'Semanal'), ('quincenal', 'Quincenal'), ('mensual', 'Mensual')],
                    default='quincenal', max_length=20
                )),
                ('salario_periodo', models.DecimalField(
                    decimal_places=2, default=0, max_digits=10,
                    help_text='Salario correspondiente al periodo (puede diferir del base)'
                )),
                ('horas_extra', models.DecimalField(decimal_places=1, default=0, max_digits=5)),
                ('monto_horas_extra', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('bonos', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('comisiones', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('deducciones_imss', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('deducciones_isr', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('otras_deducciones', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('concepto_otras_deducciones', models.CharField(blank=True, max_length=200)),
                ('total_percepciones', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('total_deducciones', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('neto_pagar', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('pagado', models.BooleanField(default=False)),
                ('fecha_pago', models.DateField(blank=True, null=True)),
                ('notas', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('empleado', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='nominas', to='nomina.empleado'
                )),
            ],
            options={
                'verbose_name': 'Nómina',
                'verbose_name_plural': 'Nóminas',
                'ordering': ['-periodo_fin', 'empleado__apellido'],
            },
        ),
    ]
