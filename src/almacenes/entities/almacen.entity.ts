import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from "typeorm";


@Entity('almacenes')
export class Almacen {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  nombre: string;


  @Column('text', { nullable: true })
  ubicacion?: string;


  @Column('text', { nullable: true })
  encargado?: string;

}
