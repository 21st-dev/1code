import { PluginManager } from "./pluginManager";
import { SamplePlugin } from "./samplePlugin";

export const pluginManager = new PluginManager();

pluginManager.load(SamplePlugin);
