import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { label } from './label';

/**
 * The same component the current guidance asks for: a signal input, `host` metadata, a stable helper. OnPush is
 * written because 19 to 21 ask for it; 22 does not lint it (it is the default there), so it passes on all four.
 */
@Component({ selector: 'app-total', templateUrl: './total.component.html', host: { '[class.busy]': 'busy' }, changeDetection: ChangeDetectionStrategy.OnPush })
export class TotalComponent {
  readonly values = input<number[]>([]);

  protected readonly busy = false;

  protected text(): string {
    return label(this.values().reduce((sum, value) => sum + value, 0));
  }
}
