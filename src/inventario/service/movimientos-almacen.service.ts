import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { MovimientoInventario } from '../entities/movimiento-inv';
import { MovimientoInventarioDto } from '../dto/movimiento-inv.dto';
import { AlmacenesService } from 'src/almacenes/almacenes.service';
import { Almacen } from 'src/almacenes/entities/almacen.entity';
import { ProductosService } from 'src/productos/productos.service';
import * as moment from 'moment-timezone';
import { Producto } from 'src/productos/entities/producto.entity';

@Injectable()
export class MovimientosAlmacenService {
  constructor(
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    private readonly almacenService: AlmacenesService,
    @Inject(forwardRef(() => ProductosService))
    private readonly productoService: ProductosService,
  ) { }

  // Registrar un ingreso
  async registrarIngreso(movimientoInventarioDto: MovimientoInventarioDto): Promise<MovimientoInventario> {

    const { almacenId, cantidad, productoId, descripcion } = movimientoInventarioDto;
    const fechaUTC = new Date()
    const almacen = await this.almacenService.findOne(almacenId);
    const producto = await this.productoService.findOneProducto(productoId);
    const movimiento = this.movimientoRepository.create({
      almacen: almacen,
      product: { id: productoId },
      tipo: 'ingreso',
      cantidad,
      descripcion,
      fecha: moment().tz("America/La_Paz").toDate(),
      nombreAlmacen: almacen.nombre,
      nombreProducto: producto.nombre,
    });

    return this.movimientoRepository.save(movimiento);
  }
  // Registrar una salida
  async registrarSalida(movimientoInventarioDto: MovimientoInventarioDto): Promise<MovimientoInventario> {

    const { almacenId, cantidad, productoId, descripcion } = movimientoInventarioDto;
    const fechaLocal = new Date();
    const producto = await this.productoService.findOneProducto(productoId);
    const almacen = await this.almacenService.findOne(almacenId);

    const movimiento = this.movimientoRepository.create({
      almacen: { id: almacenId },
      product: { id: productoId },
      tipo: 'salida',
      cantidad,
      descripcion,
      fecha: moment().tz("America/La_Paz").toDate(),
      nombreAlmacen: almacen.nombre,
      nombreProducto: producto.nombre
    });

    return this.movimientoRepository.save(movimiento);
  }
  async registrarIngresoTransaccional(movimientoInventarioDto: MovimientoInventarioDto, queryRunner: QueryRunner): Promise<MovimientoInventario> {

    const { almacenId, cantidad, productoId, descripcion } = movimientoInventarioDto;
    const fechaUTC = new Date()
    const almacen = await this.almacenService.findOne(almacenId);
    const producto = await queryRunner.manager.findOne(Producto, { where: { id: productoId } });

    const movimiento = queryRunner.manager.create(MovimientoInventario, {
      almacen: almacen,
      product: { id: productoId },
      tipo: 'ingreso',
      cantidad,
      descripcion,
      fecha: moment().tz("America/La_Paz").toDate(),
      nombreAlmacen: almacen.nombre,
      nombreProducto: producto.nombre
    });

    return queryRunner.manager.save(MovimientoInventario, movimiento);
  }
  // Registrar una salida
  async registrarSalidaTransaccional(movimientoInventarioDto: MovimientoInventarioDto, queryRunner: QueryRunner): Promise<MovimientoInventario> {

    const { almacenId, cantidad, productoId, descripcion } = movimientoInventarioDto;
    const fechaLocal = new Date();
    const almacen = await this.almacenService.findOne(almacenId);
    const producto = await this.productoService.findOneProducto(productoId);
    const movimiento = queryRunner.manager.create(MovimientoInventario, {
      almacen: { id: almacenId },
      product: { id: productoId },
      tipo: 'salida',
      cantidad,
      descripcion,
      fecha: moment().tz("America/La_Paz").toDate(),
      nombreAlmacen: almacen.nombre,
      nombreProducto: producto.nombre
    });

    return queryRunner.manager.save(MovimientoInventario, movimiento);
  }
  async registrarIngresoExcel(
    movimientoInventarioDto: MovimientoInventarioDto,
    queryRunner: QueryRunner
  ): Promise<MovimientoInventario> {

    const { almacenId, cantidad, productoId, descripcion, } = movimientoInventarioDto;
    const fechaUTC = new Date();

    // Busca el almacén usando el QueryRunner
    const almacen = await queryRunner.manager.findOne(Almacen, { where: { id: almacenId } });

    if (!almacen) {
      throw new Error(`El almacén con ID ${almacenId} no existe.`);
    }

    const movimiento = queryRunner.manager.create(MovimientoInventario, {
      almacen: almacen,
      product: { id: productoId }, // Asegúrate de que el producto exista también en la misma transacción
      tipo: 'ingreso',
      cantidad,
      descripcion,
      fecha: fechaUTC,
    });

    // Guarda el movimiento usando el QueryRunner
    return queryRunner.manager.save(MovimientoInventario, movimiento);
  }



  // Obtener todos los movimientos
  async obtenerMovimientos(): Promise<MovimientoInventario[]> {
    return this.movimientoRepository.find({ order: { fecha: 'DESC' } });
  }
  // Obtener todos los movimientos
  async obtenerUltimosMovimientos(): Promise<MovimientoInventario[]> {
    return this.movimientoRepository.find({
      order: { fecha: 'DESC' },
      relations: ['product', 'product.categoria'], take: 5
    });
  }

  // Obtener movimientos por almacén
  async obtenerMovimientosPorAlmacen(almacenId: string): Promise<MovimientoInventario[]> {
    return this.movimientoRepository.find({
      where: { almacen: { id: almacenId } },
      order: { fecha: 'DESC' },
    });
  }

  // Obtener movimientos por producto
  async obtenerMovimientosPorProducto(
    productoId: string,
    fechaIn?: string,
    fechaFn?: string,
  ) {
    const queryBuilder = this.movimientoRepository.createQueryBuilder('movimiento');

    // Filtrar por producto_id y codigo_barras
    queryBuilder.where('movimiento.product = :productoId', { productoId })

    // Filtrar por rango de fechas si se pasan
    if (fechaIn && fechaFn) {
      // Asegurarse de que las fechas estén en el formato correcto (ej. 'YYYY-MM-DD')
      queryBuilder.andWhere('movimiento.fecha BETWEEN :fechaIn AND :fechaFn', {
        fechaIn: fechaIn + 'T00:00:00',  // Incluir inicio del día
        fechaFn: fechaFn + 'T23:59:59',  // Incluir fin del día
      });
    }

    // Ejecutar la consulta
    const movimientos = await queryBuilder.getMany();

    return movimientos;
  }



}
