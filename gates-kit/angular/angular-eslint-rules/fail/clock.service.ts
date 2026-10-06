import { Injectable } from '@angular/core';

/** A root singleton declared the pre-22 way: `prefer-service-decorator` (22+) asks for `@Service()`. */
@Injectable({ providedIn: 'root' })
export class Clock {
  now(): number {
    return Date.now();
  }
}
