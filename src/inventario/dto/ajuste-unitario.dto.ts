import { IsNumber, IsString, IsUUID } from "class-validator";


export class AjusteUnitarioDto {

  @IsUUID()
  productoId: string;

  @IsNumber()
  cantidad: number;

  @IsString()
  glosa: string;

  @IsString()
  tipo: string;
}