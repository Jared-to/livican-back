import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Raw, Repository } from 'typeorm';
import { Gasto } from './entities/gasto.entity';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { User } from 'src/auth/entities/user.entity';
import { CategoriaGasto } from 'src/categoria-gastos/entities/categoria-gasto.entity';
import * as moment from 'moment-timezone';
import { NotificacionesService } from 'src/notificaciones/notificaciones.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class GastosService {
  constructor(
    @InjectRepository(Gasto)
    private readonly gastoRepository: Repository<Gasto>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CategoriaGasto)
    private readonly categoriaRepository: Repository<CategoriaGasto>,
    private readonly notificationsService: NotificacionesService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async create(createGastoDto: CreateGastoDto): Promise<Gasto> {
    const { usuarioId, categoriaId, fecha, ...rest } = createGastoDto;

    const usuario = await this.userRepository.findOne({ where: { id: usuarioId } });
    if (!usuario) {
      throw new NotFoundException(`Usuario con ID ${usuarioId} no encontrado.`);
    }

    const categoria = await this.categoriaRepository.findOne({ where: { id: categoriaId } });
    if (!categoria) {
      throw new NotFoundException(`Categoría con ID ${categoriaId} no encontrada.`);
    }
    const gasto = this.gastoRepository.create({
      ...rest,
      usuario,
      categoria,
      fecha: moment(fecha).tz("America/La_Paz").toDate(),
    });

    const gastoGuardado = await this.gastoRepository.save(gasto);

    // Validar si 'increment' existe, aunque debería ser garantizado por la base de datos
    if (!gastoGuardado.increment) {
      gastoGuardado.increment = 1; // En caso de que sea nulo por algún motivo
    }

    // Generar el código basado en el increment
    gastoGuardado.codigo = `G${gastoGuardado.increment.toString().padStart(4, '0')}`;

    // Guardar nuevamente el gasto con el código generado
    const gastoG = await this.gastoRepository.save(gastoGuardado);

    this.notificationsService.sendEvent({
      type: 'gastoCreado',
      payload: {
        rol: 'admin',
        tipo: 'gasto',
        mensaje: `Nuevo Gasto - ${gastoG?.codigo} - ${gastoG.glosa}`,
        fecha: gastoG.fecha,
      },
    });

    // --- ENVÍO DEL MENSAJE ---
    const mensaje = `🛒 *Comercio.bo*  
✨ ¡Hola Livican, se realizó un *nuevo Gasto*! ✨

👤 Glosa: *${gasto.glosa || 'Desconocido'}*  
💰 Monto: *${gasto.monto.toFixed(2)} Bs*  
💰 Metodo de Pago: *${gasto.tipo_pago}*  
💰 Tipo: *${gasto.tipo}*  
🆔 Código: *${gasto.codigo}*  
📅 Fecha: *${new Date(gasto.fecha).toLocaleString()}*
Sistema: *https://livican.comercio.bo*
✅ Revisa los detalles en tu panel`;


    // Emitir evento asíncrono SIN bloquear la respuesta
    this.eventEmitter.emitAsync('gasto.creada', {
      numero: process.env.WSP_NUM,
      mensaje,
    });

    return gastoG;
  }

  async findAll(): Promise<Gasto[]> {
    return await this.gastoRepository.find({
      relations: ['usuario', 'categoria'],
    });
  }

  async findAllDates(fechaInicio: string | 'xx', fechaFin: string | 'xx', user: User): Promise<Gasto[]> {

    const isAdmin = user?.roles?.some(role => role === 'admin') ?? false;

    if (fechaInicio === 'xx' && fechaFin === 'xx') {
      return this.gastoRepository.find({
        where: user.roles[0] === 'admin' ? {} : { usuario: { id: user.id } },
        relations: ['usuario', 'categoria',],
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
    return this.gastoRepository.find({
      where: whereConditions,
      relations: ['usuario', 'categoria'],
    });
  }

  async findOne(id: string): Promise<Gasto> {
    const gasto = await this.gastoRepository.findOne({
      where: { id },
      relations: ['usuario', 'categoria'],
    });

    if (!gasto) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado.`);
    }

    return gasto;
  }

  async update(id: string, updateGastoDto: UpdateGastoDto): Promise<Gasto> {
    const gasto = await this.findOne(id);

    const { usuarioId, categoriaId, ...rest } = updateGastoDto;

    if (usuarioId) {
      const usuario = await this.userRepository.findOne({ where: { id: usuarioId } });
      if (!usuario) {
        throw new NotFoundException(`Usuario con ID ${usuarioId} no encontrado.`);
      }
      gasto.usuario = usuario;
    }

    if (categoriaId) {
      const categoria = await this.categoriaRepository.findOne({ where: { id: categoriaId } });
      if (!categoria) {
        throw new NotFoundException(`Categoría con ID ${categoriaId} no encontrada.`);
      }
      gasto.categoria = categoria;
    }

    Object.assign(gasto, rest);

    return await this.gastoRepository.save(gasto);
  }

  async remove(id: string): Promise<void> {
    const gasto = await this.findOne(id);
    await this.gastoRepository.remove(gasto);
  }
  async getGastosCount(): Promise<number> {
    return this.gastoRepository.count();
  }
}
function formatDateToYMD(date: string | Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0'); // meses inician en 0
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}