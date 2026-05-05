from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Avg
from django.utils import timezone
from django.http import HttpResponse


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


class ReportePDF(APIView):
    """
    GET /api/reportes/pdf/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
    Genera una minuta PDF con ventas, gastos, utilidad bruta del período.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.ventas.models import Venta, DetalleVenta
        from apps.gastos.models import Gasto
        from django.db.models import Q
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        import io

        hoy = timezone.now().date()
        fecha_inicio = request.query_params.get('fecha_inicio', str(hoy.replace(day=1)))
        fecha_fin = request.query_params.get('fecha_fin', str(hoy))

        # ── Datos ─────────────────────────────────────────────────────────────
        ventas_qs = Venta.objects.filter(fecha__date__range=[fecha_inicio, fecha_fin])

        v_total = ventas_qs.aggregate(
            total=Sum('total'),
            efectivo=Sum('monto_efectivo'),
            electronico=Sum('monto_electronico'),
            cantidad=Count('id'),
        )

        por_vendedor = list(
            ventas_qs.values('empleado__nombre', 'empleado__apellido')
            .annotate(total=Sum('total'), cantidad=Count('id'))
            .order_by('-total')
        )

        top_productos = list(
            DetalleVenta.objects
            .filter(venta__fecha__date__range=[fecha_inicio, fecha_fin])
            .values('descripcion')
            .annotate(piezas=Sum('cantidad'), subtotal=Sum('subtotal'))
            .order_by('-subtotal')[:10]
        )

        gastos_qs = Gasto.objects.filter(fecha__range=[fecha_inicio, fecha_fin])
        g_total = gastos_qs.aggregate(
            total=Sum('monto'),
            efectivo=Sum('monto', filter=Q(metodo_pago='efectivo')),
            transferencia=Sum('monto', filter=Q(metodo_pago='transferencia')),
            tarjeta=Sum('monto', filter=Q(metodo_pago='tarjeta')),
        )

        por_cat_gasto = list(
            gastos_qs.values('categoria__nombre')
            .annotate(total=Sum('monto'))
            .order_by('-total')
        )

        venta_total_f = float(v_total['total'] or 0)
        gasto_total_f = float(g_total['total'] or 0)
        utilidad = venta_total_f - gasto_total_f

        # Costo de mercancía vendida (costo real de salidas en el período)
        from apps.inventario.models import SalidaInventario
        costo_mercancias = float(
            SalidaInventario.objects
            .filter(fecha_venta__range=[fecha_inicio, fecha_fin])
            .aggregate(c=Sum('precio_costo'))
            .get('c') or 0
        )

        # ── PDF ───────────────────────────────────────────────────────────────
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=letter,
            leftMargin=1.8*cm, rightMargin=1.8*cm,
            topMargin=1.8*cm, bottomMargin=1.8*cm,
        )
        styles = getSampleStyleSheet()

        H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=16, spaceAfter=4)
        H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, spaceBefore=14, spaceAfter=4,
                             textColor=colors.HexColor('#1e3a5f'))
        NORMAL = styles['Normal']
        SMALL = ParagraphStyle('SMALL', parent=NORMAL, fontSize=8)

        HEADER_BG = colors.HexColor('#1e3a5f')
        ALT_BG = colors.HexColor('#f0f4f8')
        WHITE = colors.white

        def money(n): return f"${float(n or 0):,.2f}"

        def make_table(headers, rows, col_widths=None):
            data = [headers] + rows
            t = Table(data, colWidths=col_widths, repeatRows=1)
            ts = TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
                ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, ALT_BG]),
                ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#cccccc')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ])
            t.setStyle(ts)
            return t

        story = []

        # Encabezado
        story.append(Paragraph('Centro Llantero EmirS', H1))
        story.append(Paragraph(f'Minuta de Operación — {fecha_inicio} al {fecha_fin}', NORMAL))
        story.append(Spacer(1, 0.3*cm))
        story.append(HRFlowable(width='100%', thickness=1, color=HEADER_BG))
        story.append(Spacer(1, 0.3*cm))

        # ── Resumen ejecutivo ─────────────────────────────────────────────────
        story.append(Paragraph('Resumen Ejecutivo', H2))
        resumen_rows = [
            ['Total Ventas', money(venta_total_f), '   Ventas en Efectivo', money(v_total['efectivo'])],
            ['Total Gastos', money(gasto_total_f), '   Ventas Electrónicas', money(v_total['electronico'])],
            ['Utilidad Neta (Ventas − Gastos)', money(utilidad), '   Número de Ventas', str(v_total['cantidad'] or 0)],
        ]
        t_res = Table(resumen_rows, colWidths=[7*cm, 4*cm, 6*cm, 4*cm])
        t_res.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [WHITE, ALT_BG]),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#cccccc')),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TEXTCOLOR', (1, 2), (1, 2), colors.HexColor('#16a34a') if utilidad >= 0 else colors.red),
        ]))
        story.append(t_res)
        story.append(Spacer(1, 0.4*cm))

        # ── Ventas por método de pago ─────────────────────────────────────────
        story.append(Paragraph('Ventas por Método de Pago', H2))
        mp_rows = []
        for mp in ['efectivo', 'tarjeta', 'transferencia', 'mixto']:
            agg = ventas_qs.filter(metodo_pago=mp).aggregate(t=Sum('total'), c=Count('id'))
            if agg['c']:
                mp_rows.append([mp.capitalize(), str(agg['c']), money(agg['t'])])
        if mp_rows:
            story.append(make_table(['Método', 'Ventas', 'Total'], mp_rows, [6*cm, 4*cm, 7*cm]))
        else:
            story.append(Paragraph('Sin ventas en el período.', SMALL))
        story.append(Spacer(1, 0.4*cm))

        # ── Ventas por vendedor ───────────────────────────────────────────────
        story.append(Paragraph('Ventas por Vendedor', H2))
        vend_rows = [
            [f"{r['empleado__nombre']} {r['empleado__apellido']}".strip(), str(r['cantidad']), money(r['total'])]
            for r in por_vendedor
        ]
        if vend_rows:
            story.append(make_table(['Vendedor', 'Ventas', 'Total'], vend_rows, [9*cm, 4*cm, 7*cm]))
        else:
            story.append(Paragraph('Sin datos.', SMALL))
        story.append(Spacer(1, 0.4*cm))

        # ── Top productos / servicios ─────────────────────────────────────────
        story.append(Paragraph('Top Productos / Servicios Vendidos', H2))
        prod_rows = [
            [r['descripcion'], str(int(r['piezas'] or 0)), money(r['subtotal'])]
            for r in top_productos
        ]
        if prod_rows:
            story.append(make_table(['Descripción', 'Piezas', 'Subtotal'], prod_rows, [11*cm, 3*cm, 5*cm]))
        else:
            story.append(Paragraph('Sin datos.', SMALL))
        story.append(Spacer(1, 0.4*cm))

        # ── Gastos ────────────────────────────────────────────────────────────
        story.append(Paragraph('Gastos del Período', H2))
        g_sum_rows = [
            ['Total Gastos', money(g_total['total']), 'Efectivo', money(g_total['efectivo'])],
            ['', '', 'Transferencia', money(g_total['transferencia'])],
            ['', '', 'Tarjeta', money(g_total['tarjeta'])],
        ]
        t_g = Table(g_sum_rows, colWidths=[5*cm, 4*cm, 5*cm, 4*cm])
        t_g.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 0), (-1, -1), [WHITE, ALT_BG, WHITE]),
            ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#cccccc')),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t_g)
        story.append(Spacer(1, 0.25*cm))

        # Gastos por categoría
        story.append(Paragraph('Gastos por Categoría', H2))
        gcat_rows = [
            [r['categoria__nombre'] or 'Sin categoría', money(r['total'])]
            for r in por_cat_gasto
        ]
        if gcat_rows:
            story.append(make_table(['Categoría', 'Total'], gcat_rows, [12*cm, 5*cm]))
        else:
            story.append(Paragraph('Sin gastos en el período.', SMALL))
        story.append(Spacer(1, 0.4*cm))

        # Detalle de gastos
        story.append(Paragraph('Detalle de Gastos', H2))
        gdet_rows = [
            [str(g.fecha), g.concepto[:40], g.categoria.nombre if g.categoria else '—',
             g.metodo_pago.capitalize(), money(g.monto)]
            for g in gastos_qs.select_related('categoria').order_by('fecha')
        ]
        if gdet_rows:
            story.append(make_table(
                ['Fecha', 'Concepto', 'Categoría', 'Método', 'Monto'],
                gdet_rows,
                [2.8*cm, 6.5*cm, 3.5*cm, 2.5*cm, 3*cm]
            ))
        else:
            story.append(Paragraph('Sin gastos en el período.', SMALL))

        story.append(Spacer(1, 0.6*cm))
        story.append(HRFlowable(width='100%', thickness=0.5, color=colors.grey))
        story.append(Spacer(1, 0.2*cm))
        story.append(Paragraph(
            f'Generado el {timezone.now().strftime("%d/%m/%Y %H:%M")} — Centro Llantero EmirS',
            ParagraphStyle('footer', parent=SMALL, textColor=colors.grey, alignment=1)
        ))

        doc.build(story)
        buf.seek(0)

        nombre_archivo = f"minuta_{fecha_inicio}_{fecha_fin}.pdf"
        resp = HttpResponse(buf.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{nombre_archivo}"'
        return resp
