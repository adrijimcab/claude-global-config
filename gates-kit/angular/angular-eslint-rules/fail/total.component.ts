import { Component, HostBinding, Input } from '@angular/core';

import { Clock } from './clock.service';
import { previewLabel, previewTotal } from './preview';

/**
 * Every rule of the per-major table broken once: a decorator input (`prefer-signals`, 19+), constructor
 * injection (`prefer-inject`, 20+), `@HostBinding` (`prefer-host-metadata-property`, 20+), an experimental and a
 * developer-preview API (`no-experimental`, `no-developer-preview`, 20+); the template uses `*ngIf`
 * (`prefer-control-flow`, 20+) the service is `@Injectable` (`prefer-service-decorator`, 22+) and the component sets no `changeDetection`
 * (`prefer-on-push-component-change-detection`, 19 to 21).
 */
@Component({ selector: 'app-total', templateUrl: './total.component.html' })
export class TotalComponent {
  @Input() values: number[] = [];

  @HostBinding('class.busy') busy = false;

  constructor(private readonly clock: Clock) {}

  label(): string {
    return `${previewLabel(previewTotal(this.values))} at ${this.clock.now()}`;
  }
}
