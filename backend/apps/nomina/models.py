from django.db import models


class Empleado(models.Model):
    """
    Modelo de empleado (independiente del usuario del sistema)
    """
    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    puesto = models.CharField(max_length=100, blank=True)
    activo = models.BooleanField(default=True)
    fecha_ingreso = models.DateField(null=True, blank=True)
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

