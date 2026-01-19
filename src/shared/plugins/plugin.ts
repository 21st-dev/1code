export interface OneCodePlugin {
  id: string;
  name: string;
  version: string;
  activate(ctx: PluginContext): void;
}

export interface PluginContext {
  registerCommand(command: PluginCommand): void;
}

export interface PluginCommand {
  id: string;
  title: string;
  run(): void;
}
