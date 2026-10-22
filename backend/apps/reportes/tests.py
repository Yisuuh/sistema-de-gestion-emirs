from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.nomina.models import Empleado, PeriodoNomina
from apps.clientes.models import Cliente
from apps.caja.models import Caja
from apps.inventario.models import Marca, Proveedor, Producto, EntradaInventario, PagoProveedor, SalidaInventario
from apps.ventas.models import Venta, DetalleVenta, Servicio
from apps.rescates.models import UnidadMovil, TipoServicioRescate, Rescate, DetalleRescate
from apps.gastos.models import CategoriaGasto, Gasto


class ReportesBalanceGlobalTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.user = Usuario.objects.create_user(
            username='admin_reportes',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.client.force_authenticate(user=self.user)

        self.empleado = Empleado.objects.create(
            nombre='Alejandro',
            apellido='López',
            puesto='Encargado',
            salario_base=Decimal('3500.00'),
            comision_porcentaje=Decimal('5.00')
        )

        self.cliente = Cliente.objects.create(
            nombre='Cliente Reportes',
            telefono='6141230000'
        )

        # 1. Venta de taller
        self.venta = Venta.objects.create(
            folio='V-000001',
            empleado=self.empleado,
            cliente=self.cliente,
            metodo_pago='efectivo',
            monto_efectivo=Decimal('3000.00'),
            monto_electronico=Decimal('0.00'),
            subtotal=Decimal('3000.00'),
            total=Decimal('3000.00')
        )
        DetalleVenta.objects.create(
            venta=self.venta,
            descripcion='Llanta 205/55R16',
            cantidad=2,
            precio_unitario=Decimal('1500.00'),
            subtotal=Decimal('3000.00')
        )

        # 2. Rescate vial completado
        self.unidad = UnidadMovil.objects.create(
            numero_economico='MOV-99',
            nombre='Unidad Rescate 99'
        )
        self.rescate = Rescate.objects.create(
            folio='RES-000099',
            operador=self.empleado,
            unidad=self.unidad,
            nombre_cliente='Cliente Carretera',
            telefono_cliente='6149998877',
            ubicacion_texto='Carretera a Aldama',
            metodo_pago='tarjeta',
            tipo_tarjeta='debito',
            monto_efectivo=Decimal('0.00'),
            monto_electronico=Decimal('800.00'),
            subtotal=Decimal('800.00'),
            total=Decimal('800.00'),
            estado='completado',
            fecha_cierre=timezone.now()
        )

        # 3. Gasto operativo
        self.cat_gasto = CategoriaGasto.objects.create(nombre='Mantenimiento General', tipo='operativo')
        self.gasto = Gasto.objects.create(
            concepto='Compra de parches y válvulas',
            categoria=self.cat_gasto,
            monto=Decimal('300.00'),
            metodo_pago='efectivo',
            fecha=timezone.localdate()
        )

        # 4. Nómina pagada
        hoy = timezone.localdate()
        self.nomina = PeriodoNomina.objects.create(
            fecha_inicio=hoy.replace(day=1),
            fecha_fin=hoy,
            estado='pagada',
            total_general=Decimal('1500.00'),
            total_efectivo=Decimal('1000.00'),
            total_transferencia=Decimal('500.00'),
            total_comisiones=Decimal('200.00'),
            total_domingos=Decimal('0.00')
        )

        # 5. Pago a proveedor
        self.proveedor = Proveedor.objects.create(nombre='Distribuidora del Norte')
        self.pago_prov = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('1200.00'),
            fecha=hoy,
            referencia='TRANSF-987123'
        )

    def test_balance_global_endpoint(self):
        url = '/api/reportes/balance-global/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        self.assertIn('resumen_ejecutivo', data)
        self.assertIn('desglose_ingresos', data)
        self.assertIn('nomina', data)
        self.assertIn('proveedores', data)
        self.assertIn('gastos', data)

        resumen = data['resumen_ejecutivo']
        # Ingresos taller (3000) + rescates (800) = 3800
        self.assertEqual(resumen['ingresos_taller'], 3000.0)
        self.assertEqual(resumen['ingresos_rescates'], 800.0)
        self.assertEqual(resumen['total_ingresos'], 3800.0)

        # Egresos: gastos (300) + nomina (1500) + proveedor (1200) = 3000
        self.assertEqual(resumen['egresos_gastos'], 300.0)
        self.assertEqual(resumen['egresos_nomina'], 1500.0)
        self.assertEqual(resumen['egresos_proveedores'], 1200.0)
        self.assertEqual(resumen['total_egresos_flujo'], 3000.0)

        # Flujo neto disponible = 3800 - 3000 = 800
        self.assertEqual(resumen['flujo_neto_disponible'], 800.0)

        # Desglose de ingresos
        desglose = data['desglose_ingresos']
        self.assertEqual(desglose['efectivo'], 3000.0)
        self.assertEqual(desglose['tarjeta_debito'], 800.0)

    def test_minuta_pdf_endpoint(self):
        url = '/api/reportes/pdf/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertTrue(len(res.content) > 1000)
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_backup_sistema_estadisticas_y_descarga_zip(self):
        import io
        import json
        import zipfile

        # 1. Estadísticas GET /api/reportes/backup/
        res_stats = self.client.get('/api/reportes/backup/')
        self.assertEqual(res_stats.status_code, status.HTTP_200_OK)
        self.assertIn('clientes', res_stats.data)
        self.assertIn('ventas', res_stats.data)
        self.assertIn('cotizaciones', res_stats.data)

        # 2. Descarga ZIP POST /api/reportes/backup/
        res_zip = self.client.post('/api/reportes/backup/')
        self.assertEqual(res_zip.status_code, status.HTTP_200_OK)
        self.assertEqual(res_zip['Content-Type'], 'application/zip')
        self.assertIn('Respaldo_EmirS_', res_zip['Content-Disposition'])

        zf = zipfile.ZipFile(io.BytesIO(res_zip.content))
        namelist = zf.namelist()
        self.assertIn('full_database_dump.json', namelist)
        self.assertIn('manifest.json', namelist)

        manifest = json.loads(zf.read('manifest.json').decode('utf-8'))
        self.assertEqual(manifest['generado_por'], self.user.username)
        self.assertIn('conteos_tablas', manifest)

        # 3. Operador recibe 403 Forbidden
        operador = Usuario.objects.create_user(
            username='op_backup',
            password='password123',
            rol='operador'
        )
        self.client.force_authenticate(user=operador)
        res_op_get = self.client.get('/api/reportes/backup/')
        self.assertEqual(res_op_get.status_code, status.HTTP_403_FORBIDDEN)
        res_op_post = self.client.post('/api/reportes/backup/')
        self.assertEqual(res_op_post.status_code, status.HTTP_403_FORBIDDEN)

