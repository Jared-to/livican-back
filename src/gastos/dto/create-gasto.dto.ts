import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateGastoDto {

  @IsNotEmpty()
  @IsString()
  usuarioId: string; // ID del usuario relacionado

  @IsNotEmpty()
  @IsEnum(['Variables', 'Fijos'])
  tipo: 'Variables' | 'Fijos';

  @IsNotEmpty()
  @IsString()
  glosa: string;

  @IsNotEmpty()
  @IsString()
  detalle: string;

  @IsOptional()
  @IsString()
  fecha?: Date;

  @IsNotEmpty()
  @IsNumber()
  monto: number;
  
  @IsString()
  tipo_pago: string


  @IsNotEmpty()
  @IsString()
  categoriaId: string; // ID de la categoría relacionada
}
