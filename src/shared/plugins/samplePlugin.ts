import { OneCodePlugin } from "./plugin";

export const SamplePlugin: OneCodePlugin = {
  id: "sample.plugin",
  name: "Sample Plugin",
  version: "1.0.0",

  activate(ctx) {
    ctx.registerCommand({
      id: "sample.hello",
      title: "Say Hello",
      run() {
        console.log("Hello from 1code plugin 👋");
      },
    });
  },
};
