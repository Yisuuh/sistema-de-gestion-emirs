"""
Comando de gestión para ejecutar pruebas integrales del sistema por módulo.
"""
import time
import sys
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.test.runner import DiscoverRunner


class Command(BaseCommand):
    help = 'Ejecuta y verifica la suite de pruebas integrales para todos los módulos clave del sistema.'

    DEFAULT_MODULES = [
        'apps.ventas',
        'apps.caja',
        'apps.inventario',
        'apps.nomina',
        'apps.rescates',
        'apps.usuarios',
        'apps.clientes',
    ]

    def add_arguments(self, parser):
        parser.add_argument(
            '--modules',
            nargs='*',
            default=self.DEFAULT_MODULES,
            help='Lista de módulos específicos a probar (por defecto todos)'
        )
        parser.add_argument(
            '--keepdb',
            action='store_true',
            default=True,
            help='Preservar la base de datos de pruebas (por defecto True)'
        )
        parser.add_argument(
            '--failfast',
            action='store_true',
            default=False,
            help='Detener la ejecución al encontrar la primera falla'
        )

    def handle(self, *args, **options):
        modules = options.get('modules') or self.DEFAULT_MODULES
        keepdb = options.get('keepdb', True)
        failfast = options.get('failfast', False)
        verbosity = options.get('verbosity', 1)

        self.stdout.write(self.style.MIGRATE_HEADING("=================================================================="))
        self.stdout.write(self.style.MIGRATE_HEADING(" SISTEMA DE GESTION EMIRS - SUITE DE PRUEBAS INTEGRALES"))
        self.stdout.write(self.style.MIGRATE_HEADING("=================================================================="))
        self.stdout.write(f"Modulos a evaluar: {', '.join(modules)}\n")

        runner = DiscoverRunner(
            verbosity=verbosity,
            interactive=False,
            failfast=failfast,
            keepdb=keepdb
        )

        runner.setup_test_environment()
        old_config = runner.setup_databases()

        resumen = []
        total_tests = 0
        total_failures = 0
        total_errors = 0
        start_global = time.time()

        try:
            for mod in modules:
                self.stdout.write(f"\n[+] Ejecutando suite: {self.style.SQL_KEYWORD(mod)} ...")
                mod_start = time.time()
                suite = runner.build_suite([mod])
                result = runner.run_suite(suite)
                elapsed = time.time() - mod_start

                tests_run = result.testsRun
                failures = len(result.failures)
                errors = len(result.errors)
                skipped = len(result.skipped)

                total_tests += tests_run
                total_failures += failures
                total_errors += errors

                passed = result.wasSuccessful()
                status_str = "EXITOSO" if passed else "FALLIDO"
                status_colored = self.style.SUCCESS(status_str) if passed else self.style.ERROR(status_str)

                resumen.append({
                    'modulo': mod,
                    'tests': tests_run,
                    'fallas': failures,
                    'errores': errors,
                    'saltados': skipped,
                    'tiempo': elapsed,
                    'estado': status_str,
                    'passed': passed
                })

                self.stdout.write(
                    f"    Resultado: {status_colored} | Tests: {tests_run} | "
                    f"Fallas: {failures} | Errores: {errors} | Tiempo: {elapsed:.2f}s"
                )

                if failfast and not passed:
                    self.stdout.write(self.style.ERROR("\n[!] Detencion temprana por --failfast"))
                    break

        finally:
            runner.teardown_databases(old_config)
            runner.teardown_test_environment()

        total_time = time.time() - start_global

        # Imprimir Tabla Resumen
        self.stdout.write("\n" + "=" * 80)
        self.stdout.write(self.style.MIGRATE_HEADING(" RESUMEN INTEGRAL DE EJECUCION POR MODULO"))
        self.stdout.write("=" * 80)
        header = f"{'Modulo':<22} | {'Tests':<6} | {'Fallas':<6} | {'Errores':<7} | {'Tiempo':<8} | {'Estado'}"
        self.stdout.write(header)
        self.stdout.write("-" * 80)

        all_ok = True
        for r in resumen:
            mod_display = r['modulo'].replace('apps.', '')
            t_str = f"{r['tiempo']:.2f}s"
            if r['passed']:
                st = self.style.SUCCESS(f"{r['estado']:<8}")
            else:
                all_ok = False
                st = self.style.ERROR(f"{r['estado']:<8}")

            row = f"{mod_display:<22} | {r['tests']:<6} | {r['fallas']:<6} | {r['errores']:<7} | {t_str:<8} | {st}"
            self.stdout.write(row)

        self.stdout.write("=" * 80)
        self.stdout.write(
            f"TOTALES: {total_tests} tests ejecutados | {total_failures} fallas | "
            f"{total_errors} errores | Tiempo total: {total_time:.2f}s\n"
        )

        if all_ok and total_failures == 0 and total_errors == 0:
            self.stdout.write(self.style.SUCCESS("[OK] TODAS LAS PRUEBAS INTEGRALES PASARON CON EXITO (100% OK)"))
        else:
            self.stdout.write(self.style.ERROR("[FAIL] SE DETECTARON FALLAS EN LA SUITE INTEGRAL"))
            sys.exit(1)
