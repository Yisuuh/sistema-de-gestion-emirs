from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.usuarios.models import Usuario
from apps.inventario.models import Proveedor, PagoProveedor, Marca, Producto, EntradaInventario, SalidaInventario


class InventarioModuleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario autenticado
        self.admin_user = Usuario.objects.create_user(
            username='admin_inv',
            password='password123',
            rol='admin',
            is_staff=True
        )
        self.client.force_authenticate(user=self.admin_user)

        # Proveedor
        self.proveedor = Proveedor.objects.create(
            nombre='Llantas y Rines de México',
            contacto='Lic. Armando Paredes',
            telefono='6141234567',
            email='ventas@llantasyrines.com'
        )

    def test_actualizacion_parcial_patch_pago_proveedor(self):
        """
        Verifica que un PagoProveedor pueda ser actualizado parcialmente (PATCH)
        modificando metodo_pago y numero_factura sin alterar monto ni proveedor.
        """
        pago = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('15000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            numero_factura='FAC-ORIG-001',
            referencia='TR-889900',
            notas='Pago inicial acordado',
            registrado_por=self.admin_user
        )

        patch_url = f'/api/inventario/pagos-proveedores/{pago.id}/'
        payload = {
            'metodo_pago': 'efectivo',
            'numero_factura': 'FAC-MOD-999',
            'referencia': 'RECIBO-EFECTIVO-01',
            'notas': 'Se liquidó en caja en efectivo con recibo'
        }

        response = self.client.patch(patch_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        pago.refresh_from_db()
        # Campos modificados
        self.assertEqual(pago.metodo_pago, 'efectivo')
        self.assertEqual(pago.numero_factura, 'FAC-MOD-999')
        self.assertEqual(pago.referencia, 'RECIBO-EFECTIVO-01')
        self.assertEqual(pago.notas, 'Se liquidó en caja en efectivo con recibo')

        # Campos intactos
        self.assertEqual(pago.monto, Decimal('15000.00'))
        self.assertEqual(pago.proveedor, self.proveedor)
        self.assertEqual(pago.registrado_por, self.admin_user)

    def test_creacion_pago_proveedor_via_api(self):
        """
        Verifica el registro de un nuevo pago a proveedor vía POST asignando registrado_por.
        """
        post_url = '/api/inventario/pagos-proveedores/'
        payload = {
            'proveedor': self.proveedor.id,
            'monto': '7500.00',
            'fecha': str(timezone.localdate()),
            'metodo_pago': 'cheque',
            'numero_factura': 'FAC-2026-CHQ',
            'referencia': 'CHQ-5544',
            'notas': 'Cheque nominativo entregado al agente'
        }

        response = self.client.post(post_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(PagoProveedor.objects.count(), 1)

        pago = PagoProveedor.objects.get(id=response.data['id'])
        self.assertEqual(pago.monto, Decimal('7500.00'))
        self.assertEqual(pago.metodo_pago, 'cheque')
        self.assertEqual(pago.numero_factura, 'FAC-2026-CHQ')
        self.assertEqual(pago.registrado_por, self.admin_user)

    def test_adeudo_proveedor_calculo(self):
        """
        Verifica el cálculo de adeudo pendiente (entradas pendientes menos pagos realizados).
        """
        marca = Marca.objects.create(nombre='Goodyear')
        producto = Producto.objects.create(
            codigo='GY-100',
            medida='225/60R17',
            marca=marca,
            modelo='Assurance',
            indice_carga=99,
            indice_velocidad='H',
            precio_venta=Decimal('2500.00')
        )

        # Entrada de compra con saldo a pagar (10 piezas * 1500 = 15,000)
        EntradaInventario.objects.create(
            producto=producto,
            proveedor=self.proveedor,
            cantidad=10,
            precio_compra=Decimal('1500.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='FAC-TOTAL-15K',
            created_by=self.admin_user
        )

        # Pago de abono por 5,000
        PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('5000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            numero_factura='FAC-TOTAL-15K',
            registrado_por=self.admin_user
        )

        # Consultar detalle de adeudo del proveedor
        res = self.client.get(f'/api/inventario/adeudos/{self.proveedor.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data['proveedor_nombre'], self.proveedor.nombre)
        self.assertEqual(Decimal(str(data['monto_total_deuda'])), Decimal('15000.00'))
        self.assertEqual(Decimal(str(data['monto_pagado'])), Decimal('5000.00'))
        self.assertEqual(Decimal(str(data['saldo_pendiente'])), Decimal('10000.00'))

    def test_operador_denegado_modificar_eliminar_pago_proveedor(self):
        """SEC-01: Operador no puede modificar ni eliminar pagos a proveedores."""
        operador = Usuario.objects.create_user(
            username='operador_inv',
            password='password123',
            rol='operador'
        )
        pago = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('3000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            registrado_por=self.admin_user
        )

        self.client.force_authenticate(user=operador)
        patch_res = self.client.patch(f'/api/inventario/pagos-proveedores/{pago.id}/', {'notas': 'hack'})
        self.assertEqual(patch_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('Solo los administradores pueden modificar o eliminar pagos a proveedores.', str(patch_res.data))

        del_res = self.client.delete(f'/api/inventario/pagos-proveedores/{pago.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_impedir_modificacion_monto_y_proveedor_en_actualizacion(self):
        """SEC-01: No se permite modificar monto ni proveedor en actualización."""
        otro_proveedor = Proveedor.objects.create(nombre='Segundo Proveedor')
        pago = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('4000.00'),
            fecha=timezone.localdate(),
            metodo_pago='transferencia',
            registrado_por=self.admin_user
        )

        # Intento de cambiar monto
        res_monto = self.client.patch(
            f'/api/inventario/pagos-proveedores/{pago.id}/',
            {'monto': '9999.00'},
            format='json'
        )
        self.assertEqual(res_monto.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('monto', res_monto.data)

        # Intento de cambiar proveedor
        res_prov = self.client.patch(
            f'/api/inventario/pagos-proveedores/{pago.id}/',
            {'proveedor': otro_proveedor.id},
            format='json'
        )
        self.assertEqual(res_prov.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('proveedor', res_prov.data)

    def test_validacion_archivo_comprobante_tamano_y_extension(self):
        """SEC-02: Validar tamaño máximo 5MB y extensiones permitidas en comprobante."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        # Archivo > 5 MB
        archivo_pesado = SimpleUploadedFile(
            'comprobante.pdf',
            b'x' * (6 * 1024 * 1024),
            content_type='application/pdf'
        )
        res_pesado = self.client.post(
            '/api/inventario/pagos-proveedores/',
            {
                'proveedor': self.proveedor.id,
                'monto': '1000.00',
                'fecha': str(timezone.localdate()),
                'metodo_pago': 'transferencia',
                'comprobante': archivo_pesado
            },
            format='multipart'
        )
        self.assertEqual(res_pesado.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('comprobante', res_pesado.data)

        # Archivo con extensión no permitida
        archivo_invalido = SimpleUploadedFile(
            'script.exe',
            b'malicious content',
            content_type='application/x-msdownload'
        )
        res_invalido = self.client.post(
            '/api/inventario/pagos-proveedores/',
            {
                'proveedor': self.proveedor.id,
                'monto': '1000.00',
                'fecha': str(timezone.localdate()),
                'metodo_pago': 'transferencia',
                'comprobante': archivo_invalido
            },
            format='multipart'
        )
        self.assertEqual(res_invalido.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('comprobante', res_invalido.data)

    def test_buscador_inteligente_medidas(self):
        """
        Verifica que búsquedas como '2055516', '205 55 16', '205-55-16' o '205/55R16'
        encuentren productos con medida '205/55 R16' o '205/55R16'.
        """
        marca = Marca.objects.create(nombre='Bridgestone')
        p1 = Producto.objects.create(
            codigo='BS-2055516',
            medida='205/55R16',
            marca=marca,
            modelo='Turanza',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2100.00')
        )
        p2 = Producto.objects.create(
            codigo='BS-2055516-B',
            medida='205/55 R16',
            marca=marca,
            modelo='Ecopia',
            indice_carga=91,
            indice_velocidad='H',
            precio_venta=Decimal('1950.00')
        )

        for termino in ['2055516', '205 55 16', '205-55-16', '205/55R16']:
            res = self.client.get(f'/api/inventario/productos/?search={termino}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            items = res.data.get('results', res.data)
            ids = [item['id'] for item in items]
            self.assertIn(p1.id, ids, f"Falló búsqueda para término: {termino}")
            self.assertIn(p2.id, ids, f"Falló búsqueda para término: {termino}")

    def test_fecha_vencimiento_automatica_y_alertas(self):
        """Verifica el cálculo automático de fecha_vencimiento y las propiedades de alerta."""
        from datetime import timedelta
        prov_credito = Proveedor.objects.create(
            nombre='Proveedor Crédito S.A.',
            dias_credito=15
        )
        marca = Marca.objects.create(nombre='Continental')
        producto = Producto.objects.create(
            codigo='CONT-1',
            medida='195/65R15',
            marca=marca,
            modelo='ContiPremium',
            indice_carga=91,
            indice_velocidad='H',
            precio_venta=Decimal('1800.00')
        )
        hoy = timezone.localdate()
        entrada = EntradaInventario.objects.create(
            producto=producto,
            proveedor=prov_credito,
            cantidad=4,
            precio_compra=Decimal('1200.00'),
            fecha_compra=hoy,
            numero_factura='FAC-AUTO-15'
        )
        self.assertEqual(entrada.fecha_vencimiento, hoy + timedelta(days=15))
        self.assertEqual(entrada.dias_restantes, 15)
        self.assertEqual(entrada.estado_alerta, 'al_dia')

        # Probar factura vencida
        entrada_vencida = EntradaInventario.objects.create(
            producto=producto,
            proveedor=prov_credito,
            cantidad=2,
            precio_compra=Decimal('1200.00'),
            fecha_compra=hoy - timedelta(days=20),
            fecha_vencimiento=hoy - timedelta(days=5),
            numero_factura='FAC-VENCIDA'
        )
        self.assertLess(entrada_vencida.dias_restantes, 0)
        self.assertEqual(entrada_vencida.estado_alerta, 'vencida')

    def test_nuevos_metodos_pago_proveedor(self):
        """Verifica el registro con tarjeta_debito y tarjeta_credito."""
        pago_deb = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('3500.00'),
            fecha=timezone.localdate(),
            metodo_pago='tarjeta_debito',
            referencia='TDD-4455'
        )
        self.assertEqual(pago_deb.metodo_pago, 'tarjeta_debito')

        pago_cred = PagoProveedor.objects.create(
            proveedor=self.proveedor,
            monto=Decimal('4200.00'),
            fecha=timezone.localdate(),
            metodo_pago='tarjeta_credito',
            referencia='TDC-9988'
        )
        self.assertEqual(pago_cred.metodo_pago, 'tarjeta_credito')

    def test_facturas_vencimiento_endpoint(self):
        """Verifica la acción facturas_vencimiento en EntradaInventarioViewSet."""
        from datetime import timedelta
        hoy = timezone.localdate()
        marca = Marca.objects.create(nombre='Michelin')
        prod = Producto.objects.create(
            codigo='MICH-100',
            medida='225/45R17',
            marca=marca,
            modelo='Primacy',
            indice_carga=94,
            indice_velocidad='W',
            precio_venta=Decimal('2800.00')
        )
        prov = Proveedor.objects.create(nombre='Michelin México', dias_credito=30)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=5,
            precio_compra=Decimal('1800.00'),
            fecha_compra=hoy - timedelta(days=32),
            fecha_vencimiento=hoy - timedelta(days=2),
            numero_factura='FAC-MICH-VENCIDA'
        )

        res = self.client.get('/api/inventario/entradas/facturas_vencimiento/?dias=7')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(len(data) >= 1)

        fac = next((f for f in data if f['numero_factura'] == 'FAC-MICH-VENCIDA'), None)
        self.assertIsNotNone(fac)
        self.assertEqual(fac['proveedor_nombre'], 'Michelin México')
        self.assertEqual(fac['monto_total'], 9000.0)
        self.assertEqual(fac['saldo_pendiente'], 9000.0)
        self.assertEqual(fac['estado_alerta'], 'vencida')
        self.assertLess(fac['dias_restantes'], 0)

        # También verificar alias de ruta en adeudos
        res_alias = self.client.get('/api/inventario/adeudos/facturas-vencimiento/?dias=7')
        self.assertEqual(res_alias.status_code, status.HTTP_200_OK)

    def test_parsear_cfdi_condiciones_pago(self):
        """Verifica la extracción de días de crédito y fecha de vencimiento al parsear CFDI."""
        from apps.inventario.views import _parsear_cfdi
        xml_test = b"""<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="A" Folio="101" Fecha="2026-10-01T12:00:00" SubTotal="1000.00" Total="1160.00"
            CondicionesDePago="CREDITO 30 DIAS" MetodoPago="PPD">
            <cfdi:Emisor Nombre="PROVEEDOR XML TEST" Rfc="PXT010101AAA"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="LL-100" Descripcion="205/55R16 91V Nexen N Priz" Cantidad="2" ValorUnitario="500.00"/>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""
        parsed = _parsear_cfdi(xml_test)
        self.assertEqual(parsed['numero_factura'], 'A101')
        self.assertEqual(parsed['dias_credito'], 30)
        self.assertEqual(parsed['fecha_vencimiento'], '2026-10-31')
        self.assertEqual(parsed['condiciones_de_pago'], 'CREDITO 30 DIAS')

    def test_facturas_vencimiento_seguridad_autenticacion(self):
        """Auditoría de seguridad: acceso anónimo a facturas_vencimiento debe retornar 401."""
        anon_client = APIClient()
        res = anon_client.get('/api/inventario/entradas/facturas_vencimiento/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_facturas_vencimiento_proteccion_inyeccion_y_no_datos_sensibles(self):
        """Auditoría de seguridad: sanitización de parámetros contra inyección y no exposición de secretos."""
        # Intento de inyección en query param 'dias'
        inyecciones = ["' OR '1'='1", "1; DROP TABLE usuarios;", "-999", "abc"]
        for inj in inyecciones:
            res = self.client.get(f'/api/inventario/entradas/facturas_vencimiento/?dias={inj}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Confirmar que los datos devueltos no contienen campos sensibles
        res_data = self.client.get('/api/inventario/entradas/facturas_vencimiento/').json()
        if res_data:
            primer_registro = res_data[0]
            campos_prohibidos = ['password', 'token', 'secret', 'rfc_curp', 'hash']
            for campo in campos_prohibidos:
                self.assertNotIn(campo, primer_registro)

    def test_agrupacion_adeudos_factura_remision_y_sin_factura(self):
        """
        Verifica que en _calcular_adeudo_proveedor las entradas se agrupen con keys:
        - FAC-<numero_factura>
        - REM-<folio_remision>
        - ENT-<id> para entradas sin factura ni remisión
        y que key y numero_factura estén presentes en facturas e items sin colisiones.
        """
        marca = Marca.objects.create(nombre='Yokohama')
        prod = Producto.objects.create(
            codigo='YOKO-01',
            medida='215/55R17',
            marca=marca,
            modelo='Bluearth',
            indice_carga=94,
            indice_velocidad='V',
            precio_venta=Decimal('2200.00')
        )
        prov = Proveedor.objects.create(nombre='Distribuidora Yokohama')

        # 1. Entrada con Factura
        e1 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=4,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='9876',
            created_by=self.admin_user
        )
        # 2. Entrada con Remisión (sin factura)
        e2 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            folio_remision='5544',
            created_by=self.admin_user
        )
        # 3. Entrada sin Factura ni Remisión
        e3 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=3,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            created_by=self.admin_user
        )
        # 4. Segunda entrada sin Factura ni Remisión (debe tener su propia key ENT-<id>)
        e4 = EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=1,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            created_by=self.admin_user
        )

        res = self.client.get(f'/api/inventario/adeudos/{prov.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # Debe haber 4 grupos en facturas (ninguno colisionó)
        self.assertEqual(data['total_facturas'], 4)
        facturas = data['facturas']
        keys = [f['key'] for f in facturas]

        self.assertIn('FAC-9876', keys)
        self.assertIn('REM-5544', keys)
        self.assertIn(f'ENT-{e3.id}', keys)
        self.assertIn(f'ENT-{e4.id}', keys)

        fac_num = next(f for f in facturas if f['key'] == 'FAC-9876')
        self.assertEqual(fac_num['numero_factura'], '9876')
        self.assertEqual(fac_num['items'][0]['key'], 'FAC-9876')
        self.assertEqual(fac_num['items'][0]['numero_factura'], '9876')

        fac_rem = next(f for f in facturas if f['key'] == 'REM-5544')
        self.assertEqual(fac_rem['numero_factura'], 'Remisión: 5544')
        self.assertEqual(fac_rem['items'][0]['key'], 'REM-5544')
        self.assertEqual(fac_rem['items'][0]['numero_factura'], 'Remisión: 5544')

        fac_ent = next(f for f in facturas if f['key'] == f'ENT-{e3.id}')
        self.assertEqual(fac_ent['numero_factura'], f'Entrada #{e3.id} (Sin Factura)')
        self.assertEqual(fac_ent['items'][0]['key'], f'ENT-{e3.id}')
        self.assertEqual(fac_ent['items'][0]['numero_factura'], f'Entrada #{e3.id} (Sin Factura)')

    def test_consolidado_filtro_activos(self):
        """
        Verifica el funcionamiento del query param 'activo' ('true', 'false', 'todos')
        en ProductoViewSet.consolidado y la presencia del campo 'activo' en cada item.
        """
        marca = Marca.objects.create(nombre='Toyo')
        prod_activo = Producto.objects.create(
            codigo='TOYO-ACT',
            medida='205/65R15',
            marca=marca,
            modelo='Proxes',
            indice_carga=94,
            indice_velocidad='H',
            precio_venta=Decimal('1800.00'),
            activo=True
        )
        prod_inactivo = Producto.objects.create(
            codigo='TOYO-INACT',
            medida='205/65R15',
            marca=marca,
            modelo='Tranpath',
            indice_carga=94,
            indice_velocidad='H',
            precio_venta=Decimal('1700.00'),
            activo=False
        )

        # 1. Por defecto (activo=true implícito)
        res_default = self.client.get('/api/inventario/productos/consolidado/')
        self.assertEqual(res_default.status_code, status.HTTP_200_OK)
        ids_default = [p['id'] for p in res_default.json()['productos']]
        self.assertIn(prod_activo.id, ids_default)
        self.assertNotIn(prod_inactivo.id, ids_default)

        # 2. Activos explícitos (?activo=true)
        res_act = self.client.get('/api/inventario/productos/consolidado/?activo=true')
        self.assertEqual(res_act.status_code, status.HTTP_200_OK)
        items_act = res_act.json()['productos']
        self.assertTrue(all(item['activo'] is True for item in items_act))
        self.assertIn(prod_activo.id, [p['id'] for p in items_act])
        self.assertNotIn(prod_inactivo.id, [p['id'] for p in items_act])

        # 3. Inactivos (?activo=false)
        res_inact = self.client.get('/api/inventario/productos/consolidado/?activo=false')
        self.assertEqual(res_inact.status_code, status.HTTP_200_OK)
        items_inact = res_inact.json()['productos']
        self.assertTrue(all(item['activo'] is False for item in items_inact))
        self.assertIn(prod_inactivo.id, [p['id'] for p in items_inact])
        self.assertNotIn(prod_activo.id, [p['id'] for p in items_inact])

        # 4. Todos (?activo=todos)
        res_todos = self.client.get('/api/inventario/productos/consolidado/?activo=todos')
        self.assertEqual(res_todos.status_code, status.HTTP_200_OK)
        ids_todos = [p['id'] for p in res_todos.json()['productos']]
        self.assertIn(prod_activo.id, ids_todos)
        self.assertIn(prod_inactivo.id, ids_todos)

    def test_eliminacion_segura_producto_con_y_sin_historial(self):
        """
        Verifica que un producto con historial de entradas o salidas no pueda ser
        eliminado físicamente (HTTP 400), mientras que uno sin historial sí pueda (HTTP 204).
        """
        marca = Marca.objects.create(nombre='Continental')
        prod_con_entrada = Producto.objects.create(
            codigo='CONTI-01',
            medida='225/50R17',
            marca=marca,
            modelo='ContiPremiumContact',
            indice_carga=98,
            indice_velocidad='W',
            precio_venta=Decimal('3100.00')
        )
        EntradaInventario.objects.create(
            producto=prod_con_entrada,
            proveedor=self.proveedor,
            cantidad=2,
            precio_compra=Decimal('2000.00'),
            fecha_compra=timezone.localdate(),
            created_by=self.admin_user
        )

        # Intento de eliminar producto con entradas -> debe fallar con 400
        del_res_entrada = self.client.delete(f'/api/inventario/productos/{prod_con_entrada.id}/')
        self.assertEqual(del_res_entrada.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No se puede eliminar definitivamente un producto con historial de entradas o ventas', del_res_entrada.json()['error'])
        self.assertTrue(Producto.objects.filter(id=prod_con_entrada.id).exists())

        # Producto con salidas -> debe fallar con 400
        prod_con_salida = Producto.objects.create(
            codigo='CONTI-02',
            medida='225/50R17',
            marca=marca,
            modelo='ContiSportContact',
            indice_carga=98,
            indice_velocidad='Y',
            precio_venta=Decimal('3500.00')
        )
        SalidaInventario.objects.create(
            producto=prod_con_salida,
            cantidad=1,
            precio_venta=Decimal('3500.00'),
            precio_costo=Decimal('2200.00'),
            fecha_venta=timezone.localdate()
        )
        del_res_salida = self.client.delete(f'/api/inventario/productos/{prod_con_salida.id}/')
        self.assertEqual(del_res_salida.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No se puede eliminar definitivamente un producto con historial de entradas o ventas', del_res_salida.json()['error'])
        self.assertTrue(Producto.objects.filter(id=prod_con_salida.id).exists())

        # Producto sin historial -> debe eliminarse con 204
        prod_limpio = Producto.objects.create(
            codigo='CONTI-LIMPIO',
            medida='225/50R17',
            marca=marca,
            modelo='ContiEcoContact',
            indice_carga=98,
            indice_velocidad='V',
            precio_venta=Decimal('2900.00')
        )
        del_res_limpio = self.client.delete(f'/api/inventario/productos/{prod_limpio.id}/')
        self.assertEqual(del_res_limpio.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Producto.objects.filter(id=prod_limpio.id).exists())

    def test_cuenta_corriente_vs_cuenta_vencida_y_pagos_factura(self):
        """
        Verifica el desglose de pagos por factura, estados (vencida, vigente, pagada, abono_parcial),
        y el cálculo correcto de cuenta_vencida vs cuenta_corriente a nivel proveedor y resumen global.
        """
        from datetime import timedelta
        hoy = timezone.localdate()

        prov = Proveedor.objects.create(
            nombre='Proveedor Crédito Mixto',
            dias_credito=15
        )
        marca = Marca.objects.create(nombre='Pirelli')
        prod = Producto.objects.create(
            codigo='PIR-TEST-01',
            medida='205/55R16',
            marca=marca,
            modelo='Cinturato',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2000.00')
        )

        # 1. Factura Vencida (hace 20 días venció, deuda 10,000, abono 3,000 -> saldo 7,000)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=10,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=35),
            fecha_vencimiento=hoy - timedelta(days=20),
            numero_factura='FAC-VENCIDA-1',
            created_by=self.admin_user
        )
        PagoProveedor.objects.create(
            proveedor=prov,
            monto=Decimal('3000.00'),
            fecha=hoy - timedelta(days=25),
            metodo_pago='transferencia',
            numero_factura='FAC-VENCIDA-1',
            registrado_por=self.admin_user
        )

        # 2. Factura Vigente (vence en 10 días, deuda 20,000, sin pagos -> saldo 20,000)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=20,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=5),
            fecha_vencimiento=hoy + timedelta(days=10),
            numero_factura='FAC-VIGENTE-2',
            created_by=self.admin_user
        )

        # 3. Factura Pagada (deuda 5,000, pago 5,000 -> saldo 0)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=5,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=12),
            fecha_vencimiento=hoy + timedelta(days=3),
            numero_factura='FAC-PAGADA-3',
            created_by=self.admin_user
        )
        PagoProveedor.objects.create(
            proveedor=prov,
            monto=Decimal('5000.00'),
            fecha=hoy - timedelta(days=10),
            metodo_pago='cheque',
            numero_factura='FAC-PAGADA-3',
            registrado_por=self.admin_user
        )

        # 4. Remisión con Abono Parcial y vigente (deuda 6,000, abono 2,000 -> saldo 4,000)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=6,
            precio_compra=Decimal('1000.00'),
            fecha_compra=hoy - timedelta(days=3),
            fecha_vencimiento=hoy + timedelta(days=12),
            folio_remision='REM-7788',
            created_by=self.admin_user
        )
        PagoProveedor.objects.create(
            proveedor=prov,
            monto=Decimal('2000.00'),
            fecha=hoy - timedelta(days=1),
            metodo_pago='transferencia',
            numero_factura='REM-7788',
            registrado_por=self.admin_user
        )

        # Consultar detalle del proveedor
        res_det = self.client.get(f'/api/inventario/adeudos/{prov.id}/')
        self.assertEqual(res_det.status_code, status.HTTP_200_OK)
        det = res_det.json()

        # Totales del proveedor:
        # Deuda total = 10,000 + 20,000 + 5,000 + 6,000 = 41,000
        # Pagos = 3,000 + 5,000 + 2,000 = 10,000
        # Saldo pendiente total = 31,000
        # Vencida = 7,000 (FAC-VENCIDA-1)
        # Corriente = 31,000 - 7,000 = 24,000 (20,000 + 4,000)
        self.assertEqual(det['monto_total_deuda'], 41000.0)
        self.assertEqual(det['monto_pagado'], 10000.0)
        self.assertEqual(det['saldo_pendiente_total'], 31000.0)
        self.assertEqual(det['cuenta_vencida'], 7000.0)
        self.assertEqual(det['cuenta_corriente'], 24000.0)

        # Verificar estados de facturas
        facs_by_key = {f['key']: f for f in det['facturas']}

        f_venc = facs_by_key['FAC-FAC-VENCIDA-1']
        self.assertEqual(f_venc['estado'], 'vencida')
        self.assertEqual(f_venc['monto_pagado'], 3000.0)
        self.assertEqual(f_venc['saldo_pendiente'], 7000.0)
        self.assertLess(f_venc['dias_restantes'], 0)
        self.assertEqual(len(f_venc['pagos']), 1)

        f_vig = facs_by_key['FAC-FAC-VIGENTE-2']
        self.assertEqual(f_vig['estado'], 'vigente')
        self.assertEqual(f_vig['monto_pagado'], 0.0)
        self.assertEqual(f_vig['saldo_pendiente'], 20000.0)
        self.assertGreater(f_vig['dias_restantes'], 0)

        f_pag = facs_by_key['FAC-FAC-PAGADA-3']
        self.assertEqual(f_pag['estado'], 'pagada')
        self.assertEqual(f_pag['monto_pagado'], 5000.0)
        self.assertEqual(f_pag['saldo_pendiente'], 0.0)
        self.assertEqual(len(f_pag['pagos']), 1)

        f_rem = facs_by_key['REM-REM-7788']
        self.assertEqual(f_rem['estado'], 'abono_parcial')
        self.assertEqual(f_rem['monto_pagado'], 2000.0)
        self.assertEqual(f_rem['saldo_pendiente'], 4000.0)
        self.assertGreater(f_rem['dias_restantes'], 0)
        self.assertEqual(len(f_rem['pagos']), 1)

        # Consultar resumen global
        res_glob = self.client.get('/api/inventario/adeudos/')
        self.assertEqual(res_glob.status_code, status.HTTP_200_OK)
        glob = res_glob.json()
        self.assertIn('total_cuenta_corriente_global', glob)
        self.assertIn('total_cuenta_vencida_global', glob)
        self.assertGreaterEqual(glob['total_cuenta_vencida_global'], 7000.0)
        self.assertGreaterEqual(glob['total_cuenta_corriente_global'], 24000.0)

    def test_facturas_vencimiento_orden_estricto(self):
        """
        Verifica que facturas_vencimiento ordene estrictamente:
        1. Vencidas: de mayor retraso (-20) a menor retraso (-5).
        2. Por vencer y al día: en orden ascendente de días restantes (0, luego 2, luego 5).
        """
        from datetime import timedelta
        hoy = timezone.localdate()

        prov = Proveedor.objects.create(nombre='Proveedor Orden Estricto', dias_credito=30)
        marca = Marca.objects.create(nombre='Hankook')
        prod = Producto.objects.create(
            codigo='HK-ORDEN-01',
            medida='225/65R17',
            marca=marca,
            modelo='Dynapro',
            indice_carga=102,
            indice_velocidad='H',
            precio_venta=Decimal('2400.00')
        )

        # Factura vencida hace 20 días
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=50),
            fecha_vencimiento=hoy - timedelta(days=20),
            numero_factura='FAC-RETRASO-20',
            created_by=self.admin_user
        )
        # Factura vencida hace 5 días
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=35),
            fecha_vencimiento=hoy - timedelta(days=5),
            numero_factura='FAC-RETRASO-05',
            created_by=self.admin_user
        )
        # Factura que vence hoy (dias_restantes = 0)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=30),
            fecha_vencimiento=hoy,
            numero_factura='FAC-VENCE-HOY',
            created_by=self.admin_user
        )
        # Factura que vence en 2 días (dias_restantes = 2)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=28),
            fecha_vencimiento=hoy + timedelta(days=2),
            numero_factura='FAC-VENCE-2DIAS',
            created_by=self.admin_user
        )
        # Factura que vence en 6 días (dias_restantes = 6)
        EntradaInventario.objects.create(
            producto=prod,
            proveedor=prov,
            cantidad=2,
            precio_compra=Decimal('1500.00'),
            fecha_compra=hoy - timedelta(days=24),
            fecha_vencimiento=hoy + timedelta(days=6),
            numero_factura='FAC-VENCE-6DIAS',
            created_by=self.admin_user
        )

        res = self.client.get('/api/inventario/entradas/facturas_vencimiento/?dias=7')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        facturas = res.json()

        # Filtrar solo las de este proveedor para aislar la prueba
        facturas_test = [f for f in facturas if f['proveedor_nombre'] == 'Proveedor Orden Estricto']
        self.assertEqual(len(facturas_test), 5)

        numeros_orden = [f['numero_factura'] for f in facturas_test]
        esperado = [
            'FAC-RETRASO-20',  # dias_restantes = -20 (mayor retraso primero)
            'FAC-RETRASO-05',  # dias_restantes = -5
            'FAC-VENCE-HOY',   # dias_restantes = 0
            'FAC-VENCE-2DIAS', # dias_restantes = 2
            'FAC-VENCE-6DIAS'  # dias_restantes = 6
        ]
        self.assertEqual(numeros_orden, esperado)

    def test_calcular_precio_venta_sugerido_tabulador_rin(self):
        """
        Verifica el cálculo del precio de venta sugerido con el tabulador de utilidad por Rin:
        - Costo 1099, Rin 16 -> 1865.00
        - Costo 1307, Rin 16 -> 2125.00
        - Pruebas adicionales de Rin (<=15, 17/18, >=19)
        """
        from apps.inventario.views import _calcular_precio_venta_sugerido

        # Caso 1: Costo 1099, Rin 16
        precio_1 = _calcular_precio_venta_sugerido(Decimal('1099.00'), '205/55R16')
        self.assertEqual(precio_1, Decimal('1865.00'))

        # Caso 2: Costo 1307, Rin 16
        precio_2 = _calcular_precio_venta_sugerido(Decimal('1307.00'), '205/55R16')
        self.assertEqual(precio_2, Decimal('2125.00'))

        # Caso 3: Rin 15 (m1=400) con costo 1000
        precio_3 = _calcular_precio_venta_sugerido(Decimal('1000.00'), '195/65R15')
        self.assertEqual(precio_3, Decimal('1685.00'))

        # Caso 4: Rin 17 (m1=700) con costo 2000
        precio_4 = _calcular_precio_venta_sugerido(Decimal('2000.00'), '225/50R17')
        self.assertEqual(precio_4, Decimal('3260.00'))

        # Caso 5: Rin 20 (m1=850) con costo 3000
        precio_5 = _calcular_precio_venta_sugerido(Decimal('3000.00'), '275/40R20')
        self.assertEqual(precio_5, Decimal('4675.00'))

    def test_parsear_cfdi_incluye_precio_venta_sugerido(self):
        """
        Verifica que _parsear_cfdi procese los conceptos e incluya el campo 'precio_venta_sugerido'
        calculado con el tabulador de Rin.
        """
        from apps.inventario.views import _parsear_cfdi

        xml_content = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="FAC" Folio="1001" Fecha="2026-10-30T10:00:00"
            SubTotal="2406.00" Total="2790.96" CondicionesDePago="30 dias" MetodoPago="PPD">
            <cfdi:Emisor Rfc="LAN101010ABC" Nombre="LLANTERA NACIONAL SA DE CV" />
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="LL-1099" Cantidad="2"
                    Descripcion="LLANTA 205/55R16 91V MICHELIN PRIMACY 4"
                    ValorUnitario="1099.00" />
                <cfdi:Concepto NoIdentificacion="LL-1307" Cantidad="4"
                    Descripcion="LLANTA 205/60R16 92H PIRELLI CINTURATO P7"
                    ValorUnitario="1307.00" />
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        datos = _parsear_cfdi(xml_content)
        self.assertEqual(len(datos['items']), 2)
        item1 = datos['items'][0]
        self.assertEqual(item1['codigo'], 'LL-1099')
        self.assertIn('precio_venta_sugerido', item1)
        self.assertEqual(item1['precio_venta_sugerido'], 1865.0)

        item2 = datos['items'][1]
        self.assertEqual(item2['codigo'], 'LL-1307')
        self.assertIn('precio_venta_sugerido', item2)
        self.assertEqual(item2['precio_venta_sugerido'], 2125.0)

    def test_importar_xml_guardar_asigna_precio_tabulador_rin(self):
        """
        Verifica que ImportarXMLView._guardar aplique el precio de venta según el tabulador de Rin,
        y actualice el precio si el producto ya existía.
        """
        from apps.inventario.views import ImportarXMLView

        # Precrear un producto existente con precio viejo
        marca = Marca.objects.create(nombre='MICHELIN')
        prod_existente = Producto.objects.create(
            codigo='LL-1099',
            medida='205/55R16',
            marca=marca,
            modelo='PRIMACY 4',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('1500.00'),
            stock_minimo=2
        )

        datos_factura = {
            'numero_factura': 'FAC-RIN-TEST',
            'fecha_compra': '2026-10-30',
            'fecha_vencimiento': '2026-11-29',
            'dias_credito': 30,
            'proveedor': {
                'nombre': 'PROVEEDOR TABULADOR RIN',
                'rfc': 'PTR999999XYZ'
            },
            'items': [
                {
                    'codigo': 'LL-1099',
                    'descripcion': 'LLANTA 205/55R16 91V MICHELIN PRIMACY 4',
                    'cantidad': 4,
                    'precio_compra': 1099.00,
                    'medida': '205/55R16',
                    'marca_nombre': 'MICHELIN',
                    'modelo': 'PRIMACY 4',
                    'indice_carga': 91,
                    'indice_velocidad': 'V',
                },
                {
                    'codigo': 'LL-1307-NEW',
                    'descripcion': 'LLANTA 205/60R16 92H PIRELLI CINTURATO P7',
                    'cantidad': 2,
                    'precio_compra': 1307.00,
                    'medida': '205/60R16',
                    'marca_nombre': 'PIRELLI',
                    'modelo': 'CINTURATO P7',
                    'indice_carga': 92,
                    'indice_velocidad': 'H',
                }
            ]
        }

        view = ImportarXMLView()
        resultado = view._guardar(datos_factura, self.admin_user)

        # 1. Producto existente debió actualizarse a $1865.00
        prod_existente.refresh_from_db()
        self.assertEqual(prod_existente.precio_venta, Decimal('1865.00'))

        # 2. Producto nuevo debió crearse con $2125.00
        prod_nuevo = Producto.objects.get(codigo='LL-1307-NEW')
        self.assertEqual(prod_nuevo.precio_venta, Decimal('2125.00'))

        # 3. Entradas creadas
        entradas = EntradaInventario.objects.filter(numero_factura='FAC-RIN-TEST')
        self.assertEqual(entradas.count(), 2)

    def test_importar_xml_seguridad_autenticacion_y_rbac(self):
        """
        Auditoría de seguridad:
        1. Acceso anónimo a /api/inventario/importar-xml/ debe retornar 401 Unauthorized.
        2. Usuario con rol operador no debe tener permiso de guardar facturas (403 Forbidden).
        """
        from io import BytesIO

        xml_dummy = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="A" Folio="55" Fecha="2026-10-30T10:00:00" SubTotal="1000.00" Total="1160.00">
            <cfdi:Emisor Nombre="PROV TEST RBAC" Rfc="PRB010101XYZ"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="RBAC-01" Descripcion="205/55R16 91V TEST" Cantidad="2" ValorUnitario="500.00"/>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        # 1. Anónimo
        anon_client = APIClient()
        file_obj = BytesIO(xml_dummy)
        file_obj.name = 'factura.xml'
        res_anon = anon_client.post('/api/inventario/importar-xml/', {'xml': file_obj, 'accion': 'preview'}, format='multipart')
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Operador autenticado
        operador_user = Usuario.objects.create_user(
            username='operador_inv',
            password='password123',
            rol='operador',
            is_staff=False
        )
        op_client = APIClient()
        op_client.force_authenticate(user=operador_user)

        file_obj.seek(0)
        res_op_guardar = op_client.post('/api/inventario/importar-xml/', {'xml': file_obj, 'accion': 'guardar'}, format='multipart')
        self.assertEqual(res_op_guardar.status_code, status.HTTP_403_FORBIDDEN)

    def test_importar_xml_transaccion_atomica_y_prevencion_valores_negativos(self):
        """
        Auditoría de seguridad:
        1. Comprobar que _guardar y _calcular_precio_venta_sugerido rechacen precios o cantidades negativos/cero.
        2. Comprobar que @transaction.atomic garantice atomicidad total ante fallos.
        """
        from apps.inventario.views import ImportarXMLView, _calcular_precio_venta_sugerido

        # 1. Validación en función de cálculo
        with self.assertRaises(ValueError):
            _calcular_precio_venta_sugerido(Decimal('-500.00'), '205/55R16')
        with self.assertRaises(ValueError):
            _calcular_precio_venta_sugerido(Decimal('0'), '205/55R16')

        # 2. Datos con un segundo item malicioso/anómalo (precio negativo)
        datos_maliciosos = {
            'numero_factura': 'FAC-ATOMIC-FAIL',
            'fecha_compra': '2026-10-30',
            'proveedor': {
                'nombre': 'PROVEEDOR ROBUST TEST',
                'rfc': 'PRT000000AAA'
            },
            'items': [
                {
                    'codigo': 'VALID-01',
                    'descripcion': 'LLANTA 205/55R16 91V VALIDA',
                    'cantidad': 2,
                    'precio_compra': 1000.00,
                    'medida': '205/55R16',
                },
                {
                    'codigo': 'INVALID-02',
                    'descripcion': 'LLANTA CON PRECIO NEGATIVO',
                    'cantidad': 2,
                    'precio_compra': -500.00,
                    'medida': '205/55R16',
                }
            ]
        }

        view = ImportarXMLView()
        with self.assertRaises(ValueError):
            view._guardar(datos_maliciosos, self.admin_user)

        # Verificar que el producto VALID-01 NO fue persistido (reversión atómica de la transacción)
        self.assertFalse(Producto.objects.filter(codigo='VALID-01').exists())
        self.assertFalse(EntradaInventario.objects.filter(numero_factura='FAC-ATOMIC-FAIL').exists())

    def test_eliminar_marca_protegida_por_productos(self):
        """
        Verifica que al intentar eliminar una marca con productos asociados,
        se capture ProtectedError y devuelva HTTP 400 con mensaje explicativo.
        """
        marca = Marca.objects.create(nombre='Continental Protected')
        Producto.objects.create(
            codigo='CONT-001',
            medida='225/45R17',
            marca=marca,
            modelo='ContiSportContact',
            indice_carga=91,
            indice_velocidad='W',
            precio_venta=Decimal('2800.00'),
            stock_minimo=2
        )

        response = self.client.delete(f'/api/inventario/marcas/{marca.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        expected_msg = 'No se puede eliminar la marca porque tiene productos asociados en catálogo. Puedes desactivarla.'
        self.assertIn(expected_msg, response.data.get('detail', ''))
        self.assertTrue(Marca.objects.filter(id=marca.id).exists())

    def test_eliminar_marca_sin_productos(self):
        """
        Verifica que una marca sin productos asociados se pueda eliminar exitosamente.
        """
        marca = Marca.objects.create(nombre='Marca Vacia Para Borrar')
        response = self.client.delete(f'/api/inventario/marcas/{marca.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Marca.objects.filter(id=marca.id).exists())

    def test_eliminar_proveedor_protegido_por_entradas(self):
        """
        Verifica que al intentar eliminar un proveedor con entradas asociadas,
        se capture ProtectedError y devuelva HTTP 400 con mensaje explicativo.
        """
        marca = Marca.objects.create(nombre='Toyo Tires')
        producto = Producto.objects.create(
            codigo='TOYO-001',
            medida='205/55R16',
            marca=marca,
            modelo='Proxes',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('1950.00'),
            stock_minimo=2
        )
        proveedor_con_entradas = Proveedor.objects.create(
            nombre='Distribuidora Protegida S.A.',
            contacto='Juan Perez',
            telefono='5551234567',
            email='ventas@distribuidora.com'
        )
        EntradaInventario.objects.create(
            producto=producto,
            proveedor=proveedor_con_entradas,
            cantidad=4,
            precio_compra=Decimal('1200.00'),
            fecha_compra=timezone.localdate(),
            numero_factura='FAC-TOYO-001'
        )

        response = self.client.delete(f'/api/inventario/proveedores/{proveedor_con_entradas.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        expected_msg = 'No se puede eliminar el proveedor porque tiene entradas o facturas asociadas en inventario. Puedes desactivarlo.'
        self.assertIn(expected_msg, response.data.get('detail', ''))
        self.assertTrue(Proveedor.objects.filter(id=proveedor_con_entradas.id).exists())

    def test_eliminar_proveedor_sin_entradas(self):
        """
        Verifica que un proveedor sin entradas asociadas se pueda eliminar exitosamente.
        """
        proveedor = Proveedor.objects.create(
            nombre='Proveedor Sin Entradas',
            contacto='Sin Relacion'
        )
        response = self.client.delete(f'/api/inventario/proveedores/{proveedor.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Proveedor.objects.filter(id=proveedor.id).exists())

    def test_busqueda_y_ordenamiento_proveedor_y_marca(self):
        """
        Verifica filtros de búsqueda y ordenamiento en MarcaViewSet y ProveedorViewSet.
        """
        # Búsqueda por contacto, teléfono y email en proveedores
        prov1 = Proveedor.objects.create(
            nombre='Alpha Proveedor',
            contacto='Contacto Específico',
            telefono='999888777',
            email='alpha@correo.com',
            dias_credito=30
        )
        prov2 = Proveedor.objects.create(
            nombre='Beta Proveedor',
            contacto='Otro Contacto',
            telefono='444555666',
            email='beta@correo.com',
            dias_credito=15
        )

        # Buscar por teléfono
        res_tel = self.client.get('/api/inventario/proveedores/?search=999888777')
        self.assertEqual(res_tel.status_code, status.HTTP_200_OK)
        results_tel = res_tel.data.get('results', res_tel.data)
        nombres = [p['nombre'] for p in results_tel]
        self.assertIn('Alpha Proveedor', nombres)
        self.assertNotIn('Beta Proveedor', nombres)

        # Buscar por email
        res_email = self.client.get('/api/inventario/proveedores/?search=beta@correo.com')
        self.assertEqual(res_email.status_code, status.HTTP_200_OK)
        results_email = res_email.data.get('results', res_email.data)
        nombres = [p['nombre'] for p in results_email]
        self.assertIn('Beta Proveedor', nombres)
        self.assertNotIn('Alpha Proveedor', nombres)

        # Ordenar por dias_credito descendente
        res_order = self.client.get('/api/inventario/proveedores/?ordering=-dias_credito')
        self.assertEqual(res_order.status_code, status.HTTP_200_OK)
        results_order = res_order.data.get('results', res_order.data)
        dias = [p['dias_credito'] for p in results_order if p['id'] in (prov1.id, prov2.id)]
        self.assertEqual(dias, [30, 15])

        # Probar búsqueda y ordenamiento en MarcaViewSet
        Marca.objects.create(nombre='Yokohama Z')
        Marca.objects.create(nombre='Avon A')
        res_marcas = self.client.get('/api/inventario/marcas/?search=Yokohama')
        self.assertEqual(res_marcas.status_code, status.HTTP_200_OK)
        marcas_res = res_marcas.data.get('results', res_marcas.data)
        nombres_marcas = [m['nombre'] for m in marcas_res]
        self.assertIn('Yokohama Z', nombres_marcas)
        self.assertNotIn('Avon A', nombres_marcas)

    def test_marca_gestion_restringida_a_admin(self):
        """
        Verifica que solo los usuarios administradores puedan crear, editar o eliminar marcas.
        """
        operador_user = Usuario.objects.create_user(
            username='operador_marca',
            password='password123',
            rol='operador'
        )
        marca_test = Marca.objects.create(nombre='Continental Test')

        # Operador intenta crear
        self.client.force_authenticate(user=operador_user)
        res_create = self.client.post('/api/inventario/marcas/', {'nombre': 'Falken'}, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # Operador intenta actualizar (PUT)
        res_put = self.client.put(f'/api/inventario/marcas/{marca_test.id}/', {'nombre': 'Continental Updated'}, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_403_FORBIDDEN)

        # Operador intenta actualizar parcialmente (PATCH)
        res_patch = self.client.patch(f'/api/inventario/marcas/{marca_test.id}/', {'nombre': 'Continental Patched'}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        # Operador intenta eliminar (DELETE)
        res_delete = self.client.delete(f'/api/inventario/marcas/{marca_test.id}/')
        self.assertEqual(res_delete.status_code, status.HTTP_403_FORBIDDEN)

        # Admin sí puede gestionar
        self.client.force_authenticate(user=self.admin_user)
        res_admin_create = self.client.post('/api/inventario/marcas/', {'nombre': 'Falken'}, format='json')
        self.assertEqual(res_admin_create.status_code, status.HTTP_201_CREATED)

        res_admin_patch = self.client.patch(f'/api/inventario/marcas/{marca_test.id}/', {'nombre': 'Continental Admin'}, format='json')
        self.assertEqual(res_admin_patch.status_code, status.HTTP_200_OK)

        res_admin_delete = self.client.delete(f'/api/inventario/marcas/{marca_test.id}/')
        self.assertEqual(res_admin_delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_proveedor_gestion_restringida_a_admin(self):
        """
        Verifica que solo los usuarios administradores puedan crear, editar o eliminar proveedores.
        """
        operador_user = Usuario.objects.create_user(
            username='operador_prov',
            password='password123',
            rol='operador'
        )
        prov_test = Proveedor.objects.create(nombre='Proveedor Prueba S.A.')

        # Operador intenta crear
        self.client.force_authenticate(user=operador_user)
        res_create = self.client.post('/api/inventario/proveedores/', {'nombre': 'Nuevo Proveedor'}, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # Operador intenta actualizar (PUT)
        res_put = self.client.put(f'/api/inventario/proveedores/{prov_test.id}/', {'nombre': 'Proveedor Modificado'}, format='json')
        self.assertEqual(res_put.status_code, status.HTTP_403_FORBIDDEN)

        # Operador intenta actualizar parcialmente (PATCH)
        res_patch = self.client.patch(f'/api/inventario/proveedores/{prov_test.id}/', {'telefono': '1234567890'}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_403_FORBIDDEN)

        # Operador intenta eliminar (DELETE)
        res_delete = self.client.delete(f'/api/inventario/proveedores/{prov_test.id}/')
        self.assertEqual(res_delete.status_code, status.HTTP_403_FORBIDDEN)

        # Admin sí puede gestionar
        self.client.force_authenticate(user=self.admin_user)
        res_admin_create = self.client.post('/api/inventario/proveedores/', {'nombre': 'Nuevo Proveedor Admin'}, format='json')
        self.assertEqual(res_admin_create.status_code, status.HTTP_201_CREATED)

        res_admin_patch = self.client.patch(f'/api/inventario/proveedores/{prov_test.id}/', {'telefono': '9998887776'}, format='json')
        self.assertEqual(res_admin_patch.status_code, status.HTTP_200_OK)

        res_admin_delete = self.client.delete(f'/api/inventario/proveedores/{prov_test.id}/')
        self.assertEqual(res_admin_delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_calcular_precio_venta_sugerido_sin_doble_iva(self):
        """
        Verifica que _calcular_precio_venta_sugerido con incluye_iva=True no duplique el 16%.
        """
        from apps.inventario.views import _calcular_precio_venta_sugerido

        precio_sin_iva = Decimal('1099.00')
        precio_con_iva = Decimal('1274.84')
        self.assertEqual(
            _calcular_precio_venta_sugerido(precio_sin_iva, '205/55R16', incluye_iva=False),
            Decimal('1865.00'),
        )
        self.assertEqual(
            _calcular_precio_venta_sugerido(precio_con_iva, '205/55R16', incluye_iva=True),
            Decimal('1865.00'),
        )

    def test_parsear_cfdi_iva_con_y_sin_nodo_traslado(self):
        """
        Verifica extracción de IVA en _parsear_cfdi:
        - Con nodo Traslado (TasaOCuota=0.160000 y Exento/0.00)
        - Sin nodo Impuestos con Total > SubTotal (fallback 0.16)
        - Sin nodo Impuestos con Total <= SubTotal (fallback 0.00)
        """
        from apps.inventario.views import _parsear_cfdi

        xml_con_traslado = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="F" Folio="200" Fecha="2026-11-16T10:00:00"
            SubTotal="2099.00" Total="2274.84">
            <cfdi:Emisor Rfc="EMISOR010101AAA" Nombre="PROVEEDOR TRASLADO" />
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="T-16" Cantidad="1"
                    Descripcion="LLANTA 205/55R16 91V MICHELIN PRIMACY"
                    ValorUnitario="1099.00">
                    <cfdi:Impuestos>
                        <cfdi:Traslados>
                            <cfdi:Traslado Base="1099.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="175.84" />
                        </cfdi:Traslados>
                    </cfdi:Impuestos>
                </cfdi:Concepto>
                <cfdi:Concepto NoIdentificacion="T-EX" Cantidad="1"
                    Descripcion="LLANTA 195/65R15 91H KUMHO ECOWING"
                    ValorUnitario="1000.00">
                    <cfdi:Impuestos>
                        <cfdi:Traslados>
                            <cfdi:Traslado Base="1000.00" Impuesto="002" TipoFactor="Exento" />
                        </cfdi:Traslados>
                    </cfdi:Impuestos>
                </cfdi:Concepto>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        datos = _parsear_cfdi(xml_con_traslado)
        item_16 = datos['items'][0]
        self.assertEqual(item_16['precio_compra_sin_iva'], 1099.0)
        self.assertEqual(item_16['precio_compra_con_iva'], 1274.84)
        self.assertEqual(item_16['tasa_iva'], 0.16)
        self.assertEqual(item_16['precio_compra'], 1274.84)
        self.assertEqual(item_16['precio_venta_sugerido'], 1865.0)

        item_exento = datos['items'][1]
        self.assertEqual(item_exento['precio_compra_sin_iva'], 1000.0)
        self.assertEqual(item_exento['precio_compra_con_iva'], 1000.0)
        self.assertEqual(item_exento['tasa_iva'], 0.0)
        self.assertEqual(item_exento['precio_compra'], 1000.0)

        xml_sin_iva = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="F" Folio="201" Fecha="2026-11-16T10:00:00"
            SubTotal="1000.00" Total="1000.00">
            <cfdi:Emisor Rfc="EMISOR010101AAA" Nombre="PROVEEDOR TASA CERO" />
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="T-00" Cantidad="1"
                    Descripcion="LLANTA 195/65R15 91H NEXEN"
                    ValorUnitario="1000.00" />
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        datos_0 = _parsear_cfdi(xml_sin_iva)
        self.assertEqual(datos_0['items'][0]['tasa_iva'], 0.0)
        self.assertEqual(datos_0['items'][0]['precio_compra_con_iva'], 1000.0)

    def test_importar_xml_guarda_entrada_con_iva_y_mantiene_compatibilidad_legacy(self):
        """
        Verifica que al importar XML vía endpoint se guarde EntradaInventario.precio_compra con IVA
        y precio_incluye_iva=True sin duplicar IVA en precio_venta; y que llamadas legacy
        sin precio_compra_con_iva mantengan precio_incluye_iva=False.
        """
        from io import BytesIO
        from apps.inventario.views import ImportarXMLView

        xml_bytes = b"""<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Serie="IVA" Folio="900" Fecha="2026-11-16T10:00:00"
            SubTotal="2198.00" Total="2549.68">
            <cfdi:Emisor Rfc="PIVA010101AAA" Nombre="PROVEEDOR IVA XML" />
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="XML-IVA-01" Cantidad="2"
                    Descripcion="LLANTA 205/55R16 91V MICHELIN PRIMACY 4"
                    ValorUnitario="1099.00">
                    <cfdi:Impuestos>
                        <cfdi:Traslados>
                            <cfdi:Traslado Base="2198.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="351.68" />
                        </cfdi:Traslados>
                    </cfdi:Impuestos>
                </cfdi:Concepto>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""

        file_obj = BytesIO(xml_bytes)
        file_obj.name = 'factura_iva.xml'
        res = self.client.post('/api/inventario/importar-xml/', {'xml': file_obj, 'accion': 'guardar'}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        prod = Producto.objects.get(codigo='XML-IVA-01')
        self.assertEqual(prod.precio_venta, Decimal('1865.00'))

        entrada = EntradaInventario.objects.get(numero_factura='IVA900', producto=prod)
        self.assertEqual(entrada.precio_compra, Decimal('1274.84'))
        self.assertTrue(entrada.precio_incluye_iva)

        # Compatibilidad legacy sin precio_compra_con_iva
        view = ImportarXMLView()
        view._guardar({
            'numero_factura': 'LEG-001',
            'fecha_compra': '2026-11-16',
            'proveedor': {'nombre': 'PROVEEDOR LEGACY', 'rfc': 'PLE010101AAA'},
            'items': [{
                'codigo': 'LEG-01',
                'descripcion': 'LLANTA 205/55R16 91V LEGACY',
                'cantidad': 1,
                'precio_compra': 1099.00,
                'medida': '205/55R16',
                'marca_nombre': 'LEGACY',
                'modelo': 'L1',
            }],
        }, self.admin_user)
        entrada_legacy = EntradaInventario.objects.get(numero_factura='LEG-001')
        self.assertEqual(entrada_legacy.precio_compra, Decimal('1099.00'))
        self.assertFalse(entrada_legacy.precio_incluye_iva)
        self.assertEqual(entrada_legacy.producto.precio_venta, Decimal('1865.00'))

    def test_entradas_busqueda_paginacion_y_filtro_numero_factura(self):
        """
        Verifica paginación, búsqueda por numero_factura/proveedor y filtro ?numero_factura= en EntradaInventarioViewSet.
        """
        marca = Marca.objects.create(nombre='BridgestoneSearch')
        prod = Producto.objects.create(
            codigo='BS-SEARCH-01',
            medida='205/55R16',
            marca=marca,
            modelo='Turanza',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2100.00'),
        )
        prov_a = Proveedor.objects.create(nombre='Distribuidora Norte SA')
        prov_b = Proveedor.objects.create(nombre='Llantera Sur SA')

        e1 = EntradaInventario.objects.create(
            producto=prod, proveedor=prov_a, cantidad=4,
            precio_compra=Decimal('1350.00'), precio_incluye_iva=True,
            fecha_compra=timezone.localdate(), numero_factura='FAC-998811',
        )
        e2 = EntradaInventario.objects.create(
            producto=prod, proveedor=prov_b, cantidad=2,
            precio_compra=Decimal('1200.00'), precio_incluye_iva=False,
            fecha_compra=timezone.localdate(), numero_factura='FAC-223344',
        )

        # Paginación por defecto
        res_list = self.client.get('/api/inventario/entradas/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertIn('results', res_list.data)
        self.assertIn('count', res_list.data)

        # Exposición de precio_incluye_iva
        items_by_id = {item['id']: item for item in res_list.data['results']}
        self.assertTrue(items_by_id[e1.id]['precio_incluye_iva'])
        self.assertFalse(items_by_id[e2.id]['precio_incluye_iva'])

        # Búsqueda por ?search=proveedor
        res_prov = self.client.get('/api/inventario/entradas/?search=Norte')
        self.assertEqual(res_prov.status_code, status.HTTP_200_OK)
        ids_prov = [x['id'] for x in res_prov.data['results']]
        self.assertIn(e1.id, ids_prov)
        self.assertNotIn(e2.id, ids_prov)

        # Búsqueda por ?search=numero_factura
        res_fac_search = self.client.get('/api/inventario/entradas/?search=998811')
        self.assertEqual(res_fac_search.status_code, status.HTTP_200_OK)
        ids_fac = [x['id'] for x in res_fac_search.data['results']]
        self.assertEqual(ids_fac, [e1.id])

        # Filtro explícito ?numero_factura=
        res_fac_param = self.client.get('/api/inventario/entradas/?numero_factura=223344')
        self.assertEqual(res_fac_param.status_code, status.HTTP_200_OK)
        ids_param = [x['id'] for x in res_fac_param.data['results']]
        self.assertEqual(ids_param, [e2.id])

    def test_producto_viewset_ultimo_precio_compra_y_creacion(self):
        """
        Verifica anotación de ultimo_precio_compra y ultimo_precio_incluye_iva en ProductoViewSet
        y que la creación de producto vía POST no falle sin entradas previas.
        """
        from datetime import timedelta

        marca = Marca.objects.create(nombre='DunlopSubquery')
        prov = Proveedor.objects.create(nombre='Proveedor Subquery')
        prod = Producto.objects.create(
            codigo='DUN-SUB-01',
            medida='215/60R16',
            marca=marca,
            modelo='Direzza',
            indice_carga=95,
            indice_velocidad='H',
            precio_venta=Decimal('2300.00'),
        )

        # Sin entradas aún
        res_sin = self.client.get(f'/api/inventario/productos/{prod.id}/')
        self.assertEqual(res_sin.status_code, status.HTTP_200_OK)
        self.assertIsNone(res_sin.data['ultimo_precio_compra'])
        self.assertIsNone(res_sin.data['ultimo_precio_incluye_iva'])

        # Entrada antigua
        EntradaInventario.objects.create(
            producto=prod, proveedor=prov, cantidad=2,
            precio_compra=Decimal('1100.00'), precio_incluye_iva=False,
            fecha_compra=timezone.localdate() - timedelta(days=10),
            numero_factura='OLD-01',
        )
        # Entrada más reciente con IVA incluido
        EntradaInventario.objects.create(
            producto=prod, proveedor=prov, cantidad=4,
            precio_compra=Decimal('1450.50'), precio_incluye_iva=True,
            fecha_compra=timezone.localdate(),
            numero_factura='NEW-01',
        )

        res_con = self.client.get(f'/api/inventario/productos/{prod.id}/')
        self.assertEqual(res_con.status_code, status.HTTP_200_OK)
        self.assertEqual(res_con.data['ultimo_precio_compra'], 1450.5)
        self.assertTrue(res_con.data['ultimo_precio_incluye_iva'])

        # POST de producto nuevo no debe fallar por falta de anotación en instancia recién creada
        res_post = self.client.post('/api/inventario/productos/', {
            'codigo': 'DUN-NEW-02',
            'medida': '205/55R16',
            'marca': marca.id,
            'modelo': 'SP Sport',
            'indice_carga': 91,
            'indice_velocidad': 'V',
            'precio_venta': '1950.00',
            'stock_minimo': 2,
        }, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_201_CREATED, res_post.data)
        self.assertIsNone(res_post.data['ultimo_precio_compra'])

    def test_seguridad_serializers_inventario_rechazan_cantidades_y_precios_invalidos(self):
        """SEC-I1: EntradaInventarioSerializer y ProductoSerializer rechazan valores <= 0."""
        from apps.inventario.serializers import EntradaInventarioSerializer, ProductoSerializer

        marca = Marca.objects.create(nombre='PirelliSec')
        prod = Producto.objects.create(
            codigo='PIR-SEC-01',
            medida='205/55R16',
            marca=marca,
            modelo='Cinturato',
            indice_carga=91,
            indice_velocidad='V',
            precio_venta=Decimal('2200.00'),
        )

        # ProductoSerializer: precio_venta <= 0
        for precio_inv in ('0.00', '-150.00'):
            s_prod = ProductoSerializer(data={
                'codigo': 'PIR-INV-01',
                'medida': '205/55R16',
                'marca': marca.id,
                'modelo': 'Cinturato',
                'indice_carga': 91,
                'indice_velocidad': 'V',
                'precio_venta': precio_inv,
            })
            self.assertFalse(s_prod.is_valid())
            self.assertIn('precio_venta', s_prod.errors)

        # EntradaInventarioSerializer: cantidad <= 0
        for cant_inv in (0, -2):
            s_ent_cant = EntradaInventarioSerializer(data={
                'producto': prod.id,
                'proveedor': self.proveedor.id,
                'cantidad': cant_inv,
                'precio_compra': '1000.00',
                'fecha_compra': str(timezone.localdate()),
            })
            self.assertFalse(s_ent_cant.is_valid())
            self.assertIn('cantidad', s_ent_cant.errors)

        # EntradaInventarioSerializer: precio_compra <= 0
        for pc_inv in ('0.00', '-500.00'):
            s_ent_pc = EntradaInventarioSerializer(data={
                'producto': prod.id,
                'proveedor': self.proveedor.id,
                'cantidad': 4,
                'precio_compra': pc_inv,
                'fecha_compra': str(timezone.localdate()),
            })
            self.assertFalse(s_ent_pc.is_valid())
            self.assertIn('precio_compra', s_ent_pc.errors)

    def test_seguridad_importar_xml_xxe_tamano_y_tasas_negativas(self):
        """SEC-I2: ImportarXMLView bloquea XXE, archivos > 5MB, TasaOCuota negativa y cantidad <= 0."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from apps.inventario.views import ImportarXMLView

        # 1. Payload XXE (DOCTYPE + ENTITY)
        xxe_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Serie="A" Folio="1" Fecha="2026-10-30T10:00:00" SubTotal="1000" Total="1160">
            <cfdi:Emisor Nombre="&xxe;" Rfc="AAA010101AAA"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="XXE-01" Descripcion="205/55R16 91V TEST" Cantidad="1" ValorUnitario="1000.00"/>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""
        res_xxe = self.client.post(
            '/api/inventario/importar-xml/',
            {'xml': SimpleUploadedFile('xxe.xml', xxe_xml, content_type='text/xml'), 'accion': 'preview'},
            format='multipart',
        )
        self.assertEqual(res_xxe.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Archivo XML > 5 MB
        oversized_xml = SimpleUploadedFile(
            'big.xml',
            b'<cfdi:Comprobante/>' + (b' ' * (5 * 1024 * 1024 + 100)),
            content_type='text/xml',
        )
        res_size = self.client.post(
            '/api/inventario/importar-xml/',
            {'xml': oversized_xml, 'accion': 'preview'},
            format='multipart',
        )
        self.assertEqual(res_size.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('5 MB', res_size.data['error'])

        # 3. TasaOCuota negativa
        tasa_neg_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Serie="A" Folio="2" Fecha="2026-10-30T10:00:00" SubTotal="1000" Total="1000">
            <cfdi:Emisor Nombre="PROVEEDOR TEST" Rfc="AAA010101AAA"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="TNEG-01" Descripcion="205/55R16 91V TEST" Cantidad="1" ValorUnitario="1000.00">
                    <cfdi:Impuestos>
                        <cfdi:Traslados>
                            <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="-0.160000"/>
                        </cfdi:Traslados>
                    </cfdi:Impuestos>
                </cfdi:Concepto>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""
        res_tasa = self.client.post(
            '/api/inventario/importar-xml/',
            {'xml': SimpleUploadedFile('tasa_neg.xml', tasa_neg_xml, content_type='text/xml'), 'accion': 'preview'},
            format='multipart',
        )
        self.assertEqual(res_tasa.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Cantidad <= 0 en XML
        cant_cero_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Serie="A" Folio="3" Fecha="2026-10-30T10:00:00" SubTotal="1000" Total="1160">
            <cfdi:Emisor Nombre="PROVEEDOR TEST" Rfc="AAA010101AAA"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="CANT-0" Descripcion="205/55R16 91V TEST" Cantidad="0" ValorUnitario="1000.00"/>
            </cfdi:Conceptos>
        </cfdi:Comprobante>"""
        res_cant = self.client.post(
            '/api/inventario/importar-xml/',
            {'xml': SimpleUploadedFile('cant_cero.xml', cant_cero_xml, content_type='text/xml'), 'accion': 'preview'},
            format='multipart',
        )
        self.assertEqual(res_cant.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. _guardar exige proveedor.nombre y item.codigo no vacíos
        view = ImportarXMLView()
        with self.assertRaises(ValueError):
            view._guardar({
                'numero_factura': 'FAC-EMPTY-PROV',
                'fecha_compra': '2026-10-30',
                'proveedor': {'nombre': '   ', 'rfc': 'AAA010101AAA'},
                'items': [{'codigo': 'COD-1', 'descripcion': 'Test', 'cantidad': 1, 'precio_compra': 1000}],
            }, self.admin_user)

        with self.assertRaises(ValueError):
            view._guardar({
                'numero_factura': 'FAC-EMPTY-COD',
                'fecha_compra': '2026-10-30',
                'proveedor': {'nombre': 'PROV OK', 'rfc': 'AAA010101AAA'},
                'items': [{'codigo': '  ', 'descripcion': 'Test', 'cantidad': 1, 'precio_compra': 1000}],
            }, self.admin_user)


class BandejaXMLGmailTestCase(TestCase):
    """Pruebas unitarias y de seguridad para Bandeja de Facturas XML desde Gmail (OAuth2)."""

    def setUp(self):
        import tempfile
        from django.test import override_settings

        self._temp_media = tempfile.TemporaryDirectory()
        self._media_override = override_settings(
            MEDIA_ROOT=self._temp_media.name,
            CRON_SECRET_KEY='cron-secret-emirs-test-2026',
            FRONTEND_URL='http://localhost:5173',
            GOOGLE_OAUTH_CLIENT_ID='test-client-id.apps.googleusercontent.com',
            GOOGLE_OAUTH_CLIENT_SECRET='test-client-secret',
            GOOGLE_OAUTH_REDIRECT_URI='http://localhost:5173/api/inventario/xml-bandeja/gmail/callback/',
        )
        self._media_override.enable()
        self.addCleanup(self._cleanup_media)

        self.client = APIClient()
        self.admin_user = Usuario.objects.create_user(
            username='admin_xml_bandeja',
            password='password123',
            rol='admin',
            is_staff=True,
        )
        self.operador_user = Usuario.objects.create_user(
            username='operador_xml_bandeja',
            password='password123',
            rol='operador',
            is_staff=False,
        )
        self.client.force_authenticate(user=self.admin_user)

    def _cleanup_media(self):
        self._media_override.disable()
        self._temp_media.cleanup()

    def _build_cfdi_xml(
        self,
        uuid='11111111-2222-3333-4444-555555555555',
        folio='1001',
        emisor_nombre='LLANTAS DEL NORTE SA',
        emisor_rfc='LDN010101AAA',
        codigo='NEX-2055516',
        descripcion='205/55R16 91V Nexen NFERA SU1',
        cantidad='4',
        valor_unitario='1000.00',
    ):
        return f"""<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
            Serie="F" Folio="{folio}" Fecha="2026-11-10T12:00:00"
            SubTotal="4000.00" Total="4640.00" CondicionesDePago="30 dias">
            <cfdi:Emisor Nombre="{emisor_nombre}" Rfc="{emisor_rfc}"/>
            <cfdi:Conceptos>
                <cfdi:Concepto NoIdentificacion="{codigo}" Descripcion="{descripcion}"
                    Cantidad="{cantidad}" ValorUnitario="{valor_unitario}">
                    <cfdi:Impuestos>
                        <cfdi:Traslados>
                            <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000"/>
                        </cfdi:Traslados>
                    </cfdi:Impuestos>
                </cfdi:Concepto>
            </cfdi:Conceptos>
            <cfdi:Complemento>
                <tfd:TimbreFiscalDigital UUID="{uuid}" FechaTimbrado="2026-11-10T12:01:00"/>
            </cfdi:Complemento>
        </cfdi:Comprobante>""".encode('utf-8')

    def _crear_cuenta_conectada(self, email='compras@emirs.mx'):
        from datetime import timedelta, timezone as dt_timezone
        from apps.inventario.models import ConfiguracionCorreoXML
        from apps.inventario.services.gmail_sync import cifrar_token_json

        expiry = (timezone.now() + timedelta(hours=1)).astimezone(dt_timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        token_data = {
            'token': 'access-token-mock',
            'refresh_token': 'refresh-token-mock',
            'token_uri': 'https://oauth2.googleapis.com/token',
            'client_id': 'test-client-id',
            'client_secret': 'test-client-secret',
            'scopes': ['https://www.googleapis.com/auth/gmail.readonly'],
            'expiry': expiry,
        }
        return ConfiguracionCorreoXML.objects.create(
            nombre='Gmail Compras',
            email_cuenta=email,
            activa=True,
            oauth_token_json_enc=cifrar_token_json(token_data),
        )

    def _crear_factura_bandeja(self, cuenta, xml_bytes, **kwargs):
        import hashlib
        from django.core.files.base import ContentFile
        from apps.inventario.models import FacturaXMLBandeja
        from apps.inventario.services.xml_import import parsear_cfdi

        datos = parsear_cfdi(xml_bytes)
        sha = hashlib.sha256(xml_bytes).hexdigest()
        defaults = {
            'cuenta': cuenta,
            'external_message_id': kwargs.pop('external_message_id', f'msg-{sha[:8]}'),
            'attachment_key': kwargs.pop('attachment_key', 'xml:0.1:factura.xml'),
            'archivo_sha256': sha,
            'remitente_email': 'facturacion@proveedor.com',
            'remitente_nombre': 'Facturación Proveedor',
            'asunto': 'Envio de CFDI F1001',
            'fecha_correo': timezone.now(),
            'nombre_archivo': kwargs.pop('nombre_archivo', 'factura_F1001.xml'),
            'cfdi_uuid': datos['cfdi_uuid'],
            'emisor_rfc': datos['proveedor']['rfc'],
            'emisor_nombre': datos['proveedor']['nombre'],
            'numero_factura': datos['numero_factura'],
            'fecha_emision': datos['fecha_compra'],
            'subtotal': Decimal(str(datos['subtotal'])),
            'total': Decimal(str(datos['total'])),
            'total_items': len(datos['items']),
            'estado': kwargs.pop('estado', 'pendiente'),
        }
        defaults.update(kwargs)
        nombre_file = defaults['nombre_archivo']
        obj = FacturaXMLBandeja(**defaults)
        obj.archivo_xml.save(nombre_file, ContentFile(xml_bytes), save=True)
        return obj

    def test_cifrado_descifrado_fernet_y_clave_explicita(self):
        """Verifica cifrado/descifrado Fernet con fallback SECRET_KEY y clave explícita."""
        from cryptography.fernet import Fernet
        from django.test import override_settings
        from apps.inventario.services.gmail_sync import cifrar_token_json, descifrar_token_json

        payload = {'token': 'abc', 'refresh_token': 'xyz-secret'}
        enc = cifrar_token_json(payload)
        self.assertNotIn('xyz-secret', enc)
        self.assertEqual(descifrar_token_json(enc), payload)

        # Con token corrupto debe fallar explícitamente
        with self.assertRaises(ValueError):
            descifrar_token_json(enc + 'tampered')

        # Con clave explícita GMAIL_TOKEN_ENCRYPTION_KEY
        custom_key = Fernet.generate_key().decode('utf-8')
        with override_settings(GMAIL_TOKEN_ENCRYPTION_KEY=custom_key):
            enc2 = cifrar_token_json(payload)
            self.assertEqual(descifrar_token_json(enc2), payload)

        # Descifrar con clave distinta falla
        with self.assertRaises(ValueError):
            descifrar_token_json(enc2)

    def test_extraccion_segura_zip_y_rechazo_zip_slip(self):
        """Verifica extracción de XML dentro de ZIP y bloqueo de rutas zip-slip / no-XML."""
        import io
        import zipfile
        from apps.inventario.services.gmail_sync import extraer_xmls_de_zip

        xml_ok = self._build_cfdi_xml(uuid='AAAA-1111', folio='2001')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('facturas/valid.xml', xml_ok)
            zf.writestr('../../evil.xml', b'<evil/>')
            zf.writestr('/etc/passwd.xml', b'<evil/>')
            zf.writestr('C:\\windows\\system32\\bad.xml', b'<evil/>')
            zf.writestr('factura.pdf', b'%PDF-1.4')

        extraidos = extraer_xmls_de_zip(buf.getvalue())
        self.assertEqual(len(extraidos), 1)
        self.assertEqual(extraidos[0][0], 'facturas/valid.xml')
        self.assertEqual(extraidos[0][1], xml_ok)

    def test_sincronizar_gmail_mock_deduplicacion_zip_y_errores_aislados(self):
        """
        Verifica sincronizar_bandeja_xml mockeando Gmail API:
        - Descarga adjunto XML directo y XML dentro de ZIP.
        - Deduplica por SHA-256 y (cuenta, external_message_id, attachment_key).
        - Marca como 'importada' si el cfdi_uuid ya fue importado previamente.
        - Guarda 'error' si un XML es inválido/XXE sin detener los demás correos.
        """
        import base64
        import io
        import zipfile
        from unittest.mock import MagicMock, patch
        from apps.inventario.models import FacturaXMLBandeja
        from apps.inventario.services.gmail_sync import sincronizar_bandeja_xml

        cuenta = self._crear_cuenta_conectada()

        # Pre-existir una factura importada con UUID específico
        uuid_ya_importado = '99999999-9999-9999-9999-999999999999'
        xml_previo = self._build_cfdi_xml(uuid=uuid_ya_importado, folio='900')
        self._crear_factura_bandeja(
            cuenta,
            xml_previo,
            external_message_id='msg-previo',
            attachment_key='xml:0.1:previo.xml',
            estado='importada',
        )

        xml_nuevo = self._build_cfdi_xml(uuid='11111111-AAAA-BBBB-CCCC-000000000001', folio='101')
        xml_en_zip = self._build_cfdi_xml(uuid='11111111-AAAA-BBBB-CCCC-000000000002', folio='102')
        # Mismo UUID ya importado pero distinto contenido (nuevo SHA-256)
        xml_uuid_repetido = self._build_cfdi_xml(uuid=uuid_ya_importado, folio='900-REENVIO')
        xml_corrupto = b'<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><bad/>'

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, 'w') as zf:
            zf.writestr('fac_102.xml', xml_en_zip)
            zf.writestr('../zipslip.xml', xml_nuevo)

        def b64url(raw):
            return base64.urlsafe_b64encode(raw).decode('ascii')

        mensajes = {
            'm1': {
                'id': 'm1',
                'payload': {
                    'headers': [
                        {'name': 'From', 'value': 'Proveedor Uno <prov1@test.com>'},
                        {'name': 'Subject', 'value': 'Factura 101 y 102'},
                        {'name': 'Date', 'value': 'Tue, 10 Nov 2026 10:00:00 -0600'},
                    ],
                    'parts': [
                        {'filename': 'fac101.xml', 'body': {'attachmentId': 'att1', 'size': len(xml_nuevo)}},
                        {'filename': 'paquete.zip', 'body': {'attachmentId': 'att2', 'size': len(zip_buf.getvalue())}},
                    ],
                },
            },
            'm2': {
                'id': 'm2',
                'payload': {
                    'headers': [
                        {'name': 'From', 'value': 'prov2@test.com'},
                        {'name': 'Subject', 'value': 'XML roto y UUID repetido'},
                    ],
                    'parts': [
                        {'filename': 'roto.xml', 'body': {'attachmentId': 'att3', 'size': len(xml_corrupto)}},
                        {'filename': 'duplicado_sha.xml', 'body': {'attachmentId': 'att4', 'size': len(xml_nuevo)}},
                        {'filename': 'uuid_rep.xml', 'body': {'attachmentId': 'att5', 'size': len(xml_uuid_repetido)}},
                    ],
                },
            },
        }
        adjuntos = {
            ('m1', 'att1'): {'data': b64url(xml_nuevo)},
            ('m1', 'att2'): {'data': b64url(zip_buf.getvalue())},
            ('m2', 'att3'): {'data': b64url(xml_corrupto)},
            ('m2', 'att4'): {'data': b64url(xml_nuevo)},  # mismo SHA-256 que att1
            ('m2', 'att5'): {'data': b64url(xml_uuid_repetido)},
        }

        mock_service = MagicMock()
        mock_messages = mock_service.users.return_value.messages.return_value
        mock_messages.list.return_value.execute.return_value = {
            'messages': [{'id': 'm1'}, {'id': 'm2'}],
        }
        mock_messages.get.side_effect = lambda userId, id, format: MagicMock(
            execute=MagicMock(return_value=mensajes[id])
        )
        mock_messages.attachments.return_value.get.side_effect = lambda userId, messageId, id: MagicMock(
            execute=MagicMock(return_value=adjuntos[(messageId, id)])
        )

        with patch('apps.inventario.services.gmail_sync._build_gmail_service', return_value=mock_service):
            res1 = sincronizar_bandeja_xml(cuenta=cuenta)
            # Segunda corrida idéntica: todo debe deduplicarse
            res2 = sincronizar_bandeja_xml(cuenta=cuenta)

        self.assertEqual(res1['nuevas'], 3)  # fac101 (pendiente), fac_102 (pendiente), uuid_rep (importada)
        self.assertEqual(res1['duplicadas'], 1)  # duplicado_sha.xml
        self.assertEqual(res1['errores'], 1)  # roto.xml

        self.assertEqual(res2['nuevas'], 0)
        self.assertEqual(res2['errores'], 0)
        self.assertGreaterEqual(res2['duplicadas'], 4)

        fac_101 = FacturaXMLBandeja.objects.get(cfdi_uuid='11111111-AAAA-BBBB-CCCC-000000000001')
        self.assertEqual(fac_101.estado, 'pendiente')

        fac_102 = FacturaXMLBandeja.objects.get(cfdi_uuid='11111111-AAAA-BBBB-CCCC-000000000002')
        self.assertEqual(fac_102.estado, 'pendiente')

        fac_uuid_rep = FacturaXMLBandeja.objects.get(numero_factura='F900-REENVIO')
        self.assertEqual(fac_uuid_rep.estado, 'importada')

        fac_error = FacturaXMLBandeja.objects.get(nombre_archivo='roto.xml')
        self.assertEqual(fac_error.estado, 'error')
        self.assertTrue(bool(fac_error.error_detalle))

        cuenta.refresh_from_db()
        self.assertIsNotNone(cuenta.ultima_sincronizacion)
        self.assertEqual(cuenta.ultimo_error, '')

    def test_preview_importar_atomico_y_bloqueo_doble_importacion(self):
        """
        Verifica preview/, importar/ atómico, creación de inventario, bloqueo de doble
        importación y bloqueo de UUID duplicado.
        """
        from apps.inventario.models import FacturaXMLBandeja

        cuenta = self._crear_cuenta_conectada()
        xml1 = self._build_cfdi_xml(uuid='UUID-UNICO-100', folio='5001')
        xml2_mismo_uuid = self._build_cfdi_xml(uuid='UUID-UNICO-100', folio='5001-DUP')

        f1 = self._crear_factura_bandeja(cuenta, xml1, external_message_id='m-imp-1')
        f2 = self._crear_factura_bandeja(cuenta, xml2_mismo_uuid, external_message_id='m-imp-2')

        # 1. Preview
        res_prev = self.client.get(f'/api/inventario/xml-bandeja/{f1.id}/preview/')
        self.assertEqual(res_prev.status_code, status.HTTP_200_OK)
        self.assertEqual(res_prev.data['accion'], 'preview')
        self.assertEqual(res_prev.data['datos']['cfdi_uuid'], 'UUID-UNICO-100')
        self.assertEqual(len(res_prev.data['datos']['items']), 1)

        # 2. Importar primera vez
        res_imp = self.client.post(f'/api/inventario/xml-bandeja/{f1.id}/importar/')
        self.assertEqual(res_imp.status_code, status.HTTP_200_OK)
        self.assertEqual(res_imp.data['accion'], 'guardado')
        self.assertEqual(res_imp.data['resultado']['total_items'], 1)

        f1.refresh_from_db()
        self.assertEqual(f1.estado, 'importada')
        self.assertEqual(f1.importado_por, self.admin_user)
        self.assertIsNotNone(f1.importado_at)
        self.assertIsNotNone(f1.proveedor_vinculado)
        self.assertTrue(Producto.objects.filter(codigo='NEX-2055516').exists())
        self.assertEqual(EntradaInventario.objects.filter(numero_factura='F5001').count(), 1)

        # 3. Bloqueo contra doble importación del mismo registro
        res_dup = self.client.post(f'/api/inventario/xml-bandeja/{f1.id}/importar/')
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(EntradaInventario.objects.filter(numero_factura='F5001').count(), 1)

        # 4. Bloqueo contra importación de otro registro con el mismo cfdi_uuid
        res_uuid_dup = self.client.post(f'/api/inventario/xml-bandeja/{f2.id}/importar/')
        self.assertEqual(res_uuid_dup.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('UUID', res_uuid_dup.data['error'])
        f2.refresh_from_db()
        self.assertEqual(f2.estado, 'pendiente')

    def test_descargar_descartar_restaurar_y_filtros_listado(self):
        """Verifica listado paginado, filtros, descarga XML, descartar y restaurar."""
        cuenta = self._crear_cuenta_conectada()
        xml1 = self._build_cfdi_xml(uuid='UUID-LIST-1', folio='7001', emisor_nombre='PROVEEDOR ALFA')
        xml2 = self._build_cfdi_xml(uuid='UUID-LIST-2', folio='7002', emisor_nombre='PROVEEDOR BETA')

        f1 = self._crear_factura_bandeja(cuenta, xml1, external_message_id='m-l1', nombre_archivo='mi factura?.xml')
        f2 = self._crear_factura_bandeja(cuenta, xml2, external_message_id='m-l2', estado='descartada')

        # Listado filtrado por estado
        res_pend = self.client.get('/api/inventario/xml-bandeja/?estado=pendiente')
        self.assertEqual(res_pend.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pend.data['count'], 1)
        self.assertEqual(res_pend.data['results'][0]['id'], f1.id)
        # No debe exponer rutas internas ni secretos
        self.assertNotIn('archivo_xml', res_pend.data['results'][0])
        self.assertNotIn('oauth_token_json_enc', res_pend.data['results'][0])

        # Buscador
        res_search = self.client.get('/api/inventario/xml-bandeja/?search=BETA')
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertEqual(res_search.data['count'], 1)
        self.assertEqual(res_search.data['results'][0]['id'], f2.id)

        # Descargar
        res_dl = self.client.get(f'/api/inventario/xml-bandeja/{f1.id}/descargar/')
        self.assertEqual(res_dl.status_code, status.HTTP_200_OK)
        self.assertEqual(res_dl['Content-Type'], 'application/xml')
        self.assertIn('attachment;', res_dl['Content-Disposition'])
        body = b''.join(res_dl.streaming_content)
        if getattr(res_dl, 'file_to_stream', None):
            res_dl.file_to_stream.close()
        self.assertEqual(body, xml1)

        # Descartar f1
        res_desc = self.client.patch(f'/api/inventario/xml-bandeja/{f1.id}/descartar/')
        self.assertEqual(res_desc.status_code, status.HTTP_200_OK)
        f1.refresh_from_db()
        self.assertEqual(f1.estado, 'descartada')

        # Restaurar f1
        res_rest = self.client.patch(f'/api/inventario/xml-bandeja/{f1.id}/restaurar/')
        self.assertEqual(res_rest.status_code, status.HTTP_200_OK)
        f1.refresh_from_db()
        self.assertEqual(f1.estado, 'pendiente')

    def test_rbac_y_autenticacion_bandeja_xml(self):
        """
        Verifica RBAC:
        - Anónimo -> 401 en todos los endpoints protegidos.
        - Operador -> 403 en sincronizar, gmail/auth-url, gmail/disconnect, importar, descartar y restaurar.
        """
        cuenta = self._crear_cuenta_conectada()
        xml1 = self._build_cfdi_xml(uuid='UUID-RBAC-1', folio='8001')
        f1 = self._crear_factura_bandeja(cuenta, xml1, external_message_id='m-rbac')

        anon = APIClient()
        for method, url in [
            ('get', '/api/inventario/xml-bandeja/'),
            ('post', '/api/inventario/xml-bandeja/sincronizar/'),
            ('get', f'/api/inventario/xml-bandeja/{f1.id}/preview/'),
            ('post', f'/api/inventario/xml-bandeja/{f1.id}/importar/'),
            ('get', f'/api/inventario/xml-bandeja/{f1.id}/descargar/'),
            ('patch', f'/api/inventario/xml-bandeja/{f1.id}/descartar/'),
            ('get', '/api/inventario/xml-bandeja/gmail/status/'),
            ('get', '/api/inventario/xml-bandeja/gmail/auth-url/'),
            ('post', '/api/inventario/xml-bandeja/gmail/disconnect/'),
        ]:
            resp = getattr(anon, method)(url)
            self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED, f'Esperado 401 en {method} {url}')

        op = APIClient()
        op.force_authenticate(user=self.operador_user)
        for method, url in [
            ('post', '/api/inventario/xml-bandeja/sincronizar/'),
            ('get', '/api/inventario/xml-bandeja/gmail/auth-url/'),
            ('post', '/api/inventario/xml-bandeja/gmail/disconnect/'),
            ('post', f'/api/inventario/xml-bandeja/{f1.id}/importar/'),
            ('patch', f'/api/inventario/xml-bandeja/{f1.id}/descartar/'),
            ('patch', f'/api/inventario/xml-bandeja/{f1.id}/restaurar/'),
        ]:
            resp = getattr(op, method)(url)
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, f'Esperado 403 en {method} {url}')

        # Operador autenticado sí puede consultar status y listado
        self.assertEqual(op.get('/api/inventario/xml-bandeja/gmail/status/').status_code, status.HTTP_200_OK)
        self.assertEqual(op.get('/api/inventario/xml-bandeja/').status_code, status.HTTP_200_OK)

    def test_cron_validacion_x_cron_key(self):
        """Verifica que /xml-bandeja/cron/ valide X-Cron-Key con hmac.compare_digest."""
        from unittest.mock import patch

        anon = APIClient()
        # Sin header
        self.assertEqual(anon.post('/api/inventario/xml-bandeja/cron/').status_code, status.HTTP_403_FORBIDDEN)
        # Clave incorrecta
        self.assertEqual(
            anon.post('/api/inventario/xml-bandeja/cron/', HTTP_X_CRON_KEY='wrong-key').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        # Clave correcta
        with patch('apps.inventario.views.sincronizar_bandeja_xml', return_value={'cuentas_procesadas': 0, 'nuevas': 0}) as mock_sync:
            res_ok = anon.post('/api/inventario/xml-bandeja/cron/', HTTP_X_CRON_KEY='cron-secret-emirs-test-2026')
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        mock_sync.assert_called_once()

    def test_oauth2_auth_url_callback_state_anti_csrf_y_disconnect(self):
        """
        Verifica generación de auth-url, validación de state firmado en callback OAuth2
        (rechazo de state manipulado/no-admin y guardado cifrado en éxito) y disconnect.
        """
        from unittest.mock import MagicMock, patch
        from django.core.signing import TimestampSigner
        from apps.inventario.models import ConfiguracionCorreoXML
        from apps.inventario.services.gmail_sync import OAUTH_STATE_SALT, descifrar_token_json

        # 1. auth-url para admin
        res_url = self.client.get('/api/inventario/xml-bandeja/gmail/auth-url/')
        self.assertEqual(res_url.status_code, status.HTTP_200_OK)
        self.assertIn('accounts.google.com', res_url.data['auth_url'])
        self.assertIn('gmail.readonly', res_url.data['auth_url'])
        self.assertIn('access_type=offline', res_url.data['auth_url'])

        # 2. Callback público con state manipulado -> redirige con gmail=error
        anon = APIClient()
        res_bad_state = anon.get('/api/inventario/xml-bandeja/gmail/callback/?code=abc&state=forged-state')
        self.assertEqual(res_bad_state.status_code, status.HTTP_302_FOUND)
        self.assertIn('gmail=error', res_bad_state['Location'])

        # 3. Callback con state firmado de un usuario operador (no admin) -> redirige con gmail=error
        signer = TimestampSigner(salt=OAUTH_STATE_SALT)
        op_state = signer.sign_object({'uid': self.operador_user.id, 'nonce': 'n1'})
        res_op_state = anon.get(f'/api/inventario/xml-bandeja/gmail/callback/?code=abc&state={op_state}')
        self.assertEqual(res_op_state.status_code, status.HTTP_302_FOUND)
        self.assertIn('gmail=error', res_op_state['Location'])

        # 4. Callback válido de admin -> intercambia token, guarda cifrado y redirige a connected
        admin_state = signer.sign_object({'uid': self.admin_user.id, 'nonce': 'n2'})
        mock_creds = MagicMock()
        mock_creds.to_json.return_value = '{"token": "t-ok", "refresh_token": "r-secret-ok"}'
        mock_flow = MagicMock()
        mock_flow.credentials = mock_creds

        mock_service = MagicMock()
        mock_service.users.return_value.getProfile.return_value.execute.return_value = {
            'emailAddress': 'facturas@emirs.mx',
            'historyId': '12345',
        }

        with (
            patch('apps.inventario.services.gmail_sync.Flow.from_client_config', return_value=mock_flow),
            patch('apps.inventario.services.gmail_sync._build_gmail_service', return_value=mock_service),
        ):
            res_ok = anon.get(f'/api/inventario/xml-bandeja/gmail/callback/?code=valid-code&state={admin_state}')

        self.assertEqual(res_ok.status_code, status.HTTP_302_FOUND)
        self.assertEqual(res_ok['Location'], 'http://localhost:5173/inventario?tab=xml&subtab=bandeja&gmail=connected')

        cuenta = ConfiguracionCorreoXML.objects.get(email_cuenta='facturas@emirs.mx')
        self.assertTrue(cuenta.activa)
        self.assertNotIn('r-secret-ok', cuenta.oauth_token_json_enc)
        self.assertEqual(descifrar_token_json(cuenta.oauth_token_json_enc)['refresh_token'], 'r-secret-ok')

        # 5. Status conectado
        res_status = self.client.get('/api/inventario/xml-bandeja/gmail/status/')
        self.assertEqual(res_status.status_code, status.HTTP_200_OK)
        self.assertTrue(res_status.data['conectado'])
        self.assertTrue(res_status.data['connected'])
        self.assertTrue(res_status.data['oauth_configurado'])
        self.assertTrue(res_status.data['configured_env'])
        self.assertIn('pendientes_count', res_status.data)
        self.assertEqual(res_status.data['email_cuenta'], 'facturas@emirs.mx')

        # 6. Disconnect
        res_disc = self.client.post('/api/inventario/xml-bandeja/gmail/disconnect/')
        self.assertEqual(res_disc.status_code, status.HTTP_200_OK)
        self.assertFalse(res_disc.data['conectado'])
        cuenta.refresh_from_db()
        self.assertFalse(cuenta.activa)
        self.assertEqual(cuenta.oauth_token_json_enc, '')

    def test_gmail_status_contrato_y_pendientes_count(self):
        """Verifica que gmail/status/ incluya conectado, connected, oauth_configurado, configured_env y pendientes_count."""
        from django.test import override_settings

        cuenta = self._crear_cuenta_conectada()
        xml1 = self._build_cfdi_xml(uuid='UUID-STAT-1', folio='9101')
        xml2 = self._build_cfdi_xml(uuid='UUID-STAT-2', folio='9102')
        xml3 = self._build_cfdi_xml(uuid='UUID-STAT-3', folio='9103')
        self._crear_factura_bandeja(cuenta, xml1, external_message_id='m-st1', estado='pendiente')
        self._crear_factura_bandeja(cuenta, xml2, external_message_id='m-st2', estado='pendiente')
        self._crear_factura_bandeja(cuenta, xml3, external_message_id='m-st3', estado='descartada')

        res = self.client.get('/api/inventario/xml-bandeja/gmail/status/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIs(res.data['conectado'], True)
        self.assertIs(res.data['connected'], True)
        self.assertIs(res.data['oauth_configurado'], True)
        self.assertIs(res.data['configured_env'], True)
        self.assertEqual(res.data['pendientes_count'], 2)

        with override_settings(GOOGLE_OAUTH_CLIENT_ID='', GOOGLE_OAUTH_CLIENT_SECRET=''):
            cuenta.activa = False
            cuenta.save(update_fields=['activa'])
            res_off = self.client.get('/api/inventario/xml-bandeja/gmail/status/')
        self.assertEqual(res_off.status_code, status.HTTP_200_OK)
        self.assertIs(res_off.data['conectado'], False)
        self.assertIs(res_off.data['connected'], False)
        self.assertIs(res_off.data['oauth_configurado'], False)
        self.assertIs(res_off.data['configured_env'], False)
        self.assertEqual(res_off.data['pendientes_count'], 2)

    def test_cron_rechaza_claves_vacias_e_inseguras_en_bandeja_y_notificaciones(self):
        """Verifica rechazo 403 cuando CRON_SECRET_KEY es '' o el fallback inseguro en ambos endpoints /cron/."""
        from django.test import override_settings

        anon = APIClient()
        for bad_secret in ('', 'cambia-esto-en-produccion'):
            with override_settings(CRON_SECRET_KEY=bad_secret):
                res_xml = anon.post(
                    '/api/inventario/xml-bandeja/cron/',
                    HTTP_X_CRON_KEY=bad_secret,
                )
                self.assertEqual(res_xml.status_code, status.HTTP_403_FORBIDDEN)

                res_notif = anon.post(
                    '/api/notificaciones/cron/',
                    HTTP_X_CRON_KEY=bad_secret,
                )
                self.assertEqual(res_notif.status_code, status.HTTP_403_FORBIDDEN)

    def test_preview_file_not_found_y_error_inesperado_no_exponen_rutas(self):
        """Verifica que preview/ devuelva 404 ante FileNotFoundError y no filtre rutas absolutas."""
        import os
        from unittest.mock import patch

        cuenta = self._crear_cuenta_conectada()
        xml1 = self._build_cfdi_xml(uuid='UUID-FNFE-1', folio='9201')
        f1 = self._crear_factura_bandeja(cuenta, xml1, external_message_id='m-fnfe')

        # Eliminar el archivo físico del disco conservando el registro en BD
        ruta_fisica = f1.archivo_xml.path
        self.assertTrue(os.path.exists(ruta_fisica))
        os.remove(ruta_fisica)

        res_404 = self.client.get(f'/api/inventario/xml-bandeja/{f1.id}/preview/')
        self.assertEqual(res_404.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res_404.data['error'], 'El archivo XML no se encuentra disponible.')
        self.assertNotIn(self._temp_media.name, str(res_404.data))

        # Simular error inesperado durante lectura con ruta interna sensible
        with patch.object(
            f1.archivo_xml.storage,
            'open',
            side_effect=RuntimeError('/srv/secret/internal/path/factura.xml permission denied'),
        ):
            res_500 = self.client.get(f'/api/inventario/xml-bandeja/{f1.id}/preview/')
        self.assertEqual(res_500.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertNotIn('/srv/secret', str(res_500.data))

    def test_importar_rechaza_registro_descartado(self):
        """Verifica que importar/ rechace registros en estado 'descartada' con HTTP 400."""
        cuenta = self._crear_cuenta_conectada()
        xml1 = self._build_cfdi_xml(uuid='UUID-DESC-1', folio='9301')
        f1 = self._crear_factura_bandeja(
            cuenta,
            xml1,
            external_message_id='m-desc-imp',
            estado='descartada',
        )

        res = self.client.post(f'/api/inventario/xml-bandeja/{f1.id}/importar/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            res.data['error'],
            'Este XML está descartado. Restáuralo a pendiente antes de importarlo.',
        )
        f1.refresh_from_db()
        self.assertEqual(f1.estado, 'descartada')

