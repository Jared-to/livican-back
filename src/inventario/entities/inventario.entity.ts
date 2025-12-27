import { Almacen } from "src/almacenes/entities/almacen.entity";
import { Producto } from "src/productos/entities/producto.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";


@Entity('inventario')
export class Inventario {

  @PrimaryGeneratedColumn('uuid')
  id: string;


  @ManyToOne(() => Almacen, { onDelete: 'CASCADE' }
  )
  almacen: Almacen;

  @ManyToOne(() => Producto, { onDelete: 'CASCADE' }
  )
  product: Producto;

  @Column('float')
  stock: number;

  @Column('float', { nullable: true })
  precio_compra: number;

}
