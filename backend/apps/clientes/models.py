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
    Vehículos de clientes
    """
    cliente = models.ForeignKey(Cliente, on_delete=models.CASCADE, related_name='vehiculos')
    marca = models.CharField(max_length=50)
    modelo = models.CharField(max_length=50)
    año = models.IntegerField()
    placas = models.CharField(max_length=10, blank=True)
    medida_llantas = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Vehículo'
        verbose_name_plural = 'Vehículos'
        ordering = ['cliente', 'marca', 'modelo']
    
    def __str__(self):
        return f"{self.marca} {self.modelo} {self.año} - {self.cliente.nombre}"
