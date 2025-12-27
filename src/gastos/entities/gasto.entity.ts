import { User } from "src/auth/entities/user.entity";
import { CategoriaGasto } from "src/categoria-gastos/entities/categoria-gasto.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('gastos')
export class Gasto {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int', generated: 'increment', unique: true })
  increment: number;

  @Column({ type: 'text', unique: true, nullable: true })
  codigo: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;


  @Column('enum', { enum: ['Variables', 'Fijos'], })
  tipo: string;

  @Column('text')
  glosa: string;

  @Column('text')
  detalle: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha: Date;

  @Column('float')
  monto: number;

  @Column({ type: 'enum', enum: ['EFECTIVO', 'QR', 'TRANSFERENCIA'], default: 'EFECTIVO' })
  tipo_pago: string;

  // Relación muchos a uno
  @ManyToOne(() => CategoriaGasto, (categoria) => categoria.gastos, {
    nullable: false, // Hace obligatorio que cada gasto tenga una categoría
    onDelete: 'CASCADE', // Elimina los gastos si se elimina la categoría
  })
  categoria: CategoriaGasto;
}
