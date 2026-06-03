import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Beacon de un evento de funnel emitido por el cliente. */
export class TrackEventDto {
  @ApiProperty({
    description: 'Nombre del evento (debe estar en la allowlist client)',
    example: 'expense.form.abandoned',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  event: string;
}
