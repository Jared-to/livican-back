import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { CreateInventarioDto } from './dto/create-inventario.dto';
import { InventarioInicialDto } from './dto/inventario-inicial.dto';
import { AjustesInventario } from './service/ajustes-inventario.service';
import { CreateAjusteInventarioDto } from './dto/ajuste-inventario.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ValidRoles } from 'src/auth/interface/valid-roles';
import { MovimientosAlmacenService } from './service/movimientos-almacen.service';
import { MovimientoInventario } from './entities/movimiento-inv';
import { AjusteUnitarioDto } from './dto/ajuste-unitario.dto';

@Controller('inventario')
export class InventarioController {
  constructor(
    private readonly inventarioService: InventarioService,
    private readonly ajustesService: AjustesInventario,
    private readonly movimientoInventarioService: MovimientosAlmacenService,

  ) { }

  @Post('modificar-stock')
  @Auth(ValidRoles.admin, ValidRoles.user)
  createInvInicial(@Body() ajusteUnitarioDto: AjusteUnitarioDto) {
    return this.ajustesService.modificarStock(ajusteUnitarioDto);
  }

  @Get()
  @Auth(ValidRoles.admin, ValidRoles.user)
  obtenerInventario() {
    return this.inventarioService.obtenerInventarioCompleto();
  }

  @Get('stocks-bajos')
  @Auth(ValidRoles.admin, ValidRoles.user)
  async obtenerStocksBajos() {
    return this.inventarioService.obtenerStocksBajos();
  }
  @Get('ventas/operaciones')
  @Auth(ValidRoles.admin, ValidRoles.user)
  obtenerInventarioVenta() {
    return this.inventarioService.obtenerInventarioVenta();
  }

  @Get(':id')
  @Auth(ValidRoles.admin, ValidRoles.user)
  obtenerInfoProductoInv(@Param('id') id: string) {
    return this.inventarioService.obtenerInfoProducto(id);
  }


  //------------Movimientos----------------------
  @Get('movimientos/producto')
  @Auth(ValidRoles.admin, ValidRoles.user)
  async obtenerMovimientosPorProducto(
    @Query('productoId') productoId: string,
    @Query('fechaIn') fechaIn?: string,
    @Query('fechaFn') fechaFn?: string,
  ): Promise<MovimientoInventario[]> {
    // Llamar al servicio para obtener los movimientos del producto
    return this.movimientoInventarioService.obtenerMovimientosPorProducto(
      productoId,
      fechaIn,
      fechaFn,
    );
  }

  @Get('movimientos/ultimos')
  @Auth(ValidRoles.admin, ValidRoles.user)
  async obtenerUltimosMovimientos(): Promise<MovimientoInventario[]> {
    // Llamar al servicio para obtener los movimientos del producto
    return this.movimientoInventarioService.obtenerUltimosMovimientos();
  }
}
