import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThanOrEqual, LessThanOrEqual, QueryRunner, Raw } from 'typeorm';
import { Venta } from './entities/venta.entity';
import { CreateDetalleVentaDto, CreateVentaDto } from './dto/create-venta.dto';
import { DetalleVenta } from './entities/detalle-venta.entity';
import { InventarioService } from 'src/inventario/inventario.service';
import { MovimientosAlmacenService } from 'src/inventario/service/movimientos-almacen.service';
import { UpdateVentaDto } from './dto/update-venta.dto';
import { Cliente } from 'src/clientes/entities/cliente.entity';
import { Producto } from 'src/productos/entities/producto.entity';
import { Almacen } from 'src/almacenes/entities/almacen.entity';
import * as moment from 'moment-timezone';
import { User } from 'src/auth/entities/user.entity';
import { ClientesService } from 'src/clientes/clientes.service';
import { Inventario } from 'src/inventario/entities/inventario.entity';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class VentasService {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepository: Repository<Venta>,
    @InjectRepository(DetalleVenta)
    private readonly detallesRepository: Repository<DetalleVenta>,
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(Almacen)
    private readonly almacenRepository: Repository<Almacen>,
    private readonly inventarioService: InventarioService,
    private readonly movimientosService: MovimientosAlmacenService,
    private readonly dataSource: DataSource,
    private readonly clienteService: ClientesService,
    private readonly notificationsService: NotificacionesService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async create(createVentaDto: CreateVentaDto): Promise<Venta> {
    const queryRunner = this.dataSource.createQueryRunner();

    // Iniciar la transacción
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { detalles, ...ventaData } = createVentaDto;

      // Crear y guardar la venta
      const venta = queryRunner.manager.create(Venta, {
        ...ventaData,
        fecha: moment(ventaData.fecha).tz("America/La_Paz").toDate(),
        vendedor: { id: ventaData.vendedor },
        nombreCliente: ventaData.cliente,
      });


      const ventaGuardada1 = await queryRunner.manager.save(Venta, venta);


      // Validar si 'increment' existe, aunque debería ser garantizado por la base de datos
      if (!ventaGuardada1.increment) {
        ventaGuardada1.increment = 1; // En caso de que sea nulo por algún motivo
      }

      // Generar el código basado en el increment
      ventaGuardada1.codigo = `V${ventaGuardada1.increment.toString().padStart(4, '0')}`;

      // Guardar nuevamente el cliente con el código generado
      const ventaGuardada = await queryRunner.manager.save(Venta, ventaGuardada1);


      if (!detalles || detalles.length === 0) {
        throw new NotFoundException('Debe incluir al menos un detalle en la venta');
      }


      // Crear y guardar los detalles de la venta

      for (const detalle of detalles) {
        const inventario = await queryRunner.manager.findOne(Inventario, { where: { id: detalle.id_inventario }, relations: ['product'] })

        const deta = queryRunner.manager.create(DetalleVenta, {
          inventario: { id: inventario.id },
          cantidad: detalle.cantidad,
          precio: detalle.precio,
          subtotal: detalle.subtotal,
          unidad_medida: detalle.unidad_medida,
          nombreProducto: inventario.product.nombre,
          marca: inventario.product.marca,
          venta: ventaGuardada,
        });
        // Guardar los detalles de la venta con el query runner
        const detalleG = await queryRunner.manager.save(DetalleVenta, deta);

        await this.registrarMovimiento(detalleG, inventario.product.id, 'venta', `Venta - ${ventaGuardada.codigo}`, queryRunner);

      }

      //Crear cliente 

      const cliente = await queryRunner.manager.findOne(Cliente, { where: { nombre: createVentaDto.cliente } });

      if (cliente) {
        await this.clienteService.create({
          nombre: createVentaDto.cliente
        })
      }

      // Confirmar la transacción
      await queryRunner.commitTransaction();

      this.notificationsService.sendEvent({
        type: 'ventaCreada',
        payload: {
          rol: 'admin',
          tipo: 'venta',
          mensaje: `Nueva Venta - ${ventaGuardada?.codigo} - ${createVentaDto.cliente}`,
          fecha: ventaGuardada.fecha,
        },
      });
      // --- ENVÍO DEL MENSAJE ---
      const mensaje = `🛒 *Comercio.bo*  
✨ ¡Hola Livican, se realizó una *nueva venta*! ✨

👤 Cliente: *${venta.nombreCliente || 'Desconocido'}*  
💰 Total: *${venta.total.toFixed(2)} Bs*  
🆔 Código: *${venta.codigo}*  
📅 Fecha: *${new Date(venta.fecha).toLocaleString()}*
Sistema: *https://livican.comercio.bo*
✅ Revisa los detalles en tu panel.`;

      // Emitir evento asíncrono SIN bloquear la respuesta
      this.eventEmitter.emitAsync('venta.creada', {
        numero: process.env.WSP_NUM,
        mensaje,
      });
      // Retornar la venta con los detalles
      return (ventaGuardada);
    } catch (error) {
      console.log(error);

      // Revertir la transacción en caso de error
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('No se pudo crear la venta');
    } finally {
      // Liberar el queryRunner
      await queryRunner.release();
    }
  }

  async update(id: string, updateVentaDto: UpdateVentaDto): Promise<Venta> {
    const queryRunner = this.ventasRepository.manager.connection.createQueryRunner();
    await queryRunner.startTransaction();

    try {
      const venta = await this.findOne(id);
      const { detalles: nuevosDetalles, ...ventaData } = updateVentaDto;

      const detallesAnteriores = venta.detalles;

      for (const detalleAnterior of detallesAnteriores) {
        const detalleNuevo = nuevosDetalles.find(d => d.id_inventario === detalleAnterior.inventario.id);

        if (!detalleNuevo) {
          // Si no está en los nuevos detalles, eliminarlo
          await queryRunner.manager.remove(DetalleVenta, detalleAnterior);
          await queryRunner.manager.delete(DetalleVenta, detalleAnterior.id);

          // Quitar manualmente del array para que TypeORM no lo restaure al guardar
          venta.detalles = venta.detalles.filter(
            (d) => d.id !== detalleAnterior.id
          );
          await this.registrarMovimiento(
            detalleAnterior,
            detalleAnterior.inventario.product.id,
            'devolucion',
            `Ajuste Venta - ${venta.codigo}`,
            queryRunner
          );
        } else if (detalleAnterior.cantidad !== detalleNuevo.cantidad) {
          // Si cambió la cantidad, devolver lo anterior y registrar nuevo
          await this.registrarMovimiento(
            detalleAnterior,
            detalleAnterior.inventario.product.id,
            'devolucion',
            `Ajuste Venta - ${venta.codigo}`,
            queryRunner
          );
          await queryRunner.manager.delete(DetalleVenta, detalleAnterior.id);

          // Quitar manualmente del array para que TypeORM no lo restaure al guardar
          venta.detalles = venta.detalles.filter(
            (d) => d.id !== detalleAnterior.id
          );
        }
      }


      // Actualizar campos de la venta
      Object.assign(venta, {
        total: ventaData.total,
        subtotal: ventaData.subtotal,
        descuento: ventaData.descuento,
        tipo_pago: ventaData.tipo_pago,
        nombreCliente: ventaData.cliente,
        montoEfectivo: ventaData.montoEfectivo || null,
        montoQR: ventaData.montoQR || null,
        fechaEdit: moment().tz("America/La_Paz").toDate(),
      });

      const ventaActualizada = await queryRunner.manager.save(Venta, venta);

      // Agregar o actualizar los nuevos detalles
      for (const detalleNuevo of nuevosDetalles) {
        const yaExiste = detallesAnteriores.find(
          d => d.inventario.id === detalleNuevo.id_inventario && d.cantidad === detalleNuevo.cantidad
        );
        if (!yaExiste) {
          const inventario = await queryRunner.manager.findOne(Inventario, {
            where: { id: detalleNuevo.id_inventario },
            relations: ['product']
          });

          if (!inventario) {
            throw new NotFoundException('El producto enviado no fue encontrado.');
          }

          const detalleG = queryRunner.manager.create(DetalleVenta, {
            venta: { id: ventaActualizada.id },
            ...detalleNuevo,
            inventario: { id: inventario.id },
            nombreProducto: inventario.product.nombre,
            marca: inventario.product.marca,
          });

          const detalleGuardado = await queryRunner.manager.save(detalleG);

          await this.registrarMovimiento(
            detalleGuardado,
            inventario.product.id,
            'venta',
            `Ajuste Venta - ${ventaActualizada.codigo}`,
            queryRunner
          );
        }
      }
      await queryRunner.commitTransaction();
      return ventaActualizada;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllDates(fechaInicio: string | 'xx', fechaFin: string | 'xx', user: User): Promise<Venta[]> {

    const isAdmin = user?.roles?.some(role => role === 'admin') ?? false;

    // Si ambas fechas son 'xx', obtenemos todas las ventas
    if (fechaInicio === 'xx' && fechaFin === 'xx') {
      return this.ventasRepository.find({
        where: user && !isAdmin ? { vendedor: { id: user.id } } : {},
        relations: ['detalles', 'detalles.inventario', 'detalles.inventario.product', 'detalles.inventario.product.categoria', 'vendedor'],
      });
    }

    const whereConditions: any = {};
    if (user && !isAdmin) {
      whereConditions.vendedor = { id: user.id };
    }

    const fechaInicioFormat = (fechaInicio);
    const fechaFinFormat = (fechaFin);

    if (fechaInicioFormat && fechaFinFormat) {
      whereConditions.fecha = Raw(alias => `
      DATE(${alias}) BETWEEN DATE('${fechaInicioFormat}') AND DATE('${fechaFinFormat}')
    `);
    } else if (fechaInicioFormat) {
      whereConditions.fecha = Raw(alias => `
      DATE(${alias}) >= DATE('${fechaInicioFormat}')
    `);
    } else if (fechaFinFormat) {
      whereConditions.fecha = Raw(alias => `
      DATE(${alias}) <= DATE('${fechaFinFormat}')
    `);
    }

    return this.ventasRepository.find({
      where: whereConditions,
      relations: ['detalles', 'detalles.inventario', 'detalles.inventario.product', 'detalles.inventario.product.categoria', 'vendedor'],
    });
  }



  async findOne(id: string): Promise<Venta> {
    const venta = await this.ventasRepository.findOne({
      where: { id },
      relations: ['detalles', 'detalles.inventario', 'detalles.inventario.product', 'detalles.inventario.product.categoria', 'vendedor'],
    });


    if (!venta) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }
    return venta;
  }


  async findOneEdit(id: string): Promise<Venta> {
    const venta = await this.ventasRepository.findOne({
      where: { id },
      relations: ['detalles', 'detalles.inventario', 'detalles.inventario.product', 'detalles.inventario.product.categoria', 'vendedor'],
    });

    if (!venta) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    return venta
  }


  async anularVenta(id: string, id_user: string): Promise<void> {
    const queryRunner = this.ventasRepository.manager.connection.createQueryRunner();
    await queryRunner.startTransaction();

    try {
      // Obtener la venta con sus detalles dentro de la transacción
      const venta = await this.findOne(id);
      const usuario = await queryRunner.manager.findOne(User, { where: { id: id_user } });
      if (!usuario) {
        throw new ConflictException('El usuario no fue encontrado.');

      }
      if (!venta.estado) {
        throw new ConflictException('La venta ya fue anulada.')
      }
      // Devolver al inventario los productos de los detalles
      for (const detalle of venta.detalles) {
        await this.registrarMovimiento(
          detalle,
          detalle.inventario.product.id,
          'devolucion',
          'Venta Anulada',
          queryRunner
        );

      }
      venta.estado = false;
      venta.fechaAnulada = moment().tz("America/La_Paz").toDate();
      venta.usuarioAnulador = usuario.fullName;

      // Eliminar la venta y sus detalles (en cascada)
      await queryRunner.manager.save(Venta, venta);

      // Confirmar la transacción
      await queryRunner.commitTransaction();
    } catch (error) {
      // Revertir la transacción en caso de error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Liberar el QueryRunner
      await queryRunner.release();
    }
  }

  async restaurarVenta(id: string): Promise<void> {
    const queryRunner = this.ventasRepository.manager.connection.createQueryRunner();
    await queryRunner.startTransaction();

    try {
      // Obtener la venta con sus detalles dentro de la transacción
      const venta = await this.findOne(id);

      if (venta.estado) {
        throw new ConflictException('La venta no esta anulada.')
      }
      // Devolver al inventario los productos de los detalles
      for (const detalle of venta.detalles) {

        await this.registrarMovimiento(
          detalle,
          detalle.inventario.product.id,
          'venta',
          'Venta Restaurada',
          queryRunner
        );
      }

      venta.estado = true;
      venta.fechaAnulada = null;
      venta.usuarioAnulador = null;

      // Eliminar la venta y sus detalles (en cascada)
      await queryRunner.manager.save(Venta, venta);

      // Confirmar la transacción
      await queryRunner.commitTransaction();
    } catch (error) {
      // Revertir la transacción en caso de error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Liberar el QueryRunner
      await queryRunner.release();
    }
  }
  async remove(id: string): Promise<void> {
    const queryRunner = this.ventasRepository.manager.connection.createQueryRunner();
    await queryRunner.startTransaction();

    try {
      // Obtener la venta con sus detalles dentro de la transacción
      const venta = await this.findOne(id);

      if (venta.estado) {
        throw new ConflictException('La venta debe estar anulada para poderla eliminar.')
      }

      // Eliminar la venta y sus detalles (en cascada)
      await queryRunner.manager.remove(Venta, venta);

      // Confirmar la transacción
      await queryRunner.commitTransaction();
    } catch (error) {
      // Revertir la transacción en caso de error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Liberar el QueryRunner
      await queryRunner.release();
    }
  }
  async getTopUsedProducts(): Promise<any[]> {
    return this.detallesRepository
      .createQueryBuilder('detalle_venta')
      .select('producto.id', 'productoId')
      .addSelect('SUM(detalle_venta.cantidad)', 'totalCantidad')
      .addSelect('SUM(detalle_venta.subtotal)', 'totalSubtotal')
      .addSelect('producto.nombre', 'productoDescripcion')
      .innerJoin('detalle_venta.inventario', 'inventario')
      .innerJoin('inventario.product', 'producto')
      .groupBy('producto.id')
      .addGroupBy('producto.nombre')
      .orderBy('SUM(detalle_venta.cantidad)', 'DESC')
      .limit(5)
      .getRawMany();
  }



  async getLatestSales(): Promise<Venta[]> {
    return this.ventasRepository.find({
      order: {
        fecha: 'DESC', // Ordena por la fecha en orden descendente
      },
      take: 5, // Limita a las últimas 5 ventas
      relations: ['detalles', 'vendedor'], // Carga relaciones necesarias
    });
  }
  async getSalesCount(): Promise<number> {
    return this.ventasRepository.count(); // Devuelve la cantidad de ventas
  }
  async obtenerDatosVentas(tipo: 'semana' | 'mes' | 'todo') {
    const today = new Date();
    let pData: number[] = [];
    let xLabels: string[] = [];

    if (tipo === 'semana') {
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const lunes = new Date(today);
      lunes.setDate(today.getDate() - today.getDay() + 1); // lunes de esta semana

      for (let i = 0; i < 7; i++) {
        const fechaInicio = new Date(lunes);
        fechaInicio.setDate(lunes.getDate() + i);

        const fechaFin = new Date(fechaInicio);
        fechaFin.setDate(fechaInicio.getDate() + 1);

        const cantidad = await this.ventasRepository.count({
          where: {
            fecha: Between(fechaInicio, fechaFin),
          },
        });

        pData.push(cantidad);
      }

      xLabels = dias;
    }

    if (tipo === 'mes') {
      const year = today.getFullYear();
      const month = today.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let i = 1; i <= daysInMonth; i++) {
        const fechaInicio = new Date(year, month, i);
        const fechaFin = new Date(year, month, i + 1);

        const cantidad = await this.ventasRepository.count({
          where: {
            fecha: Between(fechaInicio, fechaFin),
          },
        });

        pData.push(cantidad);
        xLabels.push(i.toString());
      }
    }

    if (tipo === 'todo') {
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const year = today.getFullYear();

      for (let m = 0; m < 12; m++) {
        const fechaInicio = new Date(year, m, 1);
        const fechaFin = new Date(year, m + 1, 1);

        const cantidad = await this.ventasRepository.count({
          where: {
            fecha: Between(fechaInicio, fechaFin),
          },
        });

        pData.push(cantidad);
      }

      xLabels = meses;
    }

    return { pData, xLabels };
  }
  private async registrarMovimiento(detalle: DetalleVenta, id_product: string, tipo: string, descripcion: string, queryRunner: QueryRunner): Promise<void> {

    const almacenes = await queryRunner.manager.find(Almacen);

    const almacen = almacenes[0]

    if (tipo === 'venta') {
      await this.inventarioService.descontarStockTransaccional({
        almacenId: almacen.id,
        cantidad: detalle.cantidad,
        productoId: id_product,
      }, queryRunner);
      await this.movimientosService.registrarSalidaTransaccional({
        almacenId: almacen.id,
        cantidad: detalle.cantidad,
        productoId: id_product,
        descripcion: descripcion,
      }, queryRunner);
    } else {
      await this.inventarioService.agregarStockTransaccional({
        almacenId: almacen.id,
        cantidad: detalle.cantidad,
        productoId: id_product,
      }, queryRunner);
      await this.movimientosService.registrarIngresoTransaccional({
        almacenId: almacen.id,
        cantidad: detalle.cantidad,
        productoId: id_product,
        descripcion: descripcion,
      }, queryRunner);
    }
  }
}
function formatDateToYMD(date: string | Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0'); // meses inician en 0
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}