import { ValidationPipe } from '@nestjs/common';

export const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
