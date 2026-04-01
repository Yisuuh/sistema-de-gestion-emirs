"""
Modelos para el módulo de Caja
"""
from django.db import models
from django.db.models import Sum


class Caja(models.Model):
    """
    Registro de apertura y cierre de caja
    """
    ESTADO_CHOICES = [
        ('abierta', 'Abierta'),
        ('cerrada', 'Cerrada'),
    ]
    
    folio = models.CharField(max_length=20, unique=True, editable=False)
    fecha_apertura = models.DateTimeField(auto_now_add=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    empleado_apertura = models.ForeignKey(
        'nomina.Empleado', 
        on_delete=models.PROTECT, 
        related_name='cajas_abiertas'
    )
    empleado_cierre = models.ForeignKey(
        'nomina.Empleado', 
        on_delete=models.PROTECT, 
        related_name='cajas_cerradas',
        null=True, 
        blank=True
    )
    monto_inicial = models.DecimalField(max_digits=10, decimal_places=2)
    monto_final = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    estado = models.CharField(max_length=10, choices=ESTADO_CHOICES, default='abierta')
    notas_apertura = models.TextField(blank=True)
    notas_cierre = models.TextField(blank=True)
    
    class Meta:
        verbose_name = 'Caja'
        verbose_name_plural = 'Cajas'
        ordering = ['-fecha_apertura']
    
    def __str__(self):
        return f"{self.folio} - {self.estado}"
    
    @property
    def total_ventas_efectivo(self):
        """Total en efectivo de ventas registradas en esta caja"""
        return self.ventas.aggregate(
            t=Sum('monto_efectivo')
        )['t'] or 0

    @property
    def total_ventas_electronico(self):
        """Total electrónico de ventas registradas en esta caja"""
        return self.ventas.aggregate(
            t=Sum('monto_electronico')
        )['t'] or 0

    @property
    def total_ventas(self):
        """Total general de ventas registradas en esta caja"""
        return self.ventas.aggregate(
            t=Sum('total')
        )['t'] or 0

    @property
    def num_ventas(self):
        """Cantidad de ventas en esta caja"""
        return self.ventas.count()

    @property
    def total_ingresos(self):
        """Calcular total de ingresos (ventas en efectivo + movimientos de ingreso)"""
        # Movimientos de ingreso extra
        movimientos_ingreso = self.movimientos.filter(
            tipo='ingreso'
        ).aggregate(
            total=Sum('monto')
        )
        total_movimientos = movimientos_ingreso['total'] or 0
        return self.total_ventas_efectivo + total_movimientos
    
    @property
    def total_egresos(self):
        """Calcular total de egresos"""
        movimientos_egreso = self.movimientos.filter(
            tipo='egreso'
        ).aggregate(
            total=Sum('monto')
        )
        return movimientos_egreso['total'] or 0
    
    @property
    def saldo_esperado(self):
        """Calcular el saldo esperado en caja"""
        return self.monto_inicial + self.total_ingresos - self.total_egresos
    
    @property
    def diferencia(self):
        """Calcular diferencia entre saldo esperado y monto final"""
        if self.monto_final is None:
            return None
        return self.monto_final - self.saldo_esperado


class MovimientoCaja(models.Model):
    """
    Movimientos de efectivo en caja (ingresos/egresos no relacionados con ventas)
    """
    TIPO_CHOICES = [
        ('ingreso', 'Ingreso'),
        ('egreso', 'Egreso'),
    ]
    
    caja = models.ForeignKey(Caja, on_delete=models.CASCADE, related_name='movimientos')
    tipo = models.CharField(max_length=10, choices=TIPO_CHOICES)
    concepto = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    fecha = models.DateTimeField(auto_now_add=True)
    empleado = models.ForeignKey('nomina.Empleado', on_delete=models.PROTECT)
    categoria = models.CharField(max_length=100, blank=True, help_text='Ejemplo: Servicios, Gastos operativos, etc.')
    
    class Meta:
        verbose_name = 'Movimiento de Caja'
        verbose_name_plural = 'Movimientos de Caja'
        ordering = ['-fecha']
    
    def __str__(self):
        return f"{self.tipo.upper()} - {self.concepto} - ${self.monto}"


class ArqueoCaja(models.Model):
    """
    Arqueo de caja - Conteo físico de dinero
    """
    caja = models.ForeignKey(Caja, on_delete=models.CASCADE, related_name='arqueos')
    fecha = models.DateTimeField(auto_now_add=True)
    empleado = models.ForeignKey('nomina.Empleado', on_delete=models.PROTECT)
    
    # Billetes
    billetes_1000 = models.IntegerField(default=0, verbose_name='Billetes de $1,000')
    billetes_500 = models.IntegerField(default=0, verbose_name='Billetes de $500')
    billetes_200 = models.IntegerField(default=0, verbose_name='Billetes de $200')
    billetes_100 = models.IntegerField(default=0, verbose_name='Billetes de $100')
    billetes_50 = models.IntegerField(default=0, verbose_name='Billetes de $50')
    billetes_20 = models.IntegerField(default=0, verbose_name='Billetes de $20')
    
    # Monedas
    monedas_20 = models.IntegerField(default=0, verbose_name='Monedas de $20')
    monedas_10 = models.IntegerField(default=0, verbose_name='Monedas de $10')
    monedas_5 = models.IntegerField(default=0, verbose_name='Monedas de $5')
    monedas_2 = models.IntegerField(default=0, verbose_name='Monedas de $2')
    monedas_1 = models.IntegerField(default=0, verbose_name='Monedas de $1')
    monedas_050 = models.IntegerField(default=0, verbose_name='Monedas de $0.50')
    
    total = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    notas = models.TextField(blank=True)
    
    class Meta:
        verbose_name = 'Arqueo de Caja'
        verbose_name_plural = 'Arqueos de Caja'
        ordering = ['-fecha']
    
    def __str__(self):
        return f"Arqueo {self.caja.folio} - ${self.total}"
    
    def calcular_total(self):
        """Calcular el total del arqueo"""
        total = (
            (self.billetes_1000 * 1000) +
            (self.billetes_500 * 500) +
            (self.billetes_200 * 200) +
            (self.billetes_100 * 100) +
            (self.billetes_50 * 50) +
            (self.billetes_20 * 20) +
            (self.monedas_20 * 20) +
            (self.monedas_10 * 10) +
            (self.monedas_5 * 5) +
            (self.monedas_2 * 2) +
            (self.monedas_1 * 1) +
            (self.monedas_050 * 0.50)
        )
        return total
    
    def save(self, *args, **kwargs):
        """Calcular total antes de guardar"""
        self.total = self.calcular_total()
        super().save(*args, **kwargs)
