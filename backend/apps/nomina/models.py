from django.db import models
from decimal import Decimal


METODO_PAGO_CHOICES = [
    ('efectivo', 'Efectivo'),
    ('transferencia', 'Transferencia'),
    ('mixto', 'Mixto'),
]

PERIODICIDAD_CHOICES = [
    ('semanal', 'Semanal'),
    ('quincenal', 'Quincenal'),
    ('mensual', 'Mensual'),
]


class Empleado(models.Model):
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    puesto = models.CharField(max_length=100, blank=True)
    activo = models.BooleanField(default=True)
    fecha_ingreso = models.DateField(null=True, blank=True)

    # Salarial
    salario_base = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Salario base semanal en MXN'
    )
    tipo_pago = models.CharField(
        max_length=20, choices=PERIODICIDAD_CHOICES, default='semanal',
        verbose_name='Periodicidad de pago'
    )
    metodo_pago = models.CharField(
        max_length=20, choices=METODO_PAGO_CHOICES, default='efectivo',
        verbose_name='Método de pago'
    )
    comision_porcentaje = models.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        help_text='Porcentaje de comisión (ej. 10 = 10%)'
    )
    pago_dominical = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text='Monto fijo por domingo trabajado'
    )

    # Datos fiscales / bancarios
    curp = models.CharField(max_length=18, blank=True)
    rfc = models.CharField(max_length=13, blank=True)
    nss = models.CharField(max_length=11, blank=True, verbose_name='NSS')
    banco = models.CharField(max_length=100, blank=True)
    cuenta_bancaria = models.CharField(max_length=25, blank=True)
    notas = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Empleado'
        verbose_name_plural = 'Empleados'
        ordering = ['apellido', 'nombre']

    def __str__(self):
        return f"{self.nombre} {self.apellido}"

    @property
    def nombre_completo(self):
        return f"{self.nombre} {self.apellido}"


class PeriodoNomina(models.Model):
    ESTADO_CHOICES = [
        ('borrador', 'Borrador'),
        ('cerrada', 'Cerrada'),
        ('pagada', 'Pagada'),
    ]

    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='borrador')
    observaciones = models.TextField(blank=True)

    # Totales consolidados (recalculados al guardar/cerrar)
    total_efectivo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_transferencia = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_general = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_comisiones = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_domingos = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Período de Nómina'
        verbose_name_plural = 'Períodos de Nómina'
        ordering = ['-fecha_inicio']

    def __str__(self):
        return f"Nómina {self.fecha_inicio} – {self.fecha_fin} [{self.get_estado_display()}]"

    def recalcular_totales(self):
        from django.db.models import Sum
        agg = self.lineas.aggregate(
            ef=Sum('efectivo'),
            tr=Sum('transferencia'),
            net=Sum('neto'),
            com=Sum('comision'),
            dom=Sum('domingo'),
        )
        self.total_efectivo = agg['ef'] or Decimal('0')
        self.total_transferencia = agg['tr'] or Decimal('0')
        self.total_general = agg['net'] or Decimal('0')
        self.total_comisiones = agg['com'] or Decimal('0')
        self.total_domingos = agg['dom'] or Decimal('0')


class LineaNomina(models.Model):
    periodo = models.ForeignKey(
        PeriodoNomina, on_delete=models.CASCADE, related_name='lineas'
    )
    empleado = models.ForeignKey(
        Empleado, on_delete=models.PROTECT, related_name='lineas_nomina'
    )

    # Percepciones
    sueldo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    comision = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    bonos = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    domingo = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Deducciones
    descuentos = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Forma de pago
    efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    transferencia = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # Calculados al guardar
    total_percepciones = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    neto = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    observaciones = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name = 'Línea de Nómina'
        verbose_name_plural = 'Líneas de Nómina'
        unique_together = [['periodo', 'empleado']]
        ordering = ['empleado__apellido', 'empleado__nombre']

    def __str__(self):
        return f"{self.empleado.nombre_completo} — {self.periodo}"

    def calcular(self):
        self.total_percepciones = self.sueldo + self.comision + self.bonos + self.domingo
        self.neto = self.total_percepciones - self.descuentos

    def save(self, *args, **kwargs):
        self.calcular()
        super().save(*args, **kwargs)

