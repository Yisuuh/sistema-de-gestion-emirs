"""
Modelos para el módulo de Usuarios
"""
from django.contrib.auth.models import AbstractUser
from django.db import models


class Usuario(AbstractUser):
    """
    Modelo de usuario personalizado
    """
    ROLES = [
        ('admin', 'Administrador'),
        ('vendedor', 'Vendedor'),
    ]
    
    rol = models.CharField(max_length=20, choices=ROLES, default='vendedor')
    telefono = models.CharField(max_length=20, blank=True)
    pin_seguridad = models.CharField(
        max_length=128, blank=True, null=True,
        help_text="Hash del PIN numérico de 4 a 6 dígitos para autorizaciones rápidas"
    )
    activo = models.BooleanField(default=True)
    fecha_ultimo_acceso = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'
        ordering = ['username']
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_rol_display()})"

    def set_pin(self, raw_pin):
        from django.contrib.auth.hashers import make_password
        self.pin_seguridad = make_password(str(raw_pin))

    def check_pin(self, raw_pin):
        from django.contrib.auth.hashers import check_password
        if not self.pin_seguridad:
            return False
        return check_password(str(raw_pin), self.pin_seguridad)

    @property
    def tiene_pin(self):
        return bool(self.pin_seguridad)

    @property
    def es_admin(self):
        return self.rol == 'admin' or self.is_superuser or self.is_staff



class LogAuditoria(models.Model):
    """
    Registro de auditoría para acciones importantes
    """
    ACCIONES = [
        ('crear', 'Crear'),
        ('editar', 'Editar'),
        ('eliminar', 'Eliminar'),
        ('login', 'Inicio de sesión'),
        ('logout', 'Cierre de sesión'),
    ]
    
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name='logs')
    accion = models.CharField(max_length=20, choices=ACCIONES)
    tabla = models.CharField(max_length=50)
    registro_id = models.IntegerField(null=True)
    datos_anteriores = models.JSONField(null=True, blank=True)
    datos_nuevos = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True)
    fecha = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        verbose_name = 'Log de Auditoría'
        verbose_name_plural = 'Logs de Auditoría'
        ordering = ['-fecha']
    
    def __str__(self):
        return f"{self.usuario} - {self.accion} - {self.tabla} ({self.fecha})"
