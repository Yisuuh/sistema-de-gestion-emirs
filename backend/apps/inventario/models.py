"""
Modelos para el módulo de Inventario
"""
from django.db import models
from django.db.models import Sum


class Marca(models.Model):
    """
    Marcas de llantas (Nexen, Pirelli, Bridgestone, etc.)
    """
    nombre = models.CharField(max_length=100, unique=True)
    logo = models.ImageField(upload_to='marcas/', null=True, blank=True)
    activa = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Marca'
        verbose_name_plural = 'Marcas'
        ordering = ['nombre']
    
    def __str__(self):
        return self.nombre


class Proveedor(models.Model):
    """
    Proveedores de llantas
    """
    nombre = models.CharField(max_length=200, unique=True)
    contacto = models.CharField(max_length=200, blank=True)
    telefono = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.TextField(blank=True)
    dias_credito = models.IntegerField(default=0, help_text='Días de crédito otorgados')
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Proveedor'
        verbose_name_plural = 'Proveedores'
        ordering = ['nombre']
    
    def __str__(self):
        return self.nombre


class Producto(models.Model):
    """
    Productos (llantas) en inventario
    """
    INDICES_VELOCIDAD = [
        ('T', 'T - hasta 190 km/h'),
        ('H', 'H - hasta 210 km/h'),
        ('V', 'V - hasta 240 km/h'),
        ('W', 'W - hasta 270 km/h'),
        ('Y', 'Y - hasta 300 km/h'),
        ('Z', 'Z - más de 240 km/h'),
    ]
    
    codigo = models.CharField(max_length=50, unique=True, help_text='Código único del producto')
    medida = models.CharField(max_length=20, help_text='Ej: 225/65R17')
    marca = models.ForeignKey(Marca, on_delete=models.PROTECT, related_name='productos')
    modelo = models.CharField(max_length=100, help_text='Ej: Scorpion ATR')
    indice_carga = models.IntegerField(help_text='Ej: 82, 84, 87')
    indice_velocidad = models.CharField(max_length=2, choices=INDICES_VELOCIDAD)
    precio_venta = models.DecimalField(max_digits=10, decimal_places=2)
    precio_descuento = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    stock_minimo = models.IntegerField(default=2, help_text='Alerta cuando stock sea menor a este valor')
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Producto'
        verbose_name_plural = 'Productos'
        ordering = ['medida', 'marca', 'modelo']
    
    def __str__(self):
        return f"{self.codigo} - {self.marca} {self.modelo} {self.medida}"
    
    @property
    def descripcion_completa(self):
        return f"{self.marca.nombre} {self.modelo} {self.medida} {self.indice_carga}{self.indice_velocidad}"
    
    @property
    def stock_actual(self):
        """Calcula el stock actual (entradas - salidas)"""
        entradas = self.entradas.aggregate(total=Sum('cantidad'))['total'] or 0
        salidas = self.salidas.aggregate(total=Sum('cantidad'))['total'] or 0
        return entradas - salidas
    
    @property
    def tiene_stock_bajo(self):
        """Verifica si el stock está por debajo del mínimo"""
        return self.stock_actual <= self.stock_minimo
    
    @property
    def stock_agotado(self):
        """Verifica si el producto está agotado"""
        return self.stock_actual <= 0


class EntradaInventario(models.Model):
    """
    Registro de entradas de inventario (compras a proveedores)
    """
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT, related_name='entradas')
    proveedor = models.ForeignKey(Proveedor, on_delete=models.PROTECT, related_name='entradas')
    cantidad = models.IntegerField()
    precio_compra = models.DecimalField(max_digits=10, decimal_places=2, help_text='Precio unitario de compra')
    fecha_compra = models.DateField()
    numero_factura = models.CharField(max_length=50)
    en_inventario = models.BooleanField(default=True, help_text='Si las llantas están en inventario')
    factura_consumida = models.BooleanField(default=False, help_text='Si la factura fue completamente vendida')
    notas = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('usuarios.Usuario', on_delete=models.SET_NULL, null=True, related_name='entradas_creadas')
    
    class Meta:
        verbose_name = 'Entrada de Inventario'
        verbose_name_plural = 'Entradas de Inventario'
        ordering = ['-fecha_compra', '-created_at']
    
    def __str__(self):
        return f"{self.producto.codigo} - {self.cantidad} unidades - {self.fecha_compra}"
    
    @property
    def total_compra(self):
        """Total de la compra"""
        return self.cantidad * self.precio_compra


class SalidaInventario(models.Model):
    """
    Registro de salidas de inventario (ventas)
    Se crea automáticamente cuando se realiza una venta
    """
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT, related_name='salidas')
    venta = models.ForeignKey('ventas.Venta', on_delete=models.CASCADE, null=True, related_name='salidas_inventario')
    cantidad = models.IntegerField()
    precio_venta = models.DecimalField(max_digits=10, decimal_places=2, help_text='Precio unitario de venta')
    precio_costo = models.DecimalField(max_digits=10, decimal_places=2, help_text='Precio unitario de costo')
    utilidad = models.DecimalField(max_digits=10, decimal_places=2, editable=False)
    fecha_venta = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Salida de Inventario'
        verbose_name_plural = 'Salidas de Inventario'
        ordering = ['-fecha_venta', '-created_at']
    
    def __str__(self):
        return f"{self.producto.codigo} - {self.cantidad} unidades - {self.fecha_venta}"
    
    def save(self, *args, **kwargs):
        """Calcula automáticamente la utilidad"""
        self.utilidad = (self.precio_venta - self.precio_costo) * self.cantidad
        super().save(*args, **kwargs)
    
    @property
    def total_venta(self):
        """Total de la venta"""
        return self.cantidad * self.precio_venta
