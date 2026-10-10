import { miniAppViteConfig } from "../../packages/ui/vite/mini-app-config";

export default miniAppViteConfig(new URL(".", import.meta.url), {
  port: 5175,
  allowedHosts: ["tasks.y3110w.com", "test-web3.y3110w.com"],
});
