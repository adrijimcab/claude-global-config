import { ValidationPipe } from '@nestjs/common';

// whitelist strips undeclared properties, but without forbidNonWhitelisted a request carrying them is accepted silently.
export const pipe = new ValidationPipe({ whitelist: true, transform: true });
