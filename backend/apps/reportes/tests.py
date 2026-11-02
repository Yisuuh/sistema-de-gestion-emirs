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

    def test_segregacion_llantas_rescate_en_balance(self):
        """Verifica que las llantas vendidas en rescates se agreguen a ingresos_taller y no a ingresos_rescates."""
        # Agregar una llanta vendida en el rescate existente (800 total = 500 servicio + 300 llanta)
        marca = Marca.objects.create(nombre='Yokohama')
        prod = Producto.objects.create(
            codigo='YOK-10',
            medida='185/65R15',
            marca=marca,
            modelo='Bluearth',
            indice_carga=88,
            indice_velocidad='H',
            precio_venta=Decimal('300.00')
        )
        DetalleRescate.objects.create(
            rescate=self.rescate,
            producto=prod,
            descripcion='Llanta auxilio',
            cantidad=1,
            precio_unitario=Decimal('300.00'),
            subtotal=Decimal('300.00')
        )

        res = self.client.get('/api/reportes/balance-global/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        resumen = res.data['resumen_ejecutivo']
        # Taller antes: 3000 + 300 (llanta en rescate) = 3300
        self.assertEqual(resumen['ingresos_taller'], 3300.0)
        # Rescate antes: 800 - 300 = 500
        self.assertEqual(resumen['ingresos_rescates'], 500.0)
        # Total sigue siendo 3800
        self.assertEqual(resumen['total_ingresos'], 3800.0)

    def test_reporte_pagos_proveedores_pdf(self):
        """Verifica la generación del reporte PDF contable de pagos a proveedores."""
        url = '/api/reportes/pagos-proveedores/pdf/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/pdf')
        self.assertIn('reporte_pagos_proveedores_', res['Content-Disposition'])
        self.assertTrue(res.content.startswith(b'%PDF'))

    def test_reporte_pagos_proveedores_excel(self):
        """Verifica la generación del reporte Excel (.xlsx) de pagos a proveedores."""
        import openpyxl
        import io
        url = '/api/reportes/pagos-proveedores/excel/'
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.assertIn('reporte_pagos_proveedores_', res['Content-Disposition'])

        wb = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertIn("Pagos a Proveedores", wb.sheetnames)
        ws = wb["Pagos a Proveedores"]
        self.assertIn("Centro Llantero EmirS", ws['A1'].value)

    def test_reporte_pagos_proveedores_anonimo_401(self):
        """Verifica que un usuario anónimo reciba 401 Unauthorized al intentar descargar reportes contables."""
        anon_client = APIClient()
        res_pdf = anon_client.get('/api/reportes/pagos-proveedores/pdf/')
        self.assertEqual(res_pdf.status_code, status.HTTP_401_UNAUTHORIZED)

        res_excel = anon_client.get('/api/reportes/pagos-proveedores/excel/')
        self.assertEqual(res_excel.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reporte_pagos_proveedores_operador_403(self):
        """Verifica que un usuario operador reciba 403 Forbidden al intentar descargar reportes contables."""
        op_user = Usuario.objects.create_user(
            username='operador_test',
            password='password123',
            rol='operador',
            is_staff=False
        )
        op_client = APIClient()
        op_client.force_authenticate(user=op_user)

        res_pdf = op_client.get('/api/reportes/pagos-proveedores/pdf/')
        self.assertEqual(res_pdf.status_code, status.HTTP_403_FORBIDDEN)

        res_excel = op_client.get('/api/reportes/pagos-proveedores/excel/')
        self.assertEqual(res_excel.status_code, status.HTTP_403_FORBIDDEN)

    def test_reporte_contable_excel_exitoso(self):
        """Verifica la generación del libro Excel contable de 4 hojas con fórmulas y estilos."""
        import openpyxl
        import io

        marca = Marca.objects.create(nombre='Michelin')
        prod = Producto.objects.create(
            codigo='MICH-001',
            medida='205/55R16',
            marca=marca,
            modelo='Primacy 4',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2200.00'),
            precio_descuento=Decimal('2100.00'),
            stock_minimo=2
        )
        entrada = EntradaInventario.objects.create(
            producto=prod,
            proveedor=self.proveedor,
            cantidad=10,
            precio_compra=Decimal('1500.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='FAC-1001',
            en_inventario=True
        )
        salida = SalidaInventario.objects.create(
            producto=prod,
            venta=self.venta,
            cantidad=4,
            precio_venta=Decimal('2200.00'),
            precio_costo=Decimal('1500.00'),
            fecha_venta=timezone.localdate()
        )

        res = self.client.get('/api/reportes/contable-excel/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        self.assertIn('reporte_contable_emirs_', res['Content-Disposition'])

        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            wb = openpyxl.load_workbook(io.BytesIO(res.content))
        self.assertEqual(len(wb.sheetnames), 4)
        self.assertEqual(wb.sheetnames[0], "Detalles De Salidas")
        self.assertEqual(wb.sheetnames[1], "Entradas de Producto")
        self.assertEqual(wb.sheetnames[2], "Salidas de Productos")
        self.assertEqual(wb.sheetnames[3], "Inventario Emir'S Centro Llantero")

        # ── Hoja 1: Detalles De Salidas ──
        ws1 = wb["Detalles De Salidas"]
        self.assertEqual(ws1.cell(row=1, column=1).value, 'ID')
        self.assertEqual(ws1.cell(row=1, column=6).value, 'Stock')
        self.assertEqual(ws1.cell(row=1, column=15).value, 'G. Unitaria')
        # Fila 2 de datos
        self.assertEqual(ws1.cell(row=2, column=3).value, '205/55R16')
        self.assertEqual(ws1.cell(row=2, column=6).value, 'VERDADERO')
        self.assertEqual(ws1.cell(row=2, column=7).value, 4)
        self.assertEqual(ws1.cell(row=2, column=15).value, '=L2-M2')
        # Totales ws1 (fila 3)
        self.assertEqual(ws1.cell(row=3, column=1).value, 'TOTALES')
        self.assertEqual(ws1.cell(row=3, column=7).value, '=SUM(G2:G2)')
        self.assertEqual(ws1.cell(row=3, column=15).value, '=SUM(O2:O2)')

        # ── Hoja 2: Entradas de Producto ──
        ws2 = wb["Entradas de Producto"]
        self.assertEqual(ws2.cell(row=1, column=1).value, 'Cod. Prod')
        self.assertEqual(ws2.cell(row=1, column=12).value, 'Inventario')
        self.assertEqual(ws2.cell(row=1, column=13).value, 'Factura Consumida')
        # Fila 2 de datos
        self.assertEqual(ws2.cell(row=2, column=1).value, 'MICH-001')
        self.assertEqual(ws2.cell(row=2, column=7).value, 10)
        self.assertEqual(ws2.cell(row=2, column=12).value, 'Si')
        self.assertEqual(ws2.cell(row=2, column=13).value, 'En Stock')
        # Totales ws2 (fila 3)
        self.assertEqual(ws2.cell(row=3, column=7).value, '=SUM(G2:G2)')
        self.assertEqual(ws2.cell(row=3, column=8).value, '=SUMPRODUCT(G2:G2, H2:H2)')

        # ── Hoja 3: Salidas de Productos ──
        ws3 = wb["Salidas de Productos"]
        self.assertEqual(ws3.cell(row=1, column=1).value, 'ID Sal')
        self.assertEqual(ws3.cell(row=1, column=6).value, 'Cantidad')
        # Fila 2 de datos
        self.assertEqual(ws3.cell(row=2, column=2).value, 'MICH-001')
        self.assertEqual(ws3.cell(row=2, column=6).value, 4)
        # Totales ws3 (fila 3)
        self.assertEqual(ws3.cell(row=3, column=6).value, '=SUM(F2:F2)')
        self.assertEqual(ws3.cell(row=3, column=7).value, '=SUMPRODUCT(F2:F2, G2:G2)')

        # ── Hoja 4: Inventario Emir'S Centro Llantero ──
        ws4 = wb["Inventario Emir'S Centro Llantero"]
        self.assertEqual(ws4.cell(row=1, column=1).value, 'Cod. Prod')
        self.assertEqual(ws4.cell(row=1, column=7).value, 'Stock')
        # Fila de datos
        mich_row = None
        for r in range(2, ws4.max_row):
            if ws4.cell(row=r, column=1).value == 'MICH-001':
                mich_row = r
                break
        self.assertIsNotNone(mich_row)
        self.assertEqual(ws4.cell(row=mich_row, column=5).value, 10)
        self.assertEqual(ws4.cell(row=mich_row, column=6).value, 4)
        self.assertEqual(ws4.cell(row=mich_row, column=7).value, f'=E{mich_row}-F{mich_row}')
        self.assertEqual(ws4.cell(row=mich_row, column=8).value, 2200.0)
        self.assertEqual(ws4.cell(row=mich_row, column=9).value, 1500.0)

    def test_reporte_contable_excel_filtros_fecha(self):
        """Verifica la filtración por rango de fechas y por mes/año."""
        hoy = timezone.localdate()
        # Filtro fecha_inicio / fecha_fin
        res1 = self.client.get(f'/api/reportes/contable-excel/?fecha_inicio={hoy}&fecha_fin={hoy}')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Filtro mes / año
        res2 = self.client.get(f'/api/reportes/contable-excel/?mes={hoy.month}&anio={hoy.year}')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

    def test_reporte_contable_excel_anonimo_401(self):
        """Verifica que un usuario anónimo no pueda descargar el reporte contable."""
        anon = APIClient()
        res = anon.get('/api/reportes/contable-excel/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reporte_contable_excel_operador_403(self):
        """Verifica que un usuario operador o vendedor no pueda descargar el reporte contable de costos."""
        vendedor = Usuario.objects.create_user(
            username='vendedor_contable',
            password='password123',
            rol='vendedor',
            is_staff=False
        )
        self.client.force_authenticate(user=vendedor)
        res = self.client.get('/api/reportes/contable-excel/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)




