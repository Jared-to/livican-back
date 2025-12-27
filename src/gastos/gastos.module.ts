import { forwardRef, Module } from '@nestjs/common';
import { GastosService } from './gastos.service';
import { GastosController } from './gastos.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Gasto } from './entities/gasto.entity';
import { AuthModule } from 'src/auth/auth.module';
import { CategoriaGastosModule } from 'src/categoria-gastos/categoria-gastos.module';
import { NotificacionesModule } from 'src/notificaciones/notificaciones.module';
import { GastoListener } from './listener/gasto.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Gasto]),
    AuthModule,
    CategoriaGastosModule,
    NotificacionesModule,
  ],
  controllers: [GastosController],
  providers: [GastosService,GastoListener],
  exports:[TypeOrmModule,GastosService]
})
export class GastosModule { }
