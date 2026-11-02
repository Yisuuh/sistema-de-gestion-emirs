"""
Permisos personalizados para la aplicación de Usuarios y RBAC
"""
from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """
    Permite acceso únicamente a usuarios con rol 'admin', 'is_superuser' o 'is_staff'.
    """
    message = "Acceso restringido a administradores."

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            (getattr(request.user, 'rol', None) == 'admin' or request.user.is_superuser or request.user.is_staff)
        )


class IsSelf(permissions.BasePermission):
    """
    Permite acceso a un usuario sobre su propio registro de cuenta.
    """
    message = "Solo puedes modificar o consultar tu propia información."

    def has_object_permission(self, request, view, obj):
        return bool(
            request.user and
            request.user.is_authenticated and
            obj.pk == request.user.pk
        )


class IsAdminOrSelf(permissions.BasePermission):
    """
    Permite acceso si el usuario es Administrador o si es el dueño del objeto.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if getattr(request.user, 'rol', None) == 'admin' or request.user.is_superuser or request.user.is_staff:
            return True
        return obj.pk == request.user.pk
