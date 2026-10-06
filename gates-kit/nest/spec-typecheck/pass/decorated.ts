/** A legacy parameter decorator, the kind Nest's `@Body()` and `@Inject()` are. */
function Dependency(): ParameterDecorator {
  return () => undefined;
}

export class Controller {
  constructor(@Dependency() readonly name: string) {}
}
