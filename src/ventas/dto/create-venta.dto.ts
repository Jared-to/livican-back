import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDetalleVentaDto {
  @IsString()
  @IsNotEmpty()
  id_inventario: string;


  @IsNumber()
  precio: number;

  @IsNumber()
  @Min(1)
  cantidad: number;

  @IsString()
  unidad_medida: string;


  @IsNumber()
  subtotal: number;

}

export class CreateVentaDto {

  @IsString()
  cliente: string;

  @IsString()
  vendedor: string;


  @IsString()
  fecha?: Date;

  @IsNumber()
  subtotal: number;

  @IsNumber()
  total: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  montoQR?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  montoEfectivo?: number;

  @IsNumber()
  descuento: number;

  @IsEnum(['EFECTIVO', 'QR', 'TRANSFERENCIA', 'QR-EFECTIVO'])
  tipo_pago: string;


  @IsArray()
  @IsOptional()
  detalles: CreateDetalleVentaDto[];
}
