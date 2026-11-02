from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Avg, Q, F
from django.utils import timezone
from django.http import HttpResponse
from datetime import datetime, date, time
import calendar


class ResumenDashboard(APIView):
    """
    GET /api/reportes/resumen/
    Devuelve todos los KPIs del dashboard en una sola llamada.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ventas.models import Venta
        from apps.gastos.models import Gasto
        from apps.caja.models import Caja
        from apps.nomina.models import PeriodoNomina
        from apps.inventario.models import Producto

        hoy = timezone.now().date()
        inicio_mes = hoy.replace(day=1)

        # ── Ventas ────────────────────────────────────────────────────────────
        ventas_hoy_qs = Venta.objects.filter(fecha__date=hoy)
        ventas_mes_qs = Venta.objects.filter(fecha__date__gte=inicio_mes)

        ventas_hoy_agg = ventas_hoy_qs.aggregate(
            total=Sum('total'), cantidad=Count('id')
        )
        ventas_mes_agg = ventas_mes_qs.aggregate(
            total=Sum('total'), cantidad=Count('id')
        )
        ticket_promedio = ventas_hoy_agg['total'] / ventas_hoy_agg['cantidad'] \
            if ventas_hoy_agg['cantidad'] else 0

        # Desglose por método de pago hoy
        por_metodo_hoy = list(
            ventas_hoy_qs.values('metodo_pago').annotate(
                total=Sum('total'), cantidad=Count('id')
            )
        )

        # Top 5 productos más vendidos del mes
        from apps.ventas.models import DetalleVenta
        top_productos = list(
            DetalleVenta.objects
            .filter(venta__fecha__date__gte=inicio_mes, producto__isnull=False)
            .values('descripcion', 'producto__codigo')
            .annotate(cantidad=Sum('cantidad'), total=Sum('subtotal'))
            .order_by('-cantidad')[:5]
        )

        # Acumulado por vendedor del mes
        por_vendedor = list(
            ventas_mes_qs.values(
                'empleado__nombre', 'empleado__apellido'
            ).annotate(
                total=Sum('total'), cantidad=Count('id')
            ).order_by('-total')[:10]
        )

        # ── Caja ──────────────────────────────────────────────────────────────
        caja_abierta = Caja.objects.filter(estado='abierta').first()
        caja_info = None
        if caja_abierta:
            caja_info = {
                'id': caja_abierta.id,
                'folio': caja_abierta.folio,
                'monto_inicial': float(caja_abierta.monto_inicial),
                'saldo_esperado': float(caja_abierta.saldo_esperado),
                'total_ventas': float(caja_abierta.total_ventas),
                'total_egresos': float(caja_abierta.total_egresos),
                'diferencia': float(caja_abierta.diferencia) if caja_abierta.diferencia is not None else None,
            }

        # ── Gastos ────────────────────────────────────────────────────────────
        gastos_hoy_agg = Gasto.objects.filter(fecha=hoy).aggregate(total=Sum('monto'), cantidad=Count('id'))
        gastos_mes_agg = Gasto.objects.filter(fecha__gte=inicio_mes).aggregate(total=Sum('monto'), cantidad=Count('id'))

        por_categoria_mes = list(
            Gasto.objects.filter(fecha__gte=inicio_mes)
            .values('categoria__nombre')
            .annotate(total=Sum('monto'))
            .order_by('-total')[:5]
        )

        # ── Nómina ────────────────────────────────────────────────────────────
        periodo_activo = PeriodoNomina.objects.filter(estado='borrador').order_by('-fecha_inicio').first()
        nomina_info = None
        if periodo_activo:
            nomina_info = {
                'id': periodo_activo.id,
                'fecha_inicio': str(periodo_activo.fecha_inicio),
                'fecha_fin': str(periodo_activo.fecha_fin),
                'estado': periodo_activo.estado,
                'total_general': float(periodo_activo.total_general or 0),
                'total_efectivo': float(periodo_activo.total_efectivo or 0),
                'total_transferencia': float(periodo_activo.total_transferencia or 0),
                'total_comisiones': float(periodo_activo.total_comisiones or 0),
            }

        # ── Inventario ────────────────────────────────────────────────────────
        total_productos = Producto.objects.filter(activo=True).count()
        # stock_actual es una propiedad (no campo DB): contar en Python
        alertas_stock = sum(
            1 for p in Producto.objects.filter(activo=True).only('id', 'stock_minimo')
            if p.stock_actual <= p.stock_minimo
        )

        return Response({
            'ventas': {
                'hoy_total': float(ventas_hoy_agg['total'] or 0),
                'hoy_cantidad': ventas_hoy_agg['cantidad'] or 0,
                'mes_total': float(ventas_mes_agg['total'] or 0),
                'mes_cantidad': ventas_mes_agg['cantidad'] or 0,
                'ticket_promedio': float(ticket_promedio),
                'por_metodo_hoy': por_metodo_hoy,
                'top_productos': top_productos,
                'por_vendedor': por_vendedor,
            },
            'caja': caja_info,
            'gastos': {
                'hoy_total': float(gastos_hoy_agg['total'] or 0),
                'hoy_cantidad': gastos_hoy_agg['cantidad'] or 0,
                'mes_total': float(gastos_mes_agg['total'] or 0),
                'mes_cantidad': gastos_mes_agg['cantidad'] or 0,
                'por_categoria': por_categoria_mes,
            },
            'nomina': nomina_info,
            'inventario': {
                'total_productos': total_productos,
                'alertas_stock': alertas_stock,
            },
        })


class ResumenVentas(APIView):
    """GET /api/reportes/ventas/?fecha_inicio=&fecha_fin="""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ventas.models import Venta, DetalleVenta
        from django.db.models.functions import TruncDate

        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))

        ventas = Venta.objects.filter(fecha__date__range=[fecha_inicio, fecha_fin])

        por_dia = list(
            ventas.annotate(dia=TruncDate('fecha'))
            .values('dia')
            .annotate(total=Sum('total'), cantidad=Count('id'))
            .order_by('dia')
        )

        por_empleado = list(
            ventas.values('empleado__nombre', 'empleado__apellido', 'empleado__id')
            .annotate(total=Sum('total'), cantidad=Count('id'))
            .order_by('-total')
        )

        totales = ventas.aggregate(
            total=Sum('total'), cantidad=Count('id'),
            efectivo=Sum('monto_efectivo'), electronico=Sum('monto_electronico')
        )

        return Response({
            'periodo': {'inicio': fecha_inicio, 'fin': fecha_fin},
            'totales': {k: float(v or 0) if v is not None else 0 for k, v in totales.items()},
            'por_dia': [{'dia': str(r['dia']), 'total': float(r['total'] or 0), 'cantidad': r['cantidad']} for r in por_dia],
            'por_empleado': [
                {
                    'empleado_id': r['empleado__id'],
                    'nombre': f"{r['empleado__nombre']} {r['empleado__apellido']}".strip(),
                    'total': float(r['total'] or 0),
                    'cantidad': r['cantidad'],
                }
                for r in por_empleado
            ],
        })


class ComisionesVendedor(APIView):
    """
    GET /api/reportes/comisiones/?empleado_id=&fecha_inicio=&fecha_fin=
    Calcula las comisiones de un vendedor en base a sus ventas del período.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ventas.models import Venta
        from apps.nomina.models import Empleado

        empleado_id = request.query_params.get('empleado_id')
        hoy = timezone.now().date()
        # Por defecto: semana actual (lunes–domingo)
        dia = hoy.weekday()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy - timezone.timedelta(days=dia)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))

        if not empleado_id:
            # Todos los empleados activos
            empleados = Empleado.objects.filter(activo=True, comision_porcentaje__gt=0)
        else:
            empleados = Empleado.objects.filter(id=empleado_id)

        resultado = []
        for emp in empleados:
            ventas = Venta.objects.filter(
                empleado=emp,
                fecha__date__range=[fecha_inicio, fecha_fin]
            )
            total_ventas = ventas.aggregate(t=Sum('total'))['t'] or 0
            comision = float(total_ventas) * float(emp.comision_porcentaje) / 100
            resultado.append({
                'empleado_id': emp.id,
                'nombre': f'{emp.nombre} {emp.apellido}'.strip(),
                'comision_porcentaje': float(emp.comision_porcentaje),
                'total_ventas': float(total_ventas),
                'comision_calculada': round(comision, 2),
                'num_ventas': ventas.count(),
            })

        return Response({
            'periodo': {'inicio': fecha_inicio, 'fin': fecha_fin},
            'vendedores': resultado,
        })


class ResumenGastos(APIView):
    """GET /api/reportes/gastos/?fecha_inicio=&fecha_fin="""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.gastos.models import Gasto
        from django.db.models.functions import TruncDate

        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))

        gastos = Gasto.objects.filter(fecha__range=[fecha_inicio, fecha_fin])

        totales = gastos.aggregate(
            total=Sum('monto'),
            cantidad=Count('id'),
            efectivo=Sum('monto', filter=__import__('django.db.models', fromlist=['Q']).Q(metodo_pago='efectivo')),
            transferencia=Sum('monto', filter=__import__('django.db.models', fromlist=['Q']).Q(metodo_pago='transferencia')),
            tarjeta=Sum('monto', filter=__import__('django.db.models', fromlist=['Q']).Q(metodo_pago='tarjeta')),
        )

        por_categoria = list(
            gastos.values('categoria__nombre', 'categoria__tipo')
            .annotate(total=Sum('monto'), cantidad=Count('id'))
            .order_by('-total')
        )

        por_dia = list(
            gastos.annotate(dia=TruncDate('fecha'))
            .values('dia')
            .annotate(total=Sum('monto'), cantidad=Count('id'))
            .order_by('dia')
        )

        detalle = list(
            gastos.select_related('categoria', 'responsable')
            .values('fecha', 'concepto', 'categoria__nombre', 'monto', 'metodo_pago',
                    'responsable__nombre', 'responsable__apellido', 'notas')
            .order_by('fecha')
        )

        return Response({
            'periodo': {'inicio': fecha_inicio, 'fin': fecha_fin},
            'totales': {k: float(v or 0) for k, v in totales.items()},
            'por_categoria': [
                {'categoria': r['categoria__nombre'] or 'Sin categoría',
                 'tipo': r['categoria__tipo'] or '',
                 'total': float(r['total'] or 0),
                 'cantidad': r['cantidad']}
                for r in por_categoria
            ],
            'por_dia': [
                {'dia': str(r['dia']), 'total': float(r['total'] or 0), 'cantidad': r['cantidad']}
                for r in por_dia
            ],
            'detalle': [
                {
                    'fecha': str(r['fecha']),
                    'concepto': r['concepto'],
                    'categoria': r['categoria__nombre'] or 'Sin categoría',
                    'monto': float(r['monto'] or 0),
                    'metodo_pago': r['metodo_pago'],
                    'responsable': f"{r['responsable__nombre'] or ''} {r['responsable__apellido'] or ''}".strip() or '—',
                    'notas': r['notas'],
                }
                for r in detalle
            ],
        })


class BalanceGlobalView(APIView):
    """
    GET /api/reportes/balance-global/?mes=MM&anio=YYYY o ?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    Consolida el Balance Financiero Global y Flujo Neto Disponible:
    - Ingresos Taller (POS)
    - Ingresos Rescates Viales (Móvil)
    - Desglose por método de pago
    - Egresos por Nómina (Pagada)
    - Egresos a Proveedores
    - Gastos Operativos
    - Costo de Mercancía Vendida (PEPS)
    - Flujo Neto de Efectivo y Utilidad Operativa
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        import calendar
        from datetime import datetime, date
        from django.db.models import Sum, Count, Q, F
        from apps.ventas.models import Venta
        from apps.rescates.models import Rescate
        from apps.gastos.models import Gasto
        from apps.nomina.models import PeriodoNomina
        from apps.inventario.models import PagoProveedor, SalidaInventario

        hoy = timezone.localdate()
        mes_param = request.query_params.get('mes')
        anio_param = request.query_params.get('anio')
        fecha_inicio_param = request.query_params.get('fecha_inicio')
        fecha_fin_param = request.query_params.get('fecha_fin')

        if fecha_inicio_param and fecha_fin_param:
            try:
                fecha_inicio = datetime.strptime(fecha_inicio_param, '%Y-%m-%d').date()
                fecha_fin = datetime.strptime(fecha_fin_param, '%Y-%m-%d').date()
                mes = fecha_inicio.month
                anio = fecha_inicio.year
            except ValueError:
                fecha_inicio = hoy.replace(day=1)
                _, last_day = calendar.monthrange(hoy.year, hoy.month)
                fecha_fin = hoy.replace(day=last_day)
                mes = hoy.month
                anio = hoy.year
        else:
            try:
                anio = int(anio_param) if anio_param else hoy.year
                mes = int(mes_param) if mes_param else hoy.month
            except (ValueError, TypeError):
                anio = hoy.year
                mes = hoy.month
            fecha_inicio = date(anio, mes, 1)
            _, last_day = calendar.monthrange(anio, mes)
            fecha_fin = date(anio, mes, last_day)

        # ── 1. Ingresos Taller (Ventas POS) ───────────────────────────────────
        from datetime import time as dt_time, datetime as dt_datetime
        tz = timezone.get_current_timezone()
        inicio_dt = timezone.make_aware(dt_datetime.combine(fecha_inicio, dt_time.min), tz)
        fin_dt = timezone.make_aware(dt_datetime.combine(fecha_fin, dt_time.max), tz)

        ventas_qs = Venta.objects.filter(fecha__range=[inicio_dt, fin_dt])
        ventas_agg = ventas_qs.aggregate(
            total=Sum('total'),
            efectivo=Sum('monto_efectivo'),
            electronico=Sum('monto_electronico'),
            cantidad=Count('id')
        )
        ventas_taller_base = float(ventas_agg['total'] or 0)

        # ── 2. Ingresos Rescates Viales ───────────────────────────────────────
        rescates_qs = Rescate.objects.filter(
            estado='completado',
            fecha_solicitud__range=[inicio_dt, fin_dt]
        )
        rescates_agg = rescates_qs.aggregate(
            total=Sum('total'),
            efectivo=Sum('monto_efectivo'),
            electronico=Sum('monto_electronico'),
            cantidad=Count('id')
        )
        rescates_total_bruto = float(rescates_agg['total'] or 0)
        num_rescates = int(rescates_agg['cantidad'] or 0)

        # Segregación contable: llantas vendidas en rescates se computan en ingresos de ventas del taller
        from apps.rescates.models import DetalleRescate
        llantas_rescates_monto = float(
            DetalleRescate.objects.filter(
                rescate__in=rescates_qs,
                producto__isnull=False
            ).aggregate(t=Sum('subtotal'))['t'] or 0
        )
        ingresos_taller = ventas_taller_base + llantas_rescates_monto
        ingresos_rescates = max(0.0, rescates_total_bruto - llantas_rescates_monto)
        num_ventas = int(ventas_agg['cantidad'] or 0)
        ticket_prom_taller = ingresos_taller / num_ventas if num_ventas > 0 else 0
        ticket_prom_rescates = ingresos_rescates / num_rescates if num_rescates > 0 else 0

        total_ingresos = ingresos_taller + ingresos_rescates

        # ── 3. Desglose Consolidado de Ingresos por Método de Pago ────────────
        efectivo_total = float((ventas_agg['efectivo'] or 0) + (rescates_agg['efectivo'] or 0))

        v_debito = float(ventas_qs.filter(tipo_tarjeta='debito').aggregate(t=Sum('monto_electronico'))['t'] or 0)
        r_debito = float(rescates_qs.filter(tipo_tarjeta='debito').aggregate(t=Sum('monto_electronico'))['t'] or 0)
        tarjeta_debito = v_debito + r_debito

        v_credito = float(ventas_qs.filter(tipo_tarjeta='credito').aggregate(t=Sum('monto_electronico'))['t'] or 0)
        r_credito = float(rescates_qs.filter(tipo_tarjeta='credito').aggregate(t=Sum('monto_electronico'))['t'] or 0)
        tarjeta_credito = v_credito + r_credito

        v_tarj_otro = float(ventas_qs.filter(metodo_pago='tarjeta', tipo_tarjeta__isnull=True).aggregate(t=Sum('monto_electronico'))['t'] or 0)
        r_tarj_otro = float(rescates_qs.filter(metodo_pago='tarjeta', tipo_tarjeta__isnull=True).aggregate(t=Sum('monto_electronico'))['t'] or 0)
        tarjeta_total = tarjeta_debito + tarjeta_credito + v_tarj_otro + r_tarj_otro

        v_transf = float(ventas_qs.filter(metodo_pago='transferencia').aggregate(t=Sum('monto_electronico'))['t'] or 0)
        r_transf = float(rescates_qs.filter(metodo_pago='transferencia').aggregate(t=Sum('monto_electronico'))['t'] or 0)
        transferencia_total = v_transf + r_transf

        # ── 4. Egresos Nómina (Períodos pagados en el rango) ───────────────────
        nominas_qs = PeriodoNomina.objects.filter(
            estado='pagada',
            fecha_fin__range=[fecha_inicio, fecha_fin]
        )
        nom_agg = nominas_qs.aggregate(
            total_general=Sum('total_general'),
            total_efectivo=Sum('total_efectivo'),
            total_transferencia=Sum('total_transferencia'),
            total_comisiones=Sum('total_comisiones'),
            total_domingos=Sum('total_domingos'),
            cantidad=Count('id')
        )
        egresos_nomina_total = float(nom_agg['total_general'] or 0)
        nomina_detalle = [
            {
                'id': n.id,
                'fecha_inicio': str(n.fecha_inicio),
                'fecha_fin': str(n.fecha_fin),
                'total_general': float(n.total_general),
                'total_efectivo': float(n.total_efectivo),
                'total_transferencia': float(n.total_transferencia),
                'total_comisiones': float(n.total_comisiones),
                'total_domingos': float(n.total_domingos),
                'observaciones': n.observaciones or ''
            }
            for n in nominas_qs.order_by('-fecha_inicio')
        ]

        # ── 5. Egresos Pagos a Proveedores ────────────────────────────────────
        pagos_prov_qs = PagoProveedor.objects.filter(fecha__range=[fecha_inicio, fecha_fin])
        pagos_agg = pagos_prov_qs.aggregate(total=Sum('monto'), cantidad=Count('id'))
        egresos_proveedores_total = float(pagos_agg['total'] or 0)
        desglose_proveedores = list(
            pagos_prov_qs.values('proveedor__nombre')
            .annotate(total=Sum('monto'), cantidad=Count('id'))
            .order_by('-total')
        )
        pagos_detalle = [
            {
                'id': p.id,
                'proveedor_nombre': p.proveedor.nombre if p.proveedor else 'Sin nombre',
                'monto': float(p.monto),
                'fecha_pago': str(p.fecha),
                'metodo_pago': p.metodo_pago,
                'numero_referencia': p.referencia,
                'numero_factura': p.numero_factura,
                'notas': p.notas,
            }
            for p in pagos_prov_qs.select_related('proveedor').order_by('-fecha', '-created_at')
        ]

        # ── 6. Egresos Gastos Operativos ──────────────────────────────────────
        gastos_qs = Gasto.objects.filter(fecha__range=[fecha_inicio, fecha_fin])
        gastos_agg = gastos_qs.aggregate(
            total=Sum('monto'),
            efectivo=Sum('monto', filter=Q(metodo_pago='efectivo')),
            transferencia=Sum('monto', filter=Q(metodo_pago='transferencia')),
            tarjeta=Sum('monto', filter=Q(metodo_pago='tarjeta')),
            cantidad=Count('id')
        )
        egresos_gastos_total = float(gastos_agg['total'] or 0)
        gastos_por_categoria = list(
            gastos_qs.values('categoria__nombre', 'categoria__tipo')
            .annotate(total=Sum('monto'), cantidad=Count('id'))
            .order_by('-total')
        )

        # ── 7. Costo de Mercancía Vendida (PEPS) ──────────────────────────────
        salidas_qs = SalidaInventario.objects.filter(fecha_venta__range=[fecha_inicio, fecha_fin])
        costo_mercancia = float(
            salidas_qs.aggregate(
                c=Sum(F('precio_costo') * F('cantidad'))
            )['c'] or 0
        )

        # ── 8. Cálculos Finales de Balance y Utilidad ──────────────────────────
        total_egresos_flujo = egresos_nomina_total + egresos_proveedores_total + egresos_gastos_total
        flujo_neto_disponible = total_ingresos - total_egresos_flujo
        utilidad_operativa = total_ingresos - (costo_mercancia + egresos_nomina_total + egresos_gastos_total)
        margen_operativo = (utilidad_operativa / total_ingresos * 100) if total_ingresos > 0 else 0

        return Response({
            'periodo': {
                'fecha_inicio': str(fecha_inicio),
                'fecha_fin': str(fecha_fin),
                'mes': mes,
                'anio': anio,
            },
            'resumen_ejecutivo': {
                'ingresos_taller': ingresos_taller,
                'ingresos_rescates': ingresos_rescates,
                'total_ingresos': total_ingresos,
                'costo_mercancia_vendida': costo_mercancia,
                'egresos_gastos': egresos_gastos_total,
                'egresos_nomina': egresos_nomina_total,
                'egresos_proveedores': egresos_proveedores_total,
                'total_egresos_flujo': total_egresos_flujo,
                'flujo_neto_disponible': flujo_neto_disponible,
                'utilidad_operativa': utilidad_operativa,
                'margen_operativo_porcentaje': round(margen_operativo, 2),
            },
            'desglose_ingresos': {
                'efectivo': efectivo_total,
                'tarjeta_debito': tarjeta_debito,
                'tarjeta_credito': tarjeta_credito,
                'tarjeta_total': tarjeta_total,
                'transferencia': transferencia_total,
                'total': total_ingresos,
            },
            'taller': {
                'total': ingresos_taller,
                'num_ventas': num_ventas,
                'ticket_promedio': ticket_prom_taller,
                'por_metodo_pago': list(
                    ventas_qs.values('metodo_pago').annotate(total=Sum('total'), cantidad=Count('id'))
                ),
            },
            'rescates': {
                'total': ingresos_rescates,
                'num_rescates': num_rescates,
                'ticket_promedio': ticket_prom_rescates,
                'por_unidad': list(
                    rescates_qs.values('unidad__numero_economico', 'unidad__nombre')
                    .annotate(total=Sum('total'), cantidad=Count('id'))
                    .order_by('-total')
                ),
                'por_operador': list(
                    rescates_qs.values('operador__nombre', 'operador__apellido')
                    .annotate(total=Sum('total'), cantidad=Count('id'))
                    .order_by('-total')
                ),
                'por_metodo_pago': list(
                    rescates_qs.values('metodo_pago').annotate(total=Sum('total'), cantidad=Count('id'))
                ),
            },
            'nomina': {
                'total': egresos_nomina_total,
                'efectivo': float(nom_agg['total_efectivo'] or 0),
                'transferencia': float(nom_agg['total_transferencia'] or 0),
                'comisiones': float(nom_agg['total_comisiones'] or 0),
                'domingos': float(nom_agg['total_domingos'] or 0),
                'cantidad_periodos': int(nom_agg['cantidad'] or 0),
                'periodos': nomina_detalle,
            },
            'proveedores': {
                'total': egresos_proveedores_total,
                'cantidad_pagos': int(pagos_agg['cantidad'] or 0),
                'desglose': [
                    {
                        'proveedor': r['proveedor__nombre'] or 'Sin nombre',
                        'total': float(r['total'] or 0),
                        'cantidad': r['cantidad']
                    }
                    for r in desglose_proveedores
                ],
                'pagos_detalle': pagos_detalle,
            },
            'pagos_detalle': pagos_detalle,
            'gastos': {
                'total': egresos_gastos_total,
                'efectivo': float(gastos_agg['efectivo'] or 0),
                'transferencia': float(gastos_agg['transferencia'] or 0),
                'tarjeta': float(gastos_agg['tarjeta'] or 0),
                'cantidad_gastos': int(gastos_agg['cantidad'] or 0),
                'por_categoria': [
                    {
                        'categoria': r['categoria__nombre'] or 'Sin categoría',
                        'tipo': r['categoria__tipo'] or '',
                        'total': float(r['total'] or 0),
                        'cantidad': r['cantidad']
                    }
                    for r in gastos_por_categoria
                ],
            },
        })


class ReportePDF(APIView):
    """
    GET /api/reportes/pdf/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    Genera la Minuta de Operación PDF en ReportLab con:
    - Balance Ejecutivo Global y Flujo Neto Disponible
    - Ingresos Taller y Rescates Viales
    - Detalle de Pagos a Proveedores y Mercancía
    - Detalle de Nóminas Pagadas (Sueldos, Comisiones, Domingos)
    - Detalle de Gastos Operativos
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ventas.models import Venta, DetalleVenta
        from apps.rescates.models import Rescate
        from apps.gastos.models import Gasto
        from apps.nomina.models import PeriodoNomina
        from apps.inventario.models import PagoProveedor, SalidaInventario
        from django.db.models import Q, F
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image,
        )
        import io, os

        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))

        logo_path = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', '..', '..', 'frontend', 'public', 'images', 'logo_hd.png'
        ))

        # ── 1. Consultas de Datos ─────────────────────────────────────────────
        # Ventas Taller
        ventas_qs = Venta.objects.filter(fecha__date__range=[fecha_inicio, fecha_fin])
        v_total = ventas_qs.aggregate(
            total=Sum('total'),
            efectivo=Sum('monto_efectivo'),
            electronico=Sum('monto_electronico'),
            cantidad=Count('id'),
        )
        venta_taller_base = float(v_total['total'] or 0)

        # Rescates Viales
        rescates_qs = Rescate.objects.filter(
            estado='completado',
            fecha_solicitud__date__range=[fecha_inicio, fecha_fin]
        )
        r_total = rescates_qs.aggregate(
            total=Sum('total'),
            efectivo=Sum('monto_efectivo'),
            electronico=Sum('monto_electronico'),
            cantidad=Count('id')
        )
        rescate_total_bruto = float(r_total['total'] or 0)

        # Segregación contable de ingresos
        from apps.rescates.models import DetalleRescate
        llantas_rescates_monto = float(
            DetalleRescate.objects.filter(
                rescate__in=rescates_qs,
                producto__isnull=False
            ).aggregate(t=Sum('subtotal'))['t'] or 0
        )
        venta_total_f = venta_taller_base + llantas_rescates_monto
        rescate_total_f = max(0.0, rescate_total_bruto - llantas_rescates_monto)
        total_ingresos_f = venta_total_f + rescate_total_f

        # Top productos vendidos
        top_productos = list(
            DetalleVenta.objects
            .filter(venta__fecha__date__range=[fecha_inicio, fecha_fin])
            .values('descripcion')
            .annotate(piezas=Sum('cantidad'), subtotal=Sum('subtotal'))
            .order_by('-subtotal')[:8]
        )

        # Ventas por vendedor
        por_vendedor = list(
            ventas_qs.values('empleado__nombre', 'empleado__apellido')
            .annotate(total=Sum('total'), cantidad=Count('id'))
            .order_by('-total')
        )

        # Gastos operativos
        gastos_qs = Gasto.objects.filter(fecha__range=[fecha_inicio, fecha_fin])
        g_total = gastos_qs.aggregate(
            total=Sum('monto'),
            efectivo=Sum('monto', filter=Q(metodo_pago='efectivo')),
            transferencia=Sum('monto', filter=Q(metodo_pago='transferencia')),
            tarjeta=Sum('monto', filter=Q(metodo_pago='tarjeta')),
        )
        gasto_total_f = float(g_total['total'] or 0)

        por_cat_gasto = list(
            gastos_qs.values('categoria__nombre')
            .annotate(total=Sum('monto'))
            .order_by('-total')
        )

        # Nóminas pagadas
        nominas_qs = PeriodoNomina.objects.filter(
            estado='pagada',
            fecha_fin__range=[fecha_inicio, fecha_fin]
        ).order_by('fecha_inicio')
        nom_total = nominas_qs.aggregate(
            total=Sum('total_general'),
            efectivo=Sum('total_efectivo'),
            transferencia=Sum('total_transferencia'),
            comisiones=Sum('total_comisiones'),
            domingos=Sum('total_domingos')
        )
        nomina_total_f = float(nom_total['total'] or 0)

        # Pagos a Proveedores
        pagos_prov_qs = PagoProveedor.objects.filter(
            fecha__range=[fecha_inicio, fecha_fin]
        ).select_related('proveedor').order_by('fecha')
        pagos_total_f = float(pagos_prov_qs.aggregate(t=Sum('monto'))['t'] or 0)

        # Costo de mercancía vendida
        salidas_qs = SalidaInventario.objects.filter(fecha_venta__range=[fecha_inicio, fecha_fin])
        costo_mercancias_f = float(
            salidas_qs.aggregate(c=Sum(F('precio_costo') * F('cantidad')))['c'] or 0
        )

        # Balances
        total_egresos_flujo = gasto_total_f + nomina_total_f + pagos_total_f
        flujo_neto = total_ingresos_f - total_egresos_flujo
        utilidad_operativa = total_ingresos_f - (costo_mercancias_f + nomina_total_f + gasto_total_f)

        # ── 2. Configuración de Documento PDF ──────────────────────────────────
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=letter,
            leftMargin=1.5*cm, rightMargin=1.5*cm,
            topMargin=1.5*cm, bottomMargin=1.5*cm,
        )
        styles = getSampleStyleSheet()

        # Brand palette
        RED    = colors.HexColor('#df000a')
        BLACK  = colors.HexColor('#0d0000')
        ORANGE = colors.HexColor('#ef8701')
        ALT_BG = colors.HexColor('#fff8f8')
        WHITE  = colors.white
        GRAY   = colors.HexColor('#666666')
        GREEN  = colors.HexColor('#16a34a')
        DARK_RED = colors.HexColor('#b91c1c')

        H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=11, spaceBefore=12, spaceAfter=4,
                             textColor=RED, fontName='Helvetica-Bold')
        NORMAL = styles['Normal']
        SMALL  = ParagraphStyle('SMALL', parent=NORMAL, fontSize=8)

        def money(n): return f"${float(n or 0):,.2f}"

        def make_table(headers, rows, col_widths=None):
            data = [headers] + rows
            t = Table(data, colWidths=col_widths, repeatRows=1)
            ts = TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), BLACK),
                ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, ALT_BG]),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#dddddd')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ])
            t.setStyle(ts)
            return t

        story = []

        # ── Encabezado con logo ───────────────────────────────────────────────
        right_content = [
            Paragraph(
                'Centro Llantero <font color="#df000a"><b>EmirS</b></font>',
                ParagraphStyle('Brand', parent=NORMAL, fontSize=20, fontName='Helvetica-Bold', leading=24),
            ),
            Paragraph(
                'Minuta de Operación & Balance Financiero Global',
                ParagraphStyle('Sub', parent=NORMAL, fontSize=10, textColor=GRAY, spaceBefore=2),
            ),
            Spacer(1, 0.15*cm),
            Paragraph(
                f'Período: <b>{fecha_inicio}</b> al <b>{fecha_fin}</b>',
                ParagraphStyle('Period', parent=NORMAL, fontSize=9),
            ),
            Paragraph(
                f'Generado: {timezone.now().strftime("%d/%m/%Y")}',
                ParagraphStyle('Gen', parent=NORMAL, fontSize=8, textColor=GRAY),
            ),
        ]

        if os.path.exists(logo_path):
            logo_img = Image(logo_path)
            max_h = 2.6 * cm
            aspect = logo_img.imageWidth / max(logo_img.imageHeight, 1)
            logo_img.drawHeight = max_h
            logo_img.drawWidth  = max_h * aspect
            header_tbl = Table(
                [[logo_img, right_content]],
                colWidths=[logo_img.drawWidth + 0.5*cm, None],
            )
        else:
            header_tbl = Table([[right_content]], colWidths=[None])

        header_tbl.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING',   (0, 0), (-1, -1), 2),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_tbl)
        story.append(Spacer(1, 0.2*cm))
        story.append(HRFlowable(width='100%', thickness=4, color=RED, spaceAfter=2))
        story.append(HRFlowable(width='100%', thickness=2, color=ORANGE, spaceAfter=4))
        story.append(Spacer(1, 0.2*cm))

        # ── 1. Resumen Ejecutivo & Balance Financiero ──────────────────────────
        story.append(Paragraph('Balance Ejecutivo y Flujo de Caja', H2))
        resumen_rows = [
            ['Total Ingresos (Taller + Rescates)', money(total_ingresos_f), 'Ventas Taller', money(venta_total_f)],
            ['Total Egresos (Flujo)', money(total_egresos_flujo), 'Ingresos Rescates Viales', money(rescate_total_f)],
            ['Flujo Neto Disponible', money(flujo_neto), 'Gastos Operativos', money(gasto_total_f)],
            ['Utilidad Operativa Estimada', money(utilidad_operativa), 'Nóminas Pagadas', money(nomina_total_f)],
            ['Costo Mercancía Vendida (PEPS)', money(costo_mercancias_f), 'Pagos a Proveedores', money(pagos_total_f)],
        ]
        t_res = Table(resumen_rows, colWidths=[6.0*cm, 3.0*cm, 5.5*cm, 3.0*cm])
        t_res.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [WHITE, ALT_BG]),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#dddddd')),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TEXTCOLOR', (1, 0), (1, 0), BLACK),
            ('TEXTCOLOR', (1, 2), (1, 2), GREEN if flujo_neto >= 0 else DARK_RED),
            ('FONTNAME', (1, 2), (1, 2), 'Helvetica-Bold'),
            ('TEXTCOLOR', (1, 3), (1, 3), GREEN if utilidad_operativa >= 0 else DARK_RED),
            ('FONTNAME', (1, 3), (1, 3), 'Helvetica-Bold'),
        ]))
        story.append(t_res)
        story.append(Spacer(1, 0.3*cm))

        # ── 2. Desglose de Ingresos por Método de Pago ────────────────────────
        story.append(Paragraph('Ingresos por Método de Pago (Taller + Rescates)', H2))
        mp_rows = []
        for mp in ['efectivo', 'tarjeta', 'transferencia', 'mixto']:
            v_agg = ventas_qs.filter(metodo_pago=mp).aggregate(t=Sum('total'), c=Count('id'))
            r_agg = rescates_qs.filter(metodo_pago=mp).aggregate(t=Sum('total'), c=Count('id'))
            t_monto = (v_agg['t'] or 0) + (r_agg['t'] or 0)
            t_cant = (v_agg['c'] or 0) + (r_agg['c'] or 0)
            if t_cant > 0:
                mp_rows.append([
                    mp.capitalize(),
                    f"{v_agg['c'] or 0} taller / {r_agg['c'] or 0} rescates",
                    str(t_cant),
                    money(t_monto)
                ])
        if mp_rows:
            story.append(make_table(['Método', 'Distribución', 'Total Ops', 'Monto Total'], mp_rows, [4.5*cm, 5.0*cm, 3.5*cm, 4.5*cm]))
        else:
            story.append(Paragraph('Sin ingresos registrados en el período.', SMALL))
        story.append(Spacer(1, 0.3*cm))

        # ── 3. Rescates Viales Realizados ─────────────────────────────────────
        if rescate_total_f > 0 or rescates_qs.exists():
            story.append(Paragraph('Servicios de Rescate y Auxilio Vial Realizados', H2))
            res_rows = [
                [
                    r.folio,
                    r.nombre_cliente[:25],
                    f"{r.operador.nombre_completo if r.operador else '—'} ({r.unidad.numero_economico if r.unidad else 'Móvil'})"[:30],
                    r.metodo_pago.capitalize(),
                    money(r.total)
                ]
                for r in rescates_qs.select_related('operador', 'unidad').order_by('fecha_solicitud')
            ]
            story.append(make_table(
                ['Folio', 'Cliente', 'Operador / Unidad', 'Método', 'Total'],
                res_rows,
                [2.5*cm, 4.5*cm, 5.0*cm, 2.5*cm, 3.0*cm]
            ))
            story.append(Spacer(1, 0.3*cm))

        # ── 4. Nóminas Pagadas ────────────────────────────────────────────────
        if nominas_qs.exists():
            story.append(Paragraph('Nóminas Pagadas y Personal', H2))
            nom_rows = [
                [
                    f"{n.fecha_inicio} al {n.fecha_fin}",
                    money(n.total_efectivo),
                    money(n.total_transferencia),
                    money(n.total_comisiones),
                    money(n.total_general)
                ]
                for n in nominas_qs
            ]
            story.append(make_table(
                ['Período Nómina', 'Efectivo', 'Transferencia', 'Comisiones', 'Total Pagado'],
                nom_rows,
                [4.5*cm, 3.0*cm, 3.5*cm, 3.0*cm, 3.5*cm]
            ))
            story.append(Spacer(1, 0.3*cm))

        # ── 5. Pagos a Proveedores ────────────────────────────────────────────
        if pagos_prov_qs.exists():
            story.append(Paragraph('Pagos a Proveedores y Compras de Mercancía', H2))
            prov_rows = [
                [
                    str(p.fecha),
                    p.proveedor.nombre[:26],
                    p.numero_factura if p.numero_factura else '—',
                    p.referencia[:16] if p.referencia else '—',
                    money(p.monto)
                ]
                for p in pagos_prov_qs
            ]
            story.append(make_table(
                ['Fecha', 'Proveedor', 'Factura / Remisión', 'Referencia', 'Monto Pagado'],
                prov_rows,
                [2.5*cm, 5.5*cm, 3.5*cm, 3.0*cm, 3.0*cm]
            ))
            story.append(Spacer(1, 0.3*cm))

        # ── 6. Top productos / servicios ──────────────────────────────────────
        story.append(Paragraph('Top Productos y Servicios Vendidos', H2))
        prod_rows = [
            [r['descripcion'], str(int(r['piezas'] or 0)), money(r['subtotal'])]
            for r in top_productos
        ]
        if prod_rows:
            story.append(make_table(['Descripción', 'Piezas', 'Subtotal'], prod_rows, [10.5*cm, 2.5*cm, 4.5*cm]))
        else:
            story.append(Paragraph('Sin ventas de productos/servicios en el período.', SMALL))
        story.append(Spacer(1, 0.3*cm))

        # ── 7. Gastos del Período ─────────────────────────────────────────────
        story.append(Paragraph('Gastos Operativos del Período', H2))
        g_sum_rows = [
            ['Total Gastos', money(g_total['total']), 'Efectivo', money(g_total['efectivo'])],
            ['', '', 'Transferencia', money(g_total['transferencia'])],
            ['', '', 'Tarjeta', money(g_total['tarjeta'])],
        ]
        t_g = Table(g_sum_rows, colWidths=[5*cm, 4*cm, 4.5*cm, 4*cm])
        t_g.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [WHITE, ALT_BG, WHITE]),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#dddddd')),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(t_g)
        story.append(Spacer(1, 0.25*cm))

        # Detalle de gastos
        story.append(Paragraph('Detalle de Gastos Operativos', H2))
        gdet_rows = [
            [str(g.fecha), g.concepto[:35], g.categoria.nombre if g.categoria else '—',
             g.metodo_pago.capitalize(), money(g.monto)]
            for g in gastos_qs.select_related('categoria').order_by('fecha')
        ]
        if gdet_rows:
            story.append(make_table(
                ['Fecha', 'Concepto', 'Categoría', 'Método', 'Monto'],
                gdet_rows,
                [2.5*cm, 6.0*cm, 3.5*cm, 2.5*cm, 3.0*cm]
            ))
        else:
            story.append(Paragraph('Sin gastos en el período.', SMALL))

        story.append(Spacer(1, 0.5*cm))
        story.append(HRFlowable(width='100%', thickness=3, color=RED, spaceAfter=2))
        story.append(HRFlowable(width='100%', thickness=1.5, color=ORANGE, spaceAfter=4))
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph(
            f'Centro Llantero <font color="#df000a"><b>EmirS</b></font> '
            f'— Generado el {timezone.now().strftime("%d/%m/%Y")}',
            ParagraphStyle('footer', parent=SMALL, textColor=GRAY, alignment=1)
        ))

        doc.build(story)
        buf.seek(0)

        nombre_archivo = f"minuta_balance_{fecha_inicio}_{fecha_fin}.pdf"
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        return resp



class RankingMasVendidos(APIView):
    """
    GET /api/reportes/mas-vendidos/?anio=YYYY
    Devuelve ranking anual de productos y servicios más vendidos con desglose mensual (1-12).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ventas.models import DetalleVenta
        from django.db.models import Q, Sum, Count

        anio_param = request.query_params.get('anio')
        try:
            anio = int(anio_param) if anio_param else timezone.localdate().year
        except (ValueError, TypeError):
            anio = timezone.localdate().year

        # Construir anotaciones mensuales condicionales
        mes_annotations = {}
        for m in range(1, 13):
            mes_annotations[f'mes_{m}_cant'] = Sum('cantidad', filter=Q(venta__fecha__month=m))
            mes_annotations[f'mes_{m}_tot'] = Sum('subtotal', filter=Q(venta__fecha__month=m))

        # ── Productos más vendidos ────────────────────────────────────────────
        detalles_prod = DetalleVenta.objects.filter(
            venta__fecha__year=anio,
            producto__isnull=False
        )

        prod_qs = detalles_prod.values(
            'producto__id',
            'producto__codigo',
            'producto__marca__nombre',
            'producto__modelo',
            'producto__medida',
            'producto__indice_carga',
            'producto__indice_velocidad',
            'descripcion',
        ).annotate(
            cantidad_total=Sum('cantidad'),
            total_recaudado=Sum('subtotal'),
            num_ventas=Count('venta', distinct=True),
            **mes_annotations
        ).order_by('-cantidad_total')

        productos = []
        for p in prod_qs:
            marca = p.get('producto__marca__nombre') or ''
            modelo = p.get('producto__modelo') or ''
            medida = p.get('producto__medida') or ''
            ic = p.get('producto__indice_carga') or ''
            iv = p.get('producto__indice_velocidad') or ''
            desc = f"{marca} {modelo} {medida} {ic}{iv}".strip() or p.get('descripcion')

            meses = [
                {
                    'mes': m,
                    'cantidad': int(p.get(f'mes_{m}_cant') or 0),
                    'total': float(p.get(f'mes_{m}_tot') or 0),
                }
                for m in range(1, 13)
            ]

            productos.append({
                'id': p['producto__id'],
                'codigo': p['producto__codigo'],
                'marca': marca,
                'modelo': modelo,
                'medida': medida,
                'descripcion': desc,
                'cantidad_total': int(p['cantidad_total'] or 0),
                'total_recaudado': float(p['total_recaudado'] or 0),
                'num_ventas': p['num_ventas'],
                'meses': meses,
            })

        # ── Servicios más realizados ──────────────────────────────────────────
        detalles_serv = DetalleVenta.objects.filter(
            venta__fecha__year=anio,
            servicio__isnull=False
        )

        serv_qs = detalles_serv.values(
            'servicio__id',
            'servicio__nombre',
        ).annotate(
            cantidad_total=Sum('cantidad'),
            total_recaudado=Sum('subtotal'),
            num_ventas=Count('venta', distinct=True),
            **mes_annotations
        ).order_by('-cantidad_total')

        servicios = []
        for s in serv_qs:
            meses = [
                {
                    'mes': m,
                    'cantidad': int(s.get(f'mes_{m}_cant') or 0),
                    'total': float(s.get(f'mes_{m}_tot') or 0),
                }
                for m in range(1, 13)
            ]

            servicios.append({
                'id': s['servicio__id'],
                'nombre': s['servicio__nombre'],
                'cantidad_total': int(s['cantidad_total'] or 0),
                'total_recaudado': float(s['total_recaudado'] or 0),
                'num_ventas': s['num_ventas'],
                'meses': meses,
            })

        return Response({
            'anio': anio,
            'productos': productos,
            'servicios': servicios,
            'totales': {
                'productos_piezas': sum(p['cantidad_total'] for p in productos),
                'productos_monto': sum(p['total_recaudado'] for p in productos),
                'servicios_realizados': sum(s['cantidad_total'] for s in servicios),
                'servicios_monto': sum(s['total_recaudado'] for s in servicios),
            }
        })


class BackupSistemaView(APIView):
    """
    GET /api/reportes/backup/ -> Estadísticas rápidas de respaldo del sistema (Solo Admin).
    POST /api/reportes/backup/ o GET /api/reportes/backup/?descargar=1 o GET /api/reportes/backup/descargar/
    -> Genera y descarga el respaldo completo en formato .zip (full_database_dump.json + manifest.json).
    """
    permission_classes = [IsAuthenticated]

    def _es_admin(self, user):
        return (
            getattr(user, 'rol', None) == 'admin' or
            getattr(user, 'role', None) == 'admin' or
            user.is_staff or
            user.is_superuser
        )

    def _obtener_conteos(self):
        from apps.clientes.models import Cliente, Vehiculo
        from apps.inventario.models import Producto, Proveedor, PagoProveedor
        from apps.ventas.models import Venta, Cotizacion
        from apps.rescates.models import Rescate
        from apps.caja.models import Caja

        return {
            'clientes': Cliente.objects.count(),
            'vehiculos': Vehiculo.objects.count(),
            'productos': Producto.objects.count(),
            'ventas': Venta.objects.count(),
            'rescates': Rescate.objects.count(),
            'cajas': Caja.objects.count(),
            'proveedores': Proveedor.objects.count(),
            'pagos': PagoProveedor.objects.count(),
            'cotizaciones': Cotizacion.objects.count(),
        }

    def _generar_zip_response(self, request):
        import io
        import json
        import zipfile
        from django.core.management import call_command

        ahora = timezone.localtime(timezone.now())
        conteos = self._obtener_conteos()

        dump_buf = io.StringIO()
        call_command(
            'dumpdata',
            exclude=['contenttypes', 'sessions', 'admin.logentry'],
            indent=2,
            stdout=dump_buf,
        )
        dump_json = dump_buf.getvalue()

        manifest = {
            'sistema': 'Centro Llantero EmirS - Sistema de Gestión Integral',
            'fecha_generacion': ahora.strftime('%Y-%m-%d %H:%M:%S'),
            'generado_por': request.user.username,
            'generado_por_nombre': request.user.get_full_name() or request.user.username,
            'conteos_tablas': conteos,
            'total_registros_principales': sum(conteos.values()),
        }

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('full_database_dump.json', dump_json.encode('utf-8'))
            zf.writestr('manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False).encode('utf-8'))

        try:
            from apps.usuarios.models import LogAuditoria
            LogAuditoria.objects.create(
                usuario=request.user,
                accion='crear',
                tabla='sistema_backup',
                registro_id=None,
                datos_nuevos=manifest,
                ip=request.META.get('REMOTE_ADDR'),
            )
        except Exception:
            pass

        zip_buf.seek(0)
        filename = f"Respaldo_EmirS_{ahora.strftime('%Y%m%d_%H%M%S')}.zip"
        response = HttpResponse(zip_buf.read(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def get(self, request, *args, **kwargs):
        if not self._es_admin(request.user):
            return Response(
                {'error': 'Acceso restringido. Solo los administradores pueden gestionar respaldos del sistema.'},
                status=403
            )

        descargar = request.query_params.get('descargar')
        if descargar in ('1', 'true', 'True') or request.path.endswith('/descargar/'):
            return self._generar_zip_response(request)

        conteos = self._obtener_conteos()
        return Response({
            'fecha_actual': timezone.localtime(timezone.now()).strftime('%Y-%m-%d %H:%M:%S'),
            'conteos': conteos,
            'total_registros': sum(conteos.values()),
            **conteos,
        })

    def post(self, request, *args, **kwargs):
        if not self._es_admin(request.user):
            return Response(
                {'error': 'Acceso restringido. Solo los administradores pueden generar respaldos del sistema.'},
                status=403
            )
        return self._generar_zip_response(request)


class ReportePagosProveedoresPDFView(APIView):
    """
    GET /api/reportes/pagos-proveedores/pdf/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    Genera un informe contable de pagos a proveedores en formato PDF con ReportLab.
    Incluye encabezado institucional, resumen por método y tabla detallada con totales.
    """
    permission_classes = [IsAuthenticated]

    def _es_admin(self, user):
        return (
            getattr(user, 'rol', None) in ['admin', 'administrador'] or
            getattr(user, 'role', None) in ['admin', 'administrador'] or
            user.is_staff or
            user.is_superuser
        )

    def get(self, request):
        if not self._es_admin(request.user):
            return Response(
                {'error': 'Acceso restringido. Solo los administradores pueden consultar y exportar reportes contables de pagos a proveedores.'},
                status=403
            )
        from apps.inventario.models import PagoProveedor, Proveedor
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image,
        )
        import io, os

        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))
        proveedor_id = request.query_params.get('proveedor') or request.query_params.get('proveedor_id')
        metodo_pago = request.query_params.get('metodo_pago')

        pagos_qs = (
            PagoProveedor.objects
            .filter(fecha__range=[fecha_inicio, fecha_fin])
            .select_related('proveedor', 'registrado_por')
            .order_by('-fecha', '-created_at')
        )

        proveedor_nombre = None
        if proveedor_id:
            pagos_qs = pagos_qs.filter(proveedor_id=proveedor_id)
            prov = Proveedor.objects.filter(id=proveedor_id).first()
            if prov:
                proveedor_nombre = prov.nombre

        if metodo_pago:
            pagos_qs = pagos_qs.filter(metodo_pago=metodo_pago)

        total_monto = pagos_qs.aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
        total_ops = pagos_qs.count()

        # Resumen por método
        metodos_labels = {
            'efectivo': 'Efectivo',
            'transferencia': 'Transferencia',
            'cheque': 'Cheque',
            'tarjeta_debito': 'Tarjeta de Débito',
            'tarjeta_credito': 'Tarjeta de Crédito',
            'tarjeta': 'Tarjeta Bancaria (General)',
        }
        resumen_metodos = []
        for clave, etiqueta in metodos_labels.items():
            sub_qs = pagos_qs.filter(metodo_pago=clave)
            cnt = sub_qs.count()
            if cnt > 0:
                sub_total = sub_qs.aggregate(t=Sum('monto'))['t'] or Decimal('0.00')
                resumen_metodos.append([etiqueta, str(cnt), f"${sub_total:,.2f}"])

        # Configuración ReportLab
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=letter,
            leftMargin=1.5*cm, rightMargin=1.5*cm,
            topMargin=1.5*cm, bottomMargin=1.5*cm,
        )
        styles = getSampleStyleSheet()

        RED    = colors.HexColor('#df000a')
        BLACK  = colors.HexColor('#0d0000')
        ORANGE = colors.HexColor('#ef8701')
        ALT_BG = colors.HexColor('#fff8f8')
        WHITE  = colors.white
        GRAY   = colors.HexColor('#666666')

        NORMAL = styles['Normal']
        H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=11, spaceBefore=10, spaceAfter=4,
                             textColor=RED, fontName='Helvetica-Bold')
        SMALL  = ParagraphStyle('SMALL', parent=NORMAL, fontSize=8)

        story = []

        # Logo y Encabezado
        logo_path = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', '..', '..', 'frontend', 'public', 'images', 'logo_hd.png'
        ))

        right_content = [
            Paragraph(
                'Centro Llantero <font color="#df000a"><b>EmirS</b></font>',
                ParagraphStyle('Brand', parent=NORMAL, fontSize=20, fontName='Helvetica-Bold', leading=24),
            ),
            Paragraph(
                'Reporte Contable de Pagos a Proveedores',
                ParagraphStyle('Sub', parent=NORMAL, fontSize=11, textColor=GRAY, spaceBefore=2),
            ),
            Spacer(1, 0.15*cm),
            Paragraph(
                f'Período: <b>{fecha_inicio}</b> al <b>{fecha_fin}</b>',
                ParagraphStyle('Period', parent=NORMAL, fontSize=9),
            ),
        ]
        if proveedor_nombre:
            right_content.append(Paragraph(
                f'Proveedor filtrado: <b>{proveedor_nombre}</b>',
                ParagraphStyle('FilterProv', parent=NORMAL, fontSize=8.5, textColor=GRAY),
            ))
        if metodo_pago:
            right_content.append(Paragraph(
                f'Método de pago: <b>{metodos_labels.get(metodo_pago, metodo_pago)}</b>',
                ParagraphStyle('FilterMP', parent=NORMAL, fontSize=8.5, textColor=GRAY),
            ))

        right_content.append(Paragraph(
            f'Generado: {timezone.now().strftime("%d/%m/%Y")}',
            ParagraphStyle('Gen', parent=NORMAL, fontSize=8, textColor=GRAY),
        ))

        if os.path.exists(logo_path):
            logo_img = Image(logo_path)
            max_h = 2.4 * cm
            aspect = logo_img.imageWidth / max(logo_img.imageHeight, 1)
            logo_img.drawHeight = max_h
            logo_img.drawWidth  = max_h * aspect
            header_tbl = Table(
                [[logo_img, right_content]],
                colWidths=[logo_img.drawWidth + 0.5*cm, None],
            )
        else:
            header_tbl = Table([[right_content]], colWidths=[None])

        header_tbl.setStyle(TableStyle([
            ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING',   (0, 0), (-1, -1), 2),
            ('RIGHTPADDING',  (0, 0), (-1, -1), 4),
            ('TOPPADDING',    (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_tbl)
        story.append(Spacer(1, 0.2*cm))
        story.append(HRFlowable(width='100%', thickness=3, color=RED, spaceAfter=2))
        story.append(HRFlowable(width='100%', thickness=1.5, color=ORANGE, spaceAfter=4))
        story.append(Spacer(1, 0.2*cm))

        # Resumen por Método
        story.append(Paragraph('Resumen por Método de Pago', H2))
        if resumen_metodos:
            resumen_data = [['Método de Pago', 'Operaciones', 'Monto Total']] + resumen_metodos + [
                ['GRAN TOTAL', str(total_ops), f"${total_monto:,.2f}"]
            ]
            t_res = Table(resumen_data, colWidths=[8.0*cm, 4.0*cm, 6.0*cm])
            t_res.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), BLACK),
                ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8.5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2), [WHITE, ALT_BG]),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f3f4f6')),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#dddddd')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            story.append(t_res)
        else:
            story.append(Paragraph('No se registraron pagos a proveedores en este período.', SMALL))

        story.append(Spacer(1, 0.3*cm))

        # Detalle de Pagos
        story.append(Paragraph('Detalle de Pagos Registrados', H2))
        if pagos_qs.exists():
            headers = ['Fecha', 'Proveedor', 'Factura / Rem.', 'Método', 'Referencia', 'Registrado Por', 'Monto']
            col_widths = [2.2*cm, 4.0*cm, 2.7*cm, 2.7*cm, 2.5*cm, 2.2*cm, 2.3*cm]
            detail_rows = []
            for p in pagos_qs:
                detail_rows.append([
                    p.fecha.strftime('%d/%m/%Y'),
                    p.proveedor.nombre[:22],
                    p.numero_factura or '-',
                    p.get_metodo_pago_display()[:18],
                    p.referencia[:16] if p.referencia else '-',
                    (p.registrado_por.username[:12] if p.registrado_por else '-'),
                    f"${p.monto:,.2f}"
                ])

            # Fila final de total
            detail_rows.append(['TOTAL', '', '', '', '', f"{total_ops} pagos", f"${total_monto:,.2f}"])

            t_det = Table([headers] + detail_rows, colWidths=col_widths, repeatRows=1)
            t_det.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), BLACK),
                ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 7.5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -2), [WHITE, ALT_BG]),
                ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e5e7eb')),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#dddddd')),
                ('ALIGN', (0, 0), (0, -1), 'CENTER'),
                ('ALIGN', (1, 0), (1, -1), 'LEFT'),
                ('ALIGN', (2, 0), (4, -1), 'LEFT'),
                ('ALIGN', (5, 0), (5, -1), 'CENTER'),
                ('ALIGN', (6, 0), (6, -1), 'RIGHT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            story.append(t_det)
        else:
            story.append(Paragraph('Sin movimientos detallados para los filtros seleccionados.', SMALL))

        story.append(Spacer(1, 0.4*cm))
        story.append(HRFlowable(width='100%', thickness=2, color=RED, spaceAfter=2))
        story.append(HRFlowable(width='100%', thickness=1, color=ORANGE, spaceAfter=3))
        story.append(Spacer(1, 0.15*cm))
        story.append(Paragraph(
            f'Centro Llantero <font color="#df000a"><b>EmirS</b></font> '
            f'— Generado el {timezone.now().strftime("%d/%m/%Y")}',
            ParagraphStyle('footer', parent=SMALL, textColor=GRAY, alignment=1)
        ))

        doc.build(story)
        buf.seek(0)
        nombre_archivo = f"reporte_pagos_proveedores_{fecha_inicio}_{fecha_fin}.pdf"
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        return resp


class ReportePagosProveedoresExcelView(APIView):
    """
    GET /api/reportes/pagos-proveedores/excel/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    Genera un informe contable de pagos a proveedores en formato Excel (.xlsx) usando openpyxl.
    Incluye encabezados estilizados, formato de moneda, y fórmula SUM de totales.
    """
    permission_classes = [IsAuthenticated]

    def _es_admin(self, user):
        return (
            getattr(user, 'rol', None) in ['admin', 'administrador'] or
            getattr(user, 'role', None) in ['admin', 'administrador'] or
            user.is_staff or
            user.is_superuser
        )

    def get(self, request):
        if not self._es_admin(request.user):
            return Response(
                {'error': 'Acceso restringido. Solo los administradores pueden consultar y exportar reportes contables de pagos a proveedores.'},
                status=403
            )
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from apps.inventario.models import PagoProveedor, Proveedor
        import io

        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))
        proveedor_id = request.query_params.get('proveedor') or request.query_params.get('proveedor_id')
        metodo_pago = request.query_params.get('metodo_pago')

        pagos_qs = (
            PagoProveedor.objects
            .filter(fecha__range=[fecha_inicio, fecha_fin])
            .select_related('proveedor', 'registrado_por')
            .order_by('-fecha', '-created_at')
        )

        proveedor_nombre = None
        if proveedor_id:
            pagos_qs = pagos_qs.filter(proveedor_id=proveedor_id)
            prov = Proveedor.objects.filter(id=proveedor_id).first()
            if prov:
                proveedor_nombre = prov.nombre

        if metodo_pago:
            pagos_qs = pagos_qs.filter(metodo_pago=metodo_pago)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Pagos a Proveedores"
        ws.views.sheetView[0].showGridLines = True

        # Paleta y estilos
        fill_header = PatternFill(start_color="0D0000", end_color="0D0000", fill_type="solid")
        fill_subtotal = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        font_title = Font(name="Calibri", size=15, bold=True, color="DF000A")
        font_subtitle = Font(name="Calibri", size=10, italic=True, color="555555")
        font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        font_bold = Font(name="Calibri", size=10, bold=True)
        font_data = Font(name="Calibri", size=10)

        border_thin = Border(
            left=Side(style='thin', color='DDDDDD'),
            right=Side(style='thin', color='DDDDDD'),
            top=Side(style='thin', color='DDDDDD'),
            bottom=Side(style='thin', color='DDDDDD')
        )
        border_total = Border(
            top=Side(style='thin', color='000000'),
            bottom=Side(style='double', color='000000'),
            left=Side(style='thin', color='DDDDDD'),
            right=Side(style='thin', color='DDDDDD')
        )

        # Fila 1: Título
        ws.merge_cells('A1:G1')
        ws['A1'] = "Centro Llantero EmirS - Reporte de Pagos a Proveedores"
        ws['A1'].font = font_title
        ws['A1'].alignment = Alignment(vertical='center')
        ws.row_dimensions[1].height = 25

        # Fila 2: Subtítulo
        sub_texto = f"Período: {fecha_inicio} al {fecha_fin}  |  Generado el: {timezone.now().strftime('%d/%m/%Y')}"
        if proveedor_nombre:
            sub_texto += f"  |  Proveedor: {proveedor_nombre}"
        if metodo_pago:
            sub_texto += f"  |  Método: {metodo_pago}"
        ws.merge_cells('A2:G2')
        ws['A2'] = sub_texto
        ws['A2'].font = font_subtitle
        ws['A2'].alignment = Alignment(vertical='center')
        ws.row_dimensions[2].height = 18

        # Fila 4: Encabezados de tabla detallada
        start_row = 4
        headers = ['Fecha', 'Proveedor', 'Factura / Remisión', 'Método de Pago', 'Referencia', 'Registrado Por', 'Monto']
        for col_idx, h_text in enumerate(headers, 1):
            cell = ws.cell(row=start_row, column=col_idx, value=h_text)
            cell.fill = fill_header
            cell.font = font_header
            cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[start_row].height = 22

        current_row = start_row + 1
        pagos_lista = list(pagos_qs)
        first_data_row = current_row

        if pagos_lista:
            for p in pagos_lista:
                c1 = ws.cell(row=current_row, column=1, value=p.fecha.strftime('%Y-%m-%d'))
                c2 = ws.cell(row=current_row, column=2, value=p.proveedor.nombre)
                c3 = ws.cell(row=current_row, column=3, value=p.numero_factura or '-')
                c4 = ws.cell(row=current_row, column=4, value=p.get_metodo_pago_display())
                c5 = ws.cell(row=current_row, column=5, value=p.referencia or '-')
                c6 = ws.cell(row=current_row, column=6, value=p.registrado_por.username if p.registrado_por else '-')
                c7 = ws.cell(row=current_row, column=7, value=float(p.monto))

                c1.alignment = Alignment(horizontal='center')
                c2.alignment = Alignment(horizontal='left')
                c3.alignment = Alignment(horizontal='center')
                c4.alignment = Alignment(horizontal='center')
                c5.alignment = Alignment(horizontal='left')
                c6.alignment = Alignment(horizontal='center')
                c7.alignment = Alignment(horizontal='right')
                c7.number_format = '"$"#,##0.00'

                for c in [c1, c2, c3, c4, c5, c6, c7]:
                    c.font = font_data
                    c.border = border_thin

                current_row += 1

            last_data_row = current_row - 1
            # Fila de totales
            ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=6)
            total_label = ws.cell(row=current_row, column=1, value="TOTAL GENERAL")
            total_label.font = font_bold
            total_label.alignment = Alignment(horizontal='right', vertical='center')

            total_val = ws.cell(row=current_row, column=7)
            total_val.value = f"=SUM(G{first_data_row}:G{last_data_row})"
            total_val.font = font_bold
            total_val.alignment = Alignment(horizontal='right', vertical='center')
            total_val.number_format = '"$"#,##0.00'

            for c_idx in range(1, 8):
                cell = ws.cell(row=current_row, column=c_idx)
                cell.border = border_total
                cell.fill = fill_subtotal
            ws.row_dimensions[current_row].height = 20
        else:
            ws.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=7)
            empty_cell = ws.cell(row=current_row, column=1, value="No se encontraron pagos con los filtros seleccionados.")
            empty_cell.font = font_subtitle
            empty_cell.alignment = Alignment(horizontal='center')

        # Autoajustar anchos de columnas
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                if cell.row in [1, 2]:
                    continue
                if isinstance(cell.value, (int, float)) and cell.number_format and '"$"#' in cell.number_format:
                    val_str = f"${cell.value:,.2f}"
                else:
                    val_str = str(cell.value or '')
                max_len = max(max_len, len(val_str))
            ws.column_dimensions[col_letter].width = max(max_len + 4, 14)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        nombre_archivo = f"reporte_pagos_proveedores_{fecha_inicio}_{fecha_fin}.xlsx"
        resp = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        resp['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        return resp


class ReporteContableExcelView(APIView):
    """
    GET /api/reportes/contable-excel/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD o ?mes=MM&anio=YYYY
    Genera el libro contable de auditoría e inventario (.xlsx) con 4 hojas estilizadas:
    - Hoja 1: "Detalles De Salidas"
    - Hoja 2: "Entradas de Producto"
    - Hoja 3: "Salidas de Productos"
    - Hoja 4: "Inventario Emir'S Centro Llantero"
    """
    permission_classes = [IsAuthenticated]

    def _es_admin(self, user):
        return (
            getattr(user, 'rol', None) in ['admin', 'administrador'] or
            getattr(user, 'role', None) in ['admin', 'administrador'] or
            user.is_staff or
            user.is_superuser
        )

    def get(self, request):
        if not self._es_admin(request.user):
            return Response(
                {'error': 'Acceso restringido. Solo los administradores pueden consultar y exportar el libro contable de inventario.'},
                status=403
            )
        import calendar
        from datetime import datetime, date
        import io
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
        from openpyxl.formatting.rule import CellIsRule
        from django.db.models import Sum
        from apps.inventario.models import Producto, EntradaInventario, SalidaInventario

        hoy = timezone.localdate()
        mes_param = request.query_params.get('mes')
        anio_param = request.query_params.get('anio')
        fecha_inicio_param = request.query_params.get('fecha_inicio')
        fecha_fin_param = request.query_params.get('fecha_fin')

        if fecha_inicio_param and fecha_fin_param:
            try:
                fecha_inicio = datetime.strptime(fecha_inicio_param, '%Y-%m-%d').date()
                fecha_fin = datetime.strptime(fecha_fin_param, '%Y-%m-%d').date()
            except ValueError:
                fecha_inicio = hoy.replace(day=1)
                _, last_day = calendar.monthrange(hoy.year, hoy.month)
                fecha_fin = hoy.replace(day=last_day)
        elif mes_param and anio_param:
            try:
                mes = int(mes_param)
                anio = int(anio_param)
                fecha_inicio = date(anio, mes, 1)
                _, last_day = calendar.monthrange(anio, mes)
                fecha_fin = date(anio, mes, last_day)
            except (ValueError, TypeError):
                fecha_inicio = hoy.replace(day=1)
                _, last_day = calendar.monthrange(hoy.year, hoy.month)
                fecha_fin = hoy.replace(day=last_day)
        else:
            fecha_inicio = hoy.replace(day=1)
            _, last_day = calendar.monthrange(hoy.year, hoy.month)
            fecha_fin = hoy.replace(day=last_day)

        # ── Estilos y Paleta Institucional ──────────────────────────────────
        fill_header = PatternFill(start_color="0D0000", end_color="0D0000", fill_type="solid")
        font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        fill_total = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        font_total = Font(name="Calibri", size=10, bold=True)
        font_data = Font(name="Calibri", size=10)
        font_empty = Font(name="Calibri", size=10, italic=True, color="666666")

        border_thin = Border(
            left=Side(style='thin', color='DDDDDD'),
            right=Side(style='thin', color='DDDDDD'),
            top=Side(style='thin', color='DDDDDD'),
            bottom=Side(style='thin', color='DDDDDD')
        )
        border_total = Border(
            top=Side(style='thin', color='000000'),
            bottom=Side(style='double', color='000000'),
            left=Side(style='thin', color='DDDDDD'),
            right=Side(style='thin', color='DDDDDD')
        )

        fill_stock_true = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
        font_stock_true = Font(name="Calibri", size=10, bold=True, color="166534")
        fill_stock_false = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
        font_stock_false = Font(name="Calibri", size=10, bold=True, color="991B1B")

        fill_orange_light = PatternFill(start_color="FFEDD5", end_color="FFEDD5", fill_type="solid")
        font_orange_dark = Font(name="Calibri", size=10, bold=True, color="C2410C")
        fill_slate_light = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        font_slate_dark = Font(name="Calibri", size=10, bold=True, color="64748B")

        # ── Pre-cálculo optimizado de stock y entradas ────────────────────────
        entradas_totales = dict(
            EntradaInventario.objects.values('producto_id').annotate(t=Sum('cantidad')).values_list('producto_id', 't')
        )
        salidas_totales = dict(
            SalidaInventario.objects.values('producto_id').annotate(t=Sum('cantidad')).values_list('producto_id', 't')
        )

        def get_stock(prod_id):
            return entradas_totales.get(prod_id, 0) - salidas_totales.get(prod_id, 0)

        # Mapeo de entradas de productos para asociar proveedor y factura
        todas_entradas = list(
            EntradaInventario.objects.select_related('proveedor').order_by('fecha_compra', 'id')
        )
        entradas_por_prod = {}
        latest_entrada_por_prod = {}
        for ent in todas_entradas:
            entradas_por_prod.setdefault(ent.producto_id, []).append(ent)
            latest_entrada_por_prod[ent.producto_id] = ent

        def encontrar_entrada_origen(producto_id, precio_costo, fecha_venta):
            prod_entradas = entradas_por_prod.get(producto_id, [])
            if not prod_entradas:
                return None
            for e in prod_entradas:
                if e.precio_compra == precio_costo and e.fecha_compra <= fecha_venta:
                    return e
            cands = [e for e in prod_entradas if e.fecha_compra <= fecha_venta]
            if cands:
                return cands[-1]
            return prod_entradas[-1]

        # Consultas de rango de fechas
        salidas_qs = list(
            SalidaInventario.objects
            .filter(fecha_venta__range=[fecha_inicio, fecha_fin])
            .select_related('producto', 'producto__marca', 'venta', 'rescate')
            .order_by('fecha_venta', 'id')
        )

        entradas_qs = list(
            EntradaInventario.objects
            .filter(fecha_compra__range=[fecha_inicio, fecha_fin])
            .select_related('producto', 'producto__marca', 'proveedor')
            .order_by('fecha_compra', 'id')
        )

        productos_activos = list(
            Producto.objects
            .filter(activo=True)
            .select_related('marca')
            .order_by('medida', 'marca__nombre', 'modelo')
        )

        # ── Inicializar Workbook ─────────────────────────────────────────────
        wb = openpyxl.Workbook()

        # =====================================================================
        # HOJA 1: "Detalles De Salidas"
        # =====================================================================
        ws1 = wb.active
        ws1.title = "Detalles De Salidas"
        ws1.freeze_panes = "A2"

        h1_headers = [
            'ID', 'ID Salida', 'Medida', 'Marca', 'Modelo', 'Stock',
            'Cantidad Llantas Vendidas', 'Proveedor', 'Numero de Factura',
            'F. Compra', 'F. Venta', 'P. Venta', 'P. Compra', 'Facturas Usadas', 'G. Unitaria'
        ]
        ws1.row_dimensions[1].height = 26
        for col_idx, h_text in enumerate(h1_headers, 1):
            cell = ws1.cell(row=1, column=col_idx, value=h_text)
            cell.fill = fill_header
            cell.font = font_header
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        current_row = 2
        start_row = 2
        if salidas_qs:
            for idx, s in enumerate(salidas_qs, 1):
                ws1.row_dimensions[current_row].height = 20
                prod = s.producto
                stock_val = get_stock(prod.id)
                e_orig = encontrar_entrada_origen(prod.id, s.precio_costo, s.fecha_venta)
                prov_nom = e_orig.proveedor.nombre if (e_orig and e_orig.proveedor) else '-'
                num_fact = (e_orig.numero_factura or e_orig.folio_remision or '-') if e_orig else '-'
                f_comp = e_orig.fecha_compra.strftime('%Y-%m-%d') if (e_orig and e_orig.fecha_compra) else '-'
                fact_usadas = num_fact

                c_id = ws1.cell(row=current_row, column=1, value=idx)
                c_idsal = ws1.cell(row=current_row, column=2, value=s.id)
                c_med = ws1.cell(row=current_row, column=3, value=prod.medida)
                c_marca = ws1.cell(row=current_row, column=4, value=prod.marca.nombre if prod.marca else '')
                c_mod = ws1.cell(row=current_row, column=5, value=prod.modelo)

                # Columna Stock
                c_stk = ws1.cell(row=current_row, column=6)
                if stock_val > 0:
                    c_stk.value = "VERDADERO"
                    c_stk.fill = fill_stock_true
                    c_stk.font = font_stock_true
                else:
                    c_stk.value = "FALSO"
                    c_stk.fill = fill_stock_false
                    c_stk.font = font_stock_false
                c_stk.alignment = Alignment(horizontal='center', vertical='center')

                c_cant = ws1.cell(row=current_row, column=7, value=s.cantidad)
                c_prov = ws1.cell(row=current_row, column=8, value=prov_nom)
                c_fact = ws1.cell(row=current_row, column=9, value=num_fact)
                c_fcomp = ws1.cell(row=current_row, column=10, value=f_comp)
                c_fvent = ws1.cell(row=current_row, column=11, value=s.fecha_venta.strftime('%Y-%m-%d'))
                c_pvent = ws1.cell(row=current_row, column=12, value=float(s.precio_venta))
                c_pcomp = ws1.cell(row=current_row, column=13, value=float(s.precio_costo))
                c_usadas = ws1.cell(row=current_row, column=14, value=fact_usadas)

                # Columna G. Unitaria: fórmula =L{row}-M{row}
                c_gunita = ws1.cell(row=current_row, column=15, value=f"=L{current_row}-M{current_row}")

                # Alineaciones y formatos
                c_id.alignment = Alignment(horizontal='center', vertical='center')
                c_idsal.alignment = Alignment(horizontal='center', vertical='center')
                c_med.alignment = Alignment(horizontal='center', vertical='center')
                c_marca.alignment = Alignment(horizontal='left', vertical='center')
                c_mod.alignment = Alignment(horizontal='left', vertical='center')
                c_cant.alignment = Alignment(horizontal='right', vertical='center')
                c_cant.number_format = '#,##0'
                c_prov.alignment = Alignment(horizontal='left', vertical='center')
                c_fact.alignment = Alignment(horizontal='center', vertical='center')
                c_fcomp.alignment = Alignment(horizontal='center', vertical='center')
                c_fvent.alignment = Alignment(horizontal='center', vertical='center')
                c_pvent.alignment = Alignment(horizontal='right', vertical='center')
                c_pvent.number_format = '"$"#,##0.00'
                c_pcomp.alignment = Alignment(horizontal='right', vertical='center')
                c_pcomp.number_format = '"$"#,##0.00'
                c_usadas.alignment = Alignment(horizontal='center', vertical='center')
                c_gunita.alignment = Alignment(horizontal='right', vertical='center')
                c_gunita.number_format = '"$"#,##0.00'

                for col_c in range(1, 16):
                    cell_cur = ws1.cell(row=current_row, column=col_c)
                    cell_cur.border = border_thin
                    if col_c != 6:
                        cell_cur.font = font_data

                current_row += 1

            last_row = current_row - 1
            # Fila final de totales
            ws1.row_dimensions[current_row].height = 22
            ws1.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=6)
            lbl = ws1.cell(row=current_row, column=1, value="TOTALES")
            lbl.font = font_total
            lbl.alignment = Alignment(horizontal='right', vertical='center')

            tot_cant = ws1.cell(row=current_row, column=7, value=f"=SUM(G{start_row}:G{last_row})")
            tot_cant.font = font_total
            tot_cant.alignment = Alignment(horizontal='right', vertical='center')
            tot_cant.number_format = '#,##0'

            tot_pvent = ws1.cell(row=current_row, column=12, value=f"=SUM(L{start_row}:L{last_row})")
            tot_pvent.font = font_total
            tot_pvent.alignment = Alignment(horizontal='right', vertical='center')
            tot_pvent.number_format = '"$"#,##0.00'

            tot_pcomp = ws1.cell(row=current_row, column=13, value=f"=SUM(M{start_row}:M{last_row})")
            tot_pcomp.font = font_total
            tot_pcomp.alignment = Alignment(horizontal='right', vertical='center')
            tot_pcomp.number_format = '"$"#,##0.00'

            tot_gunita = ws1.cell(row=current_row, column=15, value=f"=SUM(O{start_row}:O{last_row})")
            tot_gunita.font = font_total
            tot_gunita.alignment = Alignment(horizontal='right', vertical='center')
            tot_gunita.number_format = '"$"#,##0.00'

            for col_c in range(1, 16):
                c_tot = ws1.cell(row=current_row, column=col_c)
                c_tot.border = border_total
                c_tot.fill = fill_total
        else:
            ws1.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=15)
            c_empty = ws1.cell(row=current_row, column=1, value="No se registraron salidas de inventario en el período seleccionado.")
            c_empty.font = font_empty
            c_empty.alignment = Alignment(horizontal='center', vertical='center')
            for col_c in range(1, 16):
                ws1.cell(row=current_row, column=col_c).border = border_thin

        # =====================================================================
        # HOJA 2: "Entradas de Producto"
        # =====================================================================
        ws2 = wb.create_sheet(title="Entradas de Producto")
        ws2.freeze_panes = "A2"

        h2_headers = [
            'Cod. Prod', 'Medida', 'Marca', 'Modelo', 'C. Carga', 'Vel',
            'Cantidad', 'P. Compra', 'F. Compra', 'N° Fact', 'Proveedor',
            'Inventario', 'Factura Consumida'
        ]
        ws2.row_dimensions[1].height = 26
        for col_idx, h_text in enumerate(h2_headers, 1):
            cell = ws2.cell(row=1, column=col_idx, value=h_text)
            cell.fill = fill_header
            cell.font = font_header
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        current_row = 2
        start_row = 2
        if entradas_qs:
            for ent in entradas_qs:
                ws2.row_dimensions[current_row].height = 20
                prod = ent.producto
                stk_actual = get_stock(prod.id)

                c1 = ws2.cell(row=current_row, column=1, value=prod.codigo)
                c2 = ws2.cell(row=current_row, column=2, value=prod.medida)
                c3 = ws2.cell(row=current_row, column=3, value=prod.marca.nombre if prod.marca else '')
                c4 = ws2.cell(row=current_row, column=4, value=prod.modelo)
                c5 = ws2.cell(row=current_row, column=5, value=prod.indice_carga)
                c6 = ws2.cell(row=current_row, column=6, value=prod.indice_velocidad)
                c7 = ws2.cell(row=current_row, column=7, value=ent.cantidad)
                c8 = ws2.cell(row=current_row, column=8, value=float(ent.precio_compra))
                c9 = ws2.cell(row=current_row, column=9, value=ent.fecha_compra.strftime('%Y-%m-%d'))
                c10 = ws2.cell(row=current_row, column=10, value=ent.numero_factura or ent.folio_remision or '-')
                c11 = ws2.cell(row=current_row, column=11, value=ent.proveedor.nombre if ent.proveedor else '-')

                # Columna Inventario: "Si" (verde), "En Lista" (naranja), "No" (rojo)
                c12 = ws2.cell(row=current_row, column=12)
                if ent.estado == 'en_lista':
                    c12.value = "En Lista"
                    c12.fill = fill_orange_light
                    c12.font = font_orange_dark
                elif ent.en_inventario and ent.estado in ['disponible', '']:
                    c12.value = "Si"
                    c12.fill = fill_stock_true
                    c12.font = font_stock_true
                else:
                    c12.value = "No"
                    c12.fill = fill_stock_false
                    c12.font = font_stock_false
                c12.alignment = Alignment(horizontal='center', vertical='center')

                # Columna Factura Consumida
                c13 = ws2.cell(row=current_row, column=13)
                if ent.factura_consumida or ent.estado == 'consumido' or stk_actual <= 0:
                    c13.value = "Factura Consumida"
                    c13.fill = fill_slate_light
                    c13.font = font_slate_dark
                else:
                    c13.value = "En Stock"
                    c13.fill = fill_stock_true
                    c13.font = font_stock_true
                c13.alignment = Alignment(horizontal='center', vertical='center')

                # Formatos y alineaciones
                c1.alignment = Alignment(horizontal='center', vertical='center')
                c2.alignment = Alignment(horizontal='center', vertical='center')
                c3.alignment = Alignment(horizontal='left', vertical='center')
                c4.alignment = Alignment(horizontal='left', vertical='center')
                c5.alignment = Alignment(horizontal='center', vertical='center')
                c6.alignment = Alignment(horizontal='center', vertical='center')
                c7.alignment = Alignment(horizontal='right', vertical='center')
                c7.number_format = '#,##0'
                c8.alignment = Alignment(horizontal='right', vertical='center')
                c8.number_format = '"$"#,##0.00'
                c9.alignment = Alignment(horizontal='center', vertical='center')
                c10.alignment = Alignment(horizontal='center', vertical='center')
                c11.alignment = Alignment(horizontal='left', vertical='center')

                for col_c in range(1, 14):
                    cell_cur = ws2.cell(row=current_row, column=col_c)
                    cell_cur.border = border_thin
                    if col_c not in [12, 13]:
                        cell_cur.font = font_data

                current_row += 1

            last_row = current_row - 1
            # Fila final de totales
            ws2.row_dimensions[current_row].height = 22
            ws2.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=6)
            lbl = ws2.cell(row=current_row, column=1, value="TOTALES")
            lbl.font = font_total
            lbl.alignment = Alignment(horizontal='right', vertical='center')

            tot_cant = ws2.cell(row=current_row, column=7, value=f"=SUM(G{start_row}:G{last_row})")
            tot_cant.font = font_total
            tot_cant.alignment = Alignment(horizontal='right', vertical='center')
            tot_cant.number_format = '#,##0'

            tot_imp = ws2.cell(row=current_row, column=8, value=f"=SUMPRODUCT(G{start_row}:G{last_row}, H{start_row}:H{last_row})")
            tot_imp.font = font_total
            tot_imp.alignment = Alignment(horizontal='right', vertical='center')
            tot_imp.number_format = '"$"#,##0.00'

            for col_c in range(1, 14):
                c_tot = ws2.cell(row=current_row, column=col_c)
                c_tot.border = border_total
                c_tot.fill = fill_total
        else:
            ws2.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=13)
            c_empty = ws2.cell(row=current_row, column=1, value="No se registraron entradas de inventario en el período seleccionado.")
            c_empty.font = font_empty
            c_empty.alignment = Alignment(horizontal='center', vertical='center')
            for col_c in range(1, 14):
                ws2.cell(row=current_row, column=col_c).border = border_thin

        # =====================================================================
        # HOJA 3: "Salidas de Productos"
        # =====================================================================
        ws3 = wb.create_sheet(title="Salidas de Productos")
        ws3.freeze_panes = "A2"

        h3_headers = [
            'ID Sal', 'Cod. Prod', 'Medida', 'Marca', 'Modelo',
            'Cantidad', 'P. Venta', 'F. Venta', 'N° Fact', 'Proveedor'
        ]
        ws3.row_dimensions[1].height = 26
        for col_idx, h_text in enumerate(h3_headers, 1):
            cell = ws3.cell(row=1, column=col_idx, value=h_text)
            cell.fill = fill_header
            cell.font = font_header
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        current_row = 2
        start_row = 2
        if salidas_qs:
            for s in salidas_qs:
                ws3.row_dimensions[current_row].height = 20
                prod = s.producto
                e_orig = encontrar_entrada_origen(prod.id, s.precio_costo, s.fecha_venta)
                prov_nom = e_orig.proveedor.nombre if (e_orig and e_orig.proveedor) else '-'
                num_fact = (e_orig.numero_factura or e_orig.folio_remision or '-') if e_orig else '-'

                c1 = ws3.cell(row=current_row, column=1, value=s.id)
                c2 = ws3.cell(row=current_row, column=2, value=prod.codigo)
                c3 = ws3.cell(row=current_row, column=3, value=prod.medida)
                c4 = ws3.cell(row=current_row, column=4, value=prod.marca.nombre if prod.marca else '')
                c5 = ws3.cell(row=current_row, column=5, value=prod.modelo)
                c6 = ws3.cell(row=current_row, column=6, value=s.cantidad)
                c7 = ws3.cell(row=current_row, column=7, value=float(s.precio_venta))
                c8 = ws3.cell(row=current_row, column=8, value=s.fecha_venta.strftime('%Y-%m-%d'))
                c9 = ws3.cell(row=current_row, column=9, value=num_fact)
                c10 = ws3.cell(row=current_row, column=10, value=prov_nom)

                c1.alignment = Alignment(horizontal='center', vertical='center')
                c2.alignment = Alignment(horizontal='center', vertical='center')
                c3.alignment = Alignment(horizontal='center', vertical='center')
                c4.alignment = Alignment(horizontal='left', vertical='center')
                c5.alignment = Alignment(horizontal='left', vertical='center')
                c6.alignment = Alignment(horizontal='right', vertical='center')
                c6.number_format = '#,##0'
                c7.alignment = Alignment(horizontal='right', vertical='center')
                c7.number_format = '"$"#,##0.00'
                c8.alignment = Alignment(horizontal='center', vertical='center')
                c9.alignment = Alignment(horizontal='center', vertical='center')
                c10.alignment = Alignment(horizontal='left', vertical='center')

                for col_c in range(1, 11):
                    cell_cur = ws3.cell(row=current_row, column=col_c)
                    cell_cur.border = border_thin
                    cell_cur.font = font_data

                current_row += 1

            last_row = current_row - 1
            # Fila final de totales
            ws3.row_dimensions[current_row].height = 22
            ws3.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=5)
            lbl = ws3.cell(row=current_row, column=1, value="TOTALES")
            lbl.font = font_total
            lbl.alignment = Alignment(horizontal='right', vertical='center')

            tot_cant = ws3.cell(row=current_row, column=6, value=f"=SUM(F{start_row}:F{last_row})")
            tot_cant.font = font_total
            tot_cant.alignment = Alignment(horizontal='right', vertical='center')
            tot_cant.number_format = '#,##0'

            tot_imp = ws3.cell(row=current_row, column=7, value=f"=SUMPRODUCT(F{start_row}:F{last_row}, G{start_row}:G{last_row})")
            tot_imp.font = font_total
            tot_imp.alignment = Alignment(horizontal='right', vertical='center')
            tot_imp.number_format = '"$"#,##0.00'

            for col_c in range(1, 11):
                c_tot = ws3.cell(row=current_row, column=col_c)
                c_tot.border = border_total
                c_tot.fill = fill_total
        else:
            ws3.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=10)
            c_empty = ws3.cell(row=current_row, column=1, value="No se registraron salidas de productos en el período seleccionado.")
            c_empty.font = font_empty
            c_empty.alignment = Alignment(horizontal='center', vertical='center')
            for col_c in range(1, 11):
                ws3.cell(row=current_row, column=col_c).border = border_thin

        # =====================================================================
        # HOJA 4: "Inventario Emir'S Centro Llantero"
        # =====================================================================
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            ws4 = wb.create_sheet(title="Inventario Emir'S Centro Llantero")
        ws4.freeze_panes = "A2"

        h4_headers = [
            'Cod. Prod', 'Medida', 'Marca', 'Modelo', 'Entrada', 'Salidas',
            'Stock', 'Precio', 'P. Compra', 'Fac. Referencia', 'P. Descuento'
        ]
        ws4.row_dimensions[1].height = 26
        for col_idx, h_text in enumerate(h4_headers, 1):
            cell = ws4.cell(row=1, column=col_idx, value=h_text)
            cell.fill = fill_header
            cell.font = font_header
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

        current_row = 2
        start_row = 2
        fill_stock_cero = PatternFill(start_color="EF4444", end_color="EF4444", fill_type="solid")
        font_stock_cero = Font(name="Calibri", size=10, bold=True, color="FFFFFF")

        if productos_activos:
            for p in productos_activos:
                ws4.row_dimensions[current_row].height = 20
                tot_ent = entradas_totales.get(p.id, 0)
                tot_sal = salidas_totales.get(p.id, 0)
                stock_est = tot_ent - tot_sal
                latest_ent = latest_entrada_por_prod.get(p.id)
                p_comp = float(latest_ent.precio_compra) if latest_ent else 0.0
                fac_ref = (latest_ent.numero_factura or latest_ent.folio_remision or '-') if latest_ent else '-'

                c1 = ws4.cell(row=current_row, column=1, value=p.codigo)
                c2 = ws4.cell(row=current_row, column=2, value=p.medida)
                c3 = ws4.cell(row=current_row, column=3, value=p.marca.nombre if p.marca else '')
                c4 = ws4.cell(row=current_row, column=4, value=p.modelo)
                c5 = ws4.cell(row=current_row, column=5, value=tot_ent)
                c6 = ws4.cell(row=current_row, column=6, value=tot_sal)

                # Columna Stock con fórmula =E{row}-F{row}
                c7 = ws4.cell(row=current_row, column=7, value=f"=E{current_row}-F{current_row}")
                c8 = ws4.cell(row=current_row, column=8, value=float(p.precio_venta))
                c9 = ws4.cell(row=current_row, column=9, value=p_comp)
                c10 = ws4.cell(row=current_row, column=10, value=fac_ref)
                c11 = ws4.cell(row=current_row, column=11, value=float(p.precio_descuento) if p.precio_descuento is not None else '-')

                c1.alignment = Alignment(horizontal='center', vertical='center')
                c2.alignment = Alignment(horizontal='center', vertical='center')
                c3.alignment = Alignment(horizontal='left', vertical='center')
                c4.alignment = Alignment(horizontal='left', vertical='center')
                c5.alignment = Alignment(horizontal='right', vertical='center')
                c5.number_format = '#,##0'
                c6.alignment = Alignment(horizontal='right', vertical='center')
                c6.number_format = '#,##0'
                c7.alignment = Alignment(horizontal='right', vertical='center')
                c7.number_format = '#,##0'

                if stock_est <= 0:
                    c7.fill = fill_stock_cero
                    c7.font = font_stock_cero
                else:
                    c7.font = font_total

                c8.alignment = Alignment(horizontal='right', vertical='center')
                c8.number_format = '"$"#,##0.00'
                c9.alignment = Alignment(horizontal='right', vertical='center')
                c9.number_format = '"$"#,##0.00'
                c10.alignment = Alignment(horizontal='center', vertical='center')
                c11.alignment = Alignment(horizontal='right', vertical='center')
                if isinstance(c11.value, float):
                    c11.number_format = '"$"#,##0.00'

                for col_c in range(1, 12):
                    cell_cur = ws4.cell(row=current_row, column=col_c)
                    cell_cur.border = border_thin
                    if col_c != 7:
                        cell_cur.font = font_data

                current_row += 1

            last_row = current_row - 1

            # Regla de formato condicional dinámico en Columna Stock
            rule_stock_cero = CellIsRule(
                operator='lessThanOrEqual',
                formula=['0'],
                stopIfTrue=True,
                fill=fill_stock_cero,
                font=font_stock_cero
            )
            ws4.conditional_formatting.add(f"G{start_row}:G{last_row}", rule_stock_cero)

            # Fila final de totales
            ws4.row_dimensions[current_row].height = 22
            ws4.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=4)
            lbl = ws4.cell(row=current_row, column=1, value="TOTALES")
            lbl.font = font_total
            lbl.alignment = Alignment(horizontal='right', vertical='center')

            tot_ent = ws4.cell(row=current_row, column=5, value=f"=SUM(E{start_row}:E{last_row})")
            tot_ent.font = font_total
            tot_ent.alignment = Alignment(horizontal='right', vertical='center')
            tot_ent.number_format = '#,##0'

            tot_sal = ws4.cell(row=current_row, column=6, value=f"=SUM(F{start_row}:F{last_row})")
            tot_sal.font = font_total
            tot_sal.alignment = Alignment(horizontal='right', vertical='center')
            tot_sal.number_format = '#,##0'

            tot_stk = ws4.cell(row=current_row, column=7, value=f"=SUM(G{start_row}:G{last_row})")
            tot_stk.font = font_total
            tot_stk.alignment = Alignment(horizontal='right', vertical='center')
            tot_stk.number_format = '#,##0'

            tot_val_venta = ws4.cell(row=current_row, column=8, value=f"=SUMPRODUCT(G{start_row}:G{last_row}, H{start_row}:H{last_row})")
            tot_val_venta.font = font_total
            tot_val_venta.alignment = Alignment(horizontal='right', vertical='center')
            tot_val_venta.number_format = '"$"#,##0.00'

            tot_val_costo = ws4.cell(row=current_row, column=9, value=f"=SUMPRODUCT(G{start_row}:G{last_row}, I{start_row}:I{last_row})")
            tot_val_costo.font = font_total
            tot_val_costo.alignment = Alignment(horizontal='right', vertical='center')
            tot_val_costo.number_format = '"$"#,##0.00'

            for col_c in range(1, 12):
                c_tot = ws4.cell(row=current_row, column=col_c)
                c_tot.border = border_total
                c_tot.fill = fill_total
        else:
            ws4.merge_cells(start_row=current_row, start_column=1, end_row=current_row, end_column=11)
            c_empty = ws4.cell(row=current_row, column=1, value="No se encontraron productos activos en el catálogo de inventario.")
            c_empty.font = font_empty
            c_empty.alignment = Alignment(horizontal='center', vertical='center')
            for col_c in range(1, 12):
                ws4.cell(row=current_row, column=col_c).border = border_thin

        # ── Ajustar anchos automáticos de columnas y visibilidad de cuadrícula ─
        for ws in [ws1, ws2, ws3, ws4]:
            ws.views.sheetView[0].showGridLines = True
            for col in ws.columns:
                max_len = 0
                col_letter = get_column_letter(col[0].column)
                for cell in col:
                    val = cell.value
                    if val is not None:
                        val_str = str(val)
                        if val_str.startswith('='):
                            val_str = "123,456.78"
                        elif isinstance(val, (int, float)) and cell.number_format and '"$"#' in cell.number_format:
                            val_str = f"${val:,.2f}"
                        max_len = max(max_len, len(val_str))
                ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        # ── Generar respuesta HTTP ───────────────────────────────────────────
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        nombre_archivo = f"reporte_contable_emirs_{fecha_inicio}_{fecha_fin}.xlsx"
        resp = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        resp['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        return resp



