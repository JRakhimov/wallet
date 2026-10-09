import { miniAppViteConfig } from "../../packages/ui/vite/mini-app-config";

export default miniAppViteConfig(new URL(".", import.meta.url), {
  port: 5173,
  allowedHosts: ["wallet.y3110w.com", "test-web.y3110w.com"],
});
