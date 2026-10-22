from django.db import models


class Cliente(models.Model):
    """
    Registro de clientes
    """
    nombre = models.CharField(max_length=200)
    telefono = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    rfc = models.CharField(max_length=13, blank=True)
    direccion = models.TextField(blank=True)
    notas = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Cliente'
        verbose_name_plural = 'Clientes'
        ordering = ['nombre']
    
    def __str__(self):
        return f"{self.nombre} - {self.telefono}"


class Vehiculo(models.Model):
    """
    Vehículos de clientes (Expediente Clínico Automotriz)
    """
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='vehiculos')
    marca = models.CharField(max_length=50)
    modelo = models.CharField(max_length=50)
    año = models.IntegerField()
    placas = models.CharField(max_length=15, blank=True, db_index=True)
    color = models.CharField(max_length=30, blank=True, default='')
    medida_llantas = models.CharField(max_length=20, blank=True, default='')
    medida_llanta_delantera = models.CharField(max_length=25, blank=True, default='')
    medida_llanta_trasera = models.CharField(max_length=25, blank=True, default='')
    kilometraje_ultimo = models.PositiveIntegerField(null=True, blank=True, default=0)
    fecha_ultimo_servicio = models.DateField(null=True, blank=True)
    fecha_proximo_servicio = models.DateField(null=True, blank=True)
    notas = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Vehículo'
        verbose_name_plural = 'Vehículos'
        ordering = ['cliente', 'marca', 'modelo']

    def save(self, *args, **kwargs):
        if not self.medida_llanta_delantera and self.medida_llantas:
            self.medida_llanta_delantera = self.medida_llantas
        elif not self.medida_llantas and self.medida_llanta_delantera:
            self.medida_llantas = self.medida_llanta_delantera[:20]
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.marca} {self.modelo} {self.año} ({self.placas}) - {self.cliente.nombre}"

