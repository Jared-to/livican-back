import { forwardRef, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, MoreThan, QueryRunner, Repository } from 'typeorm';

import { CreateInventarioDto } from './dto/create-inventario.dto';
import { Inventario } from './entities/inventario.entity';
import { InventarioInicialDto } from './dto/inventario-inicial.dto';
import { inventarioInicial } from './entities/inventario-inicial.entity';
import { MovimientosAlmacenService } from './service/movimientos-almacen.service';
import { ProductosService } from 'src/productos/productos.service';
import { AlmacenesService } from 'src/almacenes/almacenes.service';
import { Producto } from 'src/productos/entities/producto.entity';

@Injectable()
export class InventarioService {
  constructor(
    @InjectRepository(Inventario)
    private readonly inventarioRepository: Repository<Inventario>,
    @InjectRepository(inventarioInicial)
    private readonly inventarioInicialRepository: Repository<inventarioInicial>,
    private readonly movimientosService: MovimientosAlmacenService,
    @Inject(forwardRef(() => ProductosService))
    private readonly productosService: ProductosService,
    private readonly AlmacenService: AlmacenesService
  ) { }

  // Traer productos de un almacén específico
  async find(): Promise<Inventario[]> {
    // Obtener productos relacionados al almacén
    return await this.inventarioRepository.find({
      relations: ['product', 'product.categoria']
    })
  }
  //agregar inventario inicial
  async inventarioInicial(inventarioInicialDto: InventarioInicialDto): Promise<Inventario[]> {
    const { almacen_id, productos } = inventarioInicialDto;
    try {


      // Crear una lista para almacenar los inventarios creados o actualizados
      const inventarios = [];

      for (const producto of productos) {
        const { producto_id, cantidad, precio_compra, precio_venta } = producto;

        //  Registrar en la tabla `inventarioInicial`
        const registroInicial = this.inventarioInicialRepository.create({
          almacen_id,
          cantidad,
          fecha: new Date().toISOString(),
          precio_compra,
          precio_venta,
          producto_id,
        });

        await this.inventarioInicialRepository.save(registroInicial);

        //  Actualizar o crear en la tabla `inventario`
        let inventario = await this.inventarioRepository.findOne({
          where: { almacen: { id: almacen_id }, product: { id: producto_id } },
        });

        let product = await this.productosService.findOneProducto(producto_id);
        let almacen = await this.AlmacenService.findOne(almacen_id);
        if (!inventario) {
          // Crear nuevo registro en inventario general 
          inventario = this.inventarioRepository.create({
            almacen: almacen,
            product: product,
            stock: cantidad,
            precio_compra
          });
        } else {
          // Incrementar stock si ya existe
          inventario.stock += cantidad;
        }

        const inventarioGuardado = await this.inventarioRepository.save(inventario);

        // Agregar a la lista de inventarios procesados
        inventarios.push(inventarioGuardado);

        //  Registrar movimiento de ingreso
        await this.movimientosService.registrarIngreso({
          almacenId: almacen_id,
          productoId: producto_id,
          cantidad,
          descripcion: 'INVENTARIO INICIAL',
        });
      }

      return inventarios;
    } catch (error) {
      console.log(error);

      throw new InternalServerErrorException('Código de barras duplicado.');
    }
  }

  async agregarStock(createInventarioDto: CreateInventarioDto): Promise<Inventario> {
    const { almacenId, cantidad, productoId } = createInventarioDto;

    let inventario = await this.inventarioRepository.findOne({
      where: { almacen: { id: almacenId }, product: { id: productoId } },
    });

    if (!inventario) {
      let product = await this.productosService.findOneProducto(productoId);
      let almacen = await this.AlmacenService.findOne(almacenId);
      inventario = this.inventarioRepository.create({
        almacen: almacen,
        product: product,
        stock: cantidad,
      });
    } else {
      inventario.stock += cantidad;
    }

    // Guardar en la base de datos
    await this.inventarioRepository.save(inventario);

    return inventario; // Retornar el inventario actualizado
  }

  // Descontar stock de un producto en un almacén
  async descontarStock(createInventarioDto: CreateInventarioDto): Promise<Inventario> {
    const { almacenId, cantidad, productoId } = createInventarioDto;

    const inventario = await this.inventarioRepository.findOne({
      where: { almacen: { id: almacenId }, product: { id: productoId }, },
    });

    if (!inventario) {
      throw new NotFoundException(`El producto no está registrado en el inventario para este almacén.`);
    }

    if (inventario.stock < cantidad) {
      throw new Error('No hay suficiente stock disponible para descontar esta cantidad.');
    }

    inventario.stock -= cantidad;

    // Guardar en la base de datos
    await this.inventarioRepository.save(inventario);

    return inventario; // Retornar el inventario actualizado
  }
  async agregarStockTransaccional(createInventarioDto: CreateInventarioDto, queryRunner: QueryRunner): Promise<Inventario> {
    const { almacenId, cantidad, productoId } = createInventarioDto;

    let inventario = await queryRunner.manager.findOne(Inventario, {
      where: { almacen: { id: almacenId }, product: { id: productoId } },
    });

    if (!inventario) {
      let almacen = await this.AlmacenService.findOne(almacenId);
      inventario = queryRunner.manager.create(Inventario, {
        almacen: almacen,
        product: { id: productoId },
        stock: cantidad,
      });
    } else {

      inventario.stock = inventario.stock + parseFloat(cantidad);

    }
    console.log('inven',inventario);
    
    // Guardar en la base de datos
    await queryRunner.manager.save(Inventario, inventario);

    return inventario; // Retornar el inventario actualizado
  }

  // Descontar stock de un producto en un almacén
  async descontarStockTransaccional(createInventarioDto: CreateInventarioDto, queryRunner: QueryRunner): Promise<Inventario> {
    const { almacenId, cantidad, productoId } = createInventarioDto;

    const inventario = await queryRunner.manager.findOne(Inventario, {
      where: { almacen: { id: almacenId }, product: { id: productoId } },
    });

    if (!inventario) {
      throw new NotFoundException(`El producto no está registrado en el inventario para este almacén.`);
    }

    if (inventario.stock < cantidad) {
      throw new Error('No hay suficiente stock disponible para descontar esta cantidad.');
    }

    inventario.stock = parseFloat(inventario.stock.toFixed(2)) - parseFloat(cantidad.toFixed(2));

    // Guardar en la base de datos
    await queryRunner.manager.save(Inventario, inventario);

    return inventario; // Retornar el inventario actualizado
  }



  // Traer todo el inventario
  async obtenerInventarioCompleto(): Promise<any[]> {
    const inventario = await this.inventarioRepository
      .createQueryBuilder('inventario')
      .leftJoin('inventario.product', 'producto')
      .leftJoin('producto.categoria', 'categoria')
      .select([
        'inventario.id AS inventario_id',
        'inventario.stock AS stock',
        'producto.id AS producto_id',
        'producto.nombre AS producto_nombre',
        'producto.unidad_medida AS unidad_medida',
        'producto.marca AS marca',
        'producto.precio_venta AS precio_venta',
        'producto.imagen AS imagen',
        'producto.codigo AS codigo',
        'producto.estado AS estado',
        'categoria.nombre AS categoria_nombre',
      ])
      .getRawMany(); // ✅ plano

    return inventario;
  }

  async obtenerInventarioVenta(): Promise<any[]> {
    const inventario = await this.inventarioRepository
      .createQueryBuilder('inventario')
      .leftJoin('inventario.product', 'producto')
      .leftJoin('producto.categoria', 'categoria')
      .select([
        'inventario.id AS inventario_id',
        'inventario.stock AS stock',
        'producto.id AS producto_id',
        'producto.nombre AS producto_nombre',
        'producto.unidad_medida AS unidad_medida',
        'producto.marca AS marca',
        'producto.precio_venta AS precio_venta',
        'producto.imagen AS imagen',
        'producto.codigo AS codigo',
        'producto.estado AS estado',
        'producto.precio_min_venta as precio_minimo',
        'categoria.nombre AS categoria_nombre',
        'categoria.id AS categoriaID',
      ])
      .where('producto.estado= true')
      .andWhere('inventario.stock > 0')
      .getRawMany(); // ✅ plano

    return inventario;
  }
  // Traer productos de un almacén específico
  async obtenerProductosPorAlmacen(almacenId: string): Promise<any> {
    // Validar si el almacén existe
    const almacen = await this.AlmacenService.findOne(almacenId);

    if (!almacen) {
      throw new NotFoundException(`Almacén con ID ${almacenId} no encontrado`);
    }

    // Obtener productos relacionados al almacén
    const inventario = await this.inventarioRepository
      .createQueryBuilder('inventario')
      .leftJoinAndSelect('inventario.product', 'producto')
      .leftJoinAndSelect('producto.categoria', 'categoria')
      .leftJoinAndSelect('inventario.almacen', 'almacen')
      .select([
        'producto.id AS id_producto',
        'producto.codigo AS codigo',
        'producto.alias AS alias',
        'producto.descripcion AS descripcion',
        'producto.imagen AS imagen',
        'producto.precio_venta AS precio_venta',
        'producto.precio_min_venta AS precio_min_venta',
        'producto.sku AS sku',
        'producto.unidad_medida AS unidad_medida',
        'categoria.nombre AS categoria',
        'almacen.nombre AS almacen',
        'almacen.id AS almacen_id',
        'inventario.stock AS stock',
        'inventario.codigo_barras AS codigo_barras',
      ]).where('producto.estado = true')
      .getRawMany();

    // Construir la respuesta con detalles del almacén y productos
    return {
      nombre: almacen.nombre,
      ubicacion: almacen.ubicacion,
      inventario, // Lista de productos con detalles
    };
  }


  async obtenerAlmacenesPorProducto(productoId: string): Promise<any[]> {
    // Validar si el producto existe
    const producto = await this.productosService.findOneProducto(productoId);

    if (!producto) {
      throw new NotFoundException(`Producto con ID "${productoId}" no encontrado.`);
    }

    // Obtener almacenes relacionados al producto desde el inventario
    const inventario = await this.inventarioRepository
      .createQueryBuilder('inventario')
      .leftJoinAndSelect('inventario.product', 'producto')
      .leftJoinAndSelect('inventario.almacen', 'almacen')
      .where('inventario.product = :productoId', { productoId })
      .select([
        'inventario.almacen AS almacen_nombre',
        'almacen.nombre AS almacen_nombre',
        'inventario.stock AS stock',
        'inventario.precio_compra AS precio_compra',
        'inventario.codigo_barras AS codigo_barras',
        'producto.alias AS producto_nombre',
        'producto.descripcion AS producto_descripcion',
        'producto.unidad_medida AS unidad_medida',
        'producto.sku AS sku',
        'producto.precio_venta AS precio_venta',
        'producto.imagen AS imagen',
        'producto.codigo AS codigo',
      ])
      .orderBy('inventario.almacen', 'ASC')
      .getRawMany();

    if (!inventario || inventario.length === 0) {
      throw new NotFoundException(`No se encontraron registros del producto con ID "${productoId}" en ningún almacén.`);
    }

    // Formatear la respuesta
    return inventario
  }


  async obtenerInfoProducto(id_inventario: string): Promise<any> {

    const productoInfo = await this.inventarioRepository.findOne({ where: { id: id_inventario }, relations: ['product', 'almacen', 'product.categoria'] })

    if (!productoInfo) {
      throw new NotFoundException(`No se encontró información para el producto con ID "${id_inventario}".`);
    }

    return productoInfo
  }

  async obtenerProductoPorAlmacenYProducto(almacenId: string, productoId: string): Promise<any> {

    // Consulta para obtener información del producto específico en el almacén
    const resultado = await this.inventarioRepository.findOne({ where: { almacen: { id: almacenId }, product: { id: productoId } }, relations: ['product'] })

    const product = await this.productosService.findOneProducto(resultado.product.id);

    return {
      ...resultado,
      ...product,
      total_stock: resultado.stock
    }

  }



  async obtenerStocksBajos(): Promise<Inventario[]> {
    const inventario = await this.inventarioRepository.find({
      where: { stock: Between(1, 9), }, //stock<10 
      order: { stock: 'ASC' },
      relations: ['product'],
    });

    return inventario;
  }


}
