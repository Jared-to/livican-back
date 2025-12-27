import { Module } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { PrinterService } from './helpers/printer.helper';
import { VentasModule } from 'src/ventas/ventas.module';
import { GastosModule } from 'src/gastos/gastos.module';

@Module({
  controllers: [ReportesController],
  providers: [ReportesService,PrinterService],
  imports:[
    VentasModule,
    GastosModule,
  ]
})
export class ReportesModule {}
