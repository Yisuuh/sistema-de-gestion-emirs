from django.db import models
from django.utils import timezone


class CategoriaGasto(models.Model):
    TIPO_CHOICES = [
        ('operativo', 'Operativo'),
        ('nomina', 'Nómina'),
        ('proveedor', 'Proveedor/Compra'),
        ('mantenimiento', 'Mantenimiento'),
        ('servicios', 'Servicios (luz/agua/renta)'),
        ('otro', 'Otro'),
    ]
    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES, default='operativo')
    activo = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Categoría de Gasto'
        verbose_name_plural = 'Categorías de Gasto'
        ordering = ['nombre']

    def __str__(self):
        return self.nombre


class Gasto(models.Model):
    METODOS_PAGO = [
        ('efectivo', 'Efectivo'),
        ('transferencia', 'Transferencia'),
        ('tarjeta', 'Tarjeta'),
    ]

    fecha = models.DateField(default=timezone.now)
    concepto = models.CharField(max_length=200)
    categoria = models.ForeignKey(
        CategoriaGasto, on_delete=models.PROTECT,
        related_name='gastos', null=True, blank=True
    )
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO, default='efectivo')
    responsable = models.ForeignKey(
        'nomina.Empleado', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='gastos_responsable'
    )
    # Relación opcional con caja para afectar saldo
    caja = models.ForeignKey(
        'caja.Caja', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='gastos'
    )
    evidencia = models.ImageField(
        upload_to='gastos/', null=True, blank=True
    )
    notas = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Gasto'
        verbose_name_plural = 'Gastos'
        ordering = ['-fecha', '-created_at']

    def __str__(self):
        return f'{self.fecha} | {self.concepto} | ${self.monto}'

    # El movimiento de caja se registra desde el ViewSet (perform_create)
    # para tener acceso al empleado del request.

