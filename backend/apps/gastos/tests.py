from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado
from apps.gastos.models import Gasto, CategoriaGasto
from apps.caja.models import Caja


class GastosModuleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(
            username='admin_gastos',
            password='Password123!',
            rol='admin'
        )
        self.empleado = Empleado.objects.create(
            nombre='Carlos',
            apellido='Gastos',
            puesto='Administrador'
        )
        self.categoria = CategoriaGasto.objects.create(
            nombre='Herramientas y Refacciones',
            tipo='operativo'
        )
        self.client.force_authenticate(user=self.admin)

    def test_crear_gasto_tarjeta_debito(self):
        payload = {
            'concepto': 'Compra de llaves milimétricas',
            'monto': '750.50',
            'categoria': self.categoria.id,
            'metodo_pago': 'tarjeta_debito',
            'notas': 'Pagado con tarjeta de débito del taller'
        }
        res = self.client.post('/api/gastos/gastos/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['metodo_pago'], 'tarjeta_debito')
        self.assertEqual(Decimal(res.data['monto']), Decimal('750.50'))

        gasto = Gasto.objects.get(id=res.data['id'])
        self.assertEqual(gasto.metodo_pago, 'tarjeta_debito')
        self.assertEqual(gasto.concepto, 'Compra de llaves milimétricas')

    def test_crear_gasto_tarjeta_credito(self):
        payload = {
            'concepto': 'Compra de compresor a crédito',
            'monto': '3200.00',
            'categoria': self.categoria.id,
            'metodo_pago': 'tarjeta_credito',
            'notas': 'Pagado con tarjeta de crédito empresarial'
        }
        res = self.client.post('/api/gastos/gastos/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['metodo_pago'], 'tarjeta_credito')
        self.assertEqual(Decimal(res.data['monto']), Decimal('3200.00'))

        gasto = Gasto.objects.get(id=res.data['id'])
        self.assertEqual(gasto.metodo_pago, 'tarjeta_credito')
        self.assertEqual(gasto.concepto, 'Compra de compresor a crédito')

    def test_crear_gasto_efectivo_con_caja(self):
        caja = Caja.objects.create(
            folio='C-GASTO01',
            monto_inicial=Decimal('1000.00'),
            empleado_apertura=self.empleado,
            estado='abierta'
        )
        payload = {
            'concepto': 'Insumos de limpieza',
            'monto': '150.00',
            'categoria': self.categoria.id,
            'metodo_pago': 'efectivo',
            'caja': caja.id
        }
        res = self.client.post('/api/gastos/gastos/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['metodo_pago'], 'efectivo')
        self.assertEqual(res.data['caja'], caja.id)

    def test_listar_y_filtrar_gastos(self):
        Gasto.objects.create(
            concepto='Gasto Débito 1',
            monto=Decimal('100.00'),
            categoria=self.categoria,
            metodo_pago='tarjeta_debito'
        )
        Gasto.objects.create(
            concepto='Gasto Crédito 1',
            monto=Decimal('200.00'),
            categoria=self.categoria,
            metodo_pago='tarjeta_credito'
        )
        res = self.client.get('/api/gastos/gastos/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should contain both expenses
        results = res.data.get('results', res.data)
        metodos = [g['metodo_pago'] for g in results]
        self.assertIn('tarjeta_debito', metodos)
        self.assertIn('tarjeta_credito', metodos)
