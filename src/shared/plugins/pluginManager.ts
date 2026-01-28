import { OneCodePlugin, PluginCommand } from "./plugin";

export class PluginManager {
  private commands = new Map<string, PluginCommand>();

  load(plugin: OneCodePlugin) {
    plugin.activate({
      registerCommand: (command) => {
        this.commands.set(command.id, command);
      },
    });
  }

  getCommands(): PluginCommand[] {
    return Array.from(this.commands.values());
  }
}
