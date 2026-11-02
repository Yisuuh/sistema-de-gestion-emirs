from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado, PeriodoNomina, LineaNomina


class NominaTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = Usuario.objects.create_user(
            username='admin_nomina_app',
            password='Password123!',
            rol='admin'
        )
        self.empleado = Empleado.objects.create(
            nombre='Pedro',
            apellido='Llantero',
            puesto='Talachero',
            salario_base=Decimal('3000.00'),
            comision_porcentaje=Decimal('5.00'),
            activo=True
        )
        self.client.force_authenticate(user=self.admin)

    def test_creacion_empleado_y_periodo_nomina(self):
        self.assertEqual(str(self.empleado), 'Pedro Llantero')
        periodo = PeriodoNomina.objects.create(
            fecha_inicio='2026-10-19',
            fecha_fin='2026-10-25',
            estado='borrador',
            observaciones='Semana 43 - Octubre 2026'
        )
        self.assertEqual(periodo.estado, 'borrador')

        linea = LineaNomina.objects.create(
            periodo=periodo,
            empleado=self.empleado,
            sueldo=Decimal('3000.00'),
            bonos=Decimal('200.00'),
            comision=Decimal('150.00'),
            domingo=Decimal('0.00'),
            descuentos=Decimal('50.00')
        )
        # 3000 + 200 + 150 = 3350 total_percepciones
        # 3350 - 50 = 3300 neto
        self.assertEqual(linea.total_percepciones, Decimal('3350.00'))
        self.assertEqual(linea.descuentos, Decimal('50.00'))
        self.assertEqual(linea.neto, Decimal('3300.00'))

    def test_api_nomina_crud(self):
        res = self.client.get('/api/nomina/empleados/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data.get('results', res.data)), 1)
