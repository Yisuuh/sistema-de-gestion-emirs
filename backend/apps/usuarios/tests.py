from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.nomina.models import Empleado, PeriodoNomina, LineaNomina

Usuario = get_user_model()


class UsuarioModelAndAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(
            username='admin_test',
            password='Password123!',
            rol='admin',
            first_name='Don',
            last_name='Emir'
        )
        self.admin.set_pin('1234')
        self.admin.save()

        self.vendedor = Usuario.objects.create_user(
            username='vendedor_test',
            password='Password123!',
            rol='vendedor',
            first_name='Carlos',
            last_name='Ventas'
        )

    def test_pin_hashing_and_verification(self):
        self.assertTrue(self.admin.check_pin('1234'))
        self.assertFalse(self.admin.check_pin('9999'))
        self.assertTrue(self.admin.tiene_pin)
        self.assertTrue(self.admin.es_admin)

        self.assertFalse(self.vendedor.check_pin('1234'))
        self.assertFalse(self.vendedor.tiene_pin)
        self.assertFalse(self.vendedor.es_admin)

    def test_custom_jwt_login_contains_required_fields(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'admin_test',
            'password': 'Password123!'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        # Token payload and direct response fields
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['user_id'], self.admin.id)
        self.assertEqual(data['username'], 'admin_test')
        self.assertEqual(data['rol'], 'admin')
        self.assertTrue(data['es_admin'])
        self.assertTrue(data['tiene_pin'])
        self.assertEqual(data['nombre_completo'], 'Don Emir')

    def test_usuario_me_endpoint(self):
        self.client.force_authenticate(user=self.vendedor)
        response = self.client.get('/api/usuarios/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['username'], 'vendedor_test')
        self.assertEqual(data['rol'], 'vendedor')
        self.assertFalse(data['tiene_pin'])

    def test_vendedor_cannot_list_other_users(self):
        self.client.force_authenticate(user=self.vendedor)
        response = self.client.get('/api/usuarios/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_and_list_users(self):
        self.client.force_authenticate(user=self.admin)
        list_resp = self.client.get('/api/usuarios/')
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)

        create_resp = self.client.post('/api/usuarios/', {
            'username': 'nuevo_vendedor',
            'password': 'NewPassword123!',
            'rol': 'vendedor',
            'first_name': 'Ana',
            'last_name': 'López',
            'pin': '5678'
        })
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        nuevo_user = Usuario.objects.get(username='nuevo_vendedor')
        self.assertTrue(nuevo_user.check_pin('5678'))
        self.assertEqual(nuevo_user.rol, 'vendedor')

    def test_cambiar_pin_action(self):
        self.client.force_authenticate(user=self.vendedor)
        # Self user can change their own pin
        resp = self.client.post(f'/api/usuarios/{self.vendedor.id}/cambiar_pin/', {
            'pin': '4321'
        })
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.vendedor.refresh_from_db()
        self.assertTrue(self.vendedor.check_pin('4321'))

    def test_validar_pin_maestro(self):
        self.client.force_authenticate(user=self.vendedor)
        resp_ok = self.client.post('/api/usuarios/validar_pin_maestro/', {'pin': '1234'})
        self.assertEqual(resp_ok.status_code, status.HTTP_200_OK)
        self.assertTrue(resp_ok.json()['valido'])

        resp_fail = self.client.post('/api/usuarios/validar_pin_maestro/', {'pin': '0000'})
        self.assertEqual(resp_fail.status_code, status.HTTP_400_BAD_REQUEST)


class NominaRBACLockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(
            username='admin_nomina',
            password='Password123!',
            rol='admin'
        )
        self.vendedor = Usuario.objects.create_user(
            username='vendedor_nomina',
            password='Password123!',
            rol='vendedor'
        )
        self.empleado = Empleado.objects.create(
            nombre='Juan',
            apellido='Pérez',
            puesto='Mecánico',
            salario_base=Decimal('2500.00'),
            metodo_pago='efectivo',
            tipo_pago='semanal',
            fecha_ingreso='2026-01-01'
        )

    def test_vendedor_is_forbidden_from_nomina_endpoints(self):
        self.client.force_authenticate(user=self.vendedor)

        # Empleados
        resp_emp = self.client.get('/api/nomina/empleados/')
        self.assertEqual(resp_emp.status_code, status.HTTP_403_FORBIDDEN)

        # Periodos
        resp_per = self.client.get('/api/nomina/periodos/')
        self.assertEqual(resp_per.status_code, status.HTTP_403_FORBIDDEN)

        # Lineas
        resp_lin = self.client.get('/api/nomina/lineas/')
        self.assertEqual(resp_lin.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_is_allowed_in_nomina_endpoints(self):
        self.client.force_authenticate(user=self.admin)

        resp_emp = self.client.get('/api/nomina/empleados/')
        self.assertEqual(resp_emp.status_code, status.HTTP_200_OK)

        resp_per = self.client.get('/api/nomina/periodos/')
        self.assertEqual(resp_per.status_code, status.HTTP_200_OK)

        resp_lin = self.client.get('/api/nomina/lineas/')
        self.assertEqual(resp_lin.status_code, status.HTTP_200_OK)
