from django.db import models


class Venta(models.Model):
    """
    Registro de ventas (POS)
    """
    METODOS_PAGO = [
        ('efectivo', 'Efectivo'),
        ('tarjeta', 'Tarjeta'),
        ('transferencia', 'Transferencia'),
        ('mixto', 'Mixto'),
    ]
    
    folio = models.CharField(max_length=20, unique=True, editable=False)
    fecha = models.DateTimeField(auto_now_add=True)
    empleado = models.ForeignKey('nomina.Empleado', on_delete=models.PROTECT, related_name='ventas')
    cliente = models.ForeignKey('clientes.Cliente', on_delete=models.SET_NULL, null=True, blank=True, related_name='ventas')
    metodo_pago = models.CharField(max_length=20, choices=METODOS_PAGO)
    monto_efectivo = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    monto_electronico = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    descuento = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    notas = models.TextField(blank=True)
    
    class Meta:
        verbose_name = 'Venta'
        verbose_name_plural = 'Ventas'
        ordering = ['-fecha']
    
    def __str__(self):
        return f"{self.folio} - ${self.total} - {self.fecha.strftime('%Y-%m-%d')}"


class DetalleVenta(models.Model):
    """
    Detalle de productos/servicios en una venta
    """
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey('inventario.Producto', on_delete=models.PROTECT, null=True, blank=True)
    servicio = models.ForeignKey('ventas.Servicio', on_delete=models.PROTECT, null=True, blank=True)
    descripcion = models.CharField(max_length=200)
    cantidad = models.IntegerField()
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    
    class Meta:
        verbose_name = 'Detalle de Venta'
        verbose_name_plural = 'Detalles de Venta'
    
    def __str__(self):
        return f"{self.venta.folio} - {self.descripcion}"


class Servicio(models.Model):
    """
    Catálogo de servicios
    """
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    precio = models.DecimalField(max_digits=10, decimal_places=2)
    activo = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = 'Servicio'
        verbose_name_plural = 'Servicios'
        ordering = ['nombre']
    
    def __str__(self):
        return f"{self.nombre} - ${self.precio}"
