import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { createAlmacen, createControl, createUserSeed } from './data/data'
import { AlmacenesService } from 'src/almacenes/almacenes.service';
import { ControlService } from 'src/control/control.service';

@Injectable()
export class SeedService {
  constructor(
    private readonly authServie: AuthService,
    private readonly almacenServie: AlmacenesService,
    private readonly controlService: ControlService
  ) { }
  async create(): Promise<object> {

    const seed = await this.authServie.create(createUserSeed)
    const almacen = await this.almacenServie.create(createAlmacen)
    await this.controlService.create(createControl)
    if (!seed || !almacen) {
      throw new InternalServerErrorException('Error al hacer el seed.')
    }
    return {
      message: 'Seed Excute'
    }
  }

}
