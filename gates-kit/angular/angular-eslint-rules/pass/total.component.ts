import { Component, input } from '@angular/core';

import { label } from './label';

/** The same component the current guidance asks for: a signal input, `host` metadata, a stable helper. */
@Component({ selector: 'app-total', templateUrl: './total.component.html', host: { '[class.busy]': 'busy' } })
export class TotalComponent {
  readonly values = input<number[]>([]);

  protected readonly busy = false;

  protected text(): string {
    return label(this.values().reduce((sum, value) => sum + value, 0));
  }
}
